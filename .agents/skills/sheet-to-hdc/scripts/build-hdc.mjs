#!/usr/bin/env node
/**
 * Builds a Hero Designer .hdc from the character IR with Hero Workshop's own code: the IR becomes
 * a Hero Workshop Character (skills, perks, talents and complications through the editor's item
 * forms; powers and equipment through its power drafts, parsed from HERO build text with the
 * catalogs), which Hero Workshop's HDC writer turns into XML, as the Foundry module does when an
 * item is added. hero6e's import repairs (repairForFoundry) run last.
 *
 * Usage: node build-hdc.mjs <character.ir.json> <character.hdc> [build-report.md] [--prefabs <dir>]
 *
 * --prefabs: a folder of Hero Designer prefabs (.hdp) or characters; an IR item with
 * "prefab": "<name>" is copied from there (with fresh IDs) instead of built from text.
 *
 * The report lists every judgment call: custom modifiers, Limited Powers, powers priced from the
 * sheet, costs that differ from the sheet. Score the result with score-hdc.mjs.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hw } from './lib/shared.mjs';
import { bindSkillRolls, buildPowerDraft, newId, norm } from './lib/hero-text.mjs';

// =============================================================================
// IR helpers
// =============================================================================

const num = (v, fallback) => {
  const n = Number(v);
  return v !== undefined && v !== null && v !== '' && Number.isFinite(n) ? n : fallback;
};
const asArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);

/** Which model item each IR item became: { section, index, name, modelId } */
let created = [];
/** IR items to copy from the prefab library: { section, index, item } */
let prefabs = [];
const track = (section, index, item, modelId) => modelId && created.push({ section, index, name: item.name ?? item.detail ?? '', modelId });

/** Saves through an editor form and returns the character and the id of the item it added */
function saveNew(character, section, list, values) {
  const before = new Set((character[list] ?? []).map((i) => i.id));
  const after = hw.saveItemForm(character, section, undefined, values);
  return { character: after, id: (after[list] ?? []).find((i) => !before.has(i.id))?.id };
}

/** The sheet's own cost for an item */
const sheetCost = (item) => num(item.realCost, num(item.sheetCost, num(item.points, undefined)));

// =============================================================================
// Characteristics
// =============================================================================

function characteristicTotals(ir) {
  const c = ir.characteristics ?? {};
  if (Array.isArray(c)) return Object.fromEntries(c.map((x) => [x.type, num(x.totalValue ?? x.value, undefined)]));
  return c;
}

function applyCharacteristics(character, ir, report) {
  const maxima = ir.rules?.maxima ?? ir.rules?.characteristicMaxima;
  if (maxima && Object.keys(maxima).length) character = hw.withMaxima(character, maxima, ir.rules?.races);
  for (const [type, total] of Object.entries(characteristicTotals(ir))) {
    if (total === undefined) continue;
    if (!character.characteristics.some((c) => c.type === type)) {
      report.push(`characteristics: ${type} isn't on this template`);
      continue;
    }
    character = hw.setCharacteristicValue(character, type, total);
  }
  return character;
}

// =============================================================================
// Skills
// =============================================================================

const ENHANCERS = new Set(hw.SKILL_ENHANCER_CATALOG_6E.map((e) => e.xmlId));
// In 6E an Area or City Knowledge is a Knowledge Skill
const BACKGROUND = { KS: 'KNOWLEDGE_SKILL', PS: 'PROFESSIONAL_SKILL', SS: 'SCIENCE_SKILL', AK: 'KNOWLEDGE_SKILL', CK: 'KNOWLEDGE_SKILL', TF: 'TRANSPORT_FAMILIARITY', WF: 'WEAPON_FAMILIARITY' };
const SKILL_XMLIDS = { AREA_KNOWLEDGE: 'KNOWLEDGE_SKILL', CITY_KNOWLEDGE: 'KNOWLEDGE_SKILL' };

