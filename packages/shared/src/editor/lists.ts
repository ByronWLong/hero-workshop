/**
 * Item lists (skills, powers, ...) as display trees, and the character point summary,
 * independent of any UI framework.
 */

import type { Character, Modifier, Adder } from '../types.js';
import type { HdcItemSection } from '../hdc/document.js';
import { calculateCostBreakdown, calculateDisadvantageTotal } from '../utils.js';

export type SectionId = 'skills' | 'perks' | 'talents' | 'martialarts' | 'powers' | 'disadvantages' | 'equipment';

export interface ItemRowView {
  id: string;
  name: string;
  detail: string;
  cost: number;
  isGroup: boolean;
  /** A list or framework other items can be put in */
  acceptsChildren: boolean;
  /** Custom icon, if the item has one */
  icon?: string;
  /** Costs no points (its own or an enclosing list's/compound's multiplier is 0) */
  free: boolean;
  /** Cost before any multiplier (what a list's own figure includes for this row) */
  rawCost: number;
  children: ItemRowView[];
}

export interface ListItem {
  id: string;
  name: string;
  alias?: string;
  parentId?: string;
  realCost?: number;
  baseCost?: number;
  isGroup?: boolean;
  isContainer?: boolean;
  type?: string;
  xmlId?: string;
  icon?: string;
  multiplier?: number;
  modifiers?: Modifier[];
  adders?: Adder[];
  notes?: string;
  points?: number;
  roll?: number;
  subPowers?: ListItem[];
}

export function sectionItems(character: Character, section: SectionId): ListItem[] {
  switch (section) {
    case 'skills': return character.skills;
    case 'perks': return character.perks;
    case 'talents': return character.talents;
    case 'martialarts': return character.martialArts;
    case 'powers': return character.powers;
    case 'disadvantages': return character.disadvantages;
    case 'equipment': return character.equipment ?? [];
  }
}

/** Modifier values as HERO writes them: +¼, -1½, +2 */
export function fractionText(value: number): string {
  const sign = value < 0 ? '-' : '+';
  const abs = Math.abs(value);
  const whole = Math.floor(abs);
  const rest = abs - whole;
  const frac = rest === 0.25 ? '¼' : rest === 0.5 ? '½' : rest === 0.75 ? '¾' : rest ? rest.toFixed(2).slice(1) : '';
  return `${sign}${whole || !frac ? whole : ''}${frac}`;
}

/** "Armor Piercing (+¼), OAF (-1)" */
export function modifierSummary(modifiers: Modifier[] | undefined): string {
  return (modifiers ?? []).map((m) => `${m.name} (${fractionText(m.value)})`).join(', ');
}

function detailFor(section: SectionId, item: ListItem): string {
  if (section === 'disadvantages') return item.alias ?? '';
  const parts: string[] = [];
  if (item.alias && item.alias !== item.name && section !== 'equipment') parts.push(item.alias);
  if (item.roll) parts.push(`${item.roll}-`);
  const adders = (item.adders ?? []).map((a) => a.optionAlias ?? a.name).filter(Boolean);
  if (adders.length && section !== 'equipment') parts.push(adders.join(', '));
  const mods = modifierSummary(item.modifiers);
  if (mods) parts.push(mods);
  return parts.join(' · ');
}

const costOf = (section: SectionId, item: ListItem) =>
  section === 'disadvantages' ? (item.points ?? 0) : (item.realCost ?? item.baseCost ?? 0);

const FRAMEWORKS = ['MULTIPOWER', 'ELEMENTAL_CONTROL', 'VPP'];

/**
 * What a row costs including what's under it: lists without their own cost show their
 * contents, and skill enhancers (Scholar, Jack of All Trades) add their skills to their
 * own cost. Power lists and compound powers already carry their total.
 */
function rowCost(section: SectionId, own: number, isGroup: boolean, children: ItemRowView[]): number {
  const inside = children.reduce((sum, c) => sum + c.cost, 0);
  if (isGroup) return own || inside;
  if (children.length && section !== 'powers' && section !== 'equipment') return own + inside;
  return own;
}

/** Items nested under their LIST groups / compound powers, in list order */
export function buildItemTree(character: Character, section: SectionId): ItemRowView[] {
  const items = sectionItems(character, section);
  const ids = new Set(items.map((i) => i.id));
  const toRow = (item: ListItem, inherited = 1): ItemRowView => {
    // Hero Designer: an item without its own multiplier takes its list's/compound's
    const multiplier = (item.multiplier ?? 1) !== 1 ? item.multiplier! : inherited;
    const children = [
      ...items.filter((c) => c.parentId === item.id).map((c) => toRow(c, multiplier)),
      ...(item.subPowers ?? []).map((c) => toRow(c, multiplier)),
    ];
    const isGroup = !!(item.isGroup || item.isContainer);
    const own = costOf(section, item);
    const inside = children.reduce((sum, c) => sum + c.cost, 0);
    const rawInside = children.reduce((sum, c) => sum + c.rawCost, 0);
    const kind = item.xmlId ?? item.type ?? '';
    let cost: number;
    let rawCost: number;
    if (section === 'disadvantages') cost = rawCost = own;
    else if (children.length && (item.isGroup || kind === 'LIST' || kind === 'COMPOUNDPOWER')) {
      // Lists and compounds: Hero Designer's figure (with any list adders) less what's free inside;
      // skill lists have no figure of their own and cost what's in them
      rawCost = own || rawInside;
      cost = own ? own * multiplier - (rawInside * multiplier - inside) : inside;
    }
    // Skill enhancers (Scholar, ...) cost their own price plus their skills
    else if (children.length && section !== 'powers' && section !== 'equipment') {
      rawCost = own + rawInside;
      cost = own * multiplier + inside;
    }
    // Frameworks and single items: their own cost
    else {
      rawCost = rowCost(section, own, isGroup, []);
      cost = rawCost * multiplier;
    }
    return {
      id: item.id,
      name: item.name,
      detail: detailFor(section, item),
      cost: Math.round(cost * 2) / 2 || 0, // no "-0" for a free penalty
      free: section !== 'disadvantages' && multiplier === 0,
      rawCost,
      isGroup,
      icon: item.icon,
      acceptsChildren: !!item.isGroup || item.type === 'LIST' || FRAMEWORKS.includes(item.xmlId ?? item.type ?? ''),
      children,
    };
  };
  return items.filter((i) => !i.parentId || !ids.has(i.parentId)).map((i) => toRow(i));
}

