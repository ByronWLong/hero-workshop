/**
 * Item forms for the non-power sections (skills, perks, talents, complications, martial
 * arts): which fields to show, what they cost, and how saving updates the character.
 *
 * Saving merges the form into the existing item, so data the form doesn't show (adders,
 * modifiers, group membership, attributes only the HDC knows about) is kept.
 */

import type {
  Adder,
  Character,
  Power,
  Disadvantage,
  MartialManeuver,
  Perk,
  Skill,
  Talent,
} from '../types.js';
import {
  DISADVANTAGE_CATALOG_6E,
  PERK_CATALOG_6E,
  TALENT_CATALOG_6E,
  type CatalogAdder,
  type CatalogEntry,
} from '../generated/catalog6e.js';
import {
  defaultBasePrice,
  perkTalentCosts,
  perkTalentEntry,
  perkTalentLevelPrice,
  perkTalentOption,
  perkXmlId,
  talentXmlId,
  type PerkTalentKind,
  type PerkTalentPurchase,
} from '../perkTalentCosts.js';
import { SKILL_CATALOG_6E } from '../generated/skillCatalog6e.js';
import { calculateAdderCost } from '../utils.js';
import { getPowerDefinition } from '../powerDefinitions.js';
import {
  pslOptionAlias,
  pslPenaltiesFor,
  pslPenalty,
  pslPenaltyInName,
  skillLevelCost,
  skillLevelOption,
  skillLevelOptions,
} from '../skillLevels.js';
import { LABELLED_SKILL_XMLIDS, skillItemName } from '../hdc/foundry.js';
import { retargetSkillRolls } from './powers.js';
import { sectionItems, setSectionItems, type ListItem, type SectionId } from './lists.js';

export type FormSection = Exclude<SectionId, 'powers' | 'equipment'>;
export type FormValues = Record<string, string | number | boolean | string[] | undefined>;

export interface FieldOption {
  value: string;
  label: string;
  selected?: boolean;
  /** Heading the option is listed under (checklists) */
  group?: string;
  /** Extra context shown after the label, e.g. the item a compound part belongs to */
  detail?: string;
}

export interface FormField {
  name: string;
  label: string;
  /** "attacks": a checklist of the character's attacks (Combat Skill Levels and the like) */
  type: 'text' | 'number' | 'select' | 'checkbox' | 'textarea' | 'attacks';
  value: string | number | boolean | string[];
  options?: FieldOption[];
  hint?: string;
  /** Checklists: shortcuts that tick a group of choices ("Tick all Agility skills") */
  picks?: { label: string; values: string[] }[];
  /** The checklist's value is a starting choice the item doesn't have yet (saved with it) */
  defaulted?: boolean;
}

export interface ItemForm {
  title: string;
  fields: FormField[];
  cost: number;
  costLabel: string;
}

