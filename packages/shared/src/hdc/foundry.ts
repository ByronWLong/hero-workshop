/**
 * Compatibility rules for the hero6e Foundry VTT system
 * (https://github.com/dmdorman/hero6e-foundryvtt).
 *
 * Foundry imports HDC XML directly into strict item data models, so some constructs that
 * desktop Hero Designer tolerates break imports or roll resolution. These rules were found
 * the hard way while building the sheet-to-hdc skill; see
 * .agents/skills/sheet-to-hdc/references/hdc-format.md for the background on each.
 *
 * `normalizeForFoundry` repairs a single item the writer touched or created. It never
 * rewrites items the user didn't edit. `validateForFoundry` reports problems anywhere in
 * the document.
 */

import type { HdcDocument } from './document.js';
import type { XmlElement } from './xml.js';

export const CHARACTERISTIC_TAGS = [
  'STR', 'DEX', 'CON', 'INT', 'EGO', 'PRE',
  'OCV', 'DCV', 'OMCV', 'DMCV',
  'SPD', 'PD', 'ED', 'REC', 'END', 'BODY', 'STUN',
  'RUNNING', 'SWIMMING', 'LEAPING',
] as const;

const CHARACTERISTIC_TAG_SET = new Set<string>(CHARACTERISTIC_TAGS);

const NO_END_CHARACTERISTICS = new Set([
  'DEX', 'CON', 'INT', 'EGO', 'PRE', 'OCV', 'DCV', 'OMCV', 'DMCV',
  'SPD', 'PD', 'ED', 'REC', 'END', 'BODY', 'STUN',
]);

/** Defense Foundry's attack resolver should use when an attack power has no INPUT */
export const ATTACK_DEFENSE_DEFAULTS: Record<string, 'PD' | 'ED'> = {
  ENERGYBLAST: 'ED',
  HANDTOHANDATTACK: 'PD',
  HKA: 'PD',
  RKA: 'PD',
  TELEKINESIS: 'PD',
};

/** Canonical roll adders each roll-bearing complication needs for Foundry to render it */
export const REQUIRED_COMPLICATION_ADDERS: Record<string, string[]> = {
  ACCIDENTALCHANGE: ['CHANCETOCHANGE'],
  DEPENDENTNPC: ['APPEARANCE'],
  ENRAGED: ['CHANCETOGO'],
  HUNTED: ['APPEARANCE'],
  PSYCHOLOGICALLIMITATION: ['INTENSITY'],
  REPUTATION: ['RECOGNIZED'],
  SOCIALLIMITATION: ['OCCUR', 'EFFECTS'],
};

const SKILL_ROLL_OPTION = /^(SKILL|PS|KS|SS)(1PER(?:5|20))?$/;

export function isCharacteristicTag(name: string): boolean {
  return CHARACTERISTIC_TAG_SET.has(name);
}

/** The Requires A Roll OPTIONID category a skill must be bound with */
/** Background skills: rolled as PS/KS/SS, and labelled "PS: Subject" unless given a NAME */
export const BACKGROUND_SKILL_XMLIDS = ['PROFESSIONAL_SKILL', 'KNOWLEDGE_SKILL', 'SCIENCE_SKILL', 'AREA_KNOWLEDGE', 'CITY_KNOWLEDGE'];

/**
 * Skills shown as "Label: Subject" with a relabelable ALIAS and an optional NAME: the
 * background skills plus the Power skill (e.g. "Power: Wizardry", a spellcaster's magic skill).
 */
export const LABELLED_SKILL_XMLIDS = [...BACKGROUND_SKILL_XMLIDS, 'POWERSKILL'];

export function skillRollCategory(skillXmlId: string): 'PS' | 'KS' | 'SS' | 'SKILL' {
  if (skillXmlId === 'PROFESSIONAL_SKILL') return 'PS';
  if (skillXmlId === 'SCIENCE_SKILL') return 'SS';
  if (['KNOWLEDGE_SKILL', 'AREA_KNOWLEDGE', 'CITY_KNOWLEDGE'].includes(skillXmlId)) return 'KS';
  return 'SKILL';
}

/**
 * The name hero6e gives a skill's Foundry item, which Requires A Roll matches against:
 * its NAME, otherwise "ALIAS: INPUT" (e.g. "MSR: Wizardry", "Power: Necromancy"), otherwise ALIAS.
 */