/** Weapon Familiarity groups and weapons (Main6E.hdt), by name */
const WEAPON_GROUPS = [
  ['COMMONMELEE', 'Common Melee Weapons', 2], ['COMMONMISSILE', 'Common Missile Weapons', 2], ['COMMONMARTIAL', 'Common Martial Arts Melee Weapons', 2],
  ['UNARMEDCOMBAT', 'Unarmed Combat', 0], ['AXESMACES', 'Axes, Maces, Hammers, and Picks', 1], ['BLADES', 'Blades', 1], ['CLUBS', 'Clubs', 0],
  ['POLEARMS', 'Polearms and Spears', 1], ['TWOHANDED', 'Two-Handed Weapons', 1], ['FLAILS', 'Flails', 1], ['GARROTE', 'Garrote', 1],
  ['LANCES', 'Lances', 1], ['NETS', 'Nets', 1], ['STAFFS', 'Staffs', 1], ['WHIPS', 'Whips', 1], ['ROCKS', 'Thrown Rocks', 0], ['BOWS', 'Bows', 1],
  ['CROSSBOWS', 'Crossbows', 1], ['JAVELINS', 'Javelins and Thrown Spears', 1], ['THROWNKNIVES', 'Thrown Knives, Axes, and Darts', 1],
];
function weaponAdders(item, report) {
  const wanted = asArray(item.weapons).length ? asArray(item.weapons) : [item.input ?? item.name ?? ''];
  const adders = [];
  for (const w of wanted) {
    const key = norm(w).replace(/^(wf|weapon familiarity) /, '');
    const group = WEAPON_GROUPS.find(([, display]) => norm(display) === key || norm(display).startsWith(key));
    const points = sheetCost(item);
    if (group && !asArray(item.weapons).length && points !== undefined && group[2] !== points) {
      adders.push({ id: newId('adder'), xmlId: 'ADDER', name: w, alias: w, baseCost: points, includeInBase: false, selected: true });
      report.push(`skill "${item.name}": the sheet charges ${points} for "${w}"; Hero Designer's ${group[1]} costs ${group[2]} (kept at the sheet's cost as a custom adder)`);
    } else if (group) adders.push({ id: newId('adder'), xmlId: group[0], name: group[1], alias: group[1], baseCost: group[2], includeInBase: false, selected: true });
    else {
      const cost = asArray(item.weapons).length ? 1 : Math.max(1, sheetCost(item) ?? 1);
      adders.push({ id: newId('adder'), xmlId: 'ADDER', name: w, alias: w, baseCost: cost, includeInBase: false, selected: true });
      report.push(`skill "${item.name}": weapon "${w}" isn't one of Hero Designer's Weapon Familiarity groups (Common Melee Weapons, Blades, Bows...): custom adder at ${cost}`);
    }
  }
  return adders;
}

/** "KS: Arcana", "Stealth", "Language: Elven" → { xmlid, input } */
function skillIdentity(item) {
  if (item.xmlId) return { xmlid: SKILL_XMLIDS[item.xmlId] ?? item.xmlId, input: item.input };
  const name = String(item.name ?? '').trim();
  const bg = /^(KS|PS|SS|AK|CK|TF|WF):\s*(.+)$/.exec(name);
  if (bg) return { xmlid: BACKGROUND[bg[1]], input: item.input ?? bg[2].trim() };
  const lang = /^(?:Native )?Language:\s*(.+)$/i.exec(name);
  if (lang) return { xmlid: 'LANGUAGES', input: item.input ?? lang[1].trim(), nativeTongue: /^native/i.test(name) || undefined };
  const entry = hw.lookupSkillCatalog(name);
  if (entry) return { xmlid: entry.xmlId, input: item.input };
  return { xmlid: 'CUSTOMSKILL', input: item.input };
}

/** Levels a skill needs to cost `points` (when the IR gives a cost but no levels) */
function levelsForPoints(xmlid, characteristic, points) {
  const entry = hw.lookupSkillCatalog(xmlid);
  const choices = entry?.characteristicChoices ?? [];
  const choice = choices.find((c) => c.characteristic === characteristic) ?? choices[0];
  const base = choice?.baseCost ?? entry?.baseCost;
  const per = choice?.lvlCost ?? entry?.lvlCost;
  if (base === undefined || !per || points === undefined) return 0;
  return Math.max(0, Math.round((points - base) / per));
}

