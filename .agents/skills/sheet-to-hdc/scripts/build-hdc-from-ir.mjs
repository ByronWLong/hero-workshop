#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

const [, , inputPath, outputPath] = process.argv;

if (!inputPath || !outputPath) {
  console.error('Usage: node build-hdc-from-ir.mjs <character-ir.json> <output.hdc>');
  process.exit(2);
}

const ir = assignNumericIds(JSON.parse(readFileSync(inputPath, 'utf8').replace(/^\uFEFF/, '')));

const CHARACTERISTICS = [
  ['STR', 10, 1],
  ['DEX', 10, 2],
  ['CON', 10, 1],
  ['INT', 10, 1],
  ['EGO', 10, 1],
  ['PRE', 10, 1],
  ['OCV', 3, 5],
  ['DCV', 3, 5],
  ['OMCV', 3, 3],
  ['DMCV', 3, 3],
  ['SPD', 2, 10],
  ['PD', 2, 1],
  ['ED', 2, 1],
  ['REC', 4, 1],
  ['END', 20, 0.2],
  ['BODY', 10, 1],
  ['STUN', 20, 0.5],
  ['RUNNING', 12, 1],
  ['SWIMMING', 4, 1],
  ['LEAPING', 4, 1],
];

const POWER_XML_IDS = new Map([
  ['armor', 'ARMOR'],
  ['barrier', 'FORCEWALL'],
  ['blast', 'BLAST'],
  ['clairsentience', 'CLAIRSENTIENCE'],
  ['darkness', 'DARKNESS'],
  ['deflection', 'DEFLECTION'],
  ['density increase', 'DENSITY_INCREASE'],
  ['desolidification', 'DESOLIDIFICATION'],
  ['drain', 'DRAIN'],
  ['ego attack', 'EGO_ATTACK'],
  ['enhanced senses', 'ENHANCED_SENSES'],
  ['entangle', 'ENTANGLE'],
  ['flash', 'FLASH'],
  ['flash defense', 'FLASH_DEFENSE'],
  ['flight', 'FLIGHT'],
  ['force wall', 'FORCEWALL'],
  ['growth', 'GROWTH'],
  ['hand attack', 'HAND_ATTACK'],
  ['healing', 'HEALING'],
  ['hka', 'KILLING_ATTACK'],
  ['images', 'IMAGES'],
  ['invisibility', 'INVISIBILITY'],
  ['killing attack', 'KILLING_ATTACK'],
  ['life support', 'LIFE_SUPPORT'],
  ['mental defense', 'MENTAL_DEFENSE'],
  ['mind control', 'MIND_CONTROL'],
  ['mind link', 'MIND_LINK'],
  ['mind scan', 'MIND_SCAN'],
  ['multipower', 'MULTIPOWER'],
  ['power defense', 'POWER_DEFENSE'],
  ['regeneration', 'REGENERATION'],
  ['resistant protection', 'RESISTANT_PROTECTION'],
  ['rka', 'KILLING_ATTACK'],
  ['running', 'RUNNING'],
  ['shape shift', 'SHAPE_SHIFT'],
  ['shrinking', 'SHRINKING'],
  ['stretching', 'STRETCHING'],
  ['summon', 'SUMMON'],
  ['swimming', 'SWIMMING'],
  ['swinging', 'SWINGING'],
  ['telekinesis', 'TELEKINESIS'],
  ['telepathy', 'TELEPATHY'],
  ['teleportation', 'TELEPORTATION'],
  ['transform', 'TRANSFORM'],
  ['tunneling', 'TUNNELING'],
]);

const DISAD_XML_IDS = new Map([
  ['accidental change', 'ACCIDENTALCHANGE'],
  ['dependence', 'DEPENDENCE'],
  ['dependent npc', 'DNPC'],
  ['distinctive features', 'DISTINCTIVEFEATURES'],
  ['dnpc', 'DNPC'],
  ['enraged', 'ENRAGED'],
  ['hunted', 'HUNTED'],
  ['negative reputation', 'REPUTATION'],
  ['physical complication', 'PHYSICALLIMITATION'],
  ['psychological complication', 'PSYCHOLOGICALLIMITATION'],
  ['rivalry', 'RIVALRY'],
  ['social complication', 'SOCIALLIMITATION'],
  ['susceptibility', 'SUSCEPTIBILITY'],
  ['unluck', 'UNLUCK'],
  ['vulnerability', 'VULNERABILITY'],
]);

const KNOWN_SKILL_XML_IDS = new Set([
  'AREA_KNOWLEDGE',
  'ANIMAL_HANDLER',
  'AUTOFIRE_SKILLS',
  'CITY_KNOWLEDGE',
  'COMBAT_LEVELS',
  'COMPUTER_PROGRAMMING',
  'CONVERSATION',
  'CRAMMING',
  'CUSTOMSKILL',
  'DEFENSE_MANEUVER',
  'ELECTRONICS',
  'FORGERY',
  'GAMBLING',
  'INVENTOR',
  'KNOWLEDGE_SKILL',
  'LANGUAGES',
  'LOCKPICKING',
  'MENTAL_COMBAT_LEVELS',
  'NAVIGATION',
  'PENALTY_SKILL_LEVELS',
  'PERSUASION',
  'PROFESSIONAL_SKILL',
  'RAPID_ATTACK_HTH',
  'RAPID_ATTACK_RANGED',
  'SCIENCE_SKILL',
  'SKILL_LEVELS',
  'STEALTH',
  'LINGUIST',
  'SCIENTIST',
  'SURVIVAL',
  'SYSTEMS_OPERATION',
  'TRANSPORT_FAMILIARITY',
  'TWO_WEAPON_FIGHTING_HTH',
  'TWO_WEAPON_FIGHTING_RANGED',
  'WEAPON_FAMILIARITY',
  'WEAPONSMITH',
]);

const KNOWN_POWER_XML_IDS = new Set([
  ...POWER_XML_IDS.values(),
  'COMPOUNDPOWER',
  'CUSTOMPOWER',
  'DETECT',
  'DRAIN',
  'ENDURANCERESERVE',
  'ENDURANCERESERVEREC',
  'ENHANCEDSENSES',
  'EXTRALIMBS',
  'FORCEFIELD',
  'HANDTOHANDATTACK',
  'HKA',
  'KBRESISTANCE',
  'LIFESUPPORT',
  'LUCK',
  'MENTALDEFENSE',
  'POWERDEFENSE',
  'RKA',
]);

const CANONICAL_POWER_ALIASES = new Map([
  ['DARKNESS', 'Darkness'],
  ['DETECT', 'Detect'],
  ['ENDURANCERESERVE', 'Endurance Reserve'],
  ['ENHANCEDSENSES', 'Enhanced Senses'],
  ['EXTRALIMBS', 'Extra Limbs'],
  ['FLIGHT', 'Flight'],
  ['FORCEFIELD', 'Resistant Protection'],
  ['KBRESISTANCE', 'Knockback Resistance'],
  ['LIFESUPPORT', 'Life Support'],
  ['MENTALDEFENSE', 'Mental Defense'],
  ['POWERDEFENSE', 'Power Defense'],
  ['REGENERATION', 'Regeneration'],
  ['RKA', 'Ranged Killing Attack'],
  ['TELEKINESIS', 'Telekinesis'],
  ['TRANSFORM', 'Transform'],
  ['TUNNELING', 'Tunneling'],
]);
const KNOWN_PERK_XML_IDS = new Set([
  'ANONYMITY',
  'BASE',
  'COMPUTER_LINK',
  'CONTACT',
  'DEEP_COVER',
  'FAVOR',
  'FOLLOWER',
  'FRINGE_BENEFIT',
  'MONEY',
  'POSITIVE_REPUTATION',
  'REPUTATION',
  'VEHICLE',
  'VEHICLE_BASE',
  'GENERIC',
]);
const KNOWN_TALENT_XML_IDS = new Set([
  'ABSOLUTE_RANGE_SENSE',
  'ABSOLUTE_TIME_SENSE',
  'AMBIDEXTERITY',
  'BUMP_OF_DIRECTION',
  'COMBAT_LUCK',
  'CUSTOMTALENT',
  'DANGER_SENSE',
  'DOUBLE_JOINTED',
  'EIDETIC_MEMORY',
  'ENVIRONMENTAL_MOVEMENT',
  'LIGHTSLEEP',
  'LIGHTNING_CALCULATOR',
  'PERFECT_PITCH',
  'RESISTANCE',
  'SIMULATE_DEATH',
  'SPEED_READING',
  'UNIVERSAL_TRANSLATOR',
]);

