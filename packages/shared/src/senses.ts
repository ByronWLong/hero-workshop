/**
 * Enhanced senses (Detect, Radar, Nightvision...) and their sense modifiers (Sense, Range,
 * Discriminatory...), from Hero Designer's template. A sense offers every sense modifier except
 * the ones it, or its sense group, has built in, each at the template's price for one sense
 * (Sense.getAvailableAdders)
 */

import { POWER_CATALOG_6E, type CatalogEntry } from './generated/catalog6e.js';
import type { PowerAdder } from './powerDefinitions.js';

/** Enhanced senses: powers with a sense group (the template's SENSE elements have no duration) */
const SENSES = new Map(POWER_CATALOG_6E.filter((e) => e.senseGroup && e.duration).map((e) => [e.xmlId, e]));

/** Sense groups (Sight Group...), with the sense modifiers every sense in them has */
const GROUPS = POWER_CATALOG_6E.filter((e) => e.isSenseGroup);

/** Sense modifiers: priced by what they apply to (all senses, a group, one sense) */
const MODIFIERS = POWER_CATALOG_6E.filter((e) => e.scopeCosts && e.types?.includes('SENSORY'));

export function isEnhancedSense(xmlId: string | undefined): boolean {
  return !!xmlId && SENSES.has(xmlId);
}

/** The group a sense is in by default (Detect: Unusual, Radar: Radio Group) */
export function defaultSenseGroup(xmlId: string): string | undefined {
  return SENSES.get(xmlId)?.senseGroup;
}

/** Groups a sense may be bought in: any, for those Hero Designer allows (Detect), else its own */
export function senseGroupChoices(xmlId: string): { value: string; label: string }[] {
  const sense = SENSES.get(xmlId);
  if (!sense) return [];
  const unusual = { value: 'UNUSUALGROUP', label: 'Unusual Senses' };
  const groups = GROUPS.map((g) => ({ value: g.xmlId, label: g.display }));
  if (sense.allowAnyGroup) return [unusual, ...groups];
  return sense.senseGroup === 'UNUSUALGROUP' ? [unusual] : groups.filter((g) => g.value === sense.senseGroup);
}

/** Whether a sense is Active by default (Detect, Radar), as Hero Designer writes ACTIVE */
export function senseIsActive(xmlId: string): boolean {
  return !!SENSES.get(xmlId)?.active;
}

/** Sense modifiers a sense has built in: its own and its group's */
export function builtInSenseModifiers(xmlId: string, group?: string): Set<string> {
  const sense = SENSES.get(xmlId);
  const groupId = group || sense?.senseGroup;
  const fromGroup = GROUPS.find((g) => g.xmlId === groupId)?.provides ?? [];
  return new Set([...(sense?.provides ?? []), ...fromGroup]);
}

/** A sense modifier's name (RANGE: "Range") */
export function senseModifierName(xmlId: string): string {
  return MODIFIERS.find((m) => m.xmlId === xmlId)?.display ?? xmlId;
}

/** Choices that rule each other out (two arcs, three dimensional reaches) */
const EXCLUSIVE_SETS = [
  ['INCREASEDARC240', 'INCREASEDARC360'],
  ['DIMENSIONALSINGLE', 'DIMENSIONALGROUP', 'DIMENSIONALALL'],
  ['ADJACENT', 'ADJACENTFIXED'],
  ['PENETRATIVE', 'PARTIALLYPENETRATIVE'],
];

/**
 * The sense modifiers a sense can take, as adders priced for one sense. `chosen` are the
 * adders it has (Analyze needs Discriminatory; Concealed is for an Active sense or one with Transmit)
 */
export function senseAdders(xmlId: string, group: string | undefined, chosen: string[] = []): PowerAdder[] {
  const sense = SENSES.get(xmlId);
  if (!sense) return [];
  const builtIn = builtInSenseModifiers(xmlId, group);
  const has = (id: string) => builtIn.has(id) || chosen.includes(id) || (id === 'MAKEASENSE' && chosen.includes('SENSE'));
  return MODIFIERS.filter((m) => !builtIn.has(m.xmlId))
    .filter((m) => !(m.xmlId === 'INCREASEDARC240' && builtIn.has('INCREASEDARC360')))
    .filter((m) => m.xmlId !== 'ANALYZESENSE' || has('DISCRIMINATORY'))
    .filter((m) => m.xmlId !== 'CONCEALED' || sense.active || has('TRANSMIT'))
    .map((m) => senseAdder(m));
}

function senseAdder(m: CatalogEntry): PowerAdder {
  const cost = m.scopeCosts?.sense ?? 0;
  const excludes = EXCLUSIVE_SETS.find((set) => set.includes(m.xmlId))?.filter((id) => id !== m.xmlId);
  return {
    xmlId: m.xmlId,
    display: m.display,
    exclusive: true,
    ...(m.lvlVal ? { baseCost: 0, lvlCost: cost, lvlVal: m.lvlVal, minVal: m.minVal ?? 1, levelStart: m.levelStart ?? 1 } : { baseCost: cost }),
    excludes,
  };
}