function addSkills(character, ir, ids, report) {
  for (const [index, item] of asArray(ir.skills).entries()) {
    const parentId = item.parentId ? ids.get(item.parentId) : undefined;
    // Lists and skill enhancers (Scholar, Scientist, ...) group other skills
    if (item.group || item.isGroup || item.xmlId === 'LIST' || ENHANCERS.has(item.xmlId)) {
      const id = newId('skill');
      const enhancer = ENHANCERS.has(item.xmlId);
      character = {
        ...character,
        skills: [...character.skills, {
          id, name: item.name || item.alias || hw.SKILL_ENHANCER_CATALOG_6E.find((e) => e.xmlId === item.xmlId)?.display || 'Skills',
          alias: item.alias, type: 'GENERAL', position: character.skills.length, levels: 0, baseCost: num(item.points, 0),
          isGroup: !enhancer, isEnhancer: enhancer || undefined, enhancerType: enhancer ? item.xmlId : undefined, notes: item.notes, parentId,
        }],
      };
      ids.set(item.id ?? item.name, id);
      track('skills', index, item, id);
      continue;
    }
    const identity = skillIdentity(item);
    const characteristic = item.characteristic ?? (identity.input && ['KNOWLEDGE_SKILL', 'SCIENCE_SKILL', 'AREA_KNOWLEDGE', 'CITY_KNOWLEDGE'].includes(identity.xmlid) ? 'GENERAL' : undefined);
    const familiarity = !!item.familiarity;
    const points = sheetCost(item);
    // Under a skill enhancer (Scholar, Linguist...) a skill costs 1 less: its levels are for 1 more
    const enhanced = item.parentId && asArray(ir.skills).some((s) => (s.id ?? s.name) === item.parentId && ENHANCERS.has(s.xmlId));
    const levels = item.levels ?? (familiarity || identity.xmlid === 'CUSTOMSKILL' ? 0 : levelsForPoints(identity.xmlid, characteristic, points !== undefined && enhanced ? points + 1 : points));
    const values = {
      xmlid: identity.xmlid,
      name: item.xmlId || identity.xmlid === 'CUSTOMSKILL' ? item.name ?? '' : '',
      input: identity.input ?? '',
      characteristic: characteristic ?? '',
      levels,
      familiarity,
      proficiency: !!item.proficiency,
      everyman: !!item.everyman,
      option: item.option ?? (identity.xmlid === 'LANGUAGES' ? languageOption(item) : ''),
      nativeTongue: !!(item.nativeTongue ?? identity.nativeTongue),
      literate: !!item.literate,
      attacks: asArray(item.attacks),
      notes: item.notes ?? '',
      cost: points ?? 0,
      free: !!item.free,
    };
    const before = new Set(character.skills.map((s) => s.id));
    character = hw.saveItemForm(character, 'skills', undefined, values);
    const made = character.skills.find((s) => !before.has(s.id));
    if (made) {
      const created = made;
      if (parentId) character = { ...character, skills: character.skills.map((s) => (s.id === created.id ? { ...s, parentId } : s)) };
      if (identity.xmlid === 'CUSTOMSKILL' && item.roll) character = { ...character, skills: character.skills.map((s) => (s.id === created.id ? { ...s, roll: item.roll } : s)) };
      if (identity.xmlid === 'WEAPON_FAMILIARITY') {
        const adders = weaponAdders(item, report);
        character = { ...character, skills: character.skills.map((s) => (s.id === created.id ? { ...s, adders: [...(s.adders ?? []), ...adders] } : s)) };
      }
      if (asArray(item.attacks).length === 0 && ['COMBAT_LEVELS', 'MENTAL_COMBAT_LEVELS'].includes(identity.xmlid) && !['ALL', 'HTH', 'RANGED'].includes(values.option)) {
        report.push(`skill "${item.name}": no attacks named for it ("attacks": [...]), so Foundry can't apply its levels`);
      }
      ids.set(item.id ?? item.name, created.id);
      track('skills', index, item, created.id);
    }
    if (identity.xmlid === 'CUSTOMSKILL') report.push(`skill "${item.name}": custom skill (no Hero Designer skill matched)`);
  }
  return character;
}

const LANGUAGE_LEVELS = { 1: 'BASIC', 2: 'FLUENT', 3: 'IDIOMATIC', 4: 'IMITATE' };
function languageOption(item) {
  if (item.fluency) return String(item.fluency).toUpperCase();
  const points = sheetCost(item);
  return LANGUAGE_LEVELS[(points ?? 2) - (item.literate ? 1 : 0)] ?? 'FLUENT';
}

// =============================================================================
// Perks, talents, martial arts, complications
// =============================================================================

const PERK_TYPES = { VEHICLE_BASE: 'VEHICLE_BASE', BASE: 'VEHICLE_BASE', CUSTOMPERK: 'GENERIC', POSITIVE_REPUTATION: 'REPUTATION' };
const PERK_CATALOG = new Map(hw.PERK_CATALOG_6E.map((p) => [p.xmlId, p]));