export interface PointSummaryView {
  basePoints: number;
  disadPoints: number;
  experience: number;
  available: number;
  spent: number;
  remaining: number;
  complicationsTaken: number;
  complicationsOk: boolean;
  breakdown: { label: string; points: number }[];
}

export function buildPointSummary(character: Character): PointSummaryView {
  const { basePoints, disadPoints, experience } = character.basicConfiguration;
  const breakdown = calculateCostBreakdown(character);
  const available = basePoints + experience;
  const complicationsTaken = calculateDisadvantageTotal(character.disadvantages);
  return {
    basePoints,
    disadPoints,
    experience,
    available,
    spent: breakdown.total,
    remaining: available - breakdown.total,
    complicationsTaken,
    complicationsOk: complicationsTaken <= disadPoints,
    breakdown: [
      { label: 'Characteristics', points: breakdown.characteristics },
      { label: 'Skills', points: breakdown.skills },
      { label: 'Perks', points: breakdown.perks },
      { label: 'Talents', points: breakdown.talents },
      { label: 'Martial Arts', points: breakdown.martialArts },
      { label: 'Powers', points: breakdown.powers },
    ].filter((b) => b.points !== 0),
  };
}


/** Removes an item and everything nested under it (LIST children, compound sub-powers) */
export function removeItem(character: Character, section: SectionId, id: string): Character {
  const items = sectionItems(character, section);
  const doomed = new Set([id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const item of items) {
      if (item.parentId && doomed.has(item.parentId) && !doomed.has(item.id)) {
        doomed.add(item.id);
        grew = true;
      }
    }
  }
  // The removed item's cost comes off the lists/compounds it was in (their cost is Hero Designer's figure)
  const removed = items.find((i) => i.id === id);
  let kept = items.filter((i) => !doomed.has(i.id));
  for (let parentId = removed?.parentId, seen = new Set<string>(); parentId && !seen.has(parentId); ) {
    seen.add(parentId);
    const pid: string = parentId;
    kept = kept.map((i) =>
      i.id === pid && (i.isContainer || i.type === 'LIST' || i.type === 'COMPOUNDPOWER')
        ? { ...i, realCost: (i.realCost ?? 0) - (removed?.realCost ?? 0) }
        : i,
    );
    parentId = kept.find((i) => i.id === pid)?.parentId;
  }
  return setSectionItems(character, section, kept);
}

/** Replaces a section's items (items must belong to that section) */
export function setSectionItems(character: Character, section: SectionId, items: ListItem[]): Character {
  switch (section) {
    case 'skills': return { ...character, skills: items as Character['skills'] };
    case 'perks': return { ...character, perks: items as Character['perks'] };
    case 'talents': return { ...character, talents: items as Character['talents'] };
    case 'martialarts': return { ...character, martialArts: items as Character['martialArts'] };
    case 'powers': return { ...character, powers: items as Character['powers'] };
    case 'disadvantages': return { ...character, disadvantages: items as Character['disadvantages'] };
    case 'equipment': return { ...character, equipment: items as NonNullable<Character['equipment']> };
  }
}

/** Editor section for each HDC section, and back */
export const SECTION_FOR_HDC: Record<HdcItemSection, SectionId> = {
  SKILLS: 'skills',
  PERKS: 'perks',
  TALENTS: 'talents',
  MARTIALARTS: 'martialarts',
  POWERS: 'powers',
  DISADVANTAGES: 'disadvantages',
  EQUIPMENT: 'equipment',
};

export const hdcSectionFor = (section: SectionId): HdcItemSection =>
  (Object.keys(SECTION_FOR_HDC) as HdcItemSection[]).find((k) => SECTION_FOR_HDC[k] === section)!;

/**
 * Adds items that `after` (a parse of the stored HDC after inserting items) has and `before`
 * (the parse it replaces) lacks, keeping the rest of the edited character as it is.
 */
export function withInsertedItems(character: Character, before: Character, after: Character, section: SectionId): Character {
  const known = new Set(sectionItems(before, section).map((i) => i.id));
  const added = sectionItems(after, section).filter((i) => !known.has(i.id));
  return setSectionItems(character, section, [...sectionItems(character, section), ...added]);
}
