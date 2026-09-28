/**
 * HERO 6e characteristic costs and characteristic maxima.
 *
 * Costs come from Hero Designer's Main6E.hdt (BASE, LVLCOST/LVLVAL). Maxima follow Hero
 * Designer: each character's embedded RULES carries <CHAR>_MAX attributes, a missing value
 * means no limit, and levels above the maximum cost NCM_COST_MULTIPLIER (2) times as much
 * (Characteristic.getTotalCost in the Java source).
 *
 * Campaign rule for this group: a character's maxima come from its original race(s). A
 * race's maxima are its listed stats +10 (+1 SPD, +2 for OCV/DCV/OMCV/DMCV); a mixed-race
 * character averages its races' maxima, rounding up.
 */

import type { CharacteristicType } from './types.js';
import { TEMPLATE_CHARACTERISTICS_6E } from './generated/catalog6e.js';

export interface CharacteristicRule {
  base: number;
  /** Character points per point of the characteristic (LVLCOST / LVLVAL) */
  costPerPoint: number;
}

export const CHARACTERISTIC_RULES_6E: Record<CharacteristicType, CharacteristicRule> = {
  STR: { base: 10, costPerPoint: 1 },
  DEX: { base: 10, costPerPoint: 2 },
  CON: { base: 10, costPerPoint: 1 },
  INT: { base: 10, costPerPoint: 1 },
  EGO: { base: 10, costPerPoint: 1 },
  PRE: { base: 10, costPerPoint: 1 },
  OCV: { base: 3, costPerPoint: 5 },
  DCV: { base: 3, costPerPoint: 5 },
  OMCV: { base: 3, costPerPoint: 3 },
  DMCV: { base: 3, costPerPoint: 3 },
  SPD: { base: 2, costPerPoint: 10 },
  PD: { base: 2, costPerPoint: 1 },
  ED: { base: 2, costPerPoint: 1 },
  REC: { base: 4, costPerPoint: 1 },
  END: { base: 20, costPerPoint: 0.2 },
  BODY: { base: 10, costPerPoint: 1 },
  STUN: { base: 20, costPerPoint: 0.5 },
  RUNNING: { base: 12, costPerPoint: 1 },
  SWIMMING: { base: 4, costPerPoint: 0.5 },
  LEAPING: { base: 4, costPerPoint: 0.5 },
  SIZE: { base: 0, costPerPoint: 5 },
  BASESIZE: { base: 0, costPerPoint: 2 },
};

/**
 * Characteristics a Hero Designer template provides, with its costs (vehicles pay 3 per 2
 * points of PD, a base starts at 2 BODY, ...). Unknown templates use the standard 6e set.
 */
export function characteristicRulesFor(template: string | undefined): Partial<Record<CharacteristicType, CharacteristicRule>> {
  const list = (template && TEMPLATE_CHARACTERISTICS_6E[template]) || TEMPLATE_CHARACTERISTICS_6E['builtIn.Main6E.hdt']!;
  const rules: Partial<Record<CharacteristicType, CharacteristicRule>> = {};
  for (const c of list) {
    rules[c.xmlId as CharacteristicType] = { base: c.base, costPerPoint: c.lvlCost / c.lvlVal };
  }
  return rules;
}

/** Templates that aren't people (vehicles, bases, computers, ...) remove characteristic maxima */
export function templateUsesMaxima(template: string | undefined): boolean {
  return !/(Vehicle|Base|Computer|Automaton|AI)6E\.hdt$/.test(template ?? '');
}

/** Hero Designer 6e's NCM_COST_MULTIPLIER: levels above the maximum cost double */
export const MAXIMA_COST_MULTIPLIER = 2;

/** Characteristics that have maxima (movement does not) */
export const MAXIMA_CHARACTERISTICS: CharacteristicType[] = [
  'STR', 'DEX', 'CON', 'INT', 'EGO', 'PRE',
  'OCV', 'DCV', 'OMCV', 'DMCV',
  'SPD', 'PD', 'ED', 'REC', 'END', 'BODY', 'STUN',
];

export type CharacteristicMaxima = Partial<Record<CharacteristicType, number>>;

/**
 * Character-point cost of buying `levels` of a characteristic. With a maximum, levels that
 * take the characteristic above it cost double, mirroring Hero Designer. Negative levels
 * (sold-back characteristics) cost nothing.
 */
export function characteristicCost(
  type: CharacteristicType,
  levels: number,
  maximum?: number,
  rule: CharacteristicRule | undefined = CHARACTERISTIC_RULES_6E[type],
): number {
  if (!rule || levels <= 0) return 0;
  let cost = levels * rule.costPerPoint;
  const value = rule.base + levels;
  if (maximum !== undefined && value > maximum) {
    let expensive = value - maximum;
    if (expensive > levels && rule.base < maximum) expensive = levels;
    cost += expensive * rule.costPerPoint * (MAXIMA_COST_MULTIPLIER - 1);
  }
  return Math.ceil(cost);
}

// -----------------------------------------------------------------------------
// Races
// -----------------------------------------------------------------------------

/** A race or creature and its listed characteristics (e.g. from a bestiary) */
export interface RaceDefinition {
  id: string;
  name: string;
  stats: CharacteristicMaxima;
  notes?: string;
}

/** How far above a race's listed value a characteristic's maximum sits */
export function maximaBonus(type: CharacteristicType): number {
  if (type === 'SPD') return 1;
  if (type === 'OCV' || type === 'DCV' || type === 'OMCV' || type === 'DMCV') return 2;
  return 10;
}

export function raceMaxima(race: RaceDefinition): CharacteristicMaxima {
  const maxima: CharacteristicMaxima = {};
  for (const type of MAXIMA_CHARACTERISTICS) {
    const stat = race.stats[type];
    if (stat !== undefined && Number.isFinite(stat)) maxima[type] = stat + maximaBonus(type);
  }
  return maxima;
}

/**
 * Maxima for a character of one or more races: each race's maxima averaged, rounded up.
 * A characteristic only some races list averages over those races.
 */
export function combinedRaceMaxima(races: RaceDefinition[]): CharacteristicMaxima {
  const perRace = races.map(raceMaxima);
  const combined: CharacteristicMaxima = {};
  for (const type of MAXIMA_CHARACTERISTICS) {
    const values = perRace.map((m) => m[type]).filter((v): v is number => v !== undefined);
    if (values.length) combined[type] = Math.ceil(values.reduce((a, b) => a + b, 0) / values.length);
  }
  return combined;
}

/** Reverses raceMaxima: listed stats for a race whose maxima are known (e.g. a rules file) */
export function raceStatsFromMaxima(maxima: CharacteristicMaxima): CharacteristicMaxima {
  const stats: CharacteristicMaxima = {};
  for (const type of MAXIMA_CHARACTERISTICS) {
    const max = maxima[type];
    if (max !== undefined) stats[type] = max - maximaBonus(type);
  }
  return stats;
}

// -----------------------------------------------------------------------------
// Races recorded in the RULES name: "TONS (Skaven/Kitsune/Lesser Demon)"
// -----------------------------------------------------------------------------

export function parseRulesName(name: string | undefined): { campaign: string; races: string[] } {
  const match = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(name ?? '');
  if (!match) return { campaign: name ?? '', races: [] };
  const races = match[2]!.split('/').map((r) => r.trim()).filter(Boolean);
  return { campaign: match[1]!.trim(), races };
}

export function formatRulesName(campaign: string, races: string[]): string {
  const base = campaign.trim() || 'Campaign';
  return races.length ? `${base} (${races.join('/')})` : base;
}