/** A catalog adder of `xmlId` (with `optionId` chosen, if it has options) as a model Adder */
function catalogAdder(entry, xmlId, optionId) {
  const def = entry?.adders?.find((a) => a.xmlId === xmlId);
  if (!def) return undefined;
  const option = optionId ? def.options?.find((o) => o.xmlId === optionId) : undefined;
  return {
    id: newId('adder'), xmlId, name: def.display, alias: def.display, baseCost: option?.baseCost ?? def.baseCost ?? 0,
    optionId: option?.xmlId, optionAlias: option?.display, includeInBase: !!def.includeInBase, selected: true,
  };
}

/** Contact adders named in its description */
const CONTACT_WORDS = [
  [/extremely useful/i, 'USEFUL', 'EXTREMELYUSEFUL'], [/very useful/i, 'USEFUL', 'VERYUSEFUL'], [/(?<!very |extremely )useful/i, 'USEFUL', 'USEFUL'],
  [/access to (?:major )?institutions/i, 'ACCESSTOINSTITUTIONS'], [/(?:significant )?contacts of (?:his|her|its|their) own|has contacts/i, 'CONTACTHASCONTACTS'],
  [/slavishly loyal/i, 'SLAVISHLYLOYAL'], [/very good relationship/i, 'VERYGOODRELATIONSHIP'], [/(?<!very )good relationship/i, 'GOODRELATIONSHIP'],
  [/limited by identity/i, 'LIMITEDBYID'],
];

/** Adders for the remainder of a sheet cost the template can't explain */
const priced = (remainder, label) => ({ id: newId('adder'), xmlId: 'ADDER', name: label, alias: label, baseCost: remainder, includeInBase: false, selected: true });
const adderTotal = (adders) => adders.reduce((s, a) => s + (a.baseCost ?? 0), 0);

/** A Contact: its roll is its levels (8- 1, 11- 2, +1 each after), its description its adders */
function contactPerk(item, report) {
  const entry = PERK_CATALOG.get('CONTACT');
  const roll = num(item.roll, 8);
  const levels = num(item.levels, roll <= 8 ? 1 : roll - 9);
  const text = [item.detail, item.notes, ...asArray(item.adders).map((a) => (typeof a === 'string' ? a : a.name))].filter(Boolean).join('; ');
  const adders = [];
  for (const [re, xmlId, optionId] of CONTACT_WORDS) {
    if (!re.test(text) || adders.some((a) => a.xmlId === xmlId)) continue;
    adders.push(catalogAdder(entry, xmlId, optionId));
  }
  const cost = sheetCost(item);
  const built = Math.max(1, levels) + adderTotal(adders);
  if (cost !== undefined && cost > built) {
    adders.push(priced(cost - built, 'Priced from the sheet'));
    report.push(`perk "${item.name}": Contact at ${roll}- with ${adders.length - 1} adder(s) is ${built} points; the sheet's ${cost} is made up with a custom adder (name its adders: useful, contacts of its own, access to institutions, good relationship...)`);
  } else if (cost !== undefined && cost < built) {
    report.push(`perk "${item.name}": Contact at ${roll}- with its adders is ${built} points, more than the sheet's ${cost}`);
  }
  return { type: 'CONTACT', name: item.name ?? '', levels, baseCost: 0, adders };
}

/** A Positive Reputation: +N/+Nd6 levels, priced per level by how widely and how well it's known */
function reputationPerk(item, report) {
  const entry = PERK_CATALOG.get('REPUTATION');
  const text = `${item.detail ?? ''} ${item.notes ?? ''} ${item.name ?? ''}`;
  const cost = sheetCost(item);
  const wide = /large group|world|empire|region|nation/i.test(text) ? 'LARGEGROUP' : /medium/i.test(text) ? 'MEDIUMGROUP' : /small/i.test(text) ? 'SMALLGROUP' : undefined;
  const well = item.roll ? String(item.roll) : /\b14-/.test(text) ? '14' : /\b8-/.test(text) ? '8' : /\b11-/.test(text) ? '11' : undefined;
  let levels = num(item.levels, Number(/\+(\d+)\s*\/\s*\+\d+d6/i.exec(text)?.[1] ?? 0) || undefined);
  // Unstated choices: whatever reaches the sheet's cost, preferring 11- and a small group
  let best;
  for (const w of wide ? [wide] : ['SMALLGROUP', 'MEDIUMGROUP', 'LARGEGROUP']) {
    for (const h of well ? [well] : ['11', '14', '8']) {
      const perLevel = Math.max(1, (entry.adders[0].options.find((o) => o.xmlId === w).baseCost) + entry.adders[1].options.find((o) => o.xmlId === h).baseCost);
      const lv = levels ?? Math.max(1, Math.round((cost ?? perLevel) / perLevel));
      const total = lv * perLevel;
      const miss = Math.abs(total - (cost ?? total));
      if (!best || miss < best.miss) best = { w, h, lv, total, miss };
    }
  }
  if (best.miss) report.push(`perk "${item.name}": Positive Reputation is ${best.total} points, the sheet says ${cost}`);
  return { type: 'REPUTATION', name: item.name ?? '', levels: best.lv, baseCost: 0, adders: [catalogAdder(entry, 'HOWWIDE', best.w), catalogAdder(entry, 'HOWWELL', best.h)] };
}

