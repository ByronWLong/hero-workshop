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
} from '../generated/catalog6e.js';
import { SKILL_CATALOG_6E } from '../generated/skillCatalog6e.js';
import { getPowerDefinition } from '../powerDefinitions.js';
import { LABELLED_SKILL_XMLIDS } from '../hdc/foundry.js';
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

const COMBAT_LEVEL_OPTIONS = [
  { value: 'SINGLE', label: 'With a single attack (2/level)', cost: 2 },
  { value: 'TIGHT', label: 'With a small group of attacks (3/level)', cost: 3 },
  { value: 'BROAD', label: 'With a large group of attacks (5/level)', cost: 5 },
  { value: 'HTH', label: 'With HTH combat (5/level)', cost: 5 },
  { value: 'RANGED', label: 'With ranged combat (5/level)', cost: 5 },
  { value: 'ALL', label: 'With all attacks (8/level)', cost: 8 },
];

const SKILL_LEVEL_OPTIONS = [
  { value: 'CHARACTERISTIC', label: 'With a single skill or characteristic roll (2/level)', cost: 2 },
  { value: 'THREE', label: 'With three related skills (3/level)', cost: 3 },
  { value: 'GROUP', label: 'With a group of similar skills (4/level)', cost: 4 },
  { value: 'ALL', label: 'With all skills (6/level)', cost: 6 },
];