const newId = () => `new-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));
const num = (v: unknown, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const bool = (v: unknown) => v === true || v === 'true' || v === 'on';
const options = (list: { value: string; label: string }[], selected: string) =>
  list.map((o) => ({ ...o, selected: o.value === selected }));

// =============================================================================
// Skills
// =============================================================================

const SKILLS_BY_ID = new Map(SKILL_CATALOG_6E.map((s) => [s.xmlId, s]));

/** Hero Designer's short label for background skills ("KS: Arcana") */
const BACKGROUND_ALIAS: Record<string, string> = {
  KNOWLEDGE_SKILL: 'KS',
  PROFESSIONAL_SKILL: 'PS',
  SCIENCE_SKILL: 'SS',
  AREA_KNOWLEDGE: 'AK',
  CITY_KNOWLEDGE: 'CK',
  TRANSPORT_FAMILIARITY: 'TF',
  WEAPON_FAMILIARITY: 'WF',
  POWERSKILL: 'Power',
};

/** A breadth-priced skill's choices (the template's, plus an older value the skill still has) */
function breadthOptions(xmlid: string, current: string) {
  const list = (skillLevelOptions(xmlid) ?? []).map((o) => ({ value: o.xmlId, label: `${capitalize(o.display)} (${o.lvlCost ?? 0}/level)` }));
  const legacy = current && !list.some((o) => o.value === current) ? skillLevelOption(xmlid, current) : undefined;
  if (legacy) list.push({ value: legacy.xmlId, label: `${capitalize(legacy.display)} (${legacy.lvlCost ?? 0}/level)` });
  return list;
}
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const LANGUAGE_OPTIONS = [
  { value: 'BASIC', label: 'Basic conversation (1)', cost: 1 },
  { value: 'FLUENT', label: 'Fluent conversation (2)', cost: 2 },
  { value: 'ACCENT', label: 'Completely fluent, with accent (3)', cost: 3 },
  { value: 'IDIOMATIC', label: 'Idiomatic, native accent (4)', cost: 4 },
  { value: 'DIALECTS', label: 'Imitate dialects (5)', cost: 5 },
];

// =============================================================================
// Combat Skill Levels: the attacks they apply to
// =============================================================================

/**
 * Skills whose levels apply only to chosen attacks. hero6e links them through custom adders
 * (XMLID "ADDER", no cost) named after each attack, matched to the Foundry item's name,
 * ALIAS or XMLID.
 */
const ATTACK_LINKED_SKILLS = ['COMBAT_LEVELS', 'MENTAL_COMBAT_LEVELS', 'PENALTY_SKILL_LEVELS', 'WEAPON_MASTER'];

/** Whether this skill (with this option) applies to chosen attacks; "all attacks" options don't */
export function showsAttacks(xmlid: string, option: string): boolean {
  if (!ATTACK_LINKED_SKILLS.includes(xmlid)) return false;
  if (option === 'ALL') return false;
  if (xmlid === 'PENALTY_SKILL_LEVELS' && (option === 'SINGLEDCV' || option === 'GROUPDCV')) return false;
  return true;
}

const isLinkAdder = (a: { xmlId?: string; baseCost?: number }) => (a.xmlId === 'ADDER' || !a.xmlId) && !a.baseCost;
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

/** Frameworks and lists stand for everything in them */
const CONTAINERS = ['LIST', 'MULTIPOWER', 'VPP', 'ELEMENTAL_CONTROL'];

/** The character's attacks a Combat Skill Level can apply to, by the name hero6e matches */
export function cslAttackChoices(character: Character): { value: string; label: string; group: string; detail?: string }[] {
  const out: { value: string; label: string; group: string; detail?: string }[] = [];
  const add = (value: string | undefined, group: string, detail?: string) => {
    if (value && !out.some((o) => o.value.toLowerCase() === value.toLowerCase())) out.push({ value, label: value, group, detail });
  };
  const isAttack = (p: { type?: string; xmlId?: string; doesDamage?: boolean }) => {
    const xmlId = p.xmlId ?? p.type ?? '';
    const def = getPowerDefinition(xmlId);
    return xmlId === 'HANDTOHANDATTACK' || !!p.doesDamage || !!def?.types?.includes('ATTACK');
  };
  const LISTS = 'Lists and frameworks (everything in them)';
  for (const p of character.powers) {
    if (p.isContainer && CONTAINERS.includes(p.type)) add(p.name, LISTS);
    else if (isAttack(p)) add(p.name, 'Powers');
  }
  for (const e of character.equipment ?? []) {
    const powerLike = e as unknown as Power;
    if (e.subPowers?.length) for (const part of e.subPowers.filter(isAttack)) add(part.name, 'Equipment', e.name);
    else if (powerLike.isContainer && CONTAINERS.includes(powerLike.type)) add(e.name, LISTS);
    else if (isAttack(powerLike)) add(e.name, 'Equipment');
  }
  for (const m of character.martialArts) if (!m.isGroup) add(m.name, 'Martial maneuvers');
  const order = [LISTS, 'Powers', 'Equipment', 'Martial maneuvers'];
  return out.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
}

/** The skill's attack links: keeps other adders and existing links, adds the newly chosen */
function withAttackLinks(adders: Adder[] | undefined, chosen: string[]): Adder[] | undefined {
  const wanted = new Set(chosen.map((n) => n.toLowerCase()));
  const kept = (adders ?? []).filter((a) => !isLinkAdder(a) || wanted.has((a.alias ?? a.name).toLowerCase()));
  const have = new Set(kept.filter(isLinkAdder).map((a) => (a.alias ?? a.name).toLowerCase()));
  const added = chosen
    .filter((n) => !have.has(n.toLowerCase()))
    .map((n): Adder => ({ id: newId(), xmlId: 'ADDER', name: n, alias: n, baseCost: 0, selected: true }));
  const result = [...kept, ...added];
  return result.length ? result : undefined;
}

// =============================================================================
// Skill Levels: the skills they apply to
// =============================================================================

/**
 * Skill Levels options that apply to chosen skills. hero6e finds them by name: a skill roll
 * gets the levels when the Skill Levels' OPTION_ALIAS contains the skill's name or XMLID, so
 * even the broad options ("with all Agility Skills") name their skills to take effect.
 */
const SKILL_LINKED_OPTIONS = ['CHARACTERISTIC', 'RELATED', 'SINGLE', 'CHAR', 'THREE', 'TIGHT'];

type SkillGroup = 'Agility' | 'Intellect' | 'Interaction' | 'Background' | 'Non-Combat' | 'All';

/** Broad options and the skill groups they cover; a preset option starts with its first group ticked */
const BROAD_OPTIONS: Record<string, { picks: SkillGroup[]; preset: boolean }> = {
  GROUP: { picks: ['Intellect', 'Interaction', 'Background'], preset: false },
  AGILITY: { picks: ['Agility'], preset: true },
  NONCOMBAT: { picks: ['Non-Combat'], preset: true },
  OVERALL: { picks: ['All'], preset: true },
  ALL: { picks: ['All'], preset: true },
};

/** Combat Skills (6E): Skill Levels with all Non-Combat Skills don't cover them */
const COMBAT_SKILLS = new Set([
  'AUTOFIRE_SKILLS', 'DEFENSE_MANEUVER', 'RAPID_ATTACK_HTH', 'RAPID_ATTACK_RANGED',
  'TWO_WEAPON_FIGHTING_HTH', 'TWO_WEAPON_FIGHTING_RANGED', 'WEAPON_FAMILIARITY',
]);
const BACKGROUND_SKILLS = new Set([
  'KNOWLEDGE_SKILL', 'PROFESSIONAL_SKILL', 'SCIENCE_SKILL', 'AREA_KNOWLEDGE', 'CITY_KNOWLEDGE', 'LANGUAGES', 'TRANSPORT_FAMILIARITY',
]);

const IN_GROUP: Record<SkillGroup, (s: { xmlid: string; characteristic?: string }) => boolean> = {
  Agility: (s) => s.characteristic === 'DEX' && !COMBAT_SKILLS.has(s.xmlid),
  Intellect: (s) => s.characteristic === 'INT' && !BACKGROUND_SKILLS.has(s.xmlid),
  Interaction: (s) => s.characteristic === 'PRE',
  Background: (s) => BACKGROUND_SKILLS.has(s.xmlid),
  'Non-Combat': (s) => !COMBAT_SKILLS.has(s.xmlid),
  All: () => true,
};

/** Whether these Skill Levels (with this option) apply to chosen skills */
export function showsSkills(xmlid: string, option: string): boolean {
  return xmlid === 'SKILL_LEVELS' && (SKILL_LINKED_OPTIONS.includes(option || 'CHARACTERISTIC') || option in BROAD_OPTIONS);
}

/** Skill Levels and the like don't take levels themselves */
const NOT_LEVELLED = new Set(['SKILL_LEVELS', 'COMBAT_LEVELS', 'MENTAL_COMBAT_LEVELS', 'PENALTY_SKILL_LEVELS']);

export interface SkillLevelChoice {
  value: string;
  label: string;
  group: string;
  xmlid: string;
  characteristic?: string;
}

/** The character's skills Skill Levels can apply to, by the name hero6e matches */
export function skillLevelChoices(character: Character): SkillLevelChoice[] {
  const out: SkillLevelChoice[] = [];
  for (const s of character.skills) {
    if (s.isGroup || NOT_LEVELLED.has(s.xmlid ?? '')) continue;
    const name = s.bindingName ?? s.name;
    if (name && !out.some((o) => o.value.toLowerCase() === name.toLowerCase())) {
      out.push({ value: name, label: name, group: 'Skills', xmlid: s.xmlid ?? '', characteristic: s.characteristic });
    }
  }
  return out;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const namesIn = (text: string, name: string) => new RegExp(`(^|[^\\w])${escapeRegex(name)}($|[^\\w])`, 'i').test(text);

/**
 * The skills an OPTION_ALIAS names ("with Stealth, Climbing", "with all Agility Skills
 * (Stealth, Climbing)"): the character's, then any others
 */
export function skillsInAlias(xmlid: string, alias: string | undefined, choices: { value: string }[]): string[] {
  let text = (alias ?? '').trim();
  // The option's own wording names no skill; a broad option names its skills after it, in brackets
  const wording = skillLevelOptions(xmlid)?.find((o) => text.toLowerCase().startsWith(o.display.toLowerCase()));
  if (wording) text = text.slice(wording.display.length).trim().replace(/^\((.*)\)$/, '$1');
  if (!text) return [];
  const known = choices.filter((c) => namesIn(text, c.value)).map((c) => c.value);
  const others = text
    .replace(/^with\s+/i, '')
    .split(/\s*,\s*|\s+and\s+/i)
    .map((s) => s.trim())
    .filter((s) => s && !known.some((k) => namesIn(s, k) || namesIn(k, s)));
  return [...known, ...others];
}

/**
 * The OPTION_ALIAS naming these skills: "with Stealth, Climbing", or for a broad option its
 * wording and then the skills ("with all Agility Skills (Stealth, Climbing)"). The option's
 * own wording when there are none.
 */
export function skillLevelAlias(xmlid: string, option: string, skills: string[]): string | undefined {
  const wording = skillLevelOption(xmlid, option)?.display;
  if (!skills.length) return wording;
  return option in BROAD_OPTIONS && wording ? `${wording} (${skills.join(', ')})` : `with ${skills.join(', ')}`;
}

/**
 * The checklist of what a skill level applies to: attacks (Combat Skill Levels and the like,
 * linked through adders) or skills (Skill Levels, named in OPTION_ALIAS). None for options
 * that cover everything.
 */
export function levelTargetsField(
  character: Character | undefined,
  item: { xmlid: string; option: string; adders?: Adder[]; optionAlias?: string },
  chosenNow?: string[],
): FormField | undefined {
  const { xmlid, option } = item;
  if (showsAttacks(xmlid, option)) {
    const chosen = chosenNow ?? (item.adders ?? []).filter(isLinkAdder).map((a) => a.alias ?? a.name);
    const choices = character ? cslAttackChoices(character) : [];
    return {
      name: 'attacks',
      label: 'Attacks it applies to',
      type: 'attacks',
      value: chosen,
      hint: 'hero6e uses the levels only with these. A list or framework covers everything in it.',
      options: checklist(choices, chosen),
    };
  }
  if (showsSkills(xmlid, option)) {
    const choices = character ? skillLevelChoices(character) : [];
    const broad = BROAD_OPTIONS[option];
    const picks = (broad?.picks ?? []).map((group) => ({
      label: group === 'All' ? 'Tick every skill' : `Tick all ${group} skills`,
      values: choices.filter(IN_GROUP[group]).map((c) => c.value),
    }));
    let chosen = chosenNow ?? skillsInAlias(xmlid, item.optionAlias, choices);
    // A broad option that names no skills yet starts with the skills it covers
    const defaulted = !chosenNow && !chosen.length && !!broad?.preset && !!picks[0]?.values.length;
    if (defaulted) chosen = picks[0]!.values;
    return {
      name: 'skills',
      label: 'Skills it applies to',
      type: 'attacks',
      value: chosen,
      hint: broad
        ? 'hero6e adds the levels only to rolls with skills the option text names, so the skills it covers are listed after it. Tick any you add later.'
        : 'hero6e adds the levels to rolls with these skills (it looks for their names in the option text).',
      options: checklist(choices, chosen),
      picks: picks.filter((p) => p.values.length),
      defaulted,
    };
  }
  return undefined;
}

/** Choices ticked when chosen, plus chosen names that match none of them (listed under Other) */
function checklist(choices: { value: string; label: string; group: string; detail?: string }[], chosen: string[]): FieldOption[] {
  const known = new Set(choices.map((c) => c.value.toLowerCase()));
  return [
    ...choices.map(({ value, label, group, detail }) => ({ value, label, group, detail, selected: chosen.some((n) => n.toLowerCase() === value.toLowerCase()) })),
    // Linked names that match none of the character's own items (standard maneuvers like Strike, renamed attacks)
    ...chosen.filter((n) => !known.has(n.toLowerCase())).map((n) => ({ value: n, label: n, group: 'Other', selected: true })),
  ];
}

/** The adders and OPTION_ALIAS that make a skill level apply to the chosen attacks or skills */
export function withLevelTargets(
  item: { xmlid: string; option: string; adders?: Adder[]; optionAlias?: string },
  field: string,
  chosen: string[],
): { adders?: Adder[]; optionAlias?: string } {
  if (field === 'attacks' && showsAttacks(item.xmlid, item.option)) return { adders: withAttackLinks(item.adders, chosen), optionAlias: item.optionAlias };
  if (field === 'skills' && showsSkills(item.xmlid, item.option)) return { adders: item.adders, optionAlias: skillLevelAlias(item.xmlid, item.option, chosen) };
  return { adders: item.adders, optionAlias: item.optionAlias };
}

function skillValues(skill: Skill | undefined): FormValues {
  const xmlid = skill?.xmlid ?? 'CUSTOMSKILL';
  if (LABELLED_SKILL_XMLIDS.includes(xmlid)) {
    return {
      ...otherSkillValues(skill, xmlid),
      label: skill?.alias || BACKGROUND_ALIAS[xmlid] || '',
      name: skill?.customName ?? '',
    };
  }
  return otherSkillValues(skill, xmlid);
}

/** The penalty a PSL offsets: what hero6e reads from its option text, else what its name states */
const pslPenaltyOf = (skill: Skill | undefined) =>
  pslPenalty(skill?.optionAlias, skill?.input) || pslPenaltyInName(skill?.name);

function otherSkillValues(skill: Skill | undefined, xmlid: string): FormValues {
  const values = otherSkillFields(skill, xmlid);
  if (xmlid === 'PENALTY_SKILL_LEVELS') values.penalty = pslPenaltyOf(skill);
  if (ATTACK_LINKED_SKILLS.includes(xmlid)) return { ...values, attacks: (skill?.adders ?? []).filter(isLinkAdder).map((a) => a.alias ?? a.name) };
  // Skill Levels' skills are read from the option text when the form is shown (it needs the character's skills)
  if (xmlid === 'SKILL_LEVELS') return { ...values, optionAlias: skill?.optionAlias ?? '' };
  return values;
}

function otherSkillFields(skill: Skill | undefined, xmlid: string): FormValues {
  const alias = BACKGROUND_ALIAS[xmlid];
  const display = SKILLS_BY_ID.get(xmlid)?.display;
  // Show the user's own name only when it's more than the composed display
  const composed = alias && skill?.input ? `${alias}: ${skill.input}` : display;
  const suffix = skill?.alias && !['CUSTOMSKILL', 'LANGUAGES'].includes(xmlid) ? `: ${skill.alias}` : undefined;
  const custom = skill && skill.name !== composed && skill.name !== alias ? skill.name : '';
  return {
    xmlid,
    name: suffix && custom.endsWith(suffix) ? custom.slice(0, -suffix.length) : custom,
    input: skill?.input ?? '',
    characteristic: skill?.characteristic ?? '',
    levels: skill?.levels ?? 0,
    familiarity: !!skill?.familiarity,
    proficiency: !!skill?.proficiency,
    everyman: !!skill?.everyman,
    option: skill?.option ?? '',
    nativeTongue: !!skill?.nativeTongue,
    literate: !!skill?.adders?.some((a) => a.xmlId === 'LITERACY' && a.selected !== false),
    cost: skill?.baseCost ?? 0,
    notes: skill?.notes ?? '',
  };
}

function skillCost(v: FormValues): number {
  const xmlid = str(v.xmlid);
  const levels = num(v.levels);
  if (bool(v.everyman)) return 0;
  if (xmlid === 'CUSTOMSKILL') return num(v.cost);
  const breadth = skillLevelCost(xmlid, str(v.option) || skillLevelOptions(xmlid)?.[0]?.xmlId, levels);
  if (breadth !== undefined) return breadth;
  if (xmlid === 'LANGUAGES') {
    if (bool(v.nativeTongue)) return 0;
    return (LANGUAGE_OPTIONS.find((o) => o.value === v.option)?.cost ?? 2) + (bool(v.literate) ? 1 : 0);
  }
  const entry = SKILLS_BY_ID.get(xmlid);
  if (bool(v.familiarity)) return entry?.familiarityCost ?? 1;
  const choices = entry?.characteristicChoices ?? [];
  const choice = choices.find((c) => c.characteristic === v.characteristic) ?? choices[0];
  return Math.ceil((choice?.baseCost ?? entry?.baseCost ?? 3) + levels * (choice?.lvlCost ?? entry?.lvlCost ?? 2));
}

function skillForm(v: FormValues, isNew: boolean, character?: Character): ItemForm {
  const xmlid = str(v.xmlid);
  const entry = SKILLS_BY_ID.get(xmlid);
  const fields: FormField[] = [
    {
      name: 'xmlid',
      label: 'Skill',
      type: 'select',
      value: xmlid,
      options: options(
        [
          ...[...SKILL_CATALOG_6E].sort((a, b) => a.display.localeCompare(b.display)).map((s) => ({ value: s.xmlId, label: s.display })),
        ],
        xmlid,
      ),
    },
  ];
  if (entry?.inputLabel || BACKGROUND_ALIAS[xmlid]) {
    fields.push({ name: 'input', label: entry?.inputLabel ?? 'Subject', type: 'text', value: str(v.input) });
  }
  if (LABELLED_SKILL_XMLIDS.includes(xmlid)) {
    fields.push(
      { name: 'label', label: 'Label', type: 'text', value: str(v.label) || BACKGROUND_ALIAS[xmlid] || '', hint: `Shown before the subject, e.g. "${str(v.label) || BACKGROUND_ALIAS[xmlid] || 'PS'}: ${str(v.input) || 'Wizardry'}"; change ${BACKGROUND_ALIAS[xmlid] ?? 'PS'} to MSR or Magic Skill Roll if you like` },
      { name: 'name', label: 'Name', type: 'text', value: str(v.name), hint: `Optional. The skill is called "${skillItemName(str(v.name), str(v.label) || BACKGROUND_ALIAS[xmlid], str(v.input))}" in Foundry, and spells' Requires A Roll links to it by that name` },
    );
  } else {
    fields.push({ name: 'name', label: 'Custom name', type: 'text', value: str(v.name), hint: 'Optional; shown before the skill' });
  }

  if (skillLevelOptions(xmlid)) {
    const list = breadthOptions(xmlid, str(v.option));
    fields.push({ name: 'option', label: 'Applies to', type: 'select', value: str(v.option), options: options(list, str(v.option) || list[0]!.value) });
    if (xmlid === 'PENALTY_SKILL_LEVELS') {
      const penalties = pslPenaltiesFor(str(v.option) || list[0]!.value);
      const penalty = penalties.some((p) => p.value === v.penalty) ? str(v.penalty) : '';
      fields.push({
        name: 'penalty',
        label: 'Penalty',
        type: 'select',
        value: penalty,
        options: options([...penalties, { value: '', label: 'Other' }], penalty),
        hint: "Written into the option's wording, where hero6e reads it. hero6e applies Range and Hit Location PSLs to attack rolls and Encumbrance PSLs to DCV; it doesn't apply other penalties itself",
      });
    }
  } else if (xmlid === 'LANGUAGES') {
    fields.push(
      { name: 'option', label: 'Fluency', type: 'select', value: str(v.option), options: options(LANGUAGE_OPTIONS, str(v.option) || 'FLUENT') },
      { name: 'literate', label: 'Literate', type: 'checkbox', value: bool(v.literate) },
      { name: 'nativeTongue', label: 'Native language', type: 'checkbox', value: bool(v.nativeTongue) },
    );
  } else if (entry?.characteristicChoices?.length) {
    const choices = entry.characteristicChoices.map((c) => ({
      value: c.characteristic,
      label: c.characteristic === 'GENERAL' ? 'General (no characteristic)' : c.characteristic,
    }));
    if (choices.length > 1) {
      fields.push({ name: 'characteristic', label: 'Based on', type: 'select', value: str(v.characteristic), options: options(choices, str(v.characteristic) || choices[0]!.value) });
    }
  }
  const targets = levelTargetsField(
    character,
    { xmlid, option: str(v.option), optionAlias: str(v.optionAlias) },
    Array.isArray(v.attacks) ? list(v.attacks) : Array.isArray(v.skills) ? list(v.skills) : undefined,
  );
  if (targets) fields.push(targets);
  if (xmlid === 'CUSTOMSKILL') {
    fields.push({ name: 'cost', label: 'Cost', type: 'number', value: num(v.cost) });
  }
  if (xmlid !== 'LANGUAGES') {
    fields.push({ name: 'levels', label: 'Levels', type: 'number', value: num(v.levels) });
    if (entry?.familiarityCost !== undefined) {
      fields.push({ name: 'familiarity', label: 'Familiarity only (8-)', type: 'checkbox', value: bool(v.familiarity) });
    }
    fields.push({ name: 'everyman', label: 'Everyman skill', type: 'checkbox', value: bool(v.everyman) });
  }
  fields.push({ name: 'notes', label: 'Notes', type: 'textarea', value: str(v.notes) });
  return { title: isNew ? 'Add skill' : 'Edit skill', fields, cost: skillCost(v), costLabel: 'pts' };
}