function addPerks(character, ir, report) {
  for (const [index, item] of asArray(ir.perks).entries()) {
    const type = PERK_TYPES[item.xmlId] ?? item.xmlId ?? 'GENERIC';
    let perk;
    if (type === 'CONTACT') perk = contactPerk(item, report);
    else if (type === 'REPUTATION') perk = reputationPerk(item, report);
    if (perk) {
      const id = newId('perk');
      character = { ...character, perks: [...character.perks, { id, position: character.perks.length, notes: item.notes, ...perk, ...(item.free ? { multiplier: 0 } : {}) }] };
      track('perks', index, item, id);
      continue;
    }
    const saved = saveNew(character, 'perks', 'perks', {
      type, name: item.name ?? '', levels: num(item.levels, 0), cost: sheetCost(item) ?? 0, notes: item.notes ?? '', free: !!item.free,
    });
    character = saved.character;
    track('perks', index, item, saved.id);
  }
  return character;
}

const TALENT_TYPES = { LIGHTNING_REFLEXES_ALL: 'LIGHTNING_REFLEXES', OFFHANDDEFENSE: 'OFF_HAND_DEFENSE', CUSTOMTALENT: 'GENERIC' };

function addTalents(character, ir) {
  for (const [index, item] of asArray(ir.talents).entries()) {
    const type = TALENT_TYPES[item.xmlId] ?? item.xmlId ?? 'GENERIC';
    const perLevel = type === 'COMBAT_LUCK';
    const levels = num(item.levels, perLevel ? 1 : 0);
    const cost = sheetCost(item) ?? 0;
    const saved = saveNew(character, 'talents', 'talents', {
      type, name: item.name ?? '', levels, cost: perLevel ? cost / levels : cost, notes: item.notes ?? '', free: !!item.free,
    });
    character = saved.character;
    track('talents', index, item, saved.id);
  }
  return character;
}

function addManeuvers(character, ir) {
  for (const [index, item] of asArray(ir.martialArts).entries()) {
    const saved = saveNew(character, 'martialarts', 'martialArts', {
      name: item.name ?? item.display ?? 'Maneuver', ocv: num(item.ocv, 0), dcv: num(item.dcv, 0), phase: item.phase ?? '1/2',
      dc: num(item.dc, 0), cost: num(item.points, num(item.baseCost, 0)), effectText: item.effect ?? '', notes: item.notes ?? '',
    });
    character = saved.character;
    track('martialArts', index, item, saved.id);
  }
  return character;
}

/** Complication types by Hero Designer XMLID or editor name, or guessed from the text */
const DISAD_TYPES = {
  ACCIDENTALCHANGE: 'ACCIDENTAL_CHANGE', DEPENDENCE: 'DEPENDENCE', DEPENDENTNPC: 'DEPENDENT_NPC', DNPC: 'DEPENDENT_NPC',
  DISTINCTIVEFEATURES: 'DISTINCTIVE_FEATURES', ENRAGED: 'ENRAGED', HUNTED: 'HUNTED', REPUTATION: 'NEGATIVE_REPUTATION',
  PHYSICALLIMITATION: 'PHYSICAL_COMPLICATION', PSYCHOLOGICALLIMITATION: 'PSYCHOLOGICAL_COMPLICATION', RIVALRY: 'RIVALRY',
  SOCIALLIMITATION: 'SOCIAL_COMPLICATION', SUSCEPTIBILITY: 'SUSCEPTIBILITY', UNLUCK: 'UNLUCK', VULNERABILITY: 'VULNERABILITY',
  GENERICDISADVANTAGE: 'GENERIC',
};
const DISAD_WORDS = [
  [/vulnerab/i, 'VULNERABILITY'], [/susceptib/i, 'SUSCEPTIBILITY'], [/hunted/i, 'HUNTED'], [/dependen(ce|t on)/i, 'DEPENDENCE'],
  [/\bdnpc\b|dependent npc/i, 'DEPENDENT_NPC'], [/distinctive/i, 'DISTINCTIVE_FEATURES'], [/enraged|berserk/i, 'ENRAGED'],
  [/rival/i, 'RIVALRY'], [/reputation/i, 'NEGATIVE_REPUTATION'], [/social/i, 'SOCIAL_COMPLICATION'], [/physical/i, 'PHYSICAL_COMPLICATION'],
  [/unluck/i, 'UNLUCK'], [/accidental change/i, 'ACCIDENTAL_CHANGE'], [/psych/i, 'PSYCHOLOGICAL_COMPLICATION'],
];