const MARTIAL_MANEUVER_DEFAULTS = new Map([
  ['Block', { phase: '1/2', ocv: '+0', dcv: '+0', dc: 0, effect: 'Block, Abort', baseCost: 4, addStr: false, useWeapon: false }],
  ['Disarm', { phase: '1/2', ocv: '-2', dcv: '+0', dc: 0, effect: 'Disarm, STR vs STR', baseCost: 4, addStr: true, useWeapon: false }],
  ['Dodge', { phase: '1/2', ocv: '--', dcv: '+3', dc: 0, effect: 'Dodge All Attacks, Abort', baseCost: 4, addStr: false, useWeapon: false }],
  ['Escape', { phase: '1/2', ocv: '+0', dcv: '+0', dc: 0, effect: '+15 STR vs. Grabs', baseCost: 4, addStr: true, useWeapon: false }],
  ['Fast Strike', { phase: '1/2', ocv: '+2', dcv: '+0', dc: 2, effect: '[NORMALDC] Strike', baseCost: 4, addStr: true, useWeapon: true, weaponEffect: 'Weapon [WEAPONDC] Strike' }],
  ['Flying Dodge', { phase: '1/2', ocv: '--', dcv: '+4', dc: 0, effect: 'Dodge All Attacks, Abort; FMove', baseCost: 5, addStr: false, useWeapon: false }],
  ['Flying Grab', { phase: '1/2', ocv: '-2', dcv: '-1', dc: 0, effect: 'Grab Two Limbs, [STRDC] for holding on; FMove', baseCost: 4, addStr: true, useWeapon: false }],
  ['Grab', { phase: '1/2', ocv: '-1', dcv: '-2', dc: 0, effect: 'Grab Two Limbs, [STRDC] for holding on', baseCost: 3, addStr: true, useWeapon: false }],
  ['Kick', { phase: '1/2', ocv: '-2', dcv: '+1', dc: 4, effect: '[NORMALDC] Strike', baseCost: 5, addStr: true, useWeapon: true, weaponEffect: 'Weapon [WEAPONDC] Strike' }],
  ['Killing Strike', { phase: '1/2', ocv: '-2', dcv: '+0', dc: 0, effect: '[NORMALDC] HKA', baseCost: 4, addStr: true, useWeapon: true, weaponEffect: 'Weapon [WEAPONDC] HKA' }],
  ['Legsweep', { phase: '1/2', ocv: '+2', dcv: '-1', dc: 1, effect: '[NORMALDC] Strike, Target Falls', baseCost: 3, addStr: true, useWeapon: true, weaponEffect: 'Weapon [WEAPONDC] Strike, Target Falls' }],
  ['Martial Throw', { phase: '1/2', ocv: '+0', dcv: '+2', dc: 2, effect: '[NORMALDC] Strike, Target Falls', baseCost: 3, addStr: true, useWeapon: true, weaponEffect: 'Weapon [WEAPONDC] Strike, Target Falls' }],
  ['Nerve Strike', { phase: '1/2', ocv: '-1', dcv: '+1', dc: 2, effect: '2d6 NND', baseCost: 4, addStr: false, useWeapon: false }],
  ['Offensive Strike', { phase: '1/2', ocv: '-2', dcv: '+1', dc: 4, effect: '[NORMALDC] Strike', baseCost: 5, addStr: true, useWeapon: true, weaponEffect: 'Weapon [WEAPONDC] Strike' }],
  ['Passing Strike', { phase: '1/2', ocv: '+1', dcv: '+0', dc: 2, effect: '[NORMALDC] Strike, FMove', baseCost: 5, addStr: true, useWeapon: true, weaponEffect: 'Weapon [WEAPONDC] Strike, FMove' }],
  ['Sacrifice Throw', { phase: '1/2', ocv: '+2', dcv: '+1', dc: 0, effect: '[NORMALDC] Strike, Both Fall', baseCost: 3, addStr: true, useWeapon: false }],
  ['Strike', { phase: '1/2', ocv: '+0', dcv: '+2', dc: 2, effect: '[NORMALDC] Strike', baseCost: 4, addStr: true, useWeapon: true, weaponEffect: 'Weapon [WEAPONDC] Strike' }],
]);

const MARTIAL_MANEUVER_ALIASES = new Map([
  ['block', 'Block'],
  ['disarm', 'Disarm'],
  ['dodge', 'Dodge'],
  ['escape', 'Escape'],
  ['fast strike', 'Fast Strike'],
  ['flying dodge', 'Flying Dodge'],
  ['flying grab', 'Flying Grab'],
  ['grab', 'Grab'],
  ['kick', 'Kick'],
  ['killing strike', 'Killing Strike'],
  ['legsweep', 'Legsweep'],
  ['martial throw', 'Martial Throw'],
  ['nerve strike', 'Nerve Strike'],
  ['offensive strike', 'Offensive Strike'],
  ['passing strike', 'Passing Strike'],
  ['sacrifice throw', 'Sacrifice Throw'],
  ['strike', 'Strike'],
]);

function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function isPresent(value) {
  return value !== undefined && value !== null && value !== '';
}

function attrString(attrs) {
  const allowEmpty = new Set(['NAME', 'INPUT', 'COMMENTS']);
  return Object.entries(attrs)
    .filter(([key, value]) => value === '' ? allowEmpty.has(key) : isPresent(value))
    .map(([key, value]) => `${key}="${esc(value)}"`)
    .join(' ');
}

function xml(tag, attrs = {}, children = []) {
  const attributes = attrString(attrs);
  const open = attributes ? `<${tag} ${attributes}` : `<${tag}`;
  const body = children.filter(isPresent).join('');
  if (!body) {
    return `${open}/>`;
  }
  return `${open}>${body}</${tag}>`;
}

function hdcDefaults(overrides = {}) {
  return {
    MULTIPLIER: '1.0',
    GRAPHIC: 'Burst',
    COLOR: '255 255 255',
    SFX: 'Default',
    SHOW_ACTIVE_COST: 'Yes',
    INCLUDE_NOTES_IN_PRINTOUT: 'Yes',
    ...overrides,
  };
}

function textElement(tag, value) {
  return xml(tag, {}, isPresent(value) ? [esc(value)] : []);
}

function notesElement(item) {
  return textElement('NOTES', noteWithSource(item));
}

function yesNo(value, defaultValue = undefined) {
  if (value === undefined || value === null) {
    return defaultValue;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['yes', 'y', 'true', '1'].includes(normalized)) {
      return 'Yes';
    }
    if (['no', 'n', 'false', '0'].includes(normalized)) {
      return 'No';
    }
  }
  return value ? 'Yes' : 'No';
}