const LANGUAGE_OPTIONS = [
  { value: 'BASIC', label: 'Basic conversation (1)', cost: 1 },
  { value: 'FLUENT', label: 'Fluent conversation (2)', cost: 2 },
  { value: 'IDIOMATIC', label: 'Completely fluent, with accent (3)', cost: 3 },
  { value: 'IMITATE', label: 'Imitate dialects (4)', cost: 4 },
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

function otherSkillValues(skill: Skill | undefined, xmlid: string): FormValues {
  const values = otherSkillFields(skill, xmlid);
  return ATTACK_LINKED_SKILLS.includes(xmlid)
    ? { ...values, attacks: (skill?.adders ?? []).filter(isLinkAdder).map((a) => a.alias ?? a.name) }
    : values;
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
  if (xmlid === 'COMBAT_LEVELS') return levels * (COMBAT_LEVEL_OPTIONS.find((o) => o.value === v.option)?.cost ?? 2);
  if (xmlid === 'SKILL_LEVELS') return levels * (SKILL_LEVEL_OPTIONS.find((o) => o.value === v.option)?.cost ?? 2);
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
      { name: 'label', label: 'Label', type: 'text', value: str(v.label) || BACKGROUND_ALIAS[xmlid] || '', hint: `Shown before the subject; e.g. change ${BACKGROUND_ALIAS[xmlid] ?? 'PS'} to Magic Skill Roll` },
      { name: 'name', label: 'Name', type: 'text', value: str(v.name), hint: 'Optional; replaces "Label: Subject". Requires A Roll links to the skill by this name (or the label, if there is none)' },
    );
  } else {
    fields.push({ name: 'name', label: 'Custom name', type: 'text', value: str(v.name), hint: 'Optional; shown before the skill' });
  }

  if (xmlid === 'COMBAT_LEVELS' || xmlid === 'SKILL_LEVELS') {
    const list = xmlid === 'COMBAT_LEVELS' ? COMBAT_LEVEL_OPTIONS : SKILL_LEVEL_OPTIONS;
    fields.push({ name: 'option', label: 'Applies to', type: 'select', value: str(v.option), options: options(list, str(v.option) || list[0]!.value) });
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
  if (showsAttacks(xmlid, str(v.option))) {
    const chosen = list(v.attacks);
    const choices = character ? cslAttackChoices(character) : [];
    const known = new Set(choices.map((c) => c.value.toLowerCase()));
    fields.push({
      name: 'attacks',
      label: 'Attacks it applies to',
      type: 'attacks',
      value: chosen,
      hint: 'hero6e uses the levels only with these. A list or framework covers everything in it.',
      options: [
        ...choices.map((c) => ({ ...c, selected: chosen.some((n) => n.toLowerCase() === c.value.toLowerCase()) })),
        // Linked names that match none of the character's own items (standard maneuvers like Strike, renamed attacks)
        ...chosen.filter((n) => !known.has(n.toLowerCase())).map((n) => ({ value: n, label: n, group: 'Other', selected: true })),
      ],
    });
  }
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
    bindingName: customName ?? alias,
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

function saveSkill(existing: Skill | undefined, v: FormValues, position: number): Skill {
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
  const option = str(v.option) || undefined;
  const optionLabel = [...COMBAT_LEVEL_OPTIONS, ...SKILL_LEVEL_OPTIONS, ...LANGUAGE_OPTIONS].find((o) => o.value === option)?.label;
  const characteristic = (str(v.characteristic) || entry?.characteristicChoices?.[0]?.characteristic) as Skill['characteristic'];

  let adders = existing?.adders;
  if (showsAttacks(xmlid, str(v.option)) && Array.isArray(v.attacks)) adders = withAttackLinks(adders, v.attacks);
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
    optionAlias: option && option !== existing?.option ? optionLabel?.replace(/ \(.*\)$/, '') : existing?.optionAlias,
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
  { value: 'ANONYMITY', xmlId: 'ANONYMITY' },
  { value: 'COMPUTER_LINK', xmlId: 'COMPUTER_LINK' },
  { value: 'CONTACT', xmlId: 'CONTACT' },
  { value: 'DEEP_COVER', xmlId: 'DEEP_COVER' },
  { value: 'FAVOR', xmlId: 'FAVOR' },
  { value: 'FOLLOWER', xmlId: 'FOLLOWER' },
  { value: 'FRINGE_BENEFIT', xmlId: 'FRINGE_BENEFIT' },
  { value: 'MONEY', xmlId: 'MONEY' },
  { value: 'REPUTATION', xmlId: 'REPUTATION' },
  { value: 'VEHICLE_BASE', xmlId: 'VEHICLE_BASE' },
  { value: 'GENERIC', xmlId: 'CUSTOMPERK' },
];
const PERK_LABELS = new Map(PERK_CATALOG_6E.map((p) => [p.xmlId, p.display]));
const perkLabel = (type: string) => PERK_LABELS.get(PERK_TYPES.find((p) => p.value === type)?.xmlId ?? '') ?? type;

const TALENT_TYPES: { value: Talent['type']; xmlId: string; perLevel?: boolean }[] = [
  { value: 'ABSOLUTE_RANGE_SENSE', xmlId: 'ABSOLUTE_RANGE_SENSE' },
  { value: 'ABSOLUTE_TIME_SENSE', xmlId: 'ABSOLUTE_TIME_SENSE' },
  { value: 'AMBIDEXTERITY', xmlId: 'AMBIDEXTERITY' },
  { value: 'BUMP_OF_DIRECTION', xmlId: 'BUMP_OF_DIRECTION' },
  { value: 'COMBAT_LUCK', xmlId: 'COMBAT_LUCK', perLevel: true },
  { value: 'DANGER_SENSE', xmlId: 'DANGER_SENSE' },
  { value: 'DOUBLE_JOINTED', xmlId: 'DOUBLE_JOINTED' },
  { value: 'EIDETIC_MEMORY', xmlId: 'EIDETIC_MEMORY' },
  { value: 'ENVIRONMENTAL_MOVEMENT', xmlId: 'ENVIRONMENTAL_MOVEMENT' },
  { value: 'LIGHTNING_CALCULATOR', xmlId: 'LIGHTNING_CALCULATOR' },
  { value: 'LIGHTNING_REFLEXES', xmlId: 'LIGHTNING_REFLEXES_ALL', perLevel: true },
  { value: 'LIGHTSLEEP', xmlId: 'LIGHTSLEEP' },
  { value: 'OFF_HAND_DEFENSE', xmlId: 'OFFHANDDEFENSE' },
  { value: 'PERFECT_PITCH', xmlId: 'PERFECT_PITCH' },
  { value: 'RESISTANCE', xmlId: 'RESISTANCE', perLevel: true },
  { value: 'SIMULATE_DEATH', xmlId: 'SIMULATE_DEATH' },
  { value: 'SPEED_READING', xmlId: 'SPEED_READING', perLevel: true },
  { value: 'STRIKING_APPEARANCE', xmlId: 'STRIKING_APPEARANCE', perLevel: true },
  { value: 'UNIVERSAL_TRANSLATOR', xmlId: 'UNIVERSAL_TRANSLATOR' },
  { value: 'GENERIC', xmlId: 'CUSTOMTALENT' },
];
const TALENTS_BY_ID = new Map(TALENT_CATALOG_6E.map((t) => [t.xmlId, t]));
const talentEntry = (type: string) => TALENTS_BY_ID.get(TALENT_TYPES.find((t) => t.value === type)?.xmlId ?? '');

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
// Public API
// =============================================================================

export function itemFormValues(character: Character, section: FormSection, itemId?: string): FormValues {
  const item = itemId ? sectionItems(character, section).find((i) => i.id === itemId) : undefined;
  return { ...sectionFormValues(section, item), icon: item?.icon ?? '' };
}

function sectionFormValues(section: FormSection, item: ListItem | undefined): FormValues {
  // Lists only have a name and notes; their members are edited on their own
  if (item?.isGroup) return { group: true, name: item.name, notes: item.notes ?? '' };
  switch (section) {
    case 'skills':
      return skillValues(item as Skill | undefined);
    case 'perks': {
      const p = item as Perk | undefined;
      return { type: p?.type ?? 'CONTACT', name: p?.name ?? '', levels: p?.levels ?? 1, cost: p?.realCost ?? p?.baseCost ?? 1, notes: p?.notes ?? '' };
    }
    case 'talents': {
      const t = item as Talent | undefined;
      const perLevel = TALENT_TYPES.find((x) => x.value === t?.type)?.perLevel;
      const levels = t?.levels || 1;
      return {
        type: t?.type ?? 'COMBAT_LUCK',
        name: t?.name ?? '',
        levels,
        cost: perLevel ? (t?.baseCost ?? 0) / levels : (t?.baseCost ?? talentEntry(t?.type ?? 'COMBAT_LUCK')?.baseCost ?? 5),
        notes: t?.notes ?? '',
      };
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
        dc: m?.dc ?? 0, cost: m?.baseCost ?? 4, notes: m?.notes ?? '',
      };
    }
  }
}