function disadType(item) {
  const key = String(item.type ?? item.xmlId ?? '').toUpperCase().replace(/\s+/g, '_');
  if (DISAD_TYPES[key]) return DISAD_TYPES[key];
  if (Object.values(DISAD_TYPES).includes(key)) return key;
  const text = `${item.category ?? ''} ${item.type ?? ''} ${item.name ?? ''}`;
  return DISAD_WORDS.find(([re]) => re.test(text))?.[1] ?? 'PSYCHOLOGICAL_COMPLICATION';
}

function addComplications(character, ir) {
  const key = ir.complications ? 'complications' : 'disadvantages';
  for (const [index, item] of asArray(ir[key]).entries()) {
    const saved = saveNew(character, 'disadvantages', 'disadvantages', {
      type: disadType(item), detail: item.detail ?? item.input ?? item.name ?? '', points: Math.abs(sheetCost(item) ?? 0), notes: item.notes ?? '',
    });
    character = saved.character;
    track(key, index, item, saved.id);
  }
  return character;
}

// =============================================================================
// Powers and equipment
// =============================================================================

const KINDS = { LIST: 'list', COMPOUNDPOWER: 'compound', MULTIPOWER: 'multipower', VPP: 'vpp' };
const kindOf = (item) => item.kind ?? KINDS[item.xmlId] ?? (asArray(item.parts ?? item.subPowers).length ? 'compound' : 'power');

/** A Hero Workshop power from an IR power (its build text, or the structured fields of older IRs) */
function powerFrom(character, section, item, ir, notes) {
  const spec = {
    name: item.name ?? '',
    build: item.build ?? item.text,
    activeCost: num(item.activeCost, undefined),
    realCost: item.build || item.text ? sheetCost(item) : undefined,
    notes: item.notes,
    input: item.input,
    defense: item.defense,
    magicSkill: item.magicSkill ?? ir.magicSkill,
    skillRoll: item.skillRoll,
    custom: !!item.custom,
  };
  if (!spec.build) return structuredPower(character, section, item);
  const built = buildPowerDraft(character, section, spec);
  const bound = bindSkillRolls(built.draft, character);
  for (const r of [...built.review, ...bound.review]) notes.push(`${section} "${item.name || spec.build.slice(0, 40)}": ${r}`);
  return bound.draft;
}

/** Older IRs: hdcXmlId/xmlId, levels, modifiers and adders as fields */
function structuredPower(character, section, item) {
  const xmlId = item.hdcXmlId ?? item.xmlId;
  let draft = hw.powerDraft(character, section, undefined, 'power');
  if (xmlId && hw.getPowerDefinition(xmlId) && !item.preserveAsCustom) {
    draft = hw.selectPower(draft, xmlId);
    draft.levels = num(item.levels, draft.levels);
    draft.option = item.optionId ?? item.option ?? draft.option;
    draft.input = item.input ?? '';
  } else {
    draft.xmlId = 'CUSTOM';
    draft.alias = item.alias ?? item.name;
    draft.customCost = num(item.baseCost, sheetCost(item) ?? 0);
  }
  draft.name = item.name ?? '';
  draft.notes = item.notes ?? '';
  draft.adders = asArray(item.adders).map((a) => ({
    id: newId('adder'), xmlId: a.xmlId, name: a.alias ?? a.name ?? a.xmlId, alias: a.alias ?? a.name, baseCost: num(a.baseCost, 0),
    levels: a.levels, lvlCost: a.lvlCost, optionAlias: a.optionAlias, includeInBase: a.includeInBase ?? true, selected: true,
  }));
  draft.modifiers = asArray(item.modifiers).map((m) => {
    const value = num(m.value, num(m.baseCost, 0));
    return {
      id: newId('mod'), xmlId: m.xmlId ?? 'CUSTOM', name: m.alias ?? m.name, alias: m.alias ?? m.name, value,
      isAdvantage: value > 0, isLimitation: value < 0, levels: m.levels, optionId: m.optionId ?? m.option, optionAlias: m.optionAlias,
      input: m.input, comments: m.comments,
    };
  });
  return draft;
}