/** PS/KS/SS, area/city knowledge and Power skills: "Label: Subject", or a custom name */
function saveLabelledSkill(existing: Skill | undefined, v: FormValues, position: number): Skill {
  const xmlid = str(v.xmlid);
  // A label that is just another type's standard label (PS after converting to a Power skill) follows the type
  const typed = str(v.label).trim();
  const standard = Object.values(BACKGROUND_ALIAS);
  const retyped = !!existing && existing.xmlid !== xmlid;
  const alias = (typed && !(retyped && standard.includes(typed)) ? typed : BACKGROUND_ALIAS[xmlid]) || 'PS';
  const input = str(v.input).trim() || undefined;
  const customName = str(v.name).trim() || undefined;
  const cost = skillCost(v);
  const entry = SKILLS_BY_ID.get(xmlid);
  const characteristic = (str(v.characteristic) || entry?.characteristicChoices?.[0]?.characteristic) as Skill['characteristic'];
  return {
    ...(existing ?? { id: newId(), type: 'GENERAL', position }),
    name: customName ?? (input ? `${alias}: ${input}` : alias),
    alias,
    customName,
    bindingName: skillItemName(customName, alias, input),
    xmlid,
    input,
    characteristic,
    levels: num(v.levels),
    familiarity: bool(v.familiarity),
    everyman: bool(v.everyman) || undefined,
    notes: str(v.notes) || undefined,
    baseCost: cost,
    realCost: existing?.modifiers?.length ? existing.realCost : cost,
  } as Skill;
}