export function itemForm(section: FormSection, values: FormValues, isNew: boolean, character?: Character): ItemForm {
  const notes: FormField = { name: 'notes', label: 'Notes', type: 'textarea', value: str(values.notes) };
  if (values.group) {
    return {
      title: 'Edit list',
      fields: [{ name: 'name', label: 'Name', type: 'text', value: str(values.name) }, notes],
      cost: 0,
      costLabel: '',
    };
  }
  switch (section) {
    case 'skills':
      return skillForm(values, isNew, character);
    case 'perks':
      return {
        title: isNew ? 'Add perk' : 'Edit perk',
        fields: [
          { name: 'type', label: 'Perk', type: 'select', value: str(values.type), options: options(PERK_TYPES.map((p) => ({ value: p.value, label: perkLabel(p.value) })), str(values.type)) },
          { name: 'name', label: 'Name', type: 'text', value: str(values.name) },
          { name: 'levels', label: 'Levels', type: 'number', value: num(values.levels) },
          { name: 'cost', label: 'Cost', type: 'number', value: num(values.cost) },
          notes,
        ],
        cost: num(values.cost),
        costLabel: 'pts',
      };
    case 'talents': {
      const type = str(values.type);
      const perLevel = TALENT_TYPES.find((t) => t.value === type)?.perLevel;
      return {
        title: isNew ? 'Add talent' : 'Edit talent',
        fields: [
          { name: 'type', label: 'Talent', type: 'select', value: type, options: options(TALENT_TYPES.map((t) => ({ value: t.value, label: talentEntry(t.value)?.display ?? t.value })), type) },
          { name: 'name', label: 'Name', type: 'text', value: str(values.name) },
          { name: 'levels', label: 'Levels', type: 'number', value: num(values.levels, 1) },
          { name: 'cost', label: perLevel ? 'Cost per level' : 'Cost', type: 'number', value: num(values.cost) },
          notes,
        ],
        cost: perLevel ? num(values.cost) * num(values.levels, 1) : num(values.cost),
        costLabel: 'pts',
      };
    }
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
  // Every section's save keeps the form's icon
  const icon = str(values.icon) || undefined;
  const put = <T extends { id: string; icon?: string }>(items: T[], saved: T) => {
    const item = { ...saved, icon };
    return existing ? items.map((i) => (i.id === item.id ? item : i)) : [...items, item];
  };

  if (existing?.isGroup) {
    const renamed = { ...existing, name: str(values.name).trim() || existing.name, notes: str(values.notes) || undefined, icon };
    return setSectionItems(character, section, list.map((i) => (i.id === existing.id ? renamed : i)));
  }

  switch (section) {
    case 'skills': {
      const before = existing as Skill | undefined;
      const skill = saveSkill(before, values, position);
      const saved = { ...character, skills: put(character.skills, skill) };
      return before ? retargetSkillRolls(saved, before, skill) : saved;
    }

    case 'perks': {
      const cost = num(values.cost);
      const perk: Perk = {
        ...((existing as Perk | undefined) ?? { id: newId(), position, baseCost: 0, levels: 0, type: 'GENERIC', name: '' }),
        type: str(values.type) as Perk['type'],
        name: str(values.name).trim() || perkLabel(str(values.type)),
        levels: num(values.levels),
        baseCost: cost,
        realCost: cost,
        notes: str(values.notes) || undefined,
      };
      return { ...character, perks: put(character.perks, perk) };
    }

    case 'talents': {
      const type = str(values.type) as Talent['type'];
      const perLevel = TALENT_TYPES.find((t) => t.value === type)?.perLevel;
      const cost = perLevel ? num(values.cost) * num(values.levels, 1) : num(values.cost);
      const talent: Talent = {
        ...((existing as Talent | undefined) ?? { id: newId(), position, baseCost: 0, levels: 0, type: 'GENERIC', name: '' }),
        type,
        name: str(values.name).trim() || talentEntry(type)?.display || type,
        levels: num(values.levels, 1),
        baseCost: cost,
        realCost: cost,
        notes: str(values.notes) || undefined,
      };
      return { ...character, talents: put(character.talents, talent) };
    }

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
        baseCost: cost,
        realCost: cost,
        notes: str(values.notes) || undefined,
        effect: `${values.phase} Phase, ${signedText(num(values.ocv))} OCV, ${signedText(num(values.dcv))} DCV`,
      } as MartialManeuver;
      return { ...character, martialArts: put(character.martialArts, maneuver) };
    }
  }
}