function applyItemFields(draft, item, ids) {
  if (item.parentId) draft.parentId = ids.get(item.parentId) ?? '';
  if (item.free || item.campaignGrantedFree) draft.free = true;
  if (item.slot) draft.slotFixed = item.slot !== 'variable';
  if (item.price !== undefined) draft.price = num(item.price, 0);
  if (item.weight !== undefined) draft.weight = num(item.weight, 0);
  if (item.carried !== undefined) draft.carried = item.carried !== false;
  return draft;
}

function addPowerItems(character, section, items, ir, ids, notes) {
  const list = section === 'powers' ? 'powers' : 'equipment';
  for (const [index, item] of asArray(items).entries()) {
    // A prefab (from --prefabs) is copied in after the character is written
    if (item.prefab) {
      prefabs.push({ section, index, item });
      continue;
    }
    const kind = kindOf(item);
    let draft;
    if (kind === 'list') {
      draft = hw.powerDraft(character, section, undefined, 'list');
      draft.name = item.name || item.alias || 'List';
      draft.notes = item.notes ?? '';
    } else if (kind === 'compound') {
      draft = hw.powerDraft(character, section, undefined, 'compound');
      draft.name = item.name ?? '';
      draft.notes = item.notes ?? '';
      const parts = asArray(item.parts ?? item.subPowers);
      draft.subPowers = parts.map((part) => {
        let scratch = { ...character, powers: [] };
        const partDraft = powerFrom(scratch, 'powers', { ...part, name: part.name ?? '' }, ir, notes);
        scratch = hw.savePowerDraft(scratch, 'powers', undefined, partDraft);
        return scratch.powers.at(-1);
      });
    } else if (kind === 'multipower' || kind === 'vpp') {
      draft = powerFrom(character, section, { ...item, build: item.build ?? undefined }, ir, notes);
      const framework = hw.powerDraft(character, section, undefined, kind);
      draft = { ...framework, name: item.name ?? '', notes: item.notes ?? '', reserve: num(item.reserve, framework.reserve), modifiers: item.build ? draft.modifiers : [] };
    } else {
      draft = powerFrom(character, section, item, ir, notes);
    }
    draft = applyItemFields(draft, item, ids);
    const before = new Set((character[list] ?? []).map((p) => p.id));
    character = hw.savePowerDraft(character, section, undefined, draft);
    const created = (character[list] ?? []).find((p) => !before.has(p.id) && !p.parentId === !draft.parentId);
    if (created) {
      ids.set(item.id ?? item.name, created.id);
      track(section, index, item, created.id);
    }
  }
  return character;
}

// =============================================================================
// Build
// =============================================================================

export function buildCharacter(ir) {
  const template = ir.template ?? ir.basicConfiguration?.exportTemplate ?? 'builtIn.Heroic6E.hdt';
  const info = { ...(ir.characterInfo ?? {}) };
  if (info.heightUnit === 'in' && info.height) info.height *= 2.54;
  if (info.weightUnit === 'lb' && info.weight) info.weight *= 0.453592;
  delete info.heightUnit;
  delete info.weightUnit;
  const config = { basePoints: 175, disadPoints: 50, experience: 0, ...(ir.basicConfiguration ?? {}) };

  let character = hw.parseHdcFile(hw.blankHdc({ basicConfiguration: config, characterInfo: info }, template));
  character = { ...character, characterInfo: { ...character.characterInfo, ...info }, basicConfiguration: { ...character.basicConfiguration, ...config } };
  const report = [];
  const ids = new Map();
  created = [];
  prefabs = [];
  character = applyCharacteristics(character, ir, report);
  character = addSkills(character, ir, ids, report);
  character = addPerks(character, ir, report);
  character = addTalents(character, ir);
  character = addManeuvers(character, ir);
  character = addComplications(character, ir);
  character = addPowerItems(character, 'powers', ir.powers, ir, ids, report);
  character = addPowerItems(character, 'equipment', ir.equipment, ir, ids, report);
  return { character, template, report, created, prefabs, ids };
}

// =============================================================================
// Prefabs
// =============================================================================