function saveSkill(existing: Skill | undefined, v: FormValues, position: number, character?: Character): Skill {
  const xmlid = str(v.xmlid);
  if (LABELLED_SKILL_XMLIDS.includes(xmlid)) return saveLabelledSkill(existing, v, position);
  const entry = SKILLS_BY_ID.get(xmlid);
  const alias = BACKGROUND_ALIAS[xmlid] ?? (xmlid === 'LANGUAGES' ? 'Language' : existing?.alias ?? entry?.display);
  const input = str(v.input).trim() || undefined;
  const customName = str(v.name).trim();
  // Compose the display name the way the HDC parser does, so saving round-trips cleanly
  const composed = BACKGROUND_ALIAS[xmlid] && input ? `${alias}: ${input}` : xmlid === 'LANGUAGES' && input ? `Language:  ${input}` : undefined;
  // A custom name is shown before the skill ("Demonic Claw Focus: Combat Skill Levels"), as the parser shows it
  const prefixed = customName && alias && !['CUSTOMSKILL', 'LANGUAGES'].includes(xmlid) && customName !== alias;
  const shownName = prefixed ? `${customName}: ${alias}` : customName;
  // Nothing to compose it from (e.g. a Weapon Familiarity listing its weapons as adders): keep the name it has
  const name = shownName || composed || (existing && existing.xmlid === xmlid ? existing.name : entry?.display ?? 'Skill');
  const cost = skillCost(v);
  // The form shows the first option until another is picked; save that one too
  const option = str(v.option) || skillLevelOptions(xmlid)?.[0]?.xmlId || (xmlid === 'LANGUAGES' ? 'FLUENT' : undefined);
  // Hero Designer's OPTION_ALIAS is the option's display ("with HTH Combat")
  const optionLabel = skillLevelOption(xmlid, option)?.display ?? LANGUAGE_OPTIONS.find((o) => o.value === option)?.label;
  // A PSL's option text names its penalty, which hero6e reads; a penalty the option can't take is dropped
  const penalty = xmlid === 'PENALTY_SKILL_LEVELS' && v.penalty !== undefined
    ? pslPenaltiesFor(option).find((p) => p.value === v.penalty)?.value ?? ''
    : undefined;
  // Compared with what hero6e reads now: a penalty only the name states is written into the text
  const pslAlias = penalty !== undefined
    && (option !== existing?.option || !existing?.optionAlias || penalty !== pslPenalty(existing.optionAlias, existing.input))
    ? pslOptionAlias(option, penalty)
    : undefined;
  const characteristic = (str(v.characteristic) || entry?.characteristicChoices?.[0]?.characteristic) as Skill['characteristic'];

  let adders = existing?.adders;
  if (showsAttacks(xmlid, str(v.option)) && Array.isArray(v.attacks)) adders = withAttackLinks(adders, v.attacks);
  // Skill Levels name their skills in OPTION_ALIAS (a broad option's skills, even if the form wasn't touched)
  const targets = showsSkills(xmlid, str(v.option))
    ? levelTargetsField(character, { xmlid, option: str(v.option), optionAlias: str(v.optionAlias) }, Array.isArray(v.skills) ? list(v.skills) : undefined)
    : undefined;
  const skillsAlias = targets && (Array.isArray(v.skills) || targets.defaulted) ? skillLevelAlias(xmlid, str(v.option), targets.value as string[]) : undefined;
  if (xmlid === 'LANGUAGES') {
    const others = (adders ?? []).filter((a) => a.xmlId !== 'LITERACY');
    const literacy = (existing?.adders ?? []).find((a) => a.xmlId === 'LITERACY') ?? {
      id: newId(), xmlId: 'LITERACY', name: 'literate', alias: 'literate', baseCost: 1, selected: true,
    };
    adders = bool(v.literate) ? [...others, literacy] : others;
  }

  return {
    ...(existing ?? { id: newId(), type: 'GENERAL', position }),
    name,
    alias,
    xmlid,
    input,
    characteristic,
    levels: xmlid === 'LANGUAGES' ? 0 : num(v.levels),
    familiarity: bool(v.familiarity),
    proficiency: bool(v.proficiency),
    everyman: bool(v.everyman) || undefined,
    option,
    // Keep the file's own wording (e.g. "with Demonic Claw") unless the option itself changed
    optionAlias: skillsAlias ?? pslAlias ?? (option && option !== existing?.option ? optionLabel?.replace(/ \(.*\)$/, '') : existing?.optionAlias),
    nativeTongue: bool(v.nativeTongue) || undefined,
    notes: str(v.notes) || undefined,
    baseCost: cost,
    realCost: existing?.modifiers?.length ? existing.realCost : cost,
    adders,
  } as Skill;
}

// =============================================================================
// Perks, talents, complications, maneuvers
// =============================================================================

