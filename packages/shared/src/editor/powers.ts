/**
 * Power and equipment editing: a draft the UI edits, the operations that change it, the view
 * a form renders from it, and saving it back into the character. Framework-independent.
 */

import { FRAMEWORK_NAMES, frameworkOwnCost, inheritedSlotLimitations, isContainerType, isFramework, slotCost, type FrameworkType } from '../frameworks.js';
import type { Adder, Character, Equipment, Modifier, Power } from '../types.js';
import { modifierBookNotes, modifierProblem, powerBookNotes, type PowerFacts } from '../modifierRules.js';
import {
  ALL_POWERS,
  calculatePowerBaseCost,
  getPowerDefinition,
  flashDefenseLevels,
  powerAdders,
  steppedCost,
  type PowerDefinition,
} from '../powerDefinitions.js';
import {
  NND,
  aoeValue,
  clampModifierValue,
  getAllModifiers,
  getModifierByXmlId,
  isNnd,
  modifierAdders,
  modifierFor,
  powerSpecificModifiers,
  POWER_DEPENDENT_MODIFIERS,
  nakedAdvantageCosts,
  powerEndCost,
  priceChargesAdders,
  subModifierFor,
  valueOnPower,
  subModifierOffered,
  subModifierSuffix,
  withSubModifiers,
  type ModifierAdder,
  type ModifierDefinition,
} from '../modifierDefinitions.js';
import { calculateAdderCost, heroRoundCost } from '../utils.js';
import { builtInSenseModifiers, defaultSenseGroup, isEnhancedSense, senseAdders, senseGroupChoices, senseModifierName } from '../senses.js';
import { fractionText as fraction, modifierSummary } from './lists.js';
import { setCarried } from './equipment.js';
import { skillRollCategory } from '../hdc/foundry.js';
import { HdcDocument } from '../hdc/document.js';
import { parseHdcFile } from '../hdc/parse.js';
import { extractItems, insertParts, type ItemTransfer } from '../hdc/transfer.js';
import { blankHdc, updateHdc } from '../hdc/write.js';
import { createElement } from '../hdc/xml.js';
import type { TypeChoiceGroup } from './items.js';

/** Requires A Roll options that roll a skill: SKILL, PS, KS, SS (each with -1 per 5/20 AP variants) */
const SKILL_ROLL_OPTION = /^(SKILL|PS|KS|SS)(1PER5|1PER20)?$/;

/** Skills that can't be rolled themselves: levels, enhancers, languages */
const NOT_ROLLED = new Set(['COMBAT_LEVELS', 'SKILL_LEVELS', 'LANGUAGES', 'JACK_OF_ALL_TRADES', 'LINGUIST', 'SCHOLAR', 'SCIENTIST', 'TRAVELER']);

/** The character's skills a Requires A Roll can use, by the name hero6e matches on */
export function rollSkillChoices(character: Character) {
  const skills = character.skills.filter((s) => !s.isGroup && !s.isEnhancer && !NOT_ROLLED.has(s.xmlid ?? ''));
  const names = skills.map((s) => s.bindingName ?? s.name);
  return skills.map((s, i) => {
    const value = names[i]!;
    return {
      value,
      label: s.name === value ? s.name : `${s.name} (as "${value}")`,
      xmlid: s.xmlid ?? '',
      input: s.input,
      // hero6e can't tell apart skills that share a name; they need a name of their own first
      ambiguous: names.filter((n) => n.toLowerCase() === value.toLowerCase()).length > 1,
    };
  });
}

const rollName = (category: string | undefined) => (category === 'SKILL' ? 'Skill' : (category ?? ''));

/** The Requires A Roll form's skill picker, and whether the roll's category suits the skill */
function skillRollView(m: Modifier, skills: ReturnType<typeof rollSkillChoices>, current: string) {
  const chosen = skills.find((s) => s.value.toLowerCase() === current.toLowerCase());
  const category = SKILL_ROLL_OPTION.exec(m.optionId ?? '')?.[1];
  const wanted = chosen ? skillRollCategory(chosen.xmlid) : undefined;
  return {
    choices: skills.map((s) => ({ ...s, selected: s === chosen })),
    current,
    missing: !!current && !chosen,
    // e.g. a Skill roll bound to a PS: hero6e expects a PS roll (which is worth less)
    mismatch: wanted && wanted !== category
      ? {
          skill: chosen!.value,
          wanted: rollName(wanted),
          current: rollName(category),
          // A casting skill bought as a Professional Skill is usually meant to be a Power skill
          professional: chosen!.xmlid === 'PROFESSIONAL_SKILL',
        }
      : undefined,
  };
}

/**
 * After a skill changes type or name, points the Requires A Roll limitations bound to it at
 * the skill as it is now: its current name, and the roll type the new skill type needs (a
 * Professional Skill converted to a Power skill takes a Skill roll again). Affected powers
 * and equipment are re-saved so their costs follow.
 */
export function retargetSkillRolls(
  character: Character,
  before: { bindingName?: string; name: string; xmlid?: string },
  after: { bindingName?: string; name: string; xmlid?: string; input?: string },
): Character {
  const oldName = (before.bindingName ?? before.name).toLowerCase();
  const newName = after.bindingName ?? after.name;
  const newCategory = skillRollCategory(after.xmlid ?? '');
  if (oldName === newName.toLowerCase() && skillRollCategory(before.xmlid ?? '') === newCategory) return character;

  const bound = (m: Modifier) =>
    m.xmlId === 'REQUIRESASKILLROLL' && SKILL_ROLL_OPTION.test(m.optionId ?? '') && (m.comments ?? '').trim().toLowerCase() === oldName;
  const retarget = (m: Modifier): Modifier => {
    if (!bound(m)) return m;
    const variant = SKILL_ROLL_OPTION.exec(m.optionId ?? '')?.[2] ?? '';
    const option = getModifierByXmlId('REQUIRESASKILLROLL')?.options?.find((o) => o.xmlId === newCategory + variant);
    return refreshModifier({
      ...m,
      comments: newName,
      optionId: option?.xmlId ?? m.optionId,
      optionAlias: newCategory === 'SKILL' ? (option?.display ?? m.optionAlias) : after.input || newName,
    });
  };

  let result = character;
  const targets: { section: PowerSection; id: string }[] = [
    ...character.powers.filter((p) => p.modifiers?.some(bound)).map((p) => ({ section: 'powers' as const, id: p.id })),
    ...(character.equipment ?? []).flatMap((e) => [
      ...(e.modifiers?.some(bound) ? [{ section: 'equipment' as const, id: e.id }] : []),
      ...(e.subPowers ?? []).filter((p) => p.modifiers?.some(bound)).map((p) => ({ section: 'equipment' as const, id: p.id })),
    ]),
  ];
  for (const { section, id } of targets) {
    const draft = powerDraft(result, section, id);
    result = savePowerDraft(result, section, id, { ...draft, modifiers: draft.modifiers.map(retarget) });
  }
  return result;
}

/**
 * Points a Requires A Roll at one of the character's skills: records its name (COMMENTS) and
 * switches the roll's category to match the skill (a PS needs a PS roll), keeping any
 * -1 per 5/20 Active Points variant.
 */
export function setRequiredSkill(draft: PowerDraft, id: string, skillName: string, character: Character): PowerDraft {
  const skill = rollSkillChoices(character).find((s) => s.value === skillName);
  return {
    ...draft,
    modifiers: draft.modifiers.map((m) => {
      if (m.id !== id) return m;
      const variant = SKILL_ROLL_OPTION.exec(m.optionId ?? '')?.[2] ?? '';
      const def = m.xmlId ? getModifierByXmlId(m.xmlId) : undefined;
      const wanted = skill ? skillRollCategory(skill.xmlid) + variant : m.optionId;
      const option = def?.options?.find((o) => o.xmlId === wanted);
      return refreshModifier({
        ...m,
        comments: skillName,
        optionId: option?.xmlId ?? m.optionId,
        // Hero Designer shows the skill's subject here for background-skill rolls
        optionAlias: skill && skillRollCategory(skill.xmlid) !== 'SKILL' ? skill.input || skillName : (option?.display ?? m.optionAlias),
      });
    }),
  };
}

export type PowerKind = 'power' | 'list' | 'compound' | 'multipower' | 'vpp';

/** The framework a kind of draft makes */
const FRAMEWORK_OF_KIND: Partial<Record<PowerKind, FrameworkType>> = { multipower: 'MULTIPOWER', vpp: 'VPP' };
const KIND_OF_FRAMEWORK: Record<FrameworkType, PowerKind> = { MULTIPOWER: 'multipower', VPP: 'vpp' };
export const isFrameworkKind = (kind: PowerKind) => kind in FRAMEWORK_OF_KIND;
export type PowerSection = 'powers' | 'equipment';

export interface PowerDraft {
  kind: PowerKind;
  /** Power XMLID, or CUSTOM for a custom power */
  xmlId: string;
  name: string;
  alias: string;
  input: string;
  notes: string;
  levels: number;
  option: string;
  /** The option's wording (Skill Levels name their skills in it) */
  optionAlias: string;
  customCost: number;
  affectsPrimary: boolean;
  affectsTotal: boolean;
  /** An enhanced sense's group (Detect: Unusual Senses, or any group) */
  senseGroup: string;
  barrier: { length: number; height: number; width: number; body: number; pd: number; ed: number; md: number; powd: number };
  /** An Endurance Reserve's Recovery (REC), and the Recovery's own modifiers (kept as they are) */
  recovery: number;
  recoveryModifiers: Modifier[];
  adders: Adder[];
  modifiers: Modifier[];
  parentId: string;
  /** A compound power's parts */
  subPowers: Power[];
  /** A Multipower's reserve or a Variable Power Pool's pool, in points */
  reserve: number;
  /** In a Multipower: a fixed slot (1/10 cost) rather than a variable one (1/5) */
  slotFixed: boolean;
  /** Custom icon (image path), or empty for the default */
  icon: string;
  /** Free (cost multiplier 0): given by the GM, costs no points */
  free: boolean;
  // Equipment
  price: number;
  /** Per item: weight in kg, how many there are */
  weight: number;
  quantity: number;
  carried: boolean;
}