function yesNoUpper(value, defaultValue = undefined) {
  const normalized = yesNo(value, defaultValue);
  return normalized ? normalized.toUpperCase() : normalized;
}

function numberValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

let fallbackGeneratedIdCounter = 0;

function normalizeGenre(value, template) {
  const text = String(value ?? '').trim();
  if (!text) {
    return template === 'builtIn.Heroic6E.hdt' ? 'Fantasy Hero' : undefined;
  }
  if (template === 'builtIn.Heroic6E.hdt' && /champions\s*\/\s*hero system sixth edition/i.test(text)) {
    return 'Fantasy Hero';
  }
  return text;
}

function generatedId(prefix, index) {
  fallbackGeneratedIdCounter += 1;
  return String(fallbackGeneratedIdCounter);
}

function maxNumericIdInNode(node) {
  let max = 0;

  function visit(value) {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') {
      return;
    }
    if (isPresent(value.id)) {
      max = Math.max(max, numberValue(value.id, 0));
    }
    for (const child of Object.values(value)) {
      visit(child);
    }
  }

  visit(node);
  return max;
}

fallbackGeneratedIdCounter = Math.max(Date.now(), maxNumericIdInNode(ir));

function toXmlId(value, fallback = 'GENERIC') {
  if (!isPresent(value)) {
    return fallback;
  }
  return String(value).trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '') || fallback;
}

function resolveSkillXmlId(item) {
  if (item.tag === 'SCIENTIST' || item.tag === 'LINGUIST') {
    return item.tag;
  }
  const xmlId = toXmlId(item.hdcXmlId ?? item.xmlId ?? item.xmlID ?? item.xmlid ?? item.name, 'CUSTOMSKILL');
  return KNOWN_SKILL_XML_IDS.has(xmlId) ? xmlId : 'CUSTOMSKILL';
}

function resolvePowerXmlId(item) {
  const explicit = item.hdcXmlId ?? item.xmlId ?? item.xmlID ?? item.xmlid;
  const xmlId = explicit ? toXmlId(explicit, 'CUSTOMPOWER') : inferPowerXmlId(item);
  if (item.preserveAsCustom === true || item.custom === true) {
    return 'CUSTOMPOWER';
  }
  if (!item.hdcXmlId && item.preserveAsCustom !== false && Array.isArray(item.sourceRefs) && item.sourceRefs.length > 0) {
    return 'CUSTOMPOWER';
  }
  return KNOWN_POWER_XML_IDS.has(xmlId) ? xmlId : 'CUSTOMPOWER';
}

function resolvePerkXmlId(item) {
  const xmlId = toXmlId(item.hdcXmlId ?? item.xmlId ?? item.xmlID ?? item.xmlid ?? item.name, 'GENERIC');
  return KNOWN_PERK_XML_IDS.has(xmlId) ? xmlId : 'GENERIC';
}

function resolveTalentXmlId(item) {
  const xmlId = toXmlId(item.hdcXmlId ?? item.xmlId ?? item.xmlID ?? item.xmlid ?? item.name, 'CUSTOMTALENT');
  return KNOWN_TALENT_XML_IDS.has(xmlId) ? xmlId : 'CUSTOMTALENT';
}

function lowerKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

function inferPowerXmlId(item) {
  const explicit = item.xmlId ?? item.xmlID ?? item.xmlid;
  if (isPresent(explicit)) {
    return toXmlId(explicit);
  }
  const candidates = [item.name, item.alias, item.input].map(lowerKey).filter(Boolean);
  for (const candidate of candidates) {
    if (POWER_XML_IDS.has(candidate)) {
      return POWER_XML_IDS.get(candidate);
    }
  }
  for (const candidate of candidates) {
    for (const [key, xmlId] of POWER_XML_IDS.entries()) {
      if (candidate.includes(key)) {
        return xmlId;
      }
    }
  }
  return 'GENERIC';
}

function resolveMartialManeuver(item) {
  const candidates = [
    item.display,
    item.maneuver,
    item.maneuverType,
    item.alias,
    item.input,
  ].map(lowerKey).filter(Boolean);
  const notes = lowerKey(item.notes);

  for (const candidate of candidates) {
    if (MARTIAL_MANEUVER_ALIASES.has(candidate)) {
      const canonical = MARTIAL_MANEUVER_ALIASES.get(candidate);
      if (canonical === 'Grab' && notes.includes('fmove')) {
        return { baseName: 'Flying Grab', defaults: MARTIAL_MANEUVER_DEFAULTS.get('Flying Grab'), recognized: true };
      }
      return { baseName: canonical, defaults: MARTIAL_MANEUVER_DEFAULTS.get(canonical), recognized: true };
    }
  }

  if (notes.includes('fmove') && candidates.includes('grab')) {
    return { baseName: 'Flying Grab', defaults: MARTIAL_MANEUVER_DEFAULTS.get('Flying Grab'), recognized: true };
  }

  return { baseName: 'Maneuver', defaults: undefined, recognized: false };
}

function maneuverDetailText(item, resolved) {
  const parts = [];
  const alias = String(item.alias ?? '').trim();
  if (alias && lowerKey(alias) !== lowerKey(resolved.baseName)) {
    parts.push(alias);
  }
  if (isPresent(item.effect)) {
    parts.push(String(item.effect));
  }
  if (isPresent(item.notes)) {
    parts.push(String(item.notes));
  }
  return parts.join(': ');
}

const CHARACTERISTIC_TAGS = new Set(CHARACTERISTICS.map(([type]) => type));

function isCharacteristicTag(value) {
  return CHARACTERISTIC_TAGS.has(toXmlId(value, ''));
}

function inferDisadXmlId(item) {
  const explicit = item.xmlId ?? item.xmlID ?? item.xmlid;
  if (isPresent(explicit)) {
    return normalizeDisadXmlId(explicit, item);
  }
  const candidates = [item.category, item.alias, item.name].map(lowerKey).filter(Boolean);
  for (const candidate of candidates) {
    if (DISAD_XML_IDS.has(candidate)) {
      return DISAD_XML_IDS.get(candidate);
    }
  }
  for (const candidate of candidates) {
    for (const [key, xmlId] of DISAD_XML_IDS.entries()) {
      if (candidate.includes(key)) {
        return xmlId;
      }
    }
  }
  return 'GENERIC';
}

function normalizeDisadXmlId(value, item = {}) {
  const xmlId = toXmlId(value, 'PSYCHOLOGICALLIMITATION');
  const aliases = {
    DISTINCTIVE: 'DISTINCTIVEFEATURES',
    DISTINCTIVE_FEATURES: 'DISTINCTIVEFEATURES',
    RIVALORNEMESIS: 'RIVALRY',
    RIVAL_OR_NEMESIS: 'RIVALRY',
    GENERIC: undefined,
  };
  if (aliases[xmlId]) {
    return aliases[xmlId];
  }
  if (xmlId !== 'GENERIC') {
    return xmlId;
  }
  const text = lowerKey(`${item.name ?? ''} ${item.alias ?? ''} ${item.input ?? ''}`);
  if (text.includes('distinctive')) {
    return 'DISTINCTIVEFEATURES';
  }
  if (text.includes('rival')) {
    return 'RIVALRY';
  }
  if (text.includes('physical')) {
    return 'PHYSICALLIMITATION';
  }
  return 'PSYCHOLOGICALLIMITATION';
}