/** Editor perk types (as the web editor names them) with their Hero Designer entries */
const PERK_TYPES: { value: Perk['type']; xmlId: string }[] = [
  { value: 'ACCESS', xmlId: 'ACCESS' },
  { value: 'ANONYMITY', xmlId: 'ANONYMITY' },
  { value: 'COMPUTER_LINK', xmlId: 'COMPUTER_LINK' },
  { value: 'CONTACT', xmlId: 'CONTACT' },
  { value: 'DEEP_COVER', xmlId: 'DEEP_COVER' },
  { value: 'FAVOR', xmlId: 'FAVOR' },
  { value: 'FOLLOWER', xmlId: 'FOLLOWER' },
  { value: 'FRINGE_BENEFIT', xmlId: 'FRINGE_BENEFIT' },
  { value: 'MONEY', xmlId: 'MONEY' },
  { value: 'REPUTATION', xmlId: 'REPUTATION' },
  { value: 'RESOURCE_POOL', xmlId: 'RESOURCE_POOL' },
  { value: 'VEHICLE_BASE', xmlId: 'VEHICLE_BASE' },
  { value: 'GENERIC', xmlId: 'CUSTOMPERK' },
];
const PERK_LABELS = new Map(PERK_CATALOG_6E.map((p) => [p.xmlId, p.display]));
const perkLabel = (type: string) => PERK_LABELS.get(PERK_TYPES.find((p) => p.value === type)?.xmlId ?? '') ?? type;

/** Template wording without its level placeholder ("Deadly Blow:  +[LVL]d6" is Deadly Blow) */
const plainDisplay = (display: string) => display.replace(/:?\s*[+x-]?\[LVL\].*$/, '').replace(/^\[(.*)\]$/, '$1').trim();

/** Talents are typed by Hero Designer's XMLID (earlier editors' names are read as theirs) */
const TALENT_TYPES = TALENT_CATALOG_6E.map((t) => ({ value: t.xmlId, label: plainDisplay(t.display) }));
const talentLabel = (type: string) => TALENT_TYPES.find((t) => t.value === talentXmlId(type))?.label ?? type;

const DISAD_TYPES: { value: Disadvantage['type']; xmlId: string }[] = [
  { value: 'ACCIDENTAL_CHANGE', xmlId: 'ACCIDENTALCHANGE' },
  { value: 'DEPENDENCE', xmlId: 'DEPENDENCE' },
  { value: 'DEPENDENT_NPC', xmlId: 'DEPENDENTNPC' },
  { value: 'DISTINCTIVE_FEATURES', xmlId: 'DISTINCTIVEFEATURES' },
  { value: 'ENRAGED', xmlId: 'ENRAGED' },
  { value: 'HUNTED', xmlId: 'HUNTED' },
  { value: 'NEGATIVE_REPUTATION', xmlId: 'REPUTATION' },
  { value: 'PHYSICAL_COMPLICATION', xmlId: 'PHYSICALLIMITATION' },
  { value: 'PSYCHOLOGICAL_COMPLICATION', xmlId: 'PSYCHOLOGICALLIMITATION' },
  { value: 'RIVALRY', xmlId: 'RIVALRY' },
  { value: 'SOCIAL_COMPLICATION', xmlId: 'SOCIALLIMITATION' },
  { value: 'SUSCEPTIBILITY', xmlId: 'SUSCEPTIBILITY' },
  { value: 'UNLUCK', xmlId: 'UNLUCK' },
  { value: 'VULNERABILITY', xmlId: 'VULNERABILITY' },
  { value: 'GENERIC', xmlId: 'GENERICDISADVANTAGE' },
];
const DISAD_LABELS = new Map(DISADVANTAGE_CATALOG_6E.map((d) => [d.xmlId, d.display]));
const disadLabel = (type: string) => DISAD_LABELS.get(DISAD_TYPES.find((d) => d.value === type)?.xmlId ?? '') ?? type;
/** Parsed complications carry the HD XMLID as their type; map it back to the editor type */
const disadTypeFor = (d: Disadvantage | undefined) =>
  DISAD_TYPES.find((t) => t.value === d?.type || t.xmlId === d?.type || t.xmlId === d?.category)?.value ?? 'PSYCHOLOGICAL_COMPLICATION';

const signedText = (n: number) => (n >= 0 ? `+${n}` : String(n));

// =============================================================================
// Perks and talents: priced as Hero Designer prices them (perkTalentCosts.ts)
// =============================================================================

type PerkOrTalent = Perk | Talent;

const xmlIdFor = (kind: PerkTalentKind, type: string) => (kind === 'perk' ? perkXmlId(type) : talentXmlId(type));
const isCustom = (xmlId: string) => xmlId === 'CUSTOMPERK' || xmlId === 'CUSTOMTALENT';
const isVehicle = (xmlId: string) => xmlId === 'FOLLOWER' || xmlId === 'VEHICLE_BASE';

/** A Fringe Benefit is one benefit, chosen from a list */
const ONE_ADDER = new Set(['FRINGE_BENEFIT']);
/** Adders that exclude each other are chosen in one list, under this label */
const ADDER_GROUP_LABELS: Record<string, string> = { GOODRELATIONSHIP: 'Relationship' };
const LEVEL_HINTS: Record<string, string> = {
  CONTACT: 'The roll: 1 level is 8-, 2 is 11-, each level after +1. 1 point per level',
  REPUTATION: '+1/+1d6 per level; each level costs how widely plus how well it is known (at least 1)',
};

const pointsText = (n: number) => (n < 0 ? String(n) : `${n}`);

/** "3 per level", "1 per 5 levels" */
function levelPriceText(price: { lvlCost: number; lvlVal: number }): string {
  return price.lvlVal > 1 ? `${price.lvlCost} per ${price.lvlVal} levels` : `${price.lvlCost} per level`;
}

interface AdderChoice {
  field: string;
  label: string;
  kind: 'check' | 'options' | 'levels' | 'group';
  adders: CatalogAdder[];
}

/** The template's adders as form choices: ticked, picked from their options, or bought in levels */
function adderChoices(entry: CatalogEntry | undefined): AdderChoice[] {
  if (!entry || ONE_ADDER.has(entry.xmlId)) return [];
  const all = entry.adders ?? [];
  const plain = (a: CatalogAdder) => !a.options?.length && !a.lvlCost;
  const grouped = new Set<string>();
  const out: AdderChoice[] = [];
  for (const a of all) {
    if (grouped.has(a.xmlId)) continue;
    const field = `adder_${a.xmlId}`;
    if (a.options?.length) out.push({ field, label: a.display, kind: 'options', adders: [a] });
    else if (a.lvlCost) out.push({ field, label: a.display.replace('[LVL]', 'N'), kind: 'levels', adders: [a] });
    else {
      const rivals = all.filter((o) => o !== a && plain(o) && (a.excludes?.includes(o.xmlId) || o.excludes?.includes(a.xmlId)));
      if (!rivals.length) out.push({ field, label: a.display, kind: 'check', adders: [a] });
      else {
        [a, ...rivals].forEach((m) => grouped.add(m.xmlId));
        out.push({ field, label: ADDER_GROUP_LABELS[a.xmlId] ?? a.display, kind: 'group', adders: [a, ...rivals] });
      }
    }
  }
  return out;
}

/** A required adder starts at its free option (11-, a small group), else its first */
const startingOption = (a: CatalogAdder) => (a.options?.find((o) => !o.baseCost) ?? a.options?.[0])?.xmlId ?? '';

/** The form values for the item's adders (a new item starts with the ones it must have) */
function adderValues(entry: CatalogEntry | undefined, adders: Adder[] | undefined, isNew: boolean): FormValues {
  const values: FormValues = {};
  const find = (xmlId: string) => adders?.find((a) => a.xmlId === xmlId);
  for (const c of adderChoices(entry)) {
    const def = c.adders[0]!;
    const have = find(def.xmlId);
    if (c.kind === 'check') values[c.field] = !!have;
    else if (c.kind === 'options') values[c.field] = have?.optionId ?? (def.required && isNew ? startingOption(def) : '');
    else if (c.kind === 'levels') values[c.field] = have?.levels ?? 0;
    else values[c.field] = c.adders.find((d) => find(d.xmlId))?.xmlId ?? '';
  }
  if (entry && ONE_ADDER.has(entry.xmlId)) {
    const have = adders?.find((a) => entry.adders?.some((d) => d.xmlId === a.xmlId));
    values.benefit = have ? (have.optionId ? `${have.xmlId}:${have.optionId}` : have.xmlId!) : '';
  }
  return values;
}