export function skillItemName(name: string | undefined, alias: string | undefined, input: string | undefined): string {
  const n = name?.trim();
  if (n) return n;
  const a = alias?.trim() ?? '';
  const i = input?.trim();
  return i ? `${a}: ${i}` : a;
}

/** Names a Requires A Roll may use for this skill: the item name hero6e gives it, plus the bare NAME/ALIAS */
export function skillIdentities(skill: XmlElement): string[] {
  return [preferredSkillIdentity(skill), skill.getAttr('NAME'), skill.getAttr('ALIAS')]
    .map((v) => v?.trim() ?? '')
    .filter((v, i, all) => v && all.indexOf(v) === i);
}

/** The identity to bind to: the skill's Foundry item name */
export function preferredSkillIdentity(skill: XmlElement): string {
  return skillItemName(skill.getAttr('NAME'), skill.getAttr('ALIAS'), skill.getAttr('INPUT'));
}

export function findSkillsByIdentity(doc: HdcDocument, identity: string): XmlElement[] {
  const target = identity.trim().toLowerCase();
  if (!target) return [];
  return (doc.section('SKILLS')?.elements() ?? []).filter(
    (el) => el.name !== 'LIST' && skillIdentities(el).some((id) => id.toLowerCase() === target),
  );
}

// =============================================================================
// Normalization (applied to items the writer touched or created)
// =============================================================================

export interface NormalizeOptions {
  /** True for elements the writer just created: fill in Foundry-required defaults */
  created?: boolean;
  /** Section the item lives in */
  section?: string;
}

/**
 * Applies Foundry-safe structure to one item element (and its modifiers/adders).
 * Returns human-readable notes describing each repair.
 */
export function normalizeForFoundry(
  doc: HdcDocument,
  item: XmlElement,
  options: NormalizeOptions = {},
): string[] {
  const notes: string[] = [];
  const label = itemLabel(item);
  const isPowerLike =
    options.section === 'POWERS' || options.section === 'EQUIPMENT' || item.name === 'POWER';

  // Top-level LVLCOST is rejected by Foundry's power/equipment models (adders keep theirs)
  if (isPowerLike && item.name !== 'ADDER' && item.removeAttr('LVLCOST')) {
    notes.push(`${label}: removed top-level LVLCOST`);
  }

  for (const el of [item, ...item.descendants()]) {
    if (el.name === 'MODIFIER') {
      if (el.removeAttr('ISLIMITATION')) notes.push(`${label}: removed ISLIMITATION from modifier`);
      if (el.getAttr('XMLID') === 'REQUIRESASKILLROLL') {
        notes.push(...normalizeRequiresARoll(doc, el, label));
      }
    }
    if (el.name === 'ADDER' && !el.getAttr('ALIAS')?.trim()) {
      el.setAttr('ALIAS', el.getAttr('NAME')?.trim() || 'Custom Adder');
      notes.push(`${label}: gave an adder a non-empty ALIAS`);
    }
  }

  const xmlId = item.getAttr('XMLID') ?? '';
  if (item.name === 'POWER' || (isPowerLike && isCharacteristicTag(item.name))) {
    const defense = ATTACK_DEFENSE_DEFAULTS[xmlId];
    if (defense && !['PD', 'ED', 'MD'].includes((item.getAttr('INPUT') ?? '').trim().toUpperCase())) {
      item.setAttr('INPUT', defense);
      notes.push(`${label}: set attack defense INPUT="${defense}"`);
    }
  }

  if (options.section === 'SKILLS' && xmlId === 'STEALTH' && item.getAttr('CHARACTERISTIC') !== 'DEX') {
    item.setAttr('CHARACTERISTIC', 'DEX');
    notes.push(`${label}: Stealth is DEX-based`);
  }

  if (lacksManeuverCategory(item)) {
    item.setAttr('CATEGORY', 'Hand to Hand');
    notes.push(`${label}: custom maneuver is Hand to Hand`);
  }

  return notes;
}

/**
 * A custom martial maneuver without a CATEGORY: hero6e counts it as a maneuver but finds it
 * neither Hand to Hand nor Ranged, and the character's sheet fails to open
 */