/** Every top-level power and equipment item in the .hdp/.hdc files under `dir`, by name */
export function loadPrefabLibrary(dir) {
  const library = new Map();
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const path = join(d, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(hdp|hdc)$/i.test(name)) {
        const xml = hw.decodeHdcBytes(readFileSync(path));
        const c = hw.parseHdcFile(xml);
        for (const item of [...c.powers, ...(c.equipment ?? [])]) {
          if (item.parentId || !item.name) continue;
          if (!library.has(norm(item.name))) library.set(norm(item.name), { xml, id: item.id, name: item.name, file: path });
        }
      }
    }
  };
  walk(dir);
  return library;
}

const SECTION_TAGS = { powers: 'POWERS', equipment: 'EQUIPMENT' };

/** Copies the IR's prefab items into the written character */
function insertPrefabs(xml, pending, library, idOf, map, report) {
  for (const { section, index, item } of pending) {
    const found = library?.get(norm(item.prefab));
    if (!found) {
      report.push(`${section} "${item.name ?? item.prefab}": prefab "${item.prefab}" isn't in the prefab library${library ? '' : ' (no --prefabs given)'}`);
      continue;
    }
    const transfer = hw.extractItems(found.xml, found.id);
    if (!transfer) continue;
    const inserted = hw.insertItems(xml, { ...transfer, section: SECTION_TAGS[section] }, { parentId: item.parentId ? idOf(item.parentId) : undefined });
    xml = inserted.xml;
    // The character's copy keeps the sheet's name ("Spectre (Tulawar)"), which its levels link to
    if (item.name && norm(item.name) !== norm(found.name)) {
      const doc = hw.HdcDocument.parse(xml);
      doc.findById(inserted.id)?.setAttr('NAME', item.name);
      xml = doc.toString();
    }
    map.push({ section, index, name: item.name ?? found.name, id: inserted.id });
    report.push(`${section} "${item.name ?? found.name}": copied from prefab "${found.name}" (${found.file.split(/[\/]/).pop()})`);
  }
  return xml;
}

export function buildHdc(ir, options = {}) {
  const { character, template, report, created: items, prefabs: pending, ids } = buildCharacter(ir);
  const written = hw.createHdc(character, { template });
  // IR item → the HDC ID the writer gave it, for score-hdc.mjs
  const hdcId = (modelId) => written.report.idMap[modelId] ?? modelId;
  const map = items.map((c) => ({ section: c.section, index: c.index, name: c.name, id: hdcId(c.modelId) }));
  const library = options.prefabs ? loadPrefabLibrary(options.prefabs) : undefined;
  const xml = insertPrefabs(written.xml, pending, library, (irId) => (ids.has(irId) ? hdcId(ids.get(irId)) : undefined), map, report);
  const repaired = hw.repairForFoundry(xml);
  return {
    xml: repaired.xml,
    character,
    map,
    report: [
      ...report,
      ...written.report.warnings.map((w) => `writer: ${w}`),
      ...repaired.changes.map((c) => `import repair: ${c}`),
      ...repaired.unresolved.map((c) => `import repair (unresolved): ${c}`),
    ],
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const flag = args.findIndex((a) => a.startsWith('--prefabs'));
  const prefabDir = flag >= 0 ? (args[flag].includes('=') ? args[flag].split('=')[1] : args[flag + 1]) : undefined;
  const positional = args.filter((a, i) => i !== flag && !(flag >= 0 && !args[flag].includes('=') && i === flag + 1));
  const [irPath, hdcPath, reportPath] = positional;
  if (!irPath || !hdcPath) {
    console.error('Usage: node build-hdc.mjs <character.ir.json> <character.hdc> [build-report.md] [--prefabs <dir>]');
    process.exit(1);
  }
  const ir = JSON.parse(readFileSync(irPath, 'utf8').replace(/^\uFEFF/, ''));
  const { xml, report, map } = buildHdc(ir, { prefabs: prefabDir });
  writeFileSync(hdcPath, hw.encodeHdcUtf16(xml));
  writeFileSync(`${hdcPath}.map.json`, JSON.stringify(map, null, 1));
  const text = ['# Build report', '', ...(report.length ? report.map((r) => `- ${r}`) : ['Nothing to review.']), ''].join('\n');
  if (reportPath) writeFileSync(reportPath, text);
  console.log(`Wrote ${hdcPath}; ${report.length} notes${reportPath ? ` in ${reportPath}` : ''}`);
}