function catalogAdder(def: CatalogAdder): Adder {
  const display = def.display.replace('[LVL]', '').replace(/\s+\)/, ')').trim();
  return {
    id: newId(),
    xmlId: def.xmlId,
    name: display,
    alias: display,
    baseCost: def.baseCost ?? 0,
    includeInBase: def.includeInBase,
    selected: true,
  };
}

/**
 * The item's adders as the form chooses them; adders the template doesn't offer are kept. A new
 * item has the ones it must have (an existing one keeps what it has until they're chosen).
 */
function chosenAdders(entry: CatalogEntry | undefined, v: FormValues, existing: Adder[] = [], isNew = false): Adder[] {
  const offered = entry?.adders ?? [];
  const own = new Set(offered.map((a) => a.xmlId));
  const chosen: Adder[] = [];
  const take = (def: CatalogAdder, change: Partial<Adder> = {}) => {
    if (chosen.some((a) => a.xmlId === def.xmlId)) return;
    chosen.push({ ...(existing.find((a) => a.xmlId === def.xmlId) ?? catalogAdder(def)), ...change });
  };
  const withOption = (def: CatalogAdder, optionId: string) => {
    const option = def.options?.find((o) => o.xmlId === optionId);
    // An unchanged option keeps the file's own wording ("Star and Region")
    if (option && existing.some((a) => a.xmlId === def.xmlId && a.optionId === option.xmlId)) take(def);
    else if (option) take(def, { optionId: option.xmlId, optionAlias: option.display, baseCost: option.baseCost ?? def.baseCost ?? 0 });
  };
  if (entry && ONE_ADDER.has(entry.xmlId)) {
    const [xmlId, optionId] = str(v.benefit).split(':');
    const def = offered.find((a) => a.xmlId === xmlId);
    if (def && optionId) withOption(def, optionId);
    else if (def) take(def);
  }
  for (const c of adderChoices(entry)) {
    const def = c.adders[0]!;
    const value = v[c.field];
    if (c.kind === 'check' && bool(value)) take(def);
    else if (c.kind === 'options') withOption(def, str(value) || (def.required && isNew ? startingOption(def) : ''));
    else if (c.kind === 'levels' && num(value) > 0) {
      take(def, { levels: num(value), lvlCost: def.lvlCost, lvlVal: def.lvlVal !== undefined && def.lvlVal !== 1 ? def.lvlVal : undefined });
    } else if (c.kind === 'group') {
      const picked = c.adders.find((d) => d.xmlId === value);
      if (picked) take(picked);
    }
  }
  // An adder brings any it requires (Analyze needs Discriminatory)
  for (const a of [...chosen]) {
    for (const needed of offered.find((d) => d.xmlId === a.xmlId)?.requires ?? []) {
      const def = offered.find((d) => d.xmlId === needed);
      if (def) take(def);
    }
  }
  return [...chosen, ...existing.filter((a) => !own.has(a.xmlId ?? ''))];
}

/** Whether the form asks for the base cost: custom items, a cost within a range, a benefit not listed */
function asksBaseCost(entry: CatalogEntry | undefined, xmlId: string, v: FormValues): boolean {
  if (isCustom(xmlId)) return true;
  if (ONE_ADDER.has(xmlId)) return !str(v.benefit);
  return entry?.minCost !== undefined && entry.maxCost !== undefined && entry.maxCost > entry.minCost && !entry.lvlCost && !entry.options?.length;
}

/** Whether the item is bought in levels */
function hasLevels(entry: CatalogEntry | undefined, xmlId: string, option: string): boolean {
  if (isCustom(xmlId) || isVehicle(xmlId)) return false;
  return xmlId === 'CONTACT' || xmlId === 'REPUTATION' || !!perkTalentLevelPrice(entry, perkTalentOption(entry, option));
}

/** Where the form's base cost comes from: what it was bought at, until the type or option changes */
const priceKey = (type: string, option: string) => `${type}|${option}`;

function purchaseValues(kind: PerkTalentKind, item: PerkOrTalent | undefined, type: string): FormValues {
  const xmlId = xmlIdFor(kind, type);
  const entry = perkTalentEntry(kind, xmlId);
  const option = item?.option ?? entry?.options?.[0]?.xmlId ?? '';
  const basePrice = item?.basePrice ?? (item ? item.baseCost : defaultBasePrice(entry, perkTalentOption(entry, option)));
  const perk = item as Perk | undefined;
  return {
    type,
    name: item?.name ?? '',
    option,
    levels: item ? item.levels ?? 0 : (entry?.levelStart ?? entry?.minVal ?? (xmlId === 'CONTACT' ? 1 : 0)),
    // A custom item's cost is its base cost and levels together
    cost: isCustom(xmlId) ? basePrice + (item?.levels ?? 0) : basePrice,
    priceOf: priceKey(type, option),
    basePoints: perk?.basePoints ?? 0,
    number: perk?.number ?? 1,
    ...adderValues(entry, item?.adders, !item),
    notes: item?.notes ?? '',
  };
}

/** A perk list's adders discount the perks in it (as the HDC parser applies them) */
function listDiscount(character: Character | undefined, kind: PerkTalentKind, item: PerkOrTalent | undefined): number {
  if (kind !== 'perk' || !character || !item?.parentId) return 0;
  return calculateAdderCost(character.perks.find((p) => p.id === item.parentId && p.isGroup)?.adders ?? []);
}

/** What the form buys, priced */
function purchaseFromValues(kind: PerkTalentKind, v: FormValues, existing: PerkOrTalent | undefined, discount = 0) {
  const type = str(v.type);
  const xmlId = xmlIdFor(kind, type);
  const entry = perkTalentEntry(kind, xmlId);
  const option = entry?.options?.length ? str(v.option) || entry.options[0]!.xmlId : '';
  const optionDef = perkTalentOption(entry, option);
  const custom = isCustom(xmlId);
  // A custom talent's cost is its LEVELS, a custom perk's its BASECOST (as Hero Designer writes
  // them); an unchanged cost stays as the file has it
  const keepCustom = custom && existing && xmlIdFor(kind, existing.type) === xmlId && num(v.cost) === (existing.basePrice ?? 0) + (existing.levels ?? 0);
  let levels = custom ? (xmlId === 'CUSTOMTALENT' ? num(v.cost) : 0) : hasLevels(entry, xmlId, option) ? num(v.levels) : existing?.levels ?? 0;
  let basePrice: number;
  if (keepCustom) {
    levels = existing.levels ?? 0;
    basePrice = existing.basePrice ?? 0;
  } else if (custom) basePrice = xmlId === 'CUSTOMTALENT' ? 0 : num(v.cost);
  else if (asksBaseCost(entry, xmlId, v)) basePrice = num(v.cost);
  // A listed benefit is its adder's cost
  else if (ONE_ADDER.has(xmlId)) basePrice = 0;
  else if (str(v.priceOf) === priceKey(type, option)) basePrice = num(v.cost);
  else basePrice = isVehicle(xmlId) || xmlId === 'CONTACT' ? 0 : defaultBasePrice(entry, optionDef);
  const purchase: PerkTalentPurchase = {
    xmlId,
    basePrice,
    levels,
    option: option || undefined,
    adders: chosenAdders(entry, v, existing?.adders, !existing),
    // Callers that give only a cost buy 5 points per point
    basePoints: isVehicle(xmlId) ? (v.basePoints !== undefined ? num(v.basePoints) : num(v.cost) * 5) : undefined,
    number: isVehicle(xmlId) ? Math.max(1, num(v.number, 1)) : undefined,
  };
  const optionAlias = optionDef ? (option === existing?.option ? existing.optionAlias : plainDisplay(optionDef.display)) : undefined;
  const costs = perkTalentCosts(kind, purchase, existing?.modifiers);
  if (discount) costs.real = Math.max(0, costs.active + discount);
  return { type, entry, purchase, optionAlias, costs };
}