function asArray(value) {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function noteWithSource(item) {
  const notes = [];
  if (isPresent(item.notes)) {
    notes.push(String(item.notes));
  }
  if (Array.isArray(item.sourceRefs) && item.sourceRefs.length > 0) {
    notes.push(`Source: ${item.sourceRefs.join(', ')}`);
  }
  return notes.join(' | ');
}

function childrenForItem(item) {
  const children = [];
  for (const [modifierIndex, modifier] of asArray(item.modifiers).entries()) {
    const value = numberValue(modifier.value ?? modifier.baseCost, 0);
    const xmlId = toXmlId(modifier.xmlId ?? modifier.xmlID ?? modifier.xmlid ?? modifier.name, 'MODIFIER');
    const canonicalAlias = xmlId === 'REQUIRESASKILLROLL'
      ? 'Requires A Roll'
      : (modifier.alias ?? modifier.name);
    const canonicalInput = xmlId === 'REQUIRESASKILLROLL'
      ? undefined
      : modifier.input;
    const canonicalOptionAlias = xmlId === 'REQUIRESASKILLROLL'
      ? (modifier.comments ?? modifier.input ?? (modifier.optionAlias && modifier.optionAlias !== 'Skill roll' ? modifier.optionAlias : 'Skill roll'))
      : modifier.optionAlias;
    const canonicalComments = xmlId === 'REQUIRESASKILLROLL'
      ? ''
      : modifier.comments;
    children.push(xml('MODIFIER', hdcDefaults({
      ID: modifier.id ?? generatedId('modifier', modifierIndex),
      XMLID: xmlId,
      NAME: modifier.name ?? '',
      ALIAS: canonicalAlias,
      POSITION: modifier.position ?? -1,
      BASECOST: value,
      LEVELS: modifier.levels ?? 0,
      OPTION: modifier.option,
      OPTIONID: modifier.optionId,
      OPTION_ALIAS: canonicalOptionAlias,
      INPUT: canonicalInput,
      COMMENTS: canonicalComments,
      ISLIMITATION: yesNo(modifier.isLimitation ?? value < 0),
      PRIVATE: 'No',
      FORCEALLOW: yesNo(modifier.forceAllow, 'No'),
    }), [notesElement(modifier)]));
  }
  for (const [adderIndex, adder] of asArray(item.adders).entries()) {
    const xmlId = toXmlId(adder.xmlId ?? adder.xmlID ?? adder.xmlid ?? adder.name, 'GENERIC_OBJECT');
    children.push(xml('ADDER', hdcDefaults({
      ID: adder.id ?? generatedId('adder', adderIndex),
      XMLID: xmlId,
      NAME: adder.name ?? '',
      ALIAS: adder.alias ?? adder.name,
      POSITION: adder.position ?? -1,
      BASECOST: numberValue(adder.baseCost ?? adder.points, 0),
      LEVELS: adder.levels ?? 0,
      LVLCOST: adder.lvlCost ?? 0,
      LVLVAL: adder.lvlVal,
      OPTION: adder.option,
      OPTIONID: adder.optionId,
      OPTION_ALIAS: adder.optionAlias,
      SELECTED: yesNoUpper(adder.selected ?? true),
      INCLUDEINBASE: yesNo(adder.includeInBase),
      SHOWALIAS: yesNo(adder.showAlias, 'Yes'),
      PRIVATE: yesNo(adder.private, 'No'),
      REQUIRED: yesNo(adder.required, 'No'),
      DISPLAYINSTRING: yesNo(adder.displayInString, 'Yes'),
      GROUP: yesNo(adder.group, 'No'),
    }), [notesElement(adder)]));
  }
  return children;
}

function normalizeCharacteristics(input) {
  const byType = new Map();
  if (Array.isArray(input)) {
    for (const item of input) {
      const type = toXmlId(item.type);
      byType.set(type, item);
    }
  } else if (input && typeof input === 'object') {
    for (const [type, value] of Object.entries(input)) {
      byType.set(toXmlId(type), { value });
    }
  }

  return CHARACTERISTICS.map(([type, base, costPerLevel], index) => {
    const item = byType.get(type) ?? {};
    const explicitLevels = item.levels;
    const total = numberValue(item.totalValue ?? item.value, base + numberValue(explicitLevels, 0));
    const levels = isPresent(explicitLevels) ? numberValue(explicitLevels, 0) : total - base;
    const baseCost = levels < 0 ? 0 : Math.ceil(levels * costPerLevel);
    return xml(type, hdcDefaults({
      ID: item.id ?? generatedId(type, index),
      XMLID: type,
      NAME: item.name ?? type,
      ALIAS: item.alias ?? type,
      POSITION: item.position ?? index,
      LEVELS: levels,
      BASECOST: item.baseCost ?? 0,
      BASE: base,
      TOTAL: item.totalValue ?? total,
      AFFECTS_PRIMARY: yesNo(item.affectsPrimary, 'Yes'),
      AFFECTS_TOTAL: yesNo(item.affectsTotal, 'Yes'),
    }), [notesElement(item), ...childrenForItem(item)]);
  }).join('');
}

function skillElement(item, index) {
  const isList = item.tag === 'LIST' || item.isGroup || toXmlId(item.xmlId) === 'LIST';
  const tag = isList ? 'LIST' : (item.tag ? toXmlId(item.tag) : 'SKILL');
  if (isList) {
    return xml(tag, hdcDefaults({
      ID: item.id ?? generatedId('skill', index),
      XMLID: 'GENERIC_OBJECT',
      NAME: item.name ?? '',
      ALIAS: item.alias ?? item.name,
      TEXT: item.text,
      POSITION: item.position ?? index,
      LEVELS: numberValue(item.levels, 0),
      BASECOST: numberValue(item.baseCost ?? item.points, 0),
    }), [notesElement(item), ...childrenForItem(item)]);
  }
  return xml(tag, hdcDefaults({
    ID: item.id ?? generatedId('skill', index),
    XMLID: resolveSkillXmlId(item),
    NAME: item.name,
    ALIAS: item.alias ?? item.name,
    INPUT: item.input,
    TEXT: item.text,
    POSITION: item.position ?? index,
    LEVELS: numberValue(item.levels, 0),
    BASECOST: numberValue(item.baseCost ?? item.points, 0),
    CHARACTERISTIC: item.characteristic,
    ROLL: item.roll,
    FAMILIARITY: yesNo(item.familiarity),
    PROFICIENCY: yesNo(item.proficiency),
    EVERYMAN: yesNo(item.everyman),
    NATIVE_TONGUE: yesNo(item.nativeTongue),
    TYPE: item.type,
    OPTION: item.option,
    OPTIONID: item.optionId,
    OPTION_ALIAS: item.optionAlias,
    PARENTID: item.parentId,
    LEVELSONLY: yesNo(item.levelsOnly, 'No'),
  }), [notesElement(item), ...childrenForItem(item)]);
}

function characteristicChildElement(item, index) {
  const type = toXmlId(item.type ?? item.xmlId ?? item.tag, 'STR');
  return xml(type, hdcDefaults({
    ID: item.id ?? generatedId(type, index),
    XMLID: type,
    NAME: item.name ?? '',
    ALIAS: item.alias ?? type,
    POSITION: item.position ?? index,
    LEVELS: numberValue(item.levels, 0),
    BASECOST: numberValue(item.baseCost, 0),
    AFFECTS_PRIMARY: yesNo(item.affectsPrimary, 'Yes'),
    AFFECTS_TOTAL: yesNo(item.affectsTotal, 'Yes'),
    ADD_MODIFIERS_TO_BASE: yesNo(item.addModifiersToBase, 'No'),
  }), [notesElement(item), ...childrenForItem(item)]);
}

function genericElement(tag, idPrefix, item, index) {
  const isList = item.tag === 'LIST' || item.isGroup || toXmlId(item.xmlId) === 'LIST';
  const isManeuver = tag === 'MANEUVER';
  const xmlId = tag === 'PERK'
    ? resolvePerkXmlId(item)
    : tag === 'TALENT'
      ? resolveTalentXmlId(item)
      : toXmlId(item.xmlId ?? item.xmlID ?? item.xmlid ?? item.name, tag === 'MANEUVER' ? 'MANEUVER' : 'GENERIC_OBJECT');
  const resolvedManeuver = isManeuver ? resolveMartialManeuver(item) : undefined;
  const maneuverDefaults = resolvedManeuver?.defaults;
  const maneuverDetail = isManeuver ? maneuverDetailText(item, resolvedManeuver) : [item.alias, item.effect, item.notes].filter(isPresent).join(': ');
  if (isList) {
    return xml('LIST', hdcDefaults({
      ID: item.id ?? generatedId(idPrefix, index),
      XMLID: 'GENERIC_OBJECT',
      NAME: item.name ?? '',
      ALIAS: item.alias ?? item.name,
      TEXT: item.text,
      POSITION: item.position ?? index,
      LEVELS: numberValue(item.levels, 0),
      BASECOST: numberValue(item.baseCost ?? item.points, 0),
      PRICE: tag === 'PERK' ? item.price : undefined,
      WEIGHT: tag === 'PERK' ? item.weight : undefined,
      CARRIED: tag === 'PERK' ? yesNo(item.carried) : undefined,
    }), [notesElement(item), ...childrenForItem(item)]);
  }
  return xml(isList ? 'LIST' : tag, hdcDefaults({
    ID: item.id ?? generatedId(idPrefix, index),
    XMLID: xmlId,
    NAME: isManeuver ? resolvedManeuver.baseName : item.name,
    ALIAS: isManeuver ? (item.name ?? resolvedManeuver.baseName) : (item.alias ?? item.name),
    INPUT: item.input,
    TEXT: item.text,
    POSITION: item.position ?? index,
    LEVELS: numberValue(item.levels, 0),
    BASECOST: numberValue(item.baseCost ?? item.points ?? maneuverDefaults?.baseCost, 0),
    ROLL: item.roll,
    NUMBER: tag === 'PERK' ? item.number : undefined,
    BASEPOINTS: tag === 'PERK' ? item.basePoints : undefined,
    DISADPOINTS: tag === 'PERK' ? item.disadPoints : undefined,
    OPTION: item.option,
    OPTION_ALIAS: item.optionAlias,
    PARENTID: item.parentId,
    CUSTOM: isManeuver && !resolvedManeuver.recognized ? yesNo(item.custom ?? true) : undefined,
    CATEGORY: isManeuver ? (item.category ?? 'Hand To Hand') : undefined,
    DISPLAY: isManeuver ? (item.display ?? resolvedManeuver.baseName) : undefined,
    OCV: isManeuver ? (item.ocv ?? maneuverDefaults?.ocv ?? '0') : undefined,
    DCV: isManeuver ? (item.dcv ?? maneuverDefaults?.dcv ?? '0') : undefined,
    DC: isManeuver ? (item.dc ?? maneuverDefaults?.dc ?? '0') : undefined,
    PHASE: isManeuver ? (item.phase ?? maneuverDefaults?.phase ?? '1/2') : undefined,
    EFFECT: isManeuver ? (maneuverDefaults?.effect ?? maneuverDetail) : undefined,
    ADDSTR: isManeuver ? yesNo(item.addStr ?? maneuverDefaults?.addStr ?? false) : undefined,
    ACTIVECOST: isManeuver ? (item.activeCost ?? item.baseCost ?? 0) : undefined,
    DAMAGETYPE: isManeuver ? (item.damageType ?? 0) : undefined,
    MAXSTR: isManeuver ? (item.maxStr ?? 0) : undefined,
    STRMULT: isManeuver ? (item.strMultiplier ?? 1) : undefined,
    USEWEAPON: isManeuver ? yesNo(item.useWeapon ?? maneuverDefaults?.useWeapon ?? false) : undefined,
    WEAPONEFFECT: isManeuver ? (item.weaponEffect ?? maneuverDefaults?.weaponEffect) : undefined,
  }), [notesElement(item), ...childrenForItem(item)]);
}

function inferTransformLvlCost(item) {
  const text = [item.name, item.alias, item.input, item.notes].filter(isPresent).join(' ').toLowerCase();
  if (text.includes('severe transform')) {
    return 15;
  }
  if (text.includes('major transform')) {
    return 10;
  }
  return 5;
}

function inferOptionId(item) {
  return String(item.optionId ?? item.option ?? '').trim().toUpperCase() || undefined;
}

function defaultPowerLvlCost(item, xmlId, isCustomPower, isCompound) {
  if (isPresent(item.lvlCost) || isPresent(item.levelCost)) {
    return numberValue(item.lvlCost ?? item.levelCost, 0);
  }

  if (isCompound || isCustomPower) {
    return 1;
  }

  const optionId = inferOptionId(item);
  const lvlCostByXmlId = {
    CUSTOMPOWER: 1,
    COMPOUNDPOWER: 1,
    DARKNESS: {
      SIGHTGROUP: 5,
      HEARINGGROUP: 3,
      SMELLGROUP: 3,
      TOUCHGROUP: 3,
      MENTALAWARENESS: 3,
      RADIOSENSE: 3,
      SPATIALGROUP: 3,
      DEFAULT: 5,
    },
    DETECT: {
      SINGLE: 1,
      CLASS: 1,
      LARGECLASS: 1,
      DEFAULT: 1,
    },
    ENDURANCERESERVE: 1,
    ENDURANCERESERVEREC: 1,
    EXTRALIMBS: 0,
    FLIGHT: 1,
    FORCEFIELD: 3,
    KBRESISTANCE: 1,
    LIFESUPPORT: 1,
    MENTALDEFENSE: 1,
    POWERDEFENSE: 1,
    REGENERATION: {
      WEEK: 2,
      DAY: 4,
      '6HOURS': 6,
      '1HOUR': 8,
      '20MINUTES': 10,
      '5MINUTES': 12,
      '1MINUTE': 14,
      '1TURN': 16,
      DEFAULT: 2,
    },
    RKA: 15,
    TELEKINESIS: 3,
    TRANSFORM: 'INFER',
    TUNNELING: 1,
  };

  const xmlDefaults = lvlCostByXmlId[String(xmlId).toUpperCase()];
  if (xmlDefaults === 'INFER') {
    return inferTransformLvlCost(item);
  }
  if (typeof xmlDefaults === 'number') {
    return xmlDefaults;
  }
  if (xmlDefaults && typeof xmlDefaults === 'object') {
    return xmlDefaults[optionId] ?? xmlDefaults.DEFAULT ?? 0;
  }
  return 0;
}

function defaultPowerFlags(xmlId) {
  const defaults = {
    CUSTOMPOWER: { doesBody: false, doesDamage: false, doesKnockback: false, killing: false },
    COMPOUNDPOWER: { doesBody: false, doesDamage: false, doesKnockback: false, killing: false },
    DARKNESS: { doesBody: false, doesDamage: false, doesKnockback: false, killing: false },
    DETECT: { doesBody: false, doesDamage: false, doesKnockback: false, killing: false },
    ENDURANCERESERVE: { doesBody: false, doesDamage: false, doesKnockback: false, killing: false },
    ENDURANCERESERVEREC: { doesBody: false, doesDamage: false, doesKnockback: false, killing: false },
    EXTRALIMBS: { doesBody: false, doesDamage: false, doesKnockback: false, killing: false },
    FLIGHT: { doesBody: false, doesDamage: false, doesKnockback: false, killing: false },
    FORCEFIELD: { doesBody: false, doesDamage: false, doesKnockback: false, killing: false },
    KBRESISTANCE: { doesBody: false, doesDamage: false, doesKnockback: false, killing: false },
    LIFESUPPORT: { doesBody: false, doesDamage: false, doesKnockback: false, killing: false },
    MENTALDEFENSE: { doesBody: false, doesDamage: false, doesKnockback: false, killing: false },
    POWERDEFENSE: { doesBody: false, doesDamage: false, doesKnockback: false, killing: false },
    REGENERATION: { doesBody: false, doesDamage: false, doesKnockback: false, killing: false },
    RKA: { doesBody: true, doesDamage: true, doesKnockback: true, killing: true },
    TELEKINESIS: { doesBody: true, doesDamage: true, doesKnockback: true, killing: false },
    TRANSFORM: { doesBody: false, doesDamage: true, doesKnockback: false, killing: false },
    TUNNELING: { doesBody: false, doesDamage: false, doesKnockback: false, killing: false },
  };
  return defaults[String(xmlId).toUpperCase()] ?? defaults.CUSTOMPOWER;
}

function hasExplicitPowerField(item, ...keys) {
  return keys.some((key) => isPresent(item?.[key]));
}

function buildPowerAttributes(item, options) {
  const {
    index,
    equipment,
    isCompound,
    isCustomPower,
    powerAlias,
    baseCost,
    levels,
    weight,
    effectDice,
    defaultFlags,
  } = options;

  const attrs = {
    ID: item.id ?? generatedId(equipment ? 'equipment' : 'power', index),
    XMLID: isCompound ? 'COMPOUNDPOWER' : resolvePowerXmlId(item),
    NAME: item.name,
    ALIAS: powerAlias,
    INPUT: item.input ?? '',
    TEXT: item.text,
    POSITION: item.position ?? index,
    LEVELS: levels,
    BASECOST: baseCost,
    EFFECT_DICE: effectDice,
    OPTION: item.option,
    OPTIONID: item.optionId,
    OPTION_ALIAS: item.optionAlias,
    PARENTID: item.parentId,
    AFFECTS_PRIMARY: yesNo(item.affectsPrimary, 'No'),
    AFFECTS_TOTAL: yesNo(item.affectsTotal, 'Yes'),
    CARRIED: equipment ? yesNo(item.carried, 'Yes') : undefined,
    PRICE: equipment ? (item.price ?? 0) : undefined,
    WEIGHT: equipment ? (weight ?? 0) : undefined,
    QUANTITY: equipment ? (item.quantity ?? 1) : 1,
    PDLEVELS: item.pdLevels,
    EDLEVELS: item.edLevels,
    MDLEVELS: item.mdLevels,
    POWDLEVELS: item.powdLevels,
    ADD_MODIFIERS_TO_BASE: yesNo(item.addModifiersToBase),
    USESTANDARDEFFECT: yesNo(item.useStandardEffect),
    ENDCOLUMNOUTPUT: item.endColumnOutput ?? '',
    USECUSTOMENDCOLUMN: yesNo(item.useCustomEndColumn, 'No'),
  };

  const shouldEmitGenericPowerFields = isCustomPower;
  const explicitLvlCost = item.lvlCost ?? item.levelCost;
  if (shouldEmitGenericPowerFields && isPresent(explicitLvlCost)) {
    attrs.LVLCOST = explicitLvlCost;
  }

  if (shouldEmitGenericPowerFields || hasExplicitPowerField(item, 'doesBody')) {
    attrs.DOESBODY = yesNo(item.doesBody ?? defaultFlags.doesBody, 'No');
  }
  if (shouldEmitGenericPowerFields || hasExplicitPowerField(item, 'doesDamage')) {
    attrs.DOESDAMAGE = yesNo(item.doesDamage ?? defaultFlags.doesDamage, 'No');
  }
  if (shouldEmitGenericPowerFields || hasExplicitPowerField(item, 'doesKnockback')) {
    attrs.DOESKNOCKBACK = yesNo(item.doesKnockback ?? defaultFlags.doesKnockback, 'No');
  }
  if (shouldEmitGenericPowerFields || hasExplicitPowerField(item, 'killing')) {
    attrs.KILLING = yesNo(item.killing ?? defaultFlags.killing, 'No');
  }
  if (shouldEmitGenericPowerFields || hasExplicitPowerField(item, 'defense')) {
    attrs.DEFENSE = item.defense ?? 'NONE';
  }
  if (shouldEmitGenericPowerFields || hasExplicitPowerField(item, 'endCost')) {
    attrs.END = yesNo((item.endCost ?? 0) > 0, 'No');
  }
  if (shouldEmitGenericPowerFields || hasExplicitPowerField(item, 'visible')) {
    attrs.VISIBLE = yesNo(item.visible, 'Yes');
  }
  if (shouldEmitGenericPowerFields || hasExplicitPowerField(item, 'range')) {
    attrs.RANGE = item.range ?? (equipment ? 'NO' : 'SELF');
  }
  if (shouldEmitGenericPowerFields || hasExplicitPowerField(item, 'duration')) {
    attrs.DURATION = item.duration ?? (equipment ? 'INHERENT' : 'INSTANT');
  }
  if (shouldEmitGenericPowerFields || hasExplicitPowerField(item, 'target')) {
    attrs.TARGET = item.target ?? (equipment ? 'N/A' : 'SELFONLY');
  }

  return attrs;
}

function powerElement(item, index, equipment = false) {
  const isList = item.tag === 'LIST' || item.isGroup || toXmlId(item.xmlId) === 'LIST';
  const isCompound = item.isContainer || toXmlId(item.xmlId) === 'COMPOUNDPOWER';
  const xmlId = isList ? 'GENERIC_OBJECT' : (isCompound ? 'COMPOUNDPOWER' : resolvePowerXmlId(item));
  const isCustomPower = xmlId === 'CUSTOMPOWER';
  const effectDice = item.effectDice ?? item.dice;
  const inferredLevels = !isPresent(item.levels) && typeof effectDice === 'string' && effectDice.match(/^(\d+(?:\.\d+)?)d6/i)
    ? Number(effectDice.match(/^(\d+(?:\.\d+)?)d6/i)[1])
    : undefined;
  const children = childrenForItem(item);
  const powerAlias = canonicalPowerAlias(item, xmlId, isCustomPower, isCompound);

  for (const [childIndex, child] of asArray(item.subPowers ?? item.children).entries()) {
    const normalizedChild = { ...child, parentId: child.parentId ?? item.id };
    if (isCharacteristicTag(normalizedChild.type ?? normalizedChild.xmlId ?? normalizedChild.tag)) {
      children.push(characteristicChildElement(normalizedChild, childIndex));
    } else if (normalizedChild.kind === 'skill') {
      children.push(skillElement(normalizedChild, childIndex));
    } else {
      children.push(powerElement(normalizedChild, childIndex, false));
    }
  }

  const weight = equipment && isPresent(item.weight)
    ? (item.weightUnit === 'lb' ? item.weight : numberValue(item.weight) / 0.453592)
    : undefined;

  const explicitCost = item.realCost ?? item.sheetCost ?? item.points;
  const baseCost = isCustomPower
    ? numberValue(explicitCost ?? item.baseCost ?? item.activeCost, 0)
    : numberValue(item.baseCost ?? item.activeCost ?? item.points, 0);
  const levels = isCustomPower
    ? numberValue(item.preserveCustomLevels ? item.levels : 0, 0)
    : numberValue(item.levels ?? inferredLevels, 0);
  const defaultFlags = defaultPowerFlags(xmlId);

  if (isList) {
    return xml('LIST', hdcDefaults({
      ID: item.id ?? generatedId(equipment ? 'equipment' : 'power', index),
      XMLID: 'GENERIC_OBJECT',
      NAME: item.name ?? '',
      ALIAS: item.alias ?? item.description ?? item.name,
      TEXT: item.text,
      POSITION: item.position ?? index,
      LEVELS: levels,
      BASECOST: baseCost,
      CARRIED: equipment ? yesNo(item.carried, 'Yes') : undefined,
      PRICE: equipment ? item.price : undefined,
      WEIGHT: weight,
    }), [notesElement(item), ...children]);
  }

  return xml('POWER', hdcDefaults(buildPowerAttributes(item, {
    index,
    equipment,
    isCompound,
    isCustomPower,
    powerAlias,
    baseCost,
    levels,
    weight,
    effectDice,
    defaultFlags,
  })), [notesElement(item), ...children]);
}

function canonicalPowerAlias(item, xmlId, isCustomPower, isCompound) {
  if (isCompound || isCustomPower) {
    return item.alias ?? item.description ?? item.name;
  }
  if (item.keepDisplayAlias === true) {
    return item.alias ?? item.description ?? item.name;
  }
  return CANONICAL_POWER_ALIASES.get(String(xmlId ?? '').toUpperCase()) ?? item.name ?? item.alias ?? item.description;
}

function defaultDisadAdders(xmlId) {
  const defaults = {
    VULNERABILITY: [
      { xmlId: 'ATTACK', alias: 'The Attack Is', baseCost: 5, option: 'UNCOMMON', optionId: 'UNCOMMON', optionAlias: '(Uncommon', selected: true, includeInBase: true, required: true },
    ],
    PSYCHOLOGICALLIMITATION: [
      { xmlId: 'SITUATION', alias: 'Situation Is', baseCost: 5, option: 'UNCOMMON', optionId: 'UNCOMMON', optionAlias: '(Uncommon', selected: true, includeInBase: true, required: true },
      { xmlId: 'INTENSITY', alias: 'Intensity Is', baseCost: 0, option: 'MODERATE', optionId: 'MODERATE', optionAlias: 'Moderate', selected: true, includeInBase: true, required: true },
    ],
    SUSCEPTIBILITY: [
      { xmlId: 'DICE', alias: 'Number of Dice', baseCost: 0, option: '1D6', optionId: '1D6', optionAlias: '1d6 damage', selected: true, includeInBase: true, required: true },
      { xmlId: 'DAMAGE', alias: 'Take Damage Every', baseCost: 0, option: 'INSTANT', optionId: 'INSTANT', optionAlias: 'Instant', selected: true, includeInBase: true, required: true },
      { xmlId: 'CONDITION', alias: 'Condition Is', baseCost: 5, option: 'UNCOMMON', optionId: 'UNCOMMON', optionAlias: '(Uncommon', selected: true, includeInBase: true, required: true },
    ],
    HUNTED: [
      { xmlId: 'APPEARANCE', alias: 'Appearance', baseCost: 0, option: 'EIGHT', optionId: 'EIGHT', optionAlias: 'Infrequently', selected: true, includeInBase: true, required: true },
      { xmlId: 'CAPABILITIES', alias: 'Capabilities', baseCost: 5, option: 'LESS', optionId: 'LESS', optionAlias: '(Less Pow', selected: true, includeInBase: true, required: true },
      { xmlId: 'MOTIVATION', alias: 'Motivation', baseCost: 0, option: 'HARSH', optionId: 'HARSH', optionAlias: 'Harshly Punish', selected: true, includeInBase: true, required: true },
    ],
    PHYSICALLIMITATION: [
      { xmlId: 'OCCURS', alias: 'Limitation Occurs', baseCost: 5, option: 'INFREQUENTLY', optionId: 'INFREQUENTLY', optionAlias: '(Infrequently', selected: true, includeInBase: true, required: true },
      { xmlId: 'IMPAIRS', alias: 'Limitation Impairs', baseCost: 0, option: 'BARELY', optionId: 'BARELY', optionAlias: 'Barely Impairing', selected: true, includeInBase: true, required: true },
    ],
    DISTINCTIVEFEATURES: [
      { xmlId: 'CONCEALABILITY', alias: 'Concealability', baseCost: 5, option: 'EASILY', optionId: 'EASILY', optionAlias: '(Easily Concealed', selected: true, includeInBase: true, required: true },
      { xmlId: 'REACTION', alias: 'Reaction', baseCost: 0, option: 'NOTICED', optionId: 'NOTICED', optionAlias: 'Noticed and Recognizable', selected: true, includeInBase: true, required: true },
      { xmlId: 'SENSING', alias: 'Sensing', baseCost: 0, option: 'COMMON', optionId: 'COMMON', optionAlias: 'Detectable By Commonly-Used Senses', selected: true, includeInBase: true, required: true },
    ],
    RIVALRY: [
      { xmlId: 'SITUATION', alias: 'Rivalry Situation', baseCost: 5, option: 'PROFESSIONAL', optionId: 'PROFESSIONAL', optionAlias: 'Professional', selected: true, includeInBase: true, required: true },
      { xmlId: 'DESCRIPTION', alias: 'Rivalry Desc.', baseCost: 0, option: 'DEFAULT', optionId: 'DEFAULT', optionAlias: '(', selected: true, includeInBase: true, required: true },
      { xmlId: 'POWER', alias: 'Rival\'s Power', baseCost: -5, option: 'LESS', optionId: 'LESS', optionAlias: 'Rival is Less Powerful', selected: true, includeInBase: true, required: true },
      { xmlId: 'FIERCENESS', alias: 'Fierceness of Rivalry', baseCost: 0, option: 'OUTDO', optionId: 'OUTDO', optionAlias: 'Seek to Outdo, Embarrass, or Humiliate Rival', selected: true, includeInBase: true, required: true },
      { xmlId: 'KNOWLEDGE', alias: 'Knowledge of Rivalry', baseCost: 0, option: 'AWARE', optionId: 'AWARE', optionAlias: 'Rival Aware of Rivalry', selected: true, includeInBase: true, required: true },
    ],
    DEPENDENCE: [
      { xmlId: 'EFFECT', alias: 'Effect', baseCost: 5, option: 'DAMAGE1D6', optionId: 'DAMAGE1D6', optionAlias: 'Takes 1d6 Damage', selected: true, includeInBase: true, required: true },
      { xmlId: 'SUBSTANCE', alias: 'Dependent Substance Is', baseCost: 5, option: 'VERYCOMMON', optionId: 'VERYCOMMON', optionAlias: '(Very Common', selected: true, includeInBase: true, required: true },
      { xmlId: 'TIME', alias: 'Time Before Suffering Effects', baseCost: 25, option: 'SEGMENT', optionId: 'SEGMENT', optionAlias: '1 Segment', selected: true, includeInBase: true, required: true },
    ],
  };
  return defaults[xmlId] ? defaults[xmlId].map((adder) => ({ ...adder })) : [];
}

function disadElement(item, index) {
  const points = Math.abs(numberValue(item.points ?? item.baseCost, 0));
  const xmlId = inferDisadXmlId(item);
  const disadItem = {
    ...item,
    adders: asArray(item.adders).length > 0 ? asArray(item.adders) : defaultDisadAdders(xmlId),
  };
  return xml('DISAD', hdcDefaults({
    ID: item.id ?? generatedId('disad', index),
    XMLID: xmlId,
    NAME: item.name,
    ALIAS: item.alias ?? item.category ?? disadAlias(xmlId),
    INPUT: item.input ?? item.name,
    POSITION: item.position ?? index,
    LEVELS: numberValue(item.levels, 0),
    BASECOST: item.baseCost ?? (points ? -points : 0),
    OPTION: item.option,
    OPTION_ALIAS: item.optionAlias,
  }), [notesElement(item), ...childrenForItem(disadItem)]);
}

function assignNumericIds(root) {
  const clone = structuredClone(root);
  let nextId = Date.now();
  const idMap = new Map();

  function allocateId() {
    nextId += 1;
    return String(nextId);
  }

  function firstPass(node) {
    if (Array.isArray(node)) {
      node.forEach(firstPass);
      return;
    }
    if (!node || typeof node !== 'object') {
      return;
    }
    if (Object.prototype.hasOwnProperty.call(node, 'id') && isPresent(node.id)) {
      const oldId = String(node.id);
      const newId = allocateId();
      idMap.set(oldId, newId);
      node.id = newId;
    }
    for (const value of Object.values(node)) {
      firstPass(value);
    }
  }

  function secondPass(node) {
    if (Array.isArray(node)) {
      node.forEach(secondPass);
      return;
    }
    if (!node || typeof node !== 'object') {
      return;
    }
    if (isPresent(node.parentId) && idMap.has(String(node.parentId))) {
      node.parentId = idMap.get(String(node.parentId));
    }
    for (const value of Object.values(node)) {
      secondPass(value);
    }
  }

  firstPass(clone);
  secondPass(clone);
  return clone;
}

function disadAlias(xmlId) {
  const aliases = {
    PSYCHOLOGICALLIMITATION: 'Psychological Complication',
    PHYSICALLIMITATION: 'Physical Complication',
    DISTINCTIVEFEATURES: 'Distinctive Features',
    RIVALRY: 'Rivalry',
    HUNTED: 'Hunted',
    VULNERABILITY: 'Vulnerability',
    SUSCEPTIBILITY: 'Susceptibility',
    DEPENDENCE: 'Dependence',
  };
  return aliases[xmlId] ?? 'Complication';
}

function section(tag, body) {
  return xml(tag, {}, [body]);
}

function buildCharacterInfo() {
  const info = ir.characterInfo ?? {};
  const height = isPresent(info.height)
    ? (info.heightUnit === 'in' ? numberValue(info.height) : numberValue(info.height) / 2.54)
    : undefined;
  const weight = isPresent(info.weight)
    ? (info.weightUnit === 'lb' ? numberValue(info.weight) : numberValue(info.weight) / 0.453592)
    : undefined;

  return xml('CHARACTER_INFO', {
    CHARACTER_NAME: info.characterName ?? ir.name ?? basename(outputPath, '.hdc') ?? 'New Character',
    ALTERNATE_IDENTITIES: info.alternateIdentities,
    PLAYER_NAME: info.playerName,
    HEIGHT: height,
    WEIGHT: weight,
    HAIR_COLOR: info.hairColor,
    EYE_COLOR: info.eyeColor,
    CAMPAIGN_NAME: info.campaignName,
    GENRE: normalizeGenre(info.genre, template),
    GM: info.gm,
  }, [
    textElement('BACKGROUND', info.background),
    textElement('PERSONALITY', info.personality),
    textElement('QUOTE', info.quote),
    textElement('TACTICS', info.tactics),
    textElement('CAMPAIGN_USE', info.campaignUse),
    textElement('APPEARANCE', info.appearance),
    textElement('NOTES1', info.notes1),
    textElement('NOTES2', info.notes2),
    textElement('NOTES3', info.notes3),
    textElement('NOTES4', info.notes4),
    textElement('NOTES5', info.notes5),
  ]);
}

function buildRules() {
  const config = ir.basicConfiguration ?? {};
  const rules = ir.rules ?? {};
  return xml('RULES', {
    name: rules.name ?? 'Default',
    BASEPOINTS: rules.basePoints ?? config.basePoints ?? 175,
    DISADPOINTS: rules.disadPoints ?? config.disadPoints ?? 100,
    APPEREND: rules.apPerEnd ?? 10,
    STRAPPEREND: rules.strApPerEnd ?? 10,
    STANDARDEFFECTALLOWED: yesNo(rules.standardEffectAllowed, 'Yes'),
    MULTIPLIERALLOWED: yesNo(rules.multiplierAllowed, 'No'),
    LITERACYFREE: yesNo(rules.literacyFree, 'No'),
    NATIVELITERACYFREE: yesNo(rules.nativeLiteracyFree, 'Yes'),
    EQUIPMENTALLOWED: yesNo(rules.equipmentAllowed, 'Yes'),
    USESKILLMAXIMA: yesNo(rules.useSkillMaxima, 'No'),
    SKILLMAXIMALIMIT: rules.skillMaximaLimit ?? 13,
    SKILLROLLBASE: rules.skillRollBase ?? 9,
    SKILLROLLDENOMINATOR: rules.skillRollDenominator ?? 5,
    CHARROLLBASE: rules.charRollBase ?? 9,
    CHARROLLDENOMINATOR: rules.charRollDenominator ?? 5,
  });
}

const config = ir.basicConfiguration ?? {};
const disadvantages = ir.disadvantages ?? ir.complications ?? [];
const template = ir.template ?? config.template ?? 'builtIn.Heroic6E.hdt';
const body = [
  xml('BASIC_CONFIGURATION', {
    BASE_POINTS: config.basePoints ?? 175,
    DISAD_POINTS: config.disadPoints ?? 100,
    EXPERIENCE: config.experience ?? 0,
    EXPORT_TEMPLATE: config.exportTemplate,
  }),
  buildCharacterInfo(),
  section('CHARACTERISTICS', normalizeCharacteristics(ir.characteristics)),
  section('SKILLS', asArray(ir.skills).map(skillElement).join('')),
  section('PERKS', asArray(ir.perks).map((item, index) => genericElement('PERK', 'perk', item, index)).join('')),
  section('TALENTS', asArray(ir.talents).map((item, index) => genericElement('TALENT', 'talent', item, index)).join('')),
  section('MARTIALARTS', asArray(ir.martialArts).map((item, index) => genericElement(item.isWeaponElement ? 'WEAPON_ELEMENT' : 'MANEUVER', 'martial', item, index)).join('')),
  section('POWERS', asArray(ir.powers).map((item, index) => powerElement(item, index)).join('')),
  section('DISADVANTAGES', asArray(disadvantages).map(disadElement).join('')),
  section('EQUIPMENT', asArray(ir.equipment).map((item, index) => powerElement(item, index, true)).join('')),
  buildRules(),
];

const document = [
  '<?xml version="1.0" encoding="UTF-16"?>',
  xml('CHARACTER', { version: ir.version ?? '6.0', TEMPLATE: template }, body),
  '',
].join('\r\n');

writeFileSync(outputPath, `\uFEFF${document}`, 'utf16le');
console.log(`Wrote ${outputPath}`);