export function lacksManeuverCategory(el: XmlElement): boolean {
  if (el.name !== 'MANEUVER' || el.getAttr('CUSTOM') !== 'Yes') return false;
  const category = (el.getAttr('CATEGORY') ?? '').toLowerCase();
  return category !== 'hand to hand' && category !== 'ranged';
}

/** Invisibility or Darkness without the Sense Group it affects (hero6e's description fails) */
export function lacksSenseGroup(el: XmlElement): boolean {
  const xmlId = el.getAttr('XMLID');
  return (xmlId === 'INVISIBILITY' || xmlId === 'DARKNESS') && el.name === 'POWER' && !el.getAttr('OPTION_ALIAS')?.trim();
}

/**
 * Canonical Requires A Roll: ALIAS "Requires A Roll", no INPUT, the Hero Designer label in
 * OPTION_ALIAS, the bound skill's NAME/ALIAS in COMMENTS, and an OPTIONID category that
 * matches the skill (PS/KS/SS/SKILL, keeping any 1PER5/1PER20 suffix).
 */
function normalizeRequiresARoll(doc: HdcDocument, modifier: XmlElement, label: string): string[] {
  const notes: string[] = [];
  if (modifier.getAttr('ALIAS') !== 'Requires A Roll') {
    modifier.setAttr('ALIAS', 'Requires A Roll');
  }

  // Legacy/hand-built files put the binding in INPUT, which makes Hero Designer strip the modifier
  const input = modifier.getAttr('INPUT')?.trim();
  if (modifier.hasAttr('INPUT')) {
    modifier.removeAttr('INPUT');
    if (input && !modifier.getAttr('COMMENTS')?.trim()) {
      modifier.setAttr('COMMENTS', input);
      notes.push(`${label}: moved Requires A Roll binding from INPUT to COMMENTS`);
    }
  }

  const characteristic = characteristicRollFix(modifier);
  if (characteristic) {
    modifier.setAttr('COMMENTS', characteristic);
    notes.push(`${label}: Requires A Roll names its characteristic as "${characteristic}"`);
  }

  const optionId = (modifier.getAttr('OPTIONID') ?? '').toUpperCase();
  const match = SKILL_ROLL_OPTION.exec(optionId);
  const binding = modifier.getAttr('COMMENTS')?.trim();
  if (!match || !binding) return notes;

  const skills = findSkillsByIdentity(doc, binding);
  if (skills.length === 1) {
    const expected = skillRollCategory(skills[0]!.getAttr('XMLID') ?? '') + (match[2] ?? '');
    if (expected !== optionId) {
      modifier.setAttr('OPTIONID', expected);
      modifier.setAttr('OPTION', expected);
      notes.push(`${label}: Requires A Roll category ${optionId} -> ${expected}`);
    }
    if (!modifier.getAttr('OPTION_ALIAS')?.trim() || modifier.getAttr('OPTION_ALIAS') === 'Skill roll') {
      modifier.setAttr('OPTION_ALIAS', skills[0]!.getAttr('INPUT')?.trim() || binding);
    }
  }
  return notes;
}

/**
 * Re-points Requires A Roll bindings after a skill's identity changes, so renaming a skill in
 * the editor doesn't silently orphan the powers that roll against it.
 */
export function rebindRequiresARoll(doc: HdcDocument, oldIdentities: string[], skill: XmlElement): string[] {
  const current = new Set(skillIdentities(skill).map((s) => s.toLowerCase()));
  const stale = oldIdentities.filter((id) => !current.has(id.toLowerCase()));
  if (stale.length === 0) return [];
  const staleSet = new Set(stale.map((s) => s.toLowerCase()));
  const target = preferredSkillIdentity(skill);
  const notes: string[] = [];

  for (const el of doc.root.descendants()) {
    if (el.name !== 'MODIFIER' || el.getAttr('XMLID') !== 'REQUIRESASKILLROLL') continue;
    const comments = el.getAttr('COMMENTS')?.trim() ?? '';
    if (!staleSet.has(comments.toLowerCase())) continue;
    el.setAttr('COMMENTS', target);
    if (staleSet.has((el.getAttr('OPTION_ALIAS') ?? '').trim().toLowerCase())) {
      el.setAttr('OPTION_ALIAS', target);
    }
    const owner = el.parent;
    notes.push(`${owner ? itemLabel(owner) : 'item'}: Requires A Roll rebound from "${comments}" to "${target}"`);
  }
  return notes;
}