function purchaseForm(kind: PerkTalentKind, v: FormValues, isNew: boolean, existing: PerkOrTalent | undefined, discount: number): ItemForm {
  const { type, entry, purchase, costs } = purchaseFromValues(kind, v, existing, discount);
  const xmlId = purchase.xmlId;
  const typeOptions = kind === 'perk'
    ? PERK_TYPES.map((p) => ({ value: p.value, label: perkLabel(p.value) }))
    : TALENT_TYPES;
  const fields: FormField[] = [
    { name: 'type', label: kind === 'perk' ? 'Perk' : 'Talent', type: 'select', value: type, options: options(typeOptions, type) },
    { name: 'name', label: 'Name', type: 'text', value: str(v.name) },
  ];
  if (entry?.options?.length) {
    const list = entry.options.map((o) => {
      const price = perkTalentLevelPrice(entry, o);
      const cost = o.lvlCost !== undefined && price ? levelPriceText(price) : pointsText(defaultBasePrice(entry, o));
      return { value: o.xmlId, label: `${capitalize(plainDisplay(o.display))} (${cost})` };
    });
    fields.push({ name: 'option', label: entry.optionLabel ?? 'Option', type: 'select', value: purchase.option ?? '', options: options(list, purchase.option ?? '') });
  }
  if (ONE_ADDER.has(xmlId)) {
    const list = [
      { value: '', label: 'Other (enter its cost)' },
      ...(entry?.adders ?? []).flatMap((a) =>
        a.options?.length
          ? a.options.map((o) => ({ value: `${a.xmlId}:${o.xmlId}`, label: `${a.display}: ${o.display} (${pointsText(o.baseCost ?? a.baseCost)})` }))
          : [{ value: a.xmlId, label: `${a.display} (${pointsText(a.baseCost)})` }],
      ),
    ];
    fields.push({ name: 'benefit', label: 'Benefit', type: 'select', value: str(v.benefit), options: options(list, str(v.benefit)) });
  }
  if (hasLevels(entry, xmlId, purchase.option ?? '')) {
    const price = perkTalentLevelPrice(entry, perkTalentOption(entry, purchase.option));
    fields.push({ name: 'levels', label: 'Levels', type: 'number', value: num(v.levels), hint: LEVEL_HINTS[xmlId] ?? (price && `${levelPriceText(price)}`) });
  }
  if (isVehicle(xmlId)) {
    fields.push(
      { name: 'basePoints', label: xmlId === 'FOLLOWER' ? "Follower's points" : 'Points built on', type: 'number', value: num(v.basePoints), hint: '1 point per 5 points' },
      { name: 'number', label: 'How many', type: 'number', value: num(v.number, 1), hint: '+5 points per doubling' },
    );
  }
  if (asksBaseCost(entry, xmlId, v)) {
    const range = !isCustom(xmlId) && entry?.minCost !== undefined && entry.maxCost !== undefined ? `${entry.minCost} to ${entry.maxCost} points` : undefined;
    fields.push({ name: 'cost', label: 'Cost', type: 'number', value: num(v.cost), hint: range });
  }
  for (const c of adderChoices(entry)) {
    const def = c.adders[0]!;
    if (c.kind === 'check') {
      fields.push({ name: c.field, label: `${c.label} (${signedText(def.baseCost ?? 0)})`, type: 'checkbox', value: bool(v[c.field]) || purchase.adders!.some((a) => a.xmlId === def.xmlId) });
    } else if (c.kind === 'levels') {
      fields.push({ name: c.field, label: c.label, type: 'number', value: num(v[c.field]), hint: `${def.lvlCost} per level` });
    } else {
      const list = c.kind === 'options'
        ? (def.options ?? []).map((o) => ({ value: o.xmlId, label: `${o.display} (${signedText(o.baseCost ?? def.baseCost ?? 0)})` }))
        : c.adders.map((d) => ({ value: d.xmlId, label: `${d.display} (${signedText(d.baseCost ?? 0)})` }));
      const value = purchase.adders!.find((a) => c.adders.some((d) => d.xmlId === a.xmlId));
      const selected = c.kind === 'options' ? value?.optionId ?? '' : value?.xmlId ?? '';
      // A required adder can't be taken off, but one the item doesn't have yet shows as none
      const none = !def.required || !selected ? [{ value: '', label: 'None' }] : [];
      fields.push({ name: c.field, label: c.label, type: 'select', value: selected, options: options([...none, ...list], selected) });
    }
  }
  fields.push({ name: 'notes', label: 'Notes', type: 'textarea', value: str(v.notes) });
  const title = `${isNew ? 'Add' : 'Edit'} ${kind}`;
  return { title, fields, cost: costs.real, costLabel: 'pts' };
}

function savePurchase<T extends PerkOrTalent>(kind: PerkTalentKind, existing: T | undefined, v: FormValues, position: number, discount: number): T {
  const { type, entry, purchase, optionAlias, costs } = purchaseFromValues(kind, v, existing, discount);
  const label = kind === 'perk' ? perkLabel(type) : talentLabel(type) || entry?.display || type;
  return {
    ...(existing ?? { id: newId(), position, name: '' }),
    type,
    name: str(v.name).trim() || label,
    levels: purchase.levels ?? 0,
    option: purchase.option,
    optionAlias,
    basePrice: purchase.basePrice,
    ...(kind === 'perk' ? { basePoints: purchase.basePoints, number: purchase.number } : {}),
    adders: purchase.adders?.length ? purchase.adders : existing?.adders?.length ? [] : existing?.adders,
    baseCost: costs.active,
    realCost: costs.real,
    notes: str(v.notes) || undefined,
  } as T;
}

// =============================================================================
// Public API
// =============================================================================

export function itemFormValues(character: Character, section: FormSection, itemId?: string): FormValues {
  const item = itemId ? sectionItems(character, section).find((i) => i.id === itemId) : undefined;
  return { ...sectionFormValues(section, item), icon: item?.icon ?? '', free: item?.multiplier === 0, itemId: item?.id };
}

function sectionFormValues(section: FormSection, item: ListItem | undefined): FormValues {
  // Lists only have a name and notes; their members are edited on their own
  if (item?.isGroup) return { group: true, name: item.name, notes: item.notes ?? '' };
  switch (section) {
    case 'skills':
      return skillValues(item as Skill | undefined);
    case 'perks': {
      const p = item as Perk | undefined;
      return purchaseValues('perk', p, p?.type ?? 'CONTACT');
    }
    case 'talents': {
      const t = item as Talent | undefined;
      return purchaseValues('talent', t, talentXmlId(t?.type ?? 'COMBAT_LUCK'));
    }
    case 'disadvantages': {
      const d = item as Disadvantage | undefined;
      // New complications keep their detail in alias; parsed ones in name (see the HDC writer)
      const label = disadLabel(disadTypeFor(d)).toLowerCase();
      const detail = d ? (d.input ?? [d.alias, d.name].find((x) => x && x.trim().toLowerCase() !== label) ?? '') : '';
      return { type: disadTypeFor(d), detail, points: d?.points ?? 15, notes: d?.notes ?? '' };
    }
    case 'martialarts': {
      const m = item as MartialManeuver | undefined;
      return {
        name: m?.name ?? '', ocv: m?.ocv ?? 0, dcv: m?.dcv ?? 0, phase: m?.phase ?? '1/2',
        dc: m?.dc ?? 0, cost: m?.baseCost ?? 4, effectText: m?.effectText ?? '', notes: m?.notes ?? '',
      };
    }
  }
}

/** A form's multiplier: 0 when free; otherwise whatever other multiplier it had (1 if it was free) */
export function freeMultiplier(free: boolean, previous: number | undefined): number | undefined {
  if (free) return 0;
  return previous === 0 ? undefined : previous;
}

/** Offered on every item form except complications */
export const FREE_FIELD = {
  name: 'free',
  label: 'Free (given by the GM)',
  hint: 'Costs no points; Active Points, END and rolls are unchanged. A free item with a penalty gives no points back.',
} as const;

