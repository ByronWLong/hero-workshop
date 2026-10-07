/**
 * Power and equipment editing: a draft the UI edits, the operations that change it, the view
 * a form renders from it, and saving it back into the character. Framework-independent.
 */

import { FRAMEWORK_NAMES, frameworkOwnCost, inheritedSlotLimitations, isContainerType, isFramework, slotCost, type FrameworkType } from '../frameworks.js';
import type { Adder, Character, Equipment, Modifier, Power } from '../types.js';
import {
  ALL_POWERS,
  calculatePowerBaseCost,
  getPowerDefinition,
  type PowerDefinition,
} from '../powerDefinitions.js';
import { NND, aoeValue, clampModifierValue, getAllModifiers, getModifierByXmlId, isNnd, modifierFor, powerSpecificModifiers, type ModifierDefinition } from '../modifierDefinitions.js';
import { calculateAdderCost, heroRoundCost } from '../utils.js';
import { fractionText as fraction } from './lists.js';
import { skillRollCategory } from '../hdc/foundry.js';

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
  customCost: number;
  affectsPrimary: boolean;
  affectsTotal: boolean;
  barrier: { length: number; height: number; width: number; body: number; pd: number; ed: number; md: number; powd: number };
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
  weight: number;
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
  const known = xmlId && getPowerDefinition(xmlId) ? xmlId : undefined;
  return {
    kind: detectedKind,
    xmlId: p ? (known ?? 'CUSTOM') : 'ENERGYBLAST',
    name: p && p.name !== (known && getPowerDefinition(known)?.display) ? p.name : '',
    alias: p?.alias ?? '',
    input: p?.input ?? '',
    notes: p?.notes && p.notes !== p.alias ? p.notes : '',
    levels: p?.levels ?? 1,
    option: p?.option ?? '',
    customCost: p && !known ? (p.baseCost ?? 0) - calculateAdderCost(p.adders ?? []) : 0,
    affectsPrimary: p?.affectsPrimary ?? true,
    affectsTotal: p?.affectsTotal ?? true,
    barrier: {
      length: p?.lengthLevels ?? 1,
      height: p?.heightLevels ?? 1,
      width: p?.widthLevels ?? 0.5,
      body: p?.bodyLevels ?? 0,
      pd: p?.pdLevels ?? 0,
      ed: p?.edLevels ?? 0,
      md: p?.mdLevels ?? 0,
      powd: p?.powdLevels ?? 0,
    },
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

/**
 * A scratch character whose Powers section holds just the compound's parts, so the ordinary
 * power form can add and edit them; hand its powers back to `setSubPowers` on save.
 */
export function compoundPartsCharacter(character: Character, draft: PowerDraft): Character {
  return { ...character, powers: draft.subPowers.map((p) => ({ ...p, parentId: undefined })) };
}

/** Picks a different power: levels/option/adders reset to the new power's defaults */
export function selectPower(draft: PowerDraft, xmlId: string): PowerDraft {
  const def = getPowerDefinition(xmlId);
  return {
    ...draft,
    xmlId,
    levels: def ? Math.max(def.minVal ?? 1, def.levelStart ?? 1, 1) : draft.levels,
    option: def?.options?.[0]?.xmlId ?? '',
    adders: [],
  };
}

// =============================================================================
// Adders
// =============================================================================

export function availableAdders(draft: PowerDraft) {
  const def = getPowerDefinition(draft.xmlId);
  const chosen = new Set(draft.adders.map((a) => a.xmlId));
  const excluded = new Set(
    draft.adders.flatMap((a) => def?.adders?.find((d) => d.xmlId === a.xmlId)?.excludes ?? []),
  );
  return (def?.adders ?? []).filter((a) => !chosen.has(a.xmlId) && !excluded.has(a.xmlId));
}

export function addAdder(draft: PowerDraft, xmlId: string): PowerDraft {
  const def = getPowerDefinition(draft.xmlId)?.adders?.find((a) => a.xmlId === xmlId);
  if (!def) return draft;
  const excludes = new Set(def.excludes ?? []);
  const adder: Adder = {
    id: newId(),
    xmlId: def.xmlId,
    name: def.display,
    alias: def.display,
    baseCost: def.baseCost,
    levels: def.lvlCost ? Math.max(def.minVal ?? 1, 1) : undefined,
    lvlCost: def.lvlCost,
    lvlVal: def.lvlVal,
    includeInBase: def.includeInBase,
    selected: true,
  };
  return { ...draft, adders: [...draft.adders.filter((a) => !excludes.has(a.xmlId ?? '')), adder] };
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

/** A modifier's value, the way the HDC parser computes it (so saving round-trips) */
function modifierValue(def: ModifierDefinition | undefined, m: Modifier): number {
  const adders = (m.adders ?? []).reduce((sum, a) => sum + (a.baseCost ?? 0), 0);
  if (m.xmlId === 'AOE') return clampModifierValue(def, aoeValue(m.optionId ?? 'RADIUS', m.levels ?? 4) + adders);
  if (def?.hasLevels && (m.levels ?? 0) > 0) return clampModifierValue(def, (def.baseCost ?? 0) + (m.levels ?? 0) * (def.lvlCost ?? 0) + adders);
  const option = def?.options?.find((o) => o.xmlId === m.optionId);
  if (option) return clampModifierValue(def, option.baseCost + adders);
  return m.value;
}

function modifierName(def: ModifierDefinition | undefined, m: Modifier): string {
  if (isNnd(m)) return NND.display;
  const base = def?.display ?? m.alias ?? m.name;
  if (m.xmlId === 'AOE') return `${base} (${m.levels ?? 4}m ${m.optionAlias ?? m.optionId ?? 'Radius'})`;
  return m.optionAlias ? `${base} (${m.optionAlias})` : base;
}

/** Recomputes a modifier's value and name (by the definition of the power it's on, if given) */
function refreshModifier(m: Modifier, powerXmlId?: string): Modifier {
  const def = m.xmlId ? modifierFor(m.xmlId, powerXmlId) : undefined;
  const value = modifierValue(def, m);
  return { ...m, value, name: modifierName(def, m), isAdvantage: value > 0, isLimitation: value < 0 };
}

export function addModifier(draft: PowerDraft, xmlId: string): PowerDraft {
  // No Normal Defense: AVAD from Very Common to Rare, All Or Nothing
  if (xmlId === NND.choice) {
    const added = addModifier(draft, 'AVAD');
    const avad = added.modifiers[added.modifiers.length - 1];
    if (!avad || avad.xmlId !== 'AVAD') return draft;
    return setModifierAdder(setModifierOption(added, avad.id, NND.option), avad.id, NND.adder, true);
  }
  const def = modifierFor(xmlId, draft.xmlId);
  if (!def) return draft;
  const option = xmlId === 'AOE' ? def.options?.find((o) => o.xmlId === 'RADIUS') ?? def.options?.[0] : !def.hasLevels ? def.options?.[0] : undefined;
  const modifier = refreshModifier({
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
  }, draft.xmlId);
  return { ...draft, modifiers: [...draft.modifiers, modifier] };
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
  return { ...draft, modifiers: draft.modifiers.filter((m) => m.id !== id) };
}

export function setModifierOption(draft: PowerDraft, id: string, optionId: string): PowerDraft {
  return {
    ...draft,
    modifiers: draft.modifiers.map((m) => {
      if (m.id !== id) return m;
      const option = (m.xmlId ? modifierFor(m.xmlId, draft.xmlId) : undefined)?.options?.find((o) => o.xmlId === optionId);
      return refreshModifier({ ...m, optionId, optionAlias: option?.display ?? optionId }, draft.xmlId);
    }),
  };
}

export function setModifierLevels(draft: PowerDraft, id: string, levels: number): PowerDraft {
  return { ...draft, modifiers: draft.modifiers.map((m) => (m.id === id ? refreshModifier({ ...m, levels: Math.max(1, levels) }, draft.xmlId) : m)) };
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

/** Turns one of a modifier's own adders on or off (e.g. AVAD's All Or Nothing, which makes it NND) */
export function setModifierAdder(draft: PowerDraft, id: string, adderXmlId: string, on: boolean): PowerDraft {
  return {
    ...draft,
    modifiers: draft.modifiers.map((m) => {
      if (m.id !== id) return m;
      const kept = (m.adders ?? []).filter((a) => a.xmlId !== adderXmlId);
      if (!on) return refreshModifier({ ...m, adders: kept }, draft.xmlId);
      const def = (m.xmlId ? modifierFor(m.xmlId, draft.xmlId) : undefined)?.adders?.find((a) => a.xmlId === adderXmlId);
      if (!def) return m;
      // Hero Designer's alias is the display without its abbreviation ("All Or Nothing", not "... (NND)")
      const alias = def.abbreviation ? def.display.replace(` (${def.abbreviation})`, '') : def.display;
      const adder: Adder = { id: newId(), xmlId: adderXmlId, name: alias, alias, baseCost: def.baseCost, includeInBase: false, selected: true };
      return refreshModifier({ ...m, adders: [...kept, adder] }, draft.xmlId);
    }),
  };
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
  const defense = Math.ceil((b.pd + b.ed + b.md + b.powd) * 1.5);
  return 3 + dimensions + b.body + defense;
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
  const def = getPowerDefinition(draft.xmlId);
  const adders = calculateAdderCost(draft.adders);
  const base = !def
    ? draft.customCost + adders
    : def.xmlId === 'FORCEWALL'
      ? barrierBaseCost(draft.barrier) + adders
      : calculatePowerBaseCost(def, draft.levels, draft.option || undefined) + adders;
  const all = [...draft.modifiers, ...inherited];
  const advantages = all.filter((m) => m.value > 0).reduce((s, m) => s + m.value, 0);
  const limitations = all.filter((m) => m.value < 0).reduce((s, m) => s + Math.abs(m.value), 0);
  const active = heroRoundCost(base * (1 + advantages));
  const real = limitations > 0 ? heroRoundCost(active / (1 + limitations)) : active;
  const end = def && def.usesEnd === false ? 0 : Math.ceil(active / 10);
  return { base, active, real, end };
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
  const all = Object.values(ALL_POWERS).filter((p) => p.types.length > 0 || CHARACTERISTIC_POWERS.includes(p.xmlId));
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

export function modifierChoices(powerXmlId?: string) {
  // The power's own definitions first, so they win over general ones with the same XMLID
  const all = [...powerSpecificModifiers(powerXmlId), ...Object.values(getAllModifiers())]
    .filter((m, i, list) => list.findIndex((o) => o.xmlId === m.xmlId) === i)
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
    isEquipment: section === 'equipment',
    draft,
    definition: def && {
      display: def.display,
      description: def.description,
      inputLabel: def.inputLabel,
      // Hero Designer's drop-down for the input ("Vs.": PD, ED), with typed values when it allows others
      inputExamples: def.inputExamples?.length ? def.inputExamples : undefined,
      otherInput: def.otherInput !== false,
      levelLabel: def.lvlVal && def.lvlCost ? `${def.lvlCost} pts per ${def.lvlVal === 1 ? 'level' : `${def.lvlVal}`}` : undefined,
      hasLevels: !!def.lvlCost || !!def.options?.some((o) => o.lvlCost),
      options: def.options?.map((o) => ({ value: o.xmlId, label: o.display, selected: o.xmlId === draft.option })),
    },
    powerChoices: powerChoices(draft.xmlId),
    containers: powerContainers(character, section, itemId).map((c) => ({ ...c, selected: c.id === draft.parentId })),
    adders: draft.adders.map((a) => ({
      id: a.id,
      name: a.alias ?? a.name,
      hasLevels: !!a.lvlCost,
      levels: a.levels ?? 0,
      cost: (a.baseCost ?? 0) + (a.levels ?? 0) * (a.lvlCost ?? 0),
    })),
    availableAdders: availableAdders(draft).map((a) => ({
      value: a.xmlId,
      label: `${a.display} (${a.baseCost}${a.lvlCost ? ` + ${a.lvlCost}/level` : ''})`,
    })),
    modifiers: draft.modifiers.map((m) => {
      const mdef = m.xmlId ? modifierFor(m.xmlId, draft.xmlId) : undefined;
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
          ? mdef?.options?.map((o) => ({ value: o.xmlId, label: o.display, selected: o.xmlId === m.optionId }))
          : undefined,
        // Free-text detail, e.g. the defense an AVAD attack works against
        input: nnd
          ? { label: 'Rare defense', value: m.input ?? '' }
          : mdef?.inputLabel || m.input ? { label: mdef?.inputLabel ?? 'Details', value: m.input ?? '' } : undefined,
        // The modifier's own on/off adders (AVAD's All Or Nothing makes it NND)
        adderChoices: (nnd ? [] : mdef?.adders ?? [])
          .filter((a) => !a.options?.length && !a.lvlCost)
          .map((a) => ({
            value: a.xmlId,
            label: a.display,
            cost: fraction(a.baseCost),
            checked: (m.adders ?? []).some((x) => x.xmlId === a.xmlId),
          })),
      };
    }),
    inherited: inherited.map((m) => `${m.name} (${fraction(m.value)})`),
    inheritedFrom: parent?.type === 'LIST' ? 'the list' : parent ? `the ${FRAMEWORK_NAMES[(parentType ?? parent.type) as keyof typeof FRAMEWORK_NAMES] ?? 'framework'}` : '',
    subPowers: draft.subPowers.map((p) => ({
      id: p.id,
      name: p.name,
      detail: [p.alias && p.alias !== p.name ? p.alias : '', modifierText(p.modifiers)].filter(Boolean).join(' · '),
      cost: p.realCost ?? 0,
    })),
    modifierChoices: modifierChoices(draft.xmlId),
    /** Custom "Spell" modifiers elsewhere in the character (see convertCustomSpells) */
    otherCustomSpells: draft.modifiers.some(isCustomSpell) ? convertCustomSpells(character, itemId).count : 0,
    costs,
  };
}

const modifierText = (mods: Modifier[] | undefined) => (mods ?? []).map((m) => `${m.name} (${fraction(m.value)})`).join(', ');

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
    levels: def ? draft.levels : (existing?.levels ?? 0),
    option: draft.option || undefined,
    // An unchanged option keeps its label (Hero Designer users often write their own)
    optionAlias:
      existing?.option === draft.option && existing?.optionAlias
        ? existing.optionAlias
        : (def?.options?.find((o) => o.xmlId === draft.option)?.display ?? existing?.optionAlias),
    affectsPrimary: draft.affectsPrimary,
    affectsTotal: draft.affectsTotal,
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

export function savePowerDraft(character: Character, section: PowerSection, itemId: string | undefined, draft: PowerDraft): Character {
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
  return { ...character, equipment: items };
}