// =============================================================================
// Validation
// =============================================================================

export interface FoundryValidationIssue {
  severity: 'error' | 'warning';
  message: string;
  /** HDC ID of the offending item, when there is one */
  itemId?: string;
}

export function validateForFoundry(doc: HdcDocument): FoundryValidationIssue[] {
  const issues: FoundryValidationIssue[] = [];
  const warn = (message: string, item?: XmlElement) =>
    issues.push({ severity: 'warning', message, itemId: item?.getAttr('ID') });
  const root = doc.root;

  if (root.name !== 'CHARACTER') {
    issues.push({ severity: 'error', message: `Root element is <${root.name}>; Foundry expects <CHARACTER>.` });
    return issues;
  }

  const characteristics = doc.section('CHARACTERISTICS');
  if (!characteristics) {
    issues.push({ severity: 'error', message: 'Missing CHARACTERISTICS section.' });
  }

  const sections = ['SKILLS', 'PERKS', 'TALENTS', 'MARTIALARTS', 'POWERS', 'DISADVANTAGES', 'EQUIPMENT'] as const;
  for (const sectionName of sections) {
    const section = doc.section(sectionName);
    if (!section) continue;

    for (const item of section.descendants()) {
      const xmlId = item.getAttr('XMLID');
      if (xmlId === undefined && item.name !== 'LIST') continue;
      const label = `${sectionName.toLowerCase()} ${itemLabel(item)}`;

      if (item.name !== 'ADDER' && item.name !== 'MODIFIER' && item.hasAttr('LVLCOST')
        && (sectionName === 'POWERS' || sectionName === 'EQUIPMENT') && item.parent === section) {
        warn(`${label} has top-level LVLCOST, which Foundry's item models reject.`, item);
      }
      if (item.name === 'MODIFIER' && item.hasAttr('ISLIMITATION')) {
        warn(`${label} has ISLIMITATION, which Foundry's modifier model rejects.`, item.parent ?? item);
      }
      if (item.name === 'ADDER' && !item.getAttr('ALIAS')?.trim()) {
        warn(`${label} has an ADDER without ALIAS; Foundry's description renderer can fail on it.`, item.parent ?? item);
      }
      if (item.name === 'MODIFIER' && xmlId === 'REQUIRESASKILLROLL') {
        validateRequiresARoll(doc, item, issues);
      }
      if (lacksSenseGroup(item)) {
        warn(`${label} doesn't name the Sense Group it affects (OPTION_ALIAS); hero6e can't describe it.`, item);
      }
      if (lacksManeuverCategory(item)) {
        warn(`${label} is a custom maneuver without CATEGORY="Hand to Hand" or "Ranged"; hero6e's sheet can't open.`, item);
      }
    }

    for (const item of section.elements()) {
      const xmlId = item.getAttr('XMLID') ?? '';
      const label = `${sectionName.toLowerCase()} ${itemLabel(item)}`;

      if (sectionName === 'POWERS' && item.name === 'POWER' && isCharacteristicTag(xmlId)) {
        warn(`${label} uses <POWER XMLID="${xmlId}">; use a <${xmlId}> element so Hero Designer preserves it.`, item);
      }
      if (sectionName === 'POWERS' && NO_END_CHARACTERISTICS.has(item.name)
        && item.elements('MODIFIER').some((m) => m.getAttr('XMLID') === 'REDUCEDEND')) {
        warn(`${label} applies Reduced Endurance to ${item.name}, which costs no END; use Costs Endurance instead.`, item);
      }
      const defense = ATTACK_DEFENSE_DEFAULTS[xmlId];
      if (defense && !['PD', 'ED', 'MD'].includes((item.getAttr('INPUT') ?? '').trim().toUpperCase())) {
        warn(`${label} (${xmlId}) needs INPUT="PD", "ED" or "MD" so Foundry can resolve its defense.`, item);
      }
      if (sectionName === 'PERKS' && xmlId === 'REPUTATION') {
        const adders = new Set(item.elements('ADDER').map((a) => a.getAttr('XMLID')));
        if (!adders.has('HOWWIDE') || !adders.has('HOWWELL')) {
          warn(`${label} (Positive Reputation) must include HOWWIDE and HOWWELL adders.`, item);
        }
      }
      if (sectionName === 'DISADVANTAGES') {
        const required = REQUIRED_COMPLICATION_ADDERS[xmlId];
        if (required) {
          const adders = new Set(item.elements('ADDER').map((a) => a.getAttr('XMLID')));
          const missing = required.filter((r) => !adders.has(r));
          if (missing.length) warn(`${label} (${xmlId}) is missing required roll adder(s): ${missing.join(', ')}.`, item);
        }
      }
      if (sectionName === 'SKILLS' && xmlId === 'STEALTH' && item.getAttr('CHARACTERISTIC') !== 'DEX') {
        warn(`${label} (Stealth) should be DEX-based for Foundry to build its roll.`, item);
      }
    }
  }
  return issues;
}

