/**
 * Perk and talent costs, as Hero Designer prices them (GenericObject.getTotalCost): the base
 * cost (the template's, its option's, or one chosen within the template's range), plus its
 * levels at the cost per level (an option's, if it has one), plus adders, held within the
 * template's minimum and maximum. Contacts, Positive Reputations, Followers and Vehicles &
 * Bases have their own rules (Contact.java, Reputation.java, Follower.java, Vehicle.java).
 */

import type { Adder, Modifier } from './types.js';
import {
  PERK_CATALOG_6E,
  TALENT_CATALOG_6E,
  type CatalogEntry,
  type CatalogOption,
} from './generated/catalog6e.js';
import { calculateActiveCost, calculateRealCost, heroRoundCost } from './utils.js';

export type PerkTalentKind = 'perk' | 'talent';

/** What a perk or talent is bought with, as the HDC stores it */
export interface PerkTalentPurchase {
  xmlId: string;
  /** BASECOST: the cost before levels and adders */
  basePrice?: number;
  levels?: number;
  /** OPTIONID */
  option?: string;
  adders?: Adder[];
  /** Followers and Vehicles & Bases: the points they're built on (BASEPOINTS) and how many (NUMBER) */
  basePoints?: number;
  number?: number;
}

/** Editor type names that differ from Hero Designer's XMLIDs */
const PERK_XMLIDS: Record<string, string> = {
  BASE: 'VEHICLE_BASE',
  VEHICLE: 'VEHICLE_BASE',
  POSITIVE_REPUTATION: 'REPUTATION',
  GENERIC: 'CUSTOMPERK',
};
const TALENT_XMLIDS: Record<string, string> = {
  LIGHTNING_REFLEXES: 'LIGHTNING_REFLEXES_ALL',
  OFF_HAND_DEFENSE: 'OFFHANDDEFENSE',
  GENERIC: 'CUSTOMTALENT',
};

export const perkXmlId = (type: string) => PERK_XMLIDS[type] ?? type;
export const talentXmlId = (type: string) => TALENT_XMLIDS[type] ?? type;

const PERKS = new Map(PERK_CATALOG_6E.map((e) => [e.xmlId, e]));
const TALENTS = new Map(TALENT_CATALOG_6E.map((e) => [e.xmlId, e]));

export function perkTalentEntry(kind: PerkTalentKind, xmlId: string): CatalogEntry | undefined {
  return (kind === 'perk' ? PERKS : TALENTS).get(xmlId);
}

export function perkTalentOption(entry: CatalogEntry | undefined, option: string | undefined): CatalogOption | undefined {
  return option ? entry?.options?.find((o) => o.xmlId === option) : undefined;
}

/** Bought in levels: the cost per level and how many levels each step is (an option's, if it sets them) */
export function perkTalentLevelPrice(entry: CatalogEntry | undefined, option?: CatalogOption): { lvlCost: number; lvlVal: number } | undefined {
  const lvlCost = option?.lvlCost !== undefined && option.lvlCost > 0 ? option.lvlCost : entry?.lvlCost;
  const lvlVal = option?.lvlVal || entry?.lvlVal;
  return lvlCost !== undefined && lvlVal ? { lvlCost, lvlVal } : undefined;
}

/** The base cost a purchase starts at: the option's, else the template's */
export function defaultBasePrice(entry: CatalogEntry | undefined, option?: CatalogOption): number {
  return option?.baseCost ?? entry?.baseCost ?? 0;
}

const adderCost = (a: Adder) => (a.baseCost ?? 0) + (a.levels ?? 0) * (a.lvlCost ?? 0);
const sum = (adders: Adder[]) => adders.reduce((total, a) => total + adderCost(a), 0);

/** The cost before advantages and limitations */
export function perkTalentBaseCost(kind: PerkTalentKind, p: PerkTalentPurchase): number {
  const levels = p.levels ?? 0;
  const adders = p.adders ?? [];
  if (kind === 'perk') {
    if (p.xmlId === 'VEHICLE_BASE' || p.xmlId === 'FOLLOWER') {
      // 1 point per 5 points built on, +5 per doubling of their number; discounts after rounding
      const doublings = Math.ceil(Math.log2(Math.max(1, p.number ?? 1)));
      const total = heroRoundCost((p.basePoints ?? 0) / 5 + 5 * doublings + sum(adders.filter((a) => adderCost(a) > 0)));
      return total + sum(adders.filter((a) => adderCost(a) < 0));
    }
    // A Contact's levels are its roll (8- at 1, 11- at 2, +1 after); at least 1
    if (p.xmlId === 'CONTACT') return Math.max(1, levels) + sum(adders);
    if (p.xmlId === 'REPUTATION') {
      // Each level (+1/+1d6) costs how widely plus how well it's known (at least 1)
      const scope = adders.filter((a) => a.xmlId === 'HOWWIDE' || a.xmlId === 'HOWWELL');
      const perLevel = Math.max(1, sum(scope));
      return Math.max(1, Math.ceil(Math.abs(p.basePrice ?? 0) + Math.max(1, levels) * perLevel + sum(adders.filter((a) => !scope.includes(a)))));
    }
  }
  const entry = perkTalentEntry(kind, p.xmlId);
  const option = perkTalentOption(entry, p.option);
  let total = p.basePrice ?? defaultBasePrice(entry, option);
  const price = perkTalentLevelPrice(entry, option);
  if (price) {
    // Steps of LVLVAL levels; a part step counts as a whole one
    const steps = Math.floor(levels / price.lvlVal) + (levels % price.lvlVal !== 0 && price.lvlVal > 1 ? 1 : 0);
    total += steps * price.lvlCost;
  }
  // The template's own adders count toward its minimum and maximum; others are added after
  const own = new Set((entry?.adders ?? []).map((a) => a.xmlId));
  total += sum(adders.filter((a) => own.has(a.xmlId ?? '')));
  if (entry?.minCost !== undefined && total < entry.minCost) total = entry.minCost;
  else if (entry?.maxCost !== undefined && total > entry.maxCost) total = entry.maxCost;
  return Math.ceil(total + sum(adders.filter((a) => !own.has(a.xmlId ?? ''))));
}

/** Active and Real Cost, with the item's own advantages and limitations */
export function perkTalentCosts(kind: PerkTalentKind, p: PerkTalentPurchase, modifiers: Modifier[] = []): { active: number; real: number } {
  const base = perkTalentBaseCost(kind, p);
  if (!modifiers.length) return { active: base, real: base };
  const active = calculateActiveCost(base, modifiers);
  return { active, real: Math.max(1, calculateRealCost(active, modifiers)) };
}