export function itemForm(section: FormSection, values: FormValues, isNew: boolean, character?: Character): ItemForm {
  const form = sectionForm(section, values, isNew, character);
  if (section === 'disadvantages' || values.group) return form;
  const free: FormField = { ...FREE_FIELD, type: 'checkbox', value: bool(values.free) };
  const notesAt = form.fields.findIndex((f) => f.name === 'notes');
  const fields = [...form.fields];
  fields.splice(notesAt < 0 ? fields.length : notesAt, 0, free);
  return { ...form, fields, cost: bool(values.free) ? 0 : form.cost };
}

function sectionForm(section: FormSection, values: FormValues, isNew: boolean, character?: Character): ItemForm {
  const notes: FormField = { name: 'notes', label: 'Notes', type: 'textarea', value: str(values.notes) };
  if (values.group) {
    return {
      title: 'Edit list',
      fields: [{ name: 'name', label: 'Name', type: 'text', value: str(values.name) }, notes],
      cost: 0,
      costLabel: '',
    };
  }
  // A perk's or talent's own modifiers and custom adders count toward its cost
  const existing = character && values.itemId ? sectionItems(character, section).find((i) => i.id === values.itemId) : undefined;
  switch (section) {
    case 'skills':
      return skillForm(values, isNew, character);
    case 'perks':
      return purchaseForm('perk', values, isNew, existing as Perk | undefined, listDiscount(character, 'perk', existing as Perk | undefined));
    case 'talents':
      return purchaseForm('talent', values, isNew, existing as Talent | undefined, 0);
    case 'disadvantages':
      return {
        title: isNew ? 'Add complication' : 'Edit complication',
        fields: [
          { name: 'type', label: 'Complication', type: 'select', value: str(values.type), options: options(DISAD_TYPES.map((d) => ({ value: d.value, label: disadLabel(d.value) })), str(values.type)) },
          { name: 'detail', label: 'Description', type: 'text', value: str(values.detail), hint: 'e.g. Code vs. Killing, Hunted by VIPER' },
          { name: 'points', label: 'Points', type: 'number', value: num(values.points) },
          notes,
        ],
        cost: num(values.points),
        costLabel: 'pts',
      };
    case 'martialarts':
      return {
        title: isNew ? 'Add maneuver' : 'Edit maneuver',
        fields: [
          { name: 'name', label: 'Maneuver', type: 'text', value: str(values.name) },
          { name: 'ocv', label: 'OCV', type: 'number', value: num(values.ocv) },
          { name: 'dcv', label: 'DCV', type: 'number', value: num(values.dcv) },
          { name: 'phase', label: 'Phase', type: 'select', value: str(values.phase), options: options(['0', '1/2', '1'].map((p) => ({ value: p, label: p })), str(values.phase)) },
          { name: 'dc', label: 'Damage classes', type: 'number', value: num(values.dc) },
          {
            name: 'effectText', label: 'Effect', type: 'text', value: str(values.effectText),
            hint: 'e.g. Strike, Grab Two Limbs, +10 STR to Disarm. A strike rolls its damage classes.',
          },
          { name: 'cost', label: 'Cost', type: 'number', value: num(values.cost) },
          notes,
        ],
        cost: num(values.cost),
        costLabel: 'pts',
      };
  }
}

/** Saves a form into the character: updates the item with `itemId`, or adds a new one */
export function saveItemForm(character: Character, section: FormSection, itemId: string | undefined, values: FormValues): Character {
  const list = sectionItems(character, section);
  const existing = itemId ? list.find((i) => i.id === itemId) : undefined;
  const position = list.length;
  // Every section's save keeps the form's icon, and free (multiplier 0) or not
  const icon = str(values.icon) || undefined;
  const multiplier = freeMultiplier(bool(values.free), existing?.multiplier);
  const put = <T extends { id: string; icon?: string; multiplier?: number }>(items: T[], saved: T) => {
    const item = { ...saved, icon, multiplier };
    return existing ? items.map((i) => (i.id === item.id ? item : i)) : [...items, item];
  };

  if (existing?.isGroup) {
    const renamed = { ...existing, name: str(values.name).trim() || existing.name, notes: str(values.notes) || undefined, icon };
    return setSectionItems(character, section, list.map((i) => (i.id === existing.id ? renamed : i)));
  }

  switch (section) {
    case 'skills': {
      const before = existing as Skill | undefined;
      const skill = saveSkill(before, values, position, character);
      const saved = { ...character, skills: put(character.skills, skill) };
      return before ? retargetSkillRolls(saved, before, skill) : saved;
    }

    case 'perks':
      return { ...character, perks: put(character.perks, savePurchase('perk', existing as Perk | undefined, values, position, listDiscount(character, 'perk', existing as Perk | undefined))) };

    case 'talents':
      return { ...character, talents: put(character.talents, savePurchase('talent', existing as Talent | undefined, values, position, 0)) };

    case 'disadvantages': {
      const type = str(values.type) as Disadvantage['type'];
      const points = num(values.points);
      const d = existing as Disadvantage | undefined;
      const detail = str(values.detail).trim();
      const detailChanged = !d || detail !== itemFormValues(character, 'disadvantages', d.id).detail;
      const disad: Disadvantage = {
        ...(d ?? { id: newId(), position, levels: 0 }),
        type,
        // The HDC writer reads the detail from whichever of name/alias isn't the type label
        ...(detailChanged ? { name: disadLabel(type), alias: detail || undefined, input: detail || undefined } : {}),
        points,
        baseCost: points,
        realCost: points,
        notes: str(values.notes) || undefined,
      } as Disadvantage;
      return { ...character, disadvantages: put(character.disadvantages, disad) };
    }

    case 'martialarts': {
      const cost = num(values.cost);
      const m = existing as MartialManeuver | undefined;
      const maneuver: MartialManeuver = {
        ...(m ?? { id: newId(), position, levels: 0 }),
        name: str(values.name).trim() || 'Maneuver',
        ocv: num(values.ocv),
        dcv: num(values.dcv),
        phase: str(values.phase) || '1/2',
        dc: num(values.dc),
        effectText: str(values.effectText).trim() || undefined,
        baseCost: cost,
        realCost: cost,
        notes: str(values.notes) || undefined,
        effect: `${values.phase} Phase, ${signedText(num(values.ocv))} OCV, ${signedText(num(values.dcv))} DCV`,
      } as MartialManeuver;
      return { ...character, martialArts: put(character.martialArts, maneuver) };
    }
  }
}

// =============================================================================
// Choosing a type (the forms' type fields and the "Add" type-ahead)
// =============================================================================

export interface TypeChoiceGroup {
  /** Heading the choices are listed under ('' for none) */
  label: string;
  /** keywords: other names it's found by (an abbreviation, an older name) */
  options: { value: string; label: string; keywords?: string }[];
}

/** The field a section's items are typed by, and its choices, or undefined (maneuvers) */
export function typeChoices(section: FormSection): { field: string; groups: TypeChoiceGroup[] } | undefined {
  const flat = (field: string, list: { value: string; label: string }[]) => ({
    field,
    groups: [{ label: '', options: [...list].sort((a, b) => a.label.localeCompare(b.label)) }],
  });
  switch (section) {
    case 'skills':
      return flat('xmlid', SKILL_CATALOG_6E.map((s) => ({ value: s.xmlId, label: s.display })));
    case 'perks':
      return flat('type', PERK_TYPES.map((p) => ({ value: p.value, label: perkLabel(p.value) })));
    case 'talents':
      return flat('type', TALENT_TYPES);
    case 'disadvantages':
      return flat('type', DISAD_TYPES.map((d) => ({ value: d.value, label: disadLabel(d.value) })));
    default:
      return undefined;
  }
}

/** Form values for a new item of the given type (a perk or talent starts at its template's purchase) */
export function newItemFormValues(character: Character, section: FormSection, type: string): FormValues {
  const values = itemFormValues(character, section);
  if (section === 'perks') return { ...values, ...purchaseValues('perk', undefined, type) };
  if (section === 'talents') return { ...values, ...purchaseValues('talent', undefined, talentXmlId(type)) };
  const field = typeChoices(section)?.field;
  return field ? { ...values, [field]: type } : values;
}