const ROLL_CHARACTERISTICS = /\b(STR|DEX|CON|INT|EGO|PRE)\b/i;

/**
 * hero6e rolls a Characteristic-roll Requires A Roll against the characteristic its COMMENTS
 * names, so COMMENTS must be the bare key ("EGO", not "EGO roll"). Returns the key a
 * characteristic roll should have there, or undefined when it's right or can't be told.
 */
export function characteristicRollFix(modifier: XmlElement): string | undefined {
  if (modifier.getAttr('XMLID') !== 'REQUIRESASKILLROLL') return undefined;
  if (!/^CHAR(1PER(5|20))?$/i.test(modifier.getAttr('OPTIONID') ?? '')) return undefined;
  const comments = modifier.getAttr('COMMENTS')?.trim() ?? '';
  if (/^(STR|DEX|CON|INT|EGO|PRE)$/.test(comments)) return undefined;
  const key = ROLL_CHARACTERISTICS.exec(comments)?.[1] ?? ROLL_CHARACTERISTICS.exec(modifier.getAttr('OPTION_ALIAS') ?? '')?.[1];
  return key?.toUpperCase();
}

function validateRequiresARoll(doc: HdcDocument, modifier: XmlElement, issues: FoundryValidationIssue[]): void {
  const characteristic = characteristicRollFix(modifier);
  if (characteristic) {
    const owner = modifier.parent;
    issues.push({
      severity: 'warning',
      itemId: owner?.getAttr('ID'),
      message: `${owner ? itemLabel(owner) : 'item'}: Requires A Roll's COMMENTS should be just "${characteristic}"; hero6e looks for a characteristic named "${modifier.getAttr('COMMENTS') ?? ''}".`,
    });
  }
  const optionId = (modifier.getAttr('OPTIONID') ?? '').toUpperCase();
  const match = SKILL_ROLL_OPTION.exec(optionId);
  if (!match) return;
  const owner = modifier.parent;
  const label = owner ? itemLabel(owner) : 'item';
  const itemId = owner?.getAttr('ID');
  const comments = modifier.getAttr('COMMENTS')?.trim() ?? '';

  if (modifier.getAttr('INPUT')?.trim()) {
    issues.push({ severity: 'warning', itemId, message: `${label}: Requires A Roll has INPUT set; Hero Designer may strip the modifier. Move the binding to COMMENTS.` });
  }
  if (!comments) {
    issues.push({ severity: 'warning', itemId, message: `${label}: Requires A Roll is not bound to a skill (COMMENTS is empty), so Foundry can't roll it.` });
    return;
  }
  const skills = findSkillsByIdentity(doc, comments);
  if (skills.length === 0) {
    issues.push({ severity: 'warning', itemId, message: `${label}: Requires A Roll targets "${comments}", but no skill has that NAME or ALIAS.` });
  } else if (skills.length === 1) {
    const expected = skillRollCategory(skills[0]!.getAttr('XMLID') ?? '');
    if (match[1] !== expected) {
      issues.push({ severity: 'warning', itemId, message: `${label}: Requires A Roll uses OPTIONID="${optionId}", but "${comments}" needs the ${expected} category.` });
    }
  }
}

export function itemLabel(item: XmlElement): string {
  return (
    item.getAttr('NAME')?.trim() ||
    item.getAttr('ALIAS')?.trim() ||
    item.getAttr('XMLID') ||
    item.name
  );
}
