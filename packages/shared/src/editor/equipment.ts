/**
 * Carried and stored equipment. Items a character owns but isn't carrying (in a pack left at
 * camp, a room at the inn) stay in their Equipment lists with Carried off: hero6e then leaves
 * them out of encumbrance and doesn't use them (no armor DEF, no attacks). A list's Carried is
 * its contents', so a "Saddlebags" list is put down or picked up as a whole.
 */

import type { Character, Equipment } from '../types.js';
import { effectiveCharacteristics } from './characteristics.js';

/** An item and everything in it: the members of a list, and theirs */
function withContents(items: Equipment[], id: string): Set<string> {
  const ids = new Set([id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const item of items) {
      if (item.parentId && ids.has(item.parentId) && !ids.has(item.id)) {
        ids.add(item.id);
        grew = true;
      }
    }
  }
  return ids;
}

/** Carries (or puts down) an item, and everything in it if it's a list */
export function setCarried(character: Character, itemId: string, carried: boolean): Character {
  const items = character.equipment ?? [];
  const ids = withContents(items, itemId);
  return { ...character, equipment: items.map((e) => (ids.has(e.id) && (e.carried ?? true) !== carried ? { ...e, carried } : e)) };
}

/** Whether an item is carried (hero6e goes by each item's own Carried, not its list's) */
export const isCarried = (item: Equipment): boolean => item.carried ?? true;

/** What an item weighs (kg), all of it: its weight times how many there are */
const weightOf = (item: Equipment) => (item.weight ?? 0) * (item.quantity ?? 1);

/** A list's contents' weight (kg), carried and stored */
export function containerWeight(character: Character, id: string): { carried: number; stored: number } {
  const items = character.equipment ?? [];
  const ids = withContents(items, id);
  let carried = 0;
  let stored = 0;
  for (const item of items) {
    if (!ids.has(item.id)) continue;
    if (isCarried(item)) carried += weightOf(item);
    else stored += weightOf(item);
  }
  return { carried: round(carried), stored: round(stored) };
}

/**
 * What STR lifts (kg), from the 6E Strength Table (hero6e's strDetails): 8 kg at STR 1,
 * 100 kg at 10, 400 kg at 20, doubling every 5 from 25 on
 */
export function strLiftKg(str: number): number {
  if (str >= 50) return 25000 * 2 ** Math.floor((str - 50) / 5);
  const table: [number, number][] = [
    [45, 12500], [40, 6400], [35, 3200], [30, 1600], [28, 1200], [25, 800], [23, 600], [20, 400], [18, 300],
    [15, 200], [13, 150], [10, 100], [8, 75], [5, 50], [4, 38], [3, 25], [2, 16], [1, 8],
  ];
  return table.find(([min]) => str >= min)?.[1] ?? 0;
}

export interface EquipmentLoad {
  /** Weight carried and weight stored (kg) */
  carried: number;
  stored: number;
  /** What the character's STR lifts (kg) */
  lift: number;
  /** Carried weight as a percentage of that */
  percent: number;
  /** hero6e's encumbrance penalties: to DCV and DEX Rolls, and to movement (m) */
  dcv: number;
  move: number;
}

/**
 * The character's load, as hero6e works out encumbrance (Actor.applyEncumbrancePenalty): carried
 * weight against STR's lift, -1 DCV from 10% up to -5 at 90%. hero6e can scale weights by its
 * "equipment weight percentage" setting; this is at 100%
 */
export function equipmentLoad(character: Character): EquipmentLoad {
  let carried = 0;
  let stored = 0;
  for (const item of character.equipment ?? []) {
    if (isCarried(item)) carried += weightOf(item);
    else stored += weightOf(item);
  }
  const str = effectiveCharacteristics(character).get('STR') ?? 10;
  const lift = strLiftKg(str);
  const percent = lift > 0 ? Math.trunc((100 * carried) / lift) : carried > 0 ? 100 : 0;
  const dcv = percent >= 90 ? -5 : percent >= 75 ? -4 : percent >= 50 ? -3 : percent >= 25 ? -2 : percent >= 10 ? -1 : 0;
  const move = ({ 0: 0, [-1]: 0, [-2]: -2, [-3]: -4, [-4]: -8, [-5]: -16 } as Record<number, number>)[dcv] ?? 0;
  return { carried: round(carried), stored: round(stored), lift, percent, dcv, move };
}

const round = (kg: number) => Math.round(kg * 10) / 10;