const newId = () => `new-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// =============================================================================
// Lookup helpers
// =============================================================================

type PowerLike = Power & Partial<Equipment>;

/** Top-level powers/equipment plus equipment sub-powers, by id */
function findPower(character: Character, section: PowerSection, id: string): PowerLike | undefined {
  if (section === 'powers') return character.powers.find((p) => p.id === id);
  for (const e of character.equipment ?? []) {
    if (e.id === id) return e as unknown as PowerLike;
    const sub = e.subPowers?.find((p) => p.id === id);
    if (sub) return sub;
  }
  return undefined;
}

/** Choices that leave the adder to be described (Immunity to a "Single substance") */
const OPEN_ADDER_OPTIONS = new Set(['ONETHING']);

function adderOptionsView(draft: PowerDraft, a: Adder) {
  const options = adderChoices(draft).find((d) => d.xmlId === a.xmlId)?.options;
  if (!options?.length) return {};
  const option = options.find((o) => o.xmlId === a.optionId);
  return {
    options: [
      // None chosen yet (files written without one), or one the template doesn't have, which stays
      ...(!a.optionId ? [{ value: '', label: 'Choose…', selected: true }] : []),
      ...(a.optionId && !option ? [{ value: a.optionId, label: a.optionAlias ?? a.optionId, selected: true }] : []),
      ...options.map((o) => ({ value: o.xmlId, label: `${o.display} (${o.baseCost ?? 0})`, selected: o.xmlId === a.optionId })),
    ],
    optionText: option && OPEN_ADDER_OPTIONS.has(option.xmlId)
      ? { value: a.optionAlias && a.optionAlias !== option.display ? a.optionAlias : '', placeholder: 'Which substance' }
      : undefined,
  };
}

function senseView(draft: PowerDraft) {
  // Hero Designer also writes NOGROUP for a sense in no group: that's Unusual Senses
  const group = !draft.senseGroup || draft.senseGroup === 'NOGROUP' ? (defaultSenseGroup(draft.xmlId) ?? 'UNUSUALGROUP') : draft.senseGroup;
  const groups = senseGroupChoices(draft.xmlId).map((g) => ({ ...g, selected: g.value === group }));
  // A sense's own levels are its Enhanced Perception (Detect's PER bonus)
  const builtIn = [...builtInSenseModifiers(draft.xmlId, group)].filter((id) => id !== 'ENHANCEDPERCEPTION').map(senseModifierName).sort();
  return { groups: groups.length > 1 ? groups : undefined, builtIn: builtIn.join(', ') };
}

const CONTAINER_LABELS: Record<string, string> = { COMPOUNDPOWER: 'compound', LIST: 'list', MULTIPOWER: 'Multipower', VPP: 'power pool' };

/** Lists, frameworks and (in Powers) compound powers a power can be placed in */
export function powerContainers(character: Character, section: PowerSection, excludeId?: string) {
  if (section === 'equipment') {
    return (character.equipment ?? [])
      .filter((e) => (e.isContainer || isContainerType(e.xmlId)) && e.id !== excludeId)
      .map((e) => ({ id: e.id, name: e.name, kind: CONTAINER_LABELS[e.xmlId ?? 'LIST'] ?? 'list' }));
  }
  return character.powers
    .filter((p) => (p.type === 'LIST' || p.type === 'COMPOUNDPOWER' || p.isContainer) && p.id !== excludeId)
    .map((p) => ({ id: p.id, name: p.name, kind: CONTAINER_LABELS[p.type] ?? 'list' }));
}

/** The list or framework an item sits in (either section) */
function containerOf(character: Character, section: PowerSection, parentId: string | undefined): PowerLike | undefined {
  if (!parentId) return undefined;
  return section === 'powers'
    ? character.powers.find((p) => p.id === parentId)
    : ((character.equipment ?? []).find((e) => e.id === parentId) as unknown as PowerLike | undefined);
}

const typeOf = (item: PowerLike | undefined) => item?.xmlId ?? item?.type;

// =============================================================================
// Drafts
// =============================================================================

export function powerDraft(character: Character, section: PowerSection, itemId?: string, kind: PowerKind = 'power'): PowerDraft {
  const p = itemId ? findPower(character, section, itemId) : undefined;
  const xmlId = section === 'equipment' ? (p?.xmlId ?? p?.type) : p?.type;
  const detectedKind: PowerKind = !p
    ? kind
    : isFramework(xmlId)
      ? KIND_OF_FRAMEWORK[xmlId]
      : p.type === 'LIST' || xmlId === 'LIST'
        ? 'list'
        : xmlId === 'COMPOUNDPOWER'
          ? 'compound'
          : 'power';
  // A custom power (Hero Designer's CUSTOMPOWER) is priced by its own cost, not per level
  const known = xmlId && xmlId !== 'CUSTOMPOWER' && getPowerDefinition(xmlId) ? xmlId : undefined;
  return {
    kind: detectedKind,
    xmlId: p ? (known ?? 'CUSTOM') : 'ENERGYBLAST',
    name: p && p.name !== (known && getPowerDefinition(known)?.display) ? p.name : '',
    alias: p?.alias ?? '',
    input: p?.input ?? '',
    notes: p?.notes && p.notes !== p.alias ? p.notes : '',
    levels: p?.levels ?? 1,
    option: p?.option ?? '',
    optionAlias: p?.optionAlias ?? '',
    customCost: p && !known ? (p.baseCost ?? 0) - calculateAdderCost(p.adders ?? []) : 0,
    affectsPrimary: p?.affectsPrimary ?? true,
    affectsTotal: p?.affectsTotal ?? true,
    senseGroup: p?.senseGroup ?? '',
    barrier: {
      length: p?.lengthLevels ?? 1,
      height: p?.heightLevels ?? 1,
      width: p?.widthLevels ?? 0.5,
      body: p?.bodyLevels ?? 0,
      // Resistant Protection written without its defenses splits its levels between PD and ED
      pd: p?.pdLevels ?? (xmlId === 'FORCEFIELD' ? Math.ceil((p?.levels ?? 0) / 2) : 0),
      ed: p?.edLevels ?? (xmlId === 'FORCEFIELD' ? Math.floor((p?.levels ?? 0) / 2) : 0),
      md: p?.mdLevels ?? 0,
      powd: p?.powdLevels ?? 0,
    },
    recovery: p?.recoveryLevels ?? 0,
    recoveryModifiers: p?.recoveryModifiers ? [...p.recoveryModifiers] : [],
    adders: p?.adders ? [...p.adders] : [],
    modifiers: p?.modifiers ? [...p.modifiers] : [],
    parentId: p?.parentId ?? '',
    subPowers: detectedKind === 'compound' && p ? compoundParts(character, section, p) : [],
    reserve: p ? (xmlId === 'VPP' ? (p.levels ?? 0) : (p.baseCost ?? 0)) : kind === 'vpp' ? 30 : 60,
    slotFixed: p?.slotFixed ?? true,
    icon: p?.icon ?? '',
    free: p?.multiplier === 0,
    price: p?.price ?? 0,
    weight: p?.weight ?? 0,
    quantity: p?.quantity ?? 1,
    carried: p?.carried ?? true,
  };
}

/** A compound's parts: nested in equipment, PARENTID-linked powers in the Powers section */
function compoundParts(character: Character, section: PowerSection, compound: PowerLike): Power[] {
  if (section === 'equipment') return [...(compound.subPowers ?? [])];
  return character.powers.filter((c) => c.parentId === compound.id);
}

/** Replaces a compound's parts (e.g. with the powers a nested power form saved) */
export function setSubPowers(draft: PowerDraft, subPowers: Power[]): PowerDraft {
  return { ...draft, subPowers };
}

export function removeSubPower(draft: PowerDraft, id: string): PowerDraft {
  return { ...draft, subPowers: draft.subPowers.filter((p) => p.id !== id) };
}

/** A part with new ids throughout, so it's added as a new part wherever it goes */
function withNewIds(part: Power): Power {
  return {
    ...part,
    id: newId(),
    parentId: undefined,
    modifiers: part.modifiers?.map((m) => ({ ...m, id: newId() })),
    adders: part.adders?.map((a) => ({ ...a, id: newId() })),
  };
}

/**
 * Copied items as compound parts (for a compound's form): a power, or a compound's parts.
 * Throws for a list or framework, which a compound can't hold.
 */
export function partsFromTransfer(transfer: ItemTransfer): Power[] {
  const doc = HdcDocument.parse(blankHdc());
  const id = doc.nextId();
  const scratch = createElement('POWER', { XMLID: 'COMPOUNDPOWER', ALIAS: 'Compound Power', ID: id, POSITION: '0' });
  doc.ensureSection('EQUIPMENT').appendElement(scratch);
  const { xml } = insertParts(doc.toString(), transfer, id);
  return (parseHdcFile(xml).equipment?.[0]?.subPowers ?? []).map(withNewIds);
}

/** A compound's part as a copy to drop elsewhere (another compound, a character, the Items sidebar) */
export function transferFromPart(part: Power): ItemTransfer | undefined {
  const base = blankHdc();
  const copy = withNewIds(part);
  const { xml, report } = updateHdc(base, { ...parseHdcFile(base), powers: [copy] });
  return extractItems(xml, report.idMap[copy.id] ?? copy.id);
}

/**
 * A scratch character whose Powers section holds just the compound's parts, so the ordinary
 * power form can add and edit them; hand its powers back to `setSubPowers` on save.
 */
export function compoundPartsCharacter(character: Character, draft: PowerDraft): Character {
  return { ...character, powers: draft.subPowers.map((p) => ({ ...p, parentId: undefined })) };
}

/** Picks a different power: levels/option/adders reset to the new power's defaults */
export function selectPower(draft: PowerDraft, xmlId: string): PowerDraft {
  // Hero Designer's Custom Power is the form's own custom power
  if (xmlId === 'CUSTOMPOWER') xmlId = 'CUSTOM';
  const def = getPowerDefinition(xmlId);
  return {
    ...draft,
    xmlId,
    // A sense's levels are a PER bonus, none to start with (Detect)
    levels: def ? (isEnhancedSense(xmlId) ? (def.levelStart ?? 0) : Math.max(def.minVal ?? 1, def.levelStart ?? 1, 1)) : draft.levels,
    option: def?.options?.[0]?.xmlId ?? '',
    optionAlias: '',
    senseGroup: defaultSenseGroup(xmlId) ?? '',
    adders: [],
  };
}

/** Moves an enhanced sense to another group; sense modifiers the group has built in are dropped */
export function setSenseGroup(draft: PowerDraft, group: string): PowerDraft {
  const builtIn = builtInSenseModifiers(draft.xmlId, group);
  return { ...draft, senseGroup: group, adders: draft.adders.filter((a) => !builtIn.has(a.xmlId ?? '')) };
}

/** What a Detect detects (its OPTION_ALIAS, as Hero Designer prints it: "Detect Magic") */
export function setDetects(draft: PowerDraft, text: string): PowerDraft {
  return { ...draft, optionAlias: text.trim() };
}

/** Renames an adder (Detect's extra things: "Each Extra Thing" becomes "Gold") */
export function setAdderAlias(draft: PowerDraft, id: string, alias: string): PowerDraft {
  return { ...draft, adders: draft.adders.map((a) => (a.id === id ? { ...a, alias: alias.trim() || a.name } : a)) };
}

/**
 * What an adder is for, in its name as Hero Designer prints its Life Support adders ("Eating: ...").
 * Expanded Breathing has no choices, so the medium goes there: "Expanded Breathing: water"
 */
export function setAdderMedium(draft: PowerDraft, id: string, text: string): PowerDraft {
  return {
    ...draft,
    adders: draft.adders.map((a) => {
      if (a.id !== id) return a;
      const name = templateAdderName(draft, a.xmlId ?? '') ?? a.name;
      return { ...a, alias: text.trim() ? `${name}: ${text.trim()}` : name };
    }),
  };
}

/** The medium in an adder's name, or (from files that put it there) its OPTION_ALIAS */
function adderMedium(draft: PowerDraft, a: Adder): string {
  const name = templateAdderName(draft, a.xmlId ?? '') ?? a.name;
  const alias = a.alias ?? '';
  if (alias.startsWith(`${name}:`)) return alias.slice(name.length + 1).trim();
  return a.optionAlias ?? '';
}

/** An adder's name in the template (before it's renamed) */
const templateAdderName = (draft: PowerDraft, xmlId: string) => adderChoices(draft).find((a) => a.xmlId === xmlId)?.display;

/** The power's adders, plus a sense's sense modifiers (those its group doesn't have built in) */
function adderChoices(draft: PowerDraft, optionId = draft.option) {
  const own = powerAdders(getPowerDefinition(draft.xmlId), optionId || undefined);
  const chosen = draft.adders.map((a) => a.xmlId ?? '');
  return [...own, ...senseAdders(draft.xmlId, draft.senseGroup, chosen).filter((a) => !own.some((o) => o.xmlId === a.xmlId))];
}

// =============================================================================
// Adders
// =============================================================================

export function availableAdders(draft: PowerDraft) {
  const offered = adderChoices(draft);
  // Generated files name Sense "SENSE"; Hero Designer's template calls it MAKEASENSE
  const chosen = new Set(draft.adders.flatMap((a) => (a.xmlId === 'SENSE' ? ['SENSE', 'MAKEASENSE'] : [a.xmlId])));
  const excluded = new Set(
    draft.adders.flatMap((a) => offered.find((d) => d.xmlId === a.xmlId)?.excludes ?? []),
  );
  return offered.filter((a) => !chosen.has(a.xmlId) && !excluded.has(a.xmlId));
}

/** Chooses the power's option, dropping adders only the previous option offered */
export function setPowerOption(draft: PowerDraft, optionId: string): PowerDraft {
  const def = getPowerDefinition(draft.xmlId);
  const offered = new Set(powerAdders(def, optionId || undefined).map((a) => a.xmlId));
  const scoped = new Set((def?.options ?? []).flatMap((o) => o.adders ?? []).map((a) => a.xmlId));
  // What a Detect detects stays (its option is only how broad that is)
  const custom = draft.xmlId === 'DETECT' && !def?.options?.some((o) => o.display === draft.optionAlias);
  return { ...draft, option: optionId, optionAlias: custom ? draft.optionAlias : '', adders: draft.adders.filter((a) => !scoped.has(a.xmlId ?? '') || offered.has(a.xmlId ?? '')) };
}

export function addAdder(draft: PowerDraft, xmlId: string): PowerDraft {
  const def = adderChoices(draft).find((a) => a.xmlId === xmlId);
  if (!def) return draft;
  const excludes = new Set(def.excludes ?? []);
  // An adder with choices (Life Support's Eating: once a week, a year, never) starts on the first
  const option = def.options?.[0];
  const adder: Adder = {
    id: newId(),
    xmlId: def.xmlId,
    name: def.display,
    alias: def.display,
    baseCost: option?.baseCost ?? def.baseCost,
    optionId: option?.xmlId,
    optionAlias: option?.display,
    levels: def.lvlCost ? Math.max(def.minVal ?? 1, 1) : undefined,
    lvlCost: def.lvlCost,
    lvlVal: def.lvlVal,
    includeInBase: def.includeInBase,
    selected: true,
  };
  return { ...draft, adders: [...draft.adders.filter((a) => !excludes.has(a.xmlId ?? '')), adder] };
}

/**
 * Picks an adder's choice, which sets its price (Life Support's Longevity: 200 years is 1 point,
 * Immortal 5), as Hero Designer stores it: OPTIONID, OPTION_ALIAS and the option's BASECOST
 */
export function setAdderOption(draft: PowerDraft, id: string, optionId: string): PowerDraft {
  return {
    ...draft,
    adders: draft.adders.map((a) => {
      if (a.id !== id) return a;
      const option = adderChoices(draft).find((d) => d.xmlId === a.xmlId)?.options?.find((o) => o.xmlId === optionId);
      return option ? { ...a, optionId: option.xmlId, optionAlias: option.display, baseCost: option.baseCost ?? a.baseCost } : a;
    }),
  };
}

/** What an adder's choice names, where the choice is "something" (Immunity to a single substance) */
export function setAdderOptionAlias(draft: PowerDraft, id: string, text: string): PowerDraft {
  const named = (a: Adder) => adderChoices(draft).find((d) => d.xmlId === a.xmlId)?.options?.find((o) => o.xmlId === a.optionId)?.display;
  return { ...draft, adders: draft.adders.map((a) => (a.id === id ? { ...a, optionAlias: text.trim() || named(a) || a.optionAlias } : a)) };
}

export function removeAdder(draft: PowerDraft, id: string): PowerDraft {
  return { ...draft, adders: draft.adders.filter((a) => a.id !== id) };
}

export function setAdderLevels(draft: PowerDraft, id: string, levels: number): PowerDraft {
  return { ...draft, adders: draft.adders.map((a) => (a.id === id ? { ...a, levels: Math.max(0, levels) } : a)) };
}

// =============================================================================
// Modifiers
// =============================================================================

export { aoeValue } from '../modifierDefinitions.js';

/** A modifier adder's cost: its own (or its option's) plus its levels */
const adderValue = (a: Adder) => (a.baseCost ?? 0) + (a.levels ?? 0) * (a.lvlCost ?? 0);

/** A modifier's value, the way the HDC parser computes it (so saving round-trips) */
function modifierValue(def: ModifierDefinition | undefined, m: Modifier): number {
  const adders = (m.adders ?? []).reduce((sum, a) => sum + adderValue(a), 0);
  // Its own modifiers apply before its MINCOST/MAXCOST, as in Hero Designer
  const total = (value: number) => clampModifierValue(def, withSubModifiers(m, value));
  if (m.xmlId === 'AOE') return total(aoeValue(m.optionId ?? 'RADIUS', m.levels ?? 4) + adders);
  if (def?.hasLevels && (m.levels ?? 0) > 0) return total((def.baseCost ?? 0) + (m.levels ?? 0) * (def.lvlCost ?? 0) + adders);
  const option = def?.options?.find((o) => o.xmlId === m.optionId);
  if (option) return total(option.baseCost + adders);
  if (m.xmlId === 'LINKED' && def) return total((m.linkedToLesser ? LINKED_TO_LESSER : def.baseCost) + adders);
  if (def && !def.hasOptions && !def.hasLevels) return total(def.baseCost + adders);
  return m.value;
}

/** All the character's powers and equipment, including the parts of compound equipment */
function characterItems(character: Character): Power[] {
  // Compound equipment keeps its parts in subPowers; compound powers list theirs alongside
  const flat = (items: (Power | Equipment)[]): Power[] =>
    items.flatMap((p) => [p as Power, ...flat(('subPowers' in p ? p.subPowers : undefined) ?? [])]);
  return flat([...character.powers, ...((character.equipment ?? []) as Power[])]);
}

/** Linked's value when the power it's linked to has fewer Active Points (Main6E.hdt LESSERVALUE) */
const LINKED_TO_LESSER = -0.25;

/** Powers and equipment a Linked modifier can name: anything but containers and the power itself */
function linkTargets(character: Character, itemId?: string): Power[] {
  const containers = ['LIST', 'MULTIPOWER', 'VPP', 'ELEMENTAL_CONTROL', 'COMPOUNDPOWER'];
  return characterItems(character).filter(
    (p) => p.id !== itemId && !containers.includes(p.type ?? '') && !p.isContainer,
  );
}

/**
 * Prices each Linked modifier by the power it's linked to (Linked.getBaseCost): -1/2 when that
 * power has at least as many Active Points as this one, -1/4 when it has fewer
 */
export function relinkModifiers(character: Character, draft: PowerDraft): PowerDraft {
  if (!draft.modifiers.some((m) => m.xmlId === 'LINKED' && m.linkedId)) return draft;
  const active = powerCosts(draft).active;
  return withModifiers(
    draft,
    draft.modifiers.map((m) => {
      if (m.xmlId !== 'LINKED' || !m.linkedId) return m;
      const target = linkTargets(character).find((p) => p.id === m.linkedId);
      if (!target) return m;
      const lesser = (target.activeCost ?? 0) < active || undefined;
      return lesser === m.linkedToLesser ? m : refreshModifier({ ...m, linkedToLesser: lesser }, draft.xmlId, others(draft, m.id));
    }),
  );
}

/** Links a Linked modifier to another power (or to none) */
export function setModifierLink(draft: PowerDraft, id: string, linkedId: string, character: Character): PowerDraft {
  const linked = updateModifier(draft, id, (m) => ({ ...m, linkedId: linkedId || undefined, linkedToLesser: undefined }));
  return relinkModifiers(character, linked);
}

function modifierName(def: ModifierDefinition | undefined, m: Modifier): string {
  if (isNnd(m)) return NND.display;
  const base = def?.display ?? m.alias ?? m.name;
  const subs = subModifierSuffix(m.xmlId, m.modifiers);
  if (m.xmlId === 'AOE') return `${base} (${m.levels ?? 4}m ${m.optionAlias ?? m.optionId ?? 'Radius'})${subs}`;
  return (m.optionAlias ? `${base} (${m.optionAlias})` : base) + subs;
}

/**
 * Recomputes a modifier's value and name (by the definition of the power it's on, if given).
 * Some depend on the power's other modifiers too (valueOnPower): Autofire, Charges, ...
 */
function refreshModifier(m: Modifier, powerXmlId?: string, others: Modifier[] = []): Modifier {
  const def = m.xmlId ? modifierFor(m.xmlId, powerXmlId, others) : undefined;
  const priced = def && m.xmlId === 'CHARGES' ? { ...m, adders: priceChargesAdders(def, m.optionId, m.adders ?? []) } : m;
  const base = { ...priced, value: modifierValue(def, priced) };
  const value = def ? valueOnPower(base, { xmlId: powerXmlId, modifiers: [...others, base] }) : base.value;
  return { ...base, value, name: modifierName(def, base), isAdvantage: value > 0, isLimitation: value < 0 };
}

/** Sets a draft's modifiers, repricing those that depend on the others (Autofire, Charges, ...) */
function withModifiers(draft: PowerDraft, modifiers: Modifier[]): PowerDraft {
  const repriced = modifiers.map((m) =>
    POWER_DEPENDENT_MODIFIERS.has(m.xmlId ?? '') ? refreshModifier(m, draft.xmlId, modifiers.filter((o) => o !== m)) : m,
  );
  return { ...draft, modifiers: repriced };
}

/** Changes one of a draft's modifiers */
function updateModifier(draft: PowerDraft, id: string, change: (m: Modifier, def: ModifierDefinition | undefined) => Modifier): PowerDraft {
  return withModifiers(
    draft,
    draft.modifiers.map((m) => (m.id === id ? change(m, m.xmlId ? modifierFor(m.xmlId, draft.xmlId, others(draft, id)) : undefined) : m)),
  );
}

export function addModifier(draft: PowerDraft, xmlId: string): PowerDraft {
  // No Normal Defense: AVAD from Very Common to Rare, All Or Nothing
  if (xmlId === NND.choice) {
    const added = addModifier(draft, 'AVAD');
    const avad = added.modifiers[added.modifiers.length - 1];
    if (!avad || avad.xmlId !== 'AVAD') return draft;
    return setModifierAdder(setModifierOption(added, avad.id, NND.option), avad.id, NND.adder, true);
  }
  const def = modifierFor(xmlId, draft.xmlId, draft.modifiers);
  if (!def) return draft;
  const option = xmlId === 'AOE' ? def.options?.find((o) => o.xmlId === 'RADIUS') ?? def.options?.[0] : !def.hasLevels ? def.options?.[0] : undefined;
  const modifier = withRequiredAdders({
    id: newId(),
    xmlId,
    name: def.display,
    alias: def.display,
    value: def.baseCost,
    isAdvantage: def.isAdvantage,
    isLimitation: def.isLimitation,
    levels: xmlId === 'AOE' ? 4 : def.hasLevels ? 1 : undefined,
    optionId: option?.xmlId,
    optionAlias: option?.display,
    // On a naked advantage, a Limitation limits the naked advantage itself
    private: draft.xmlId === 'NAKEDMODIFIER' && def.isLimitation ? true : undefined,
  }, def);
  return withModifiers(draft, [...draft.modifiers, refreshModifier(modifier, draft.xmlId, draft.modifiers)]);
}

/**
 * On a naked advantage: whether a modifier applies to the naked advantage itself (Reduced
 * Endurance on the naked Autofire, its Focus) rather than being what it adds to the other power
 */
export function setModifierPrivate(draft: PowerDraft, id: string, on: boolean): PowerDraft {
  return updateModifier(draft, id, (m) => refreshModifier({ ...m, private: on || undefined }, draft.xmlId, others(draft, id)));
}

/** A modifier with free-text name and value (the Hero Designer "custom modifier") */
export function addCustomModifier(draft: PowerDraft, name: string, value: number): PowerDraft {
  const modifier: Modifier = {
    id: newId(), xmlId: 'CUSTOM', name, alias: name, value,
    isAdvantage: value > 0, isLimitation: value < 0,
  };
  return { ...draft, modifiers: [...draft.modifiers, modifier] };
}

export function removeModifier(draft: PowerDraft, id: string): PowerDraft {
  return withModifiers(draft, draft.modifiers.filter((m) => m.id !== id));
}

export function setModifierOption(draft: PowerDraft, id: string, optionId: string): PowerDraft {
  return updateModifier(draft, id, (m, def) => {
    const option = def?.options?.find((o) => o.xmlId === optionId);
    // An option's own adders go with it (Accurate is for a Radius, not a Cone)
    const offered = new Set(modifierAdders(def, optionId).map((a) => a.xmlId));
    const scoped = new Set((def?.options ?? []).flatMap((o) => o.adders ?? []).map((a) => a.xmlId));
    const adders = (m.adders ?? []).filter((a) => !scoped.has(a.xmlId ?? '') || offered.has(a.xmlId ?? ''));
    const changed = { ...m, optionId, optionAlias: option?.display ?? optionId, adders };
    return refreshModifier(def ? withRequiredAdders(changed, def) : changed, draft.xmlId, others(draft, id));
  });
}

export function setModifierLevels(draft: PowerDraft, id: string, levels: number): PowerDraft {
  return updateModifier(draft, id, (m) => refreshModifier({ ...m, levels: Math.max(1, levels) }, draft.xmlId, others(draft, id)));
}

const others = (draft: PowerDraft, id: string) => draft.modifiers.filter((m) => m.id !== id);

// -----------------------------------------------------------------------------
// A modifier's own adders
// -----------------------------------------------------------------------------

/** Whether a modifier adder is bought in levels (Mobile's speed, Autofire's x2 shots, Charges' Clips) */
const isLeveled = (def: ModifierAdder) => def.lvlCost !== undefined || def.lvlVal !== undefined;

/** "x[LVL] Shots" at a level: x2 per level where the level multiplies (and for Clips) */
function adderDisplay(def: ModifierAdder, levels: number): string {
  if (!def.levelDisplay) return def.display;
  const shown = def.lvlPower ? def.lvlPower ** levels : def.xmlId === 'CLIPS' ? 2 ** levels : levels;
  return def.levelDisplay.replace('[LVL]', String(shown));
}

/** A new adder on a modifier, at its first option and lowest level */
function newModifierAdder(def: ModifierAdder): Adder {
  const option = def.options?.[0];
  const levels = isLeveled(def) ? Math.max(def.minVal ?? 1, def.levelStart ?? 1, 1) : undefined;
  // Hero Designer's alias is the display without its abbreviation ("All Or Nothing", not "... (NND)")
  const display = adderDisplay(def, levels ?? 0);
  const alias = def.abbreviation ? display.replace(` (${def.abbreviation})`, '') : display;
  return {
    id: newId(),
    xmlId: def.xmlId,
    name: alias,
    alias,
    baseCost: option?.baseCost ?? def.baseCost,
    levels,
    lvlCost: levels !== undefined ? (def.lvlCost ?? 0) : undefined,
    lvlVal: levels !== undefined && def.lvlVal !== undefined && def.lvlVal !== 1 ? def.lvlVal : undefined,
    optionId: option?.xmlId,
    optionAlias: option?.display,
    includeInBase: false,
    selected: true,
  };
}

/** Adds the adders the modifier must have (Damage Over Time's increments, a Trigger's reset) */
function withRequiredAdders(m: Modifier, def: ModifierDefinition): Modifier {
  const missing = modifierAdders(def, m.optionId).filter((a) => a.required && !(m.adders ?? []).some((x) => x.xmlId === a.xmlId));
  return missing.length ? { ...m, adders: [...(m.adders ?? []), ...missing.map(newModifierAdder)] } : m;
}

/**
 * Turns one of a modifier's adders on (replacing any it excludes, and adding any it requires)
 * or off (with any that require it). Required adders stay on.
 */
function toggleModifierAdder(m: Modifier, def: ModifierDefinition | undefined, adderXmlId: string, on: boolean, make?: (d: ModifierAdder) => Adder): Modifier {
  const offered = modifierAdders(def, m.optionId);
  const adderDef = offered.find((a) => a.xmlId === adderXmlId);
  if (!adderDef) return m;
  let adders = (m.adders ?? []).filter((a) => a.xmlId !== adderXmlId);
  if (!on) {
    if (adderDef.required) return m;
    const dependents = new Set(offered.filter((a) => a.requires?.includes(adderXmlId)).map((a) => a.xmlId));
    return { ...m, adders: adders.filter((a) => !dependents.has(a.xmlId ?? '')) };
  }
  const excluded = new Set([...(adderDef.excludes ?? []), ...offered.filter((a) => a.excludes?.includes(adderXmlId)).map((a) => a.xmlId)]);
  adders = adders.filter((a) => !excluded.has(a.xmlId ?? ''));
  const needed = (adderDef.requires ?? [])
    .map((x) => offered.find((a) => a.xmlId === x))
    .filter((a): a is ModifierAdder => !!a && !adders.some((x) => x.xmlId === a.xmlId));
  return { ...m, adders: [...adders, (make ?? newModifierAdder)(adderDef), ...needed.map(newModifierAdder)] };
}

/** Turns one of a modifier's own adders on or off (e.g. AVAD's All Or Nothing, which makes it NND) */
export function setModifierAdder(draft: PowerDraft, id: string, adderXmlId: string, on: boolean): PowerDraft {
  return updateModifier(draft, id, (m, def) => refreshModifier(toggleModifierAdder(m, def, adderXmlId, on), draft.xmlId, others(draft, id)));
}

/** Chooses a modifier adder's option (Continuing Charges' duration); none turns it off */
export function setModifierAdderOption(draft: PowerDraft, id: string, adderXmlId: string, optionId: string): PowerDraft {
  return updateModifier(draft, id, (m, def) => {
    const adderDef = modifierAdders(def, m.optionId).find((a) => a.xmlId === adderXmlId);
    const option = adderDef?.options?.find((o) => o.xmlId === optionId);
    const existing = (m.adders ?? []).find((a) => a.xmlId === adderXmlId);
    const changed = !option
      ? toggleModifierAdder(m, def, adderXmlId, false)
      : existing
        ? { ...m, adders: (m.adders ?? []).map((a) => (a === existing ? { ...a, optionId: option.xmlId, optionAlias: option.display, baseCost: option.baseCost } : a)) }
        : toggleModifierAdder(m, def, adderXmlId, true, (d) => ({ ...newModifierAdder(d), optionId: option.xmlId, optionAlias: option.display, baseCost: option.baseCost }));
    return refreshModifier(changed, draft.xmlId, others(draft, id));
  });
}

/** Sets a leveled modifier adder's levels (Autofire's x2 shots, Charges' Clips); 0 turns it off */
export function setModifierAdderLevels(draft: PowerDraft, id: string, adderXmlId: string, levels: number): PowerDraft {
  return updateModifier(draft, id, (m, def) => {
    const adderDef = modifierAdders(def, m.optionId).find((a) => a.xmlId === adderXmlId);
    if (!adderDef) return m;
    const n = Math.max(0, Math.floor(Number.isFinite(levels) ? levels : 0));
    const existing = (m.adders ?? []).find((a) => a.xmlId === adderXmlId);
    const at = (a: Adder): Adder => {
      const display = adderDisplay(adderDef, n);
      return { ...a, levels: n, name: display, alias: display };
    };
    const changed = n === 0
      ? toggleModifierAdder(m, def, adderXmlId, false)
      : existing
        ? { ...m, adders: (m.adders ?? []).map((a) => (a === existing ? at(a) : a)) }
        : toggleModifierAdder(m, def, adderXmlId, true, (d) => at(newModifierAdder(d)));
    return refreshModifier(changed, draft.xmlId, others(draft, id));
  });
}

/**
 * Turns one of a modifier's own modifiers on or off (Gestures "throughout", Extra Time "Only to
 * Activate"), which multiplies or divides the modifier's value
 */
export function setModifierSubModifier(draft: PowerDraft, id: string, xmlId: string, on: boolean): PowerDraft {
  return updateModifier(draft, id, (m) => {
    const kept = (m.modifiers ?? []).filter((s) => s.xmlId !== xmlId);
    const def = subModifierFor(m.xmlId, xmlId);
    if (on && !def) return m;
    const sub: Modifier | undefined = on && def
      ? { id: newId(), xmlId, name: def.display, alias: def.display, value: clampModifierValue(def, def.baseCost), isAdvantage: def.baseCost > 0, isLimitation: def.baseCost < 0 }
      : undefined;
    const modifiers = sub ? [...kept, sub] : kept;
    return refreshModifier({ ...m, modifiers: modifiers.length ? modifiers : undefined }, draft.xmlId, others(draft, id));
  });
}

/** The modifier's own modifiers for the form, those this power can take (and any it already has) */
function subModifierChoices(m: Modifier, def: ModifierDefinition | undefined, draft: PowerDraft) {
  const power = { xmlId: draft.xmlId, duration: getPowerDefinition(draft.xmlId)?.duration, modifiers: draft.modifiers };
  return (def?.subModifiers ?? [])
    .filter((s) => subModifierOffered(s.xmlId, power) || (m.modifiers ?? []).some((x) => x.xmlId === s.xmlId))
    .map((s) => ({
      value: s.xmlId,
      label: s.display,
      cost: subModifierEffect(s),
      checked: (m.modifiers ?? []).some((x) => x.xmlId === s.xmlId),
    }));
}

/** What a modifier's own modifier does to it: x2 for +1, x1/2 for -1 */
function subModifierEffect(s: ModifierDefinition): string {
  const factor = s.baseCost >= 0 ? 1 + s.baseCost : 1 / (1 - s.baseCost);
  return factor === 0.5 ? 'x½' : `x${factor}`;
}

const CHARGES_TABLE_ADDERS = new Set(['CONTINUING', 'BOOSTABLE', 'RECOVERABLE', 'CLIPS']);

/** The modifier's adders for the form: on/off, a choice of option, or a number of levels */
function modifierAdderChoices(m: Modifier, def: ModifierDefinition | undefined) {
  return modifierAdders(def, m.optionId).map((a) => {
    const chosen = (m.adders ?? []).find((x) => x.xmlId === a.xmlId);
    const levels = chosen?.levels ?? 0;
    return {
      value: a.xmlId,
      label: isLeveled(a) ? adderDisplay(a, Math.max(levels, 1)).replace(/^x\d+ /, '') : a.display,
      // Charges' table adders are only priced once taken (by the rows they move the power)
      cost: chosen
        ? fraction(adderValue(chosen))
        : m.xmlId === 'CHARGES' && CHARGES_TABLE_ADDERS.has(a.xmlId)
          ? ''
          : fraction((a.options?.[0]?.baseCost ?? a.baseCost) + (isLeveled(a) ? Math.max(a.minVal ?? 1, 1) * (a.lvlCost ?? 0) : 0)),
      checked: !!chosen,
      required: !!a.required,
      kind: a.options?.length ? 'select' : isLeveled(a) ? 'levels' : 'check',
      options: a.options?.map((o) => ({ value: o.xmlId, label: o.label ?? o.display, selected: chosen?.optionId === o.xmlId })),
      levels,
      levelsLabel: a.levelDisplay ? adderDisplay(a, levels).replace(/ .*/, '') : '',
    };
  });
}

// =============================================================================
// Spell (Fantasy Hero)
// =============================================================================

/**
 * A custom modifier standing in for Fantasy Hero's Spell limitation (Hero Designer's 6E template
 * lacks it, so builders type it in). Converting keeps the cost; hero6e then knows it's a Spell.
 */
export function isCustomSpell(m: Modifier): boolean {
  if (m.xmlId && getModifierByXmlId(m.xmlId)) return false;
  return /^spell$/i.test((m.alias || m.name || '').trim()) && m.value === -0.5;
}

const asSpell = (m: Modifier): Modifier =>
  isCustomSpell(m) ? { ...m, xmlId: 'SPELL', name: 'Spell', alias: 'Spell', value: -0.5, isAdvantage: false, isLimitation: true } : m;

export function convertSpellModifier(draft: PowerDraft, id: string): PowerDraft {
  return { ...draft, modifiers: draft.modifiers.map((m) => (m.id === id ? asSpell(m) : m)) };
}

type WithModifiers = { id: string; modifiers?: Modifier[]; subPowers?: WithModifiers[] };

function convertSpellsIn<T extends WithModifiers>(items: T[], skipId?: string): { items: T[]; count: number } {
  let count = 0;
  const out = items.map((item) => {
    if (item.id === skipId) return item;
    const found = (item.modifiers ?? []).filter(isCustomSpell).length;
    const subs = item.subPowers ? convertSpellsIn(item.subPowers) : undefined;
    count += found + (subs?.count ?? 0);
    if (!found && !subs?.count) return item;
    return { ...item, modifiers: item.modifiers?.map(asSpell), ...(subs ? { subPowers: subs.items } : {}) };
  });
  return { items: out, count };
}

/**
 * Converts every custom "Spell" modifier in the character's powers and equipment to the Spell
 * limitation, optionally leaving one item alone (the one open in a dialog)
 */
export function convertCustomSpells(character: Character, skipId?: string): { character: Character; count: number } {
  const powers = convertSpellsIn(character.powers, skipId);
  const equipment = convertSpellsIn(character.equipment ?? [], skipId);
  const count = powers.count + equipment.count;
  if (!count) return { character, count };
  return { character: { ...character, powers: powers.items, ...(character.equipment ? { equipment: equipment.items } : {}) }, count };
}

/** A modifier's free-text detail (Hero Designer's INPUT), e.g. the defense an AVAD attack works against */
export function setModifierInput(draft: PowerDraft, id: string, input: string): PowerDraft {
  return { ...draft, modifiers: draft.modifiers.map((m) => (m.id === id ? { ...m, input: input.trim() || undefined } : m)) };
}

/**
 * A modifier's comments (COMMENTS): why or when it applies ("Only in jungle or forest"). Hero
 * Designer and hero6e show them with the modifier. Requires A Roll keeps its roll binding there
 */
export function setModifierComments(draft: PowerDraft, id: string, comments: string): PowerDraft {
  return { ...draft, modifiers: draft.modifiers.map((m) => (m.id === id ? { ...m, comments: comments.trim() || undefined } : m)) };
}

export function setModifierValue(draft: PowerDraft, id: string, value: number): PowerDraft {
  return {
    ...draft,
    modifiers: draft.modifiers.map((m) => (m.id === id ? { ...m, value, isAdvantage: value > 0, isLimitation: value < 0 } : m)),
  };
}

// =============================================================================
// Costs
// =============================================================================

/** Barrier: 3 CP for 1m x 1m x 0.5m; +1 per extra meter (or half meter of thickness) and BODY; 3 per 2 DEF */
export function barrierBaseCost(b: PowerDraft['barrier']): number {
  const dimensions = Math.max(0, b.length - 1) + Math.max(0, b.height - 1) + Math.max(0, (b.width - 0.5) * 2);
  // 3 per 2 points of defense, a part pair costing a whole one (ForceWall.getTotalCost)
  const defense = steppedCost(0, b.pd + b.ed + b.md + b.powd, 2, 3);
  return 3 + dimensions + b.body + defense;
}

/** Resistant Protection's levels are its defenses' (ForceField.getLevels) */
export function powerLevels(draft: PowerDraft): number {
  if (draft.xmlId !== 'FORCEFIELD') return draft.levels;
  const b = draft.barrier;
  return b.pd + b.ed + b.md + b.powd;
}

export interface PowerCosts {
  base: number;
  active: number;
  real: number;
  end: number;
}

export function powerCosts(draft: PowerDraft, inherited: Modifier[] = []): PowerCosts {
  if (draft.kind === 'compound') {
    const sum = (key: 'baseCost' | 'activeCost' | 'realCost' | 'endCost') =>
      draft.subPowers.reduce((n, p) => n + (p[key] ?? 0), 0);
    return { base: sum('activeCost'), active: sum('activeCost'), real: sum('realCost'), end: sum('endCost') };
  }
  const framework = FRAMEWORK_OF_KIND[draft.kind];
  if (framework) {
    const own = frameworkOwnCost({
      type: framework,
      baseCost: framework === 'MULTIPOWER' ? draft.reserve : 0,
      levels: framework === 'VPP' ? draft.reserve : 0,
      adders: draft.adders,
      modifiers: draft.modifiers,
    });
    return { base: own.base, active: own.active, real: own.real, end: 0 };
  }
  if (draft.kind !== 'power') return { base: 0, active: 0, real: 0, end: 0 };
  // A naked advantage costs what it adds to the Active Points it's for
  if (draft.xmlId === 'NAKEDMODIFIER') return nakedAdvantageCosts(draft.levels, draft.modifiers, inherited);
  const def = getPowerDefinition(draft.xmlId);
  const adders = calculateAdderCost(draft.adders);
  // Resistant Protection's Flash Defense is priced with its other defenses
  const flash = flashDefenseLevels(def?.xmlId, draft.adders);
  const ownAdders = flash ? calculateAdderCost(draft.adders.filter((a) => a.xmlId !== 'FLASHDEFENSE')) : adders;
  const base = !def
    ? draft.customCost + adders
    : def.xmlId === 'FORCEWALL'
      ? barrierBaseCost(draft.barrier) + adders
      : calculatePowerBaseCost(def, powerLevels(draft) + flash, draft.option || undefined) + ownAdders;
  const all = [...draft.modifiers, ...inherited];
  const advantages = all.filter((m) => m.value > 0).reduce((s, m) => s + m.value, 0);
  const limitations = all.filter((m) => m.value < 0).reduce((s, m) => s + Math.abs(m.value), 0);
  const active = heroRoundCost(base * (1 + advantages));
  const real = limitations > 0 ? heroRoundCost(active / (1 + limitations)) : active;
  const end = powerEndCost(base, def?.usesEnd !== false, all);
  // An Endurance Reserve's Recovery is a power of its own inside it, priced with its own modifiers
  if (def?.xmlId === 'ENDURANCERESERVE') {
    const rec = recoveryCosts(draft);
    return { base, active: active + rec.active, real: real + rec.real, end };
  }
  return { base, active, real, end };
}

/** What an Endurance Reserve's Recovery costs (2 points per 3 REC, with its own modifiers) */
export function recoveryCosts(draft: Pick<PowerDraft, 'recovery' | 'recoveryModifiers'>): { active: number; real: number } {
  const def = getPowerDefinition('ENDURANCERESERVEREC');
  if (!def || !draft.recovery) return { active: 0, real: 0 };
  const base = calculatePowerBaseCost(def, draft.recovery);
  const advantages = draft.recoveryModifiers.filter((m) => m.value > 0).reduce((s, m) => s + m.value, 0);
  const limitations = draft.recoveryModifiers.filter((m) => m.value < 0).reduce((s, m) => s + Math.abs(m.value), 0);
  const active = heroRoundCost(base * (1 + advantages));
  return { active, real: limitations > 0 ? heroRoundCost(active / (1 + limitations)) : active };
}

// =============================================================================
// Form view
// =============================================================================

const CATEGORY_RULES: [string, (p: PowerDefinition) => boolean][] = [
  ['Attack', (p) => p.types.includes('ATTACK')],
  ['Defense', (p) => p.types.includes('DEFENSE')],
  ['Movement', (p) => p.types.includes('MOVEMENT')],
  ['Mental', (p) => p.types.includes('MENTAL')],
  ['Adjustment', (p) => p.types.includes('ADJUSTMENT')],
  ['Body-Affecting', (p) => p.types.includes('BODYAFFECTING') || p.types.includes('SIZE')],
  ['Sensory', (p) => p.types.includes('SENSORY') || p.types.includes('SENSEAFFECTING')],
  ['Special', (p) => p.types.includes('SPECIAL')],
  ['Standard', (p) => p.types.includes('STANDARD')],
];

const CHARACTERISTIC_POWERS = ['STR', 'DEX', 'CON', 'INT', 'EGO', 'PRE', 'OCV', 'DCV', 'OMCV', 'DMCV', 'SPD', 'PD', 'ED', 'REC', 'END', 'BODY', 'STUN', 'RUNNING', 'SWIMMING', 'LEAPING'];

/** Power choices grouped for a <select>; each power appears once, in its first category */
export function powerChoices(selected: string) {
  const placed = new Set<string>();
  // Custom Power is offered on its own ("Custom power"), not as a catalog power
  const all = Object.values(ALL_POWERS).filter(
    (p) => p.xmlId !== 'CUSTOMPOWER' && (p.types.length > 0 || CHARACTERISTIC_POWERS.includes(p.xmlId)),
  );
  const groups: { label: string; options: { value: string; label: string; selected: boolean }[] }[] = [];
  const take = (label: string, pred: (p: PowerDefinition) => boolean) => {
    const options = all
      .filter((p) => !placed.has(p.xmlId) && pred(p))
      .sort((a, b) => a.display.localeCompare(b.display))
      .map((p) => {
        placed.add(p.xmlId);
        return { value: p.xmlId, label: p.display, selected: p.xmlId === selected };
      });
    if (options.length) groups.push({ label, options });
  };
  take('Characteristics', (p) => CHARACTERISTIC_POWERS.includes(p.xmlId));
  for (const [label, pred] of CATEGORY_RULES) take(label, pred);
  take('Other', () => true);
  return groups;
}

/** Older or everyday names people search for, by power */
const POWER_SEARCH_NAMES: Record<string, string> = {
  FORCEFIELD: 'armor force field',
  ENERGYBLAST: 'energy blast',
  EGOATTACK: 'ego attack',
  FORCEWALL: 'force wall',
  MISSILEDEFLECTION: 'missile deflection',
};

/** Power choices for a type-ahead: grouped by category, then a custom power */
export function powerTypeChoices(): TypeChoiceGroup[] {
  const keywords = (xmlId: string) =>
    [getPowerDefinition(xmlId)?.abbreviation, POWER_SEARCH_NAMES[xmlId]].filter(Boolean).join(' ') || undefined;
  return [
    ...powerChoices('').map((g) => ({
      label: g.label,
      options: g.options.map(({ value, label }) => ({ value, label, keywords: keywords(value) })),
    })),
    { label: 'Custom', options: [{ value: 'CUSTOM', label: 'Custom power' }] },
  ];
}

export function modifierChoices(powerXmlId?: string, powerModifiers: Modifier[] = []) {
  // The power's own definitions first, so they win over general ones with the same XMLID
  const all = [...powerSpecificModifiers(powerXmlId), ...Object.values(getAllModifiers())]
    .filter((m, i, list) => list.findIndex((o) => o.xmlId === m.xmlId) === i)
    // Time Limit is a Limitation on a Persistent power, an Advantage otherwise
    .map((m) => (m.xmlId === 'TIMELIMIT' ? (modifierFor(m.xmlId, powerXmlId, powerModifiers) ?? m) : m))
    .sort((a, b) => a.display.localeCompare(b.display));
  return {
    advantages: [
      ...all.filter((m) => m.isAdvantage).map((m) => ({ value: m.xmlId, label: m.display })),
      { value: NND.choice, label: NND.display },
    ].sort((a, b) => a.label.localeCompare(b.label)),
    limitations: all.filter((m) => m.isLimitation).map((m) => ({ value: m.xmlId, label: m.display })),
  };
}

export function powerFormView(character: Character, section: PowerSection, draft: PowerDraft, itemId?: string) {
  const def = getPowerDefinition(draft.xmlId);
  const facts = powerFacts(character, draft, itemId);
  const parent = containerOf(character, section, draft.parentId);
  const parentType = typeOf(parent);
  // A list's modifiers apply to everything in it; a Multipower's limitations to its slots
  const inherited = parent?.type === 'LIST' ? (parent.modifiers ?? []) : inheritedSlotLimitations(parentType, parent?.modifiers, draft.modifiers);
  const costs = powerCosts(draft, inherited);
  const framework = FRAMEWORK_OF_KIND[draft.kind];
  return {
    kind: draft.kind,
    framework: framework && {
      name: FRAMEWORK_NAMES[framework],
      reserveLabel: framework === 'VPP' ? 'Pool (points)' : 'Reserve (points)',
      hint:
        framework === 'VPP'
          ? 'Control cost is half the pool. Powers in the pool cost no points of their own.'
          : 'Each slot costs 1/10 of its Real Cost if fixed, 1/5 if variable (at least 1).',
    },
    // A Multipower's or pool's slot: what it costs as a slot
    slot:
      (draft.kind === 'power' || draft.kind === 'compound') && isFramework(parentType)
        ? {
            framework: FRAMEWORK_NAMES[parentType],
            isMultipower: parentType === 'MULTIPOWER',
            cost: slotCost(parentType, costs.real, draft.slotFixed),
          }
        : undefined,
    isPower: draft.kind === 'power',
    isCustom: draft.kind === 'power' && !def,
    isBarrier: def?.xmlId === 'FORCEWALL',
    // An enhanced sense: its group, and the sense modifiers it has built in
    sense: def && isEnhancedSense(def.xmlId) ? senseView(draft) : undefined,
    // What a Detect detects; the option is how broad that is
    detects: def?.xmlId === 'DETECT'
      ? { value: def.options?.some((o) => o.display === draft.optionAlias) ? '' : draft.optionAlias, placeholder: 'Magic, gold, minds…' }
      : undefined,
    isDefenses: def?.xmlId === 'FORCEFIELD',
    // An Endurance Reserve's Recovery: how much END it regains, and what that costs
    recovery: def?.xmlId === 'ENDURANCERESERVE'
      ? { value: draft.recovery, cost: recoveryCosts(draft).real, modifiers: draft.recoveryModifiers.length ? modifierSummary(draft.recoveryModifiers) : '' }
      : undefined,
    isEquipment: section === 'equipment',
    draft,
    definition: def && {
      display: def.display,
      description: def.description,
      inputLabel: def.inputLabel,
      // Hero Designer's drop-down for the input ("Vs.": PD, ED), with typed values when it allows others
      inputExamples: def.inputExamples?.length ? def.inputExamples : undefined,
      otherInput: def.otherInput !== false,
      levelLabel: def.xmlId === 'NAKEDMODIFIER'
        ? 'The naked advantage costs its value on this many Active Points of the power it\'s for (6E1 315).'
        : def.lvlVal && def.lvlCost ? `${def.lvlCost} pts per ${def.lvlVal === 1 ? 'level' : `${def.lvlVal}`}` : undefined,
      levelsTitle: def.xmlId === 'NAKEDMODIFIER' ? 'Up to Active Points' : isEnhancedSense(def.xmlId) ? 'PER bonus' : def.xmlId === 'ENDURANCERESERVE' ? 'END' : undefined,
      hasLevels: !!def.lvlCost || !!def.options?.some((o) => o.lvlCost),
      options: def.options?.length
        ? [
            // Files written without one (a Flash Defense with no sense group) choose one here
            // (one the template doesn't have stays as it is)
            ...(!def.options.some((o) => o.xmlId === draft.option)
              ? [{ value: draft.option, label: draft.option ? draft.optionAlias || draft.option : 'Choose…', selected: true }]
              : []),
            ...def.options.map((o) => ({ value: o.xmlId, label: o.display, selected: o.xmlId === draft.option })),
          ]
        : undefined,
    },
    powerChoices: powerChoices(draft.xmlId),
    containers: powerContainers(character, section, itemId).map((c) => ({ ...c, selected: c.id === draft.parentId })),
    adders: draft.adders.map((a) => ({
      id: a.id,
      // An adder with its medium in its name shows the medium in its own box
      name: a.xmlId === 'EXPANDEDBREATHING' ? (templateAdderName(draft, a.xmlId) ?? a.name) : (a.alias ?? a.name),
      hasLevels: !!a.lvlCost,
      levels: a.levels ?? 0,
      // The adder's choices (Life Support's Eating: how often), and text for an open one
      ...adderOptionsView(draft, a),
      // Detect's extra things are named by their alias
      rename: draft.xmlId === 'DETECT' && a.xmlId === 'EXTRA' ? { value: a.alias && a.alias !== templateAdderName(draft, 'EXTRA') ? a.alias : '' } : undefined,
      // Life Support's Expanded Breathing: the medium it breathes
      medium: a.xmlId === 'EXPANDEDBREATHING' ? { value: adderMedium(draft, a) } : undefined,
      cost: (a.baseCost ?? 0) + (a.levels ?? 0) * (a.lvlCost ?? 0),
    })),
    availableAdders: availableAdders(draft).map((a) => ({
      value: a.xmlId,
      label: `${a.display} (${a.baseCost}${a.lvlCost ? ` + ${a.lvlCost}/level` : ''})`,
    })),
    modifiers: draft.modifiers.map((m) => {
      const mdef = m.xmlId ? modifierFor(m.xmlId, draft.xmlId, others(draft, m.id)) : undefined;
      // Hero Designer's warning if this power can't normally take it
      const problem = m.xmlId ? modifierProblem(m.xmlId, facts) : '';
      // Rules the book states that Hero Designer doesn't apply
      const bookNotes = modifierBookNotes(m, facts).map((n) => `${n.text} (6E1 ${n.page})`);
      const nnd = isNnd(m);
      const rollsSkill = m.xmlId === 'REQUIRESASKILLROLL' && SKILL_ROLL_OPTION.test(m.optionId ?? '');
      const skills = rollsSkill ? rollSkillChoices(character) : [];
      const current = m.comments?.trim() ?? '';
      return {
        skill: rollsSkill ? skillRollView(m, skills, current) : undefined,
        id: m.id,
        name: m.name,
        value: fraction(m.value),
        isAdvantage: m.value > 0,
        isAoe: m.xmlId === 'AOE',
        isCustom: !mdef,
        rawValue: m.value,
        hasLevels: !!mdef?.hasLevels || m.xmlId === 'AOE',
        levels: m.levels ?? 1,
        // No Normal Defense is fixed at Very Common -> Rare with All Or Nothing: only its defense is chosen
        isNnd: nnd,
        toSpell: isCustomSpell(m),
        options: nnd ? undefined : m.xmlId === 'AOE' || !mdef?.hasLevels
          ? mdef?.options?.map((o) => ({ value: o.xmlId, label: o.label ?? o.display, selected: o.xmlId === m.optionId }))
          : undefined,
        // Free-text detail, e.g. the defense an AVAD attack works against
        input: nnd
          ? { label: 'Rare defense', value: m.input ?? '' }
          : mdef?.inputLabel || m.input ? { label: mdef?.inputLabel ?? 'Details', value: m.input ?? '' } : undefined,
        // Why or when it applies; Requires A Roll's COMMENTS name what it rolls instead
        comments: m.xmlId === 'REQUIRESASKILLROLL'
          ? undefined
          : { value: m.comments ?? '', placeholder: m.value < 0 ? 'Why or when it limits the power' : 'What it covers' },
        // The modifier's own adders (AVAD's All Or Nothing makes it NND)
        adderChoices: nnd ? [] : modifierAdderChoices(m, mdef),
        // Its own modifiers ("throughout" doubles Gestures)
        subChoices: subModifierChoices(m, mdef, draft),
        // On a naked advantage: whether it's on the naked advantage itself
        nakedPart: draft.xmlId === 'NAKEDMODIFIER' ? { private: !!m.private } : undefined,
        problem,
        bookNotes,
        // Linked: the power it's linked to
        linkChoices: m.xmlId === 'LINKED'
          ? linkTargets(character, itemId).map((p) => ({ value: p.id, label: `${p.name} (${p.activeCost ?? 0} AP)`, selected: p.id === m.linkedId }))
          : undefined,
      };
    }),
    inherited: inherited.map((m) => `${m.name} (${fraction(m.value)})`),
    inheritedFrom: parent?.type === 'LIST' ? 'the list' : parent ? `the ${FRAMEWORK_NAMES[(parentType ?? parent.type) as keyof typeof FRAMEWORK_NAMES] ?? 'framework'}` : '',
    subPowers: draft.subPowers.map((p) => ({
      id: p.id,
      name: p.name,
      detail: [p.alias && p.alias !== p.name ? p.alias : '', modifierSummary(p.modifiers)].filter(Boolean).join(' · '),
      cost: p.realCost ?? 0,
    })),
    modifierChoices: modifierChoices(draft.xmlId, draft.modifiers),
    // Rules for the power itself from its 6E1 description
    powerNotes: powerBookNotes({
      ...facts,
      input: draft.input,
      levels: powerLevels(draft),
      framework: parentType === 'MULTIPOWER' || parentType === 'VPP' ? parentType : undefined,
    }).map((n) => `${n.text} (6E1 ${n.page})`),
    /** Custom "Spell" modifiers elsewhere in the character (see convertCustomSpells) */
    otherCustomSpells: draft.modifiers.some(isCustomSpell) ? convertCustomSpells(character, itemId).count : 0,
    costs,
  };
}

/** What Hero Designer's modifier rules need to know about the power being edited */
export function powerFacts(character: Character, draft: PowerDraft, itemId?: string): PowerFacts {
  const items = characterItems(character);
  const containers: Partial<Record<PowerKind, PowerFacts['container']>> = { list: 'LIST', multipower: 'MULTIPOWER', vpp: 'VPP', compound: 'COMPOUNDPOWER' };
  return {
    xmlId: draft.xmlId,
    modifiers: draft.modifiers,
    adders: draft.adders.map((a) => a.xmlId ?? ''),
    baseCost: powerCosts(draft).base,
    container: containers[draft.kind],
    characterPowers: items.map((p) => p.type ?? ''),
    characterItems: items.filter((p) => p.id !== itemId).map((p) => ({ id: p.id, xmlId: p.type, modifiers: p.modifiers ?? [] })),
  };
}

// =============================================================================
// Saving
// =============================================================================

function buildPower(existing: PowerLike | undefined, draft: PowerDraft, costs: PowerCosts, position: number): Power {
  const def = getPowerDefinition(draft.xmlId);
  const base = {
    ...(existing ?? ({ id: newId(), position } as Power)),
    icon: draft.icon || undefined,
    multiplier: draft.free ? 0 : existing?.multiplier === 0 ? undefined : existing?.multiplier,
  };
  if (draft.kind === 'list') {
    return {
      ...base,
      name: draft.name.trim() || 'Power list',
      type: 'LIST',
      isContainer: true,
      levels: 0,
      baseCost: 0,
      modifiers: draft.modifiers.length ? draft.modifiers : undefined,
      adders: draft.adders.length ? draft.adders : undefined,
      notes: draft.notes || undefined,
    } as Power;
  }
  const framework = FRAMEWORK_OF_KIND[draft.kind];
  if (framework) {
    // Its total is its own cost plus its slots' (kept from before; slots are saved on their own)
    const slots = (existing?.realCost ?? 0) - (existing?.ownCost?.real ?? existing?.realCost ?? 0);
    const slotsActive = (existing?.activeCost ?? 0) - (existing?.ownCost?.active ?? existing?.activeCost ?? 0);
    return {
      ...base,
      name: draft.name.trim() || FRAMEWORK_NAMES[framework],
      type: framework,
      isContainer: true,
      levels: framework === 'VPP' ? draft.reserve : 0,
      baseCost: framework === 'MULTIPOWER' ? draft.reserve : 0,
      ownCost: { active: costs.active, real: costs.real },
      activeCost: costs.active + slotsActive,
      realCost: costs.real + slots,
      modifiers: draft.modifiers.length ? draft.modifiers : undefined,
      adders: draft.adders.length ? draft.adders : undefined,
      notes: draft.notes || undefined,
      parentId: draft.parentId || undefined,
    } as Power;
  }
  if (draft.kind === 'compound') {
    return {
      ...base,
      name: draft.name.trim() || 'Compound power',
      type: 'COMPOUNDPOWER',
      isContainer: true,
      levels: 0,
      notes: draft.notes || undefined,
      parentId: draft.parentId || undefined,
      baseCost: costs.base,
      activeCost: costs.active,
      realCost: costs.real,
      endCost: costs.end,
    } as Power;
  }
  return {
    ...base,
    // Custom powers keep their text in name/alias; known powers default to the power's name
    name: draft.name.trim() || (def ? def.display : 'Custom power'),
    // An existing power keeps its alias as-is (Hero Designer often leaves it empty)
    alias: def ? (existing ? existing.alias : def.display) : draft.alias.trim() || draft.name.trim() || undefined,
    type: (def ? draft.xmlId : (existing?.type && !getPowerDefinition(existing.type) ? existing.type : 'GENERIC')) as Power['type'],
    input: draft.input.trim() || undefined,
    notes: draft.notes || undefined,
    levels: def ? powerLevels(draft) : (existing?.levels ?? 0),
    option: draft.option || undefined,
    // An unchanged option keeps its label (Hero Designer users often write their own)
    optionAlias:
      draft.optionAlias ||
      (existing?.option === draft.option && existing?.optionAlias
        ? existing.optionAlias
        : (def?.options?.find((o) => o.xmlId === draft.option)?.display ?? existing?.optionAlias)),
    affectsPrimary: draft.affectsPrimary,
    affectsTotal: draft.affectsTotal,
    senseGroup: isEnhancedSense(def?.xmlId) ? draft.senseGroup || undefined : existing?.senseGroup,
    adders: draft.adders.length ? draft.adders : undefined,
    modifiers: draft.modifiers.length ? draft.modifiers : undefined,
    parentId: draft.parentId || undefined,
    baseCost: costs.base,
    activeCost: costs.active,
    realCost: costs.real,
    endCost: costs.end,
    doesDamage: def?.doesDamage ?? existing?.doesDamage,
    killing: def?.isKilling ?? existing?.killing,
    ...(def?.xmlId === 'FORCEWALL'
      ? {
          lengthLevels: draft.barrier.length, heightLevels: draft.barrier.height, widthLevels: draft.barrier.width,
          bodyLevels: draft.barrier.body, pdLevels: draft.barrier.pd, edLevels: draft.barrier.ed,
          mdLevels: draft.barrier.md, powdLevels: draft.barrier.powd,
        }
      : def?.xmlId === 'FORCEFIELD'
        ? { pdLevels: draft.barrier.pd, edLevels: draft.barrier.ed, mdLevels: draft.barrier.md, powdLevels: draft.barrier.powd }
        : def?.xmlId === 'ENDURANCERESERVE'
          ? { recoveryLevels: Math.max(0, Math.floor(draft.recovery)), recoveryModifiers: draft.recoveryModifiers.length ? draft.recoveryModifiers : undefined }
          : {}),
  } as Power;
}

/**
 * Passes a power's change in cost up to the lists/compounds it sits in. Their costs come from
 * Hero Designer's own figures (which include list adders such as a Common Adder), so they are
 * adjusted by the difference rather than re-added up from their contents.
 */
export function propagateCost<T extends { id: string; parentId?: string; realCost?: number; activeCost?: number; baseCost?: number; type?: string; xmlId?: string }>(
  items: T[],
  parentId: string | undefined,
  delta: { real: number; active: number },
): T[] {
  if (!parentId || (!delta.real && !delta.active)) return items;
  const ancestors = new Set<string>();
  for (let id: string | undefined = parentId; id && !ancestors.has(id); id = items.find((i) => i.id === id)?.parentId) ancestors.add(id);
  return items.map((i) =>
    ancestors.has(i.id)
      ? {
          ...i,
          realCost: (i.realCost ?? 0) + delta.real,
          activeCost: (i.activeCost ?? 0) + delta.active,
          // A framework's baseCost is its reserve, not a total
          baseCost: isFramework(i.xmlId ?? i.type) ? i.baseCost : (i.baseCost ?? 0) + delta.active,
        }
      : i,
  );
}

export function savePowerDraft(character: Character, section: PowerSection, itemId: string | undefined, unlinked: PowerDraft): Character {
  // Linked's value follows the Active Points of both powers as they are now
  const draft = relinkModifiers(character, unlinked);
  const existing = itemId ? findPower(character, section, itemId) : undefined;
  const parent = containerOf(character, section, draft.parentId);
  const costs = powerCosts(draft, parent?.type === 'LIST' ? (parent.modifiers ?? []) : []);
  const parentType = typeOf(parent);
  // A framework's slot costs a fraction of its Real Cost (nothing in a power pool)
  const asSlot = (power: Power): Power =>
    (draft.kind === 'power' || draft.kind === 'compound') && isFramework(parentType)
      ? { ...power, realCost: slotCost(parentType, power.realCost ?? 0, draft.slotFixed), slotFixed: parentType === 'MULTIPOWER' ? draft.slotFixed : power.slotFixed }
      : power;

  if (section === 'powers') {
    const power = asSlot(buildPower(existing, draft, costs, character.powers.length));
    let powers = existing ? character.powers.map((p) => (p.id === power.id ? power : p)) : [...character.powers, power];
    if (draft.kind === 'compound') {
      // The parts follow the compound, linked to it
      const parts = draft.subPowers.map((p) => ({ ...p, parentId: power.id }));
      powers = powers.filter((p) => p.parentId !== power.id);
      const at = powers.findIndex((p) => p.id === power.id);
      powers.splice(at + 1, 0, ...parts);
    }
    // Lists it left lose its old cost; lists it's in gain the new one
    const was = { real: existing?.realCost ?? 0, active: existing?.activeCost ?? 0 };
    const now = { real: power.realCost ?? 0, active: power.activeCost ?? 0 };
    if (existing?.parentId !== power.parentId) {
      powers = propagateCost(powers, existing?.parentId, { real: -was.real, active: -was.active });
      powers = propagateCost(powers, power.parentId, now);
    } else {
      powers = propagateCost(powers, power.parentId, { real: now.real - was.real, active: now.active - was.active });
    }
    return { ...character, powers };
  }

  // Equipment: top-level items, or a sub-power inside a compound item
  const equipment = character.equipment ?? [];
  const top = existing ? equipment.find((e) => e.id === existing.id) : undefined;
  if (existing && !top) {
    const sub = buildPower(existing, draft, costs, 0);
    return {
      ...character,
      equipment: equipment.map((e) => (e.subPowers?.some((p) => p.id === sub.id) ? { ...e, subPowers: e.subPowers.map((p) => (p.id === sub.id ? sub : p)) } : e)),
    };
  }
  const power = asSlot(buildPower(existing, draft, costs, equipment.length));
  const item: Equipment = {
    ...(top ?? {}),
    ...(power as unknown as Equipment),
    xmlId:
      draft.kind === 'compound'
        ? 'COMPOUNDPOWER'
        : FRAMEWORK_OF_KIND[draft.kind]
          ? FRAMEWORK_OF_KIND[draft.kind]
          : draft.kind === 'list'
            ? 'LIST'
            : getPowerDefinition(draft.xmlId)
              ? draft.xmlId
              : (top?.xmlId ?? 'CUSTOMPOWER'),
    price: draft.price,
    weight: draft.weight,
    quantity: Math.max(0, Math.floor(draft.quantity ?? 1)),
    carried: draft.carried,
    subPowers: draft.kind === 'compound' ? draft.subPowers.map((p) => ({ ...p, parentId: undefined })) : top?.subPowers,
  };
  let items = top ? equipment.map((e) => (e.id === item.id ? item : e)) : [...equipment, item];
  // Lists and frameworks it left lose its old cost; ones it's in gain the new one
  const was = { real: top?.realCost ?? 0, active: top?.activeCost ?? 0 };
  const now = { real: item.realCost ?? 0, active: item.activeCost ?? 0 };
  if (top?.parentId !== item.parentId) {
    items = propagateCost(items, top?.parentId, { real: -was.real, active: -was.active });
    items = propagateCost(items, item.parentId, now);
  } else {
    items = propagateCost(items, item.parentId, { real: now.real - was.real, active: now.active - was.active });
  }
  let saved: Character = { ...character, equipment: items };
  // A list's Carried is its contents' (put down the saddlebags, and what's in them is put down)
  if (draft.kind === 'list' && top && (top.carried ?? true) !== draft.carried) saved = setCarried(saved, item.id, draft.carried);
  // Put in a list, an item is where the list is: carried or stored with it
  const list = item.parentId !== top?.parentId ? items.find((e) => e.id === item.parentId && e.xmlId === 'LIST') : undefined;
  if (list && (top?.carried ?? true) === draft.carried) saved = setCarried(saved, item.id, list.carried ?? true);
  return saved;
}
