/**
 * Characteristic editing operations and view data, independent of any UI framework.
 * Used by the Foundry module's Handlebars editor (and available to the web app).
 */

import type { Character, CharacteristicType, Rules } from '../types.js';
import {
  characteristicCost,
  characteristicRulesFor,
  templateUsesMaxima,
  type CharacteristicMaxima,
} from '../characteristics.js';
import { calculateStatModifications, getStatModificationTotal } from '../utils.js';

export interface CharacteristicGroupDefinition {
  id: string;
  label: string;
  stats: { type: CharacteristicType; label: string; showRoll?: boolean; unit?: string }[];
}

export const CHARACTERISTIC_GROUPS: CharacteristicGroupDefinition[] = [
  {
    id: 'primary',
    label: 'Primary Characteristics',
    stats: [
      { type: 'STR', label: 'Strength', showRoll: true },
      { type: 'DEX', label: 'Dexterity', showRoll: true },
      { type: 'CON', label: 'Constitution', showRoll: true },
      { type: 'INT', label: 'Intelligence', showRoll: true },
      { type: 'EGO', label: 'Ego', showRoll: true },
      { type: 'PRE', label: 'Presence', showRoll: true },
    ],
  },
  {
    id: 'combat',
    label: 'Combat Values',
    stats: [
      { type: 'OCV', label: 'OCV' },
      { type: 'DCV', label: 'DCV' },
      { type: 'OMCV', label: 'OMCV' },
      { type: 'DMCV', label: 'DMCV' },
    ],
  },
  {
    id: 'secondary',
    label: 'Secondary Characteristics',
    stats: [
      { type: 'SPD', label: 'Speed' },
      { type: 'PD', label: 'PD' },
      { type: 'ED', label: 'ED' },
      { type: 'REC', label: 'Recovery' },
      { type: 'END', label: 'Endurance' },
      { type: 'BODY', label: 'Body' },
      { type: 'STUN', label: 'Stun' },
    ],
  },
  {
    id: 'movement',
    label: 'Movement',
    stats: [
      { type: 'RUNNING', label: 'Running', unit: 'm' },
      { type: 'SWIMMING', label: 'Swimming', unit: 'm' },
      { type: 'LEAPING', label: 'Leaping', unit: 'm' },
    ],
  },
  {
    id: 'size',
    label: 'Size',
    stats: [
      { type: 'SIZE', label: 'Size' },
      { type: 'BASESIZE', label: 'Size' },
    ],
  },
];

// -----------------------------------------------------------------------------
// STR-derived values
// -----------------------------------------------------------------------------

const LIFT_TABLE: [number, string][] = [
  [5, '50 kg'], [10, '100 kg'], [15, '200 kg'], [20, '400 kg'], [25, '800 kg'], [30, '1,600 kg'],
  [35, '3,200 kg'], [40, '6,400 kg'], [45, '12.5 tons'], [50, '25 tons'], [55, '50 tons'],
  [60, '100 tons'], [65, '200 tons'], [70, '400 tons'], [75, '800 tons'], [80, '1,600 tons'],
  [85, '3,200 tons'], [90, '6,400 tons'], [95, '12,800 tons'], [100, '25,600 tons'],
];

export function liftFor(str: number): string {
  if (str <= 0) return '0 kg';
  if (str <= 5) return `${Math.round(str * 10)} kg`;
  for (const [threshold, lift] of LIFT_TABLE) if (str <= threshold) return lift;
  return '50,000+ tons';
}

/** Normal damage from STR: 1d6 per 5 STR, with half dice and pips for the remainder */
export function hthDamageFor(str: number): string {
  if (str <= 0) return '0d6';
  const fullDice = Math.floor(str / 5);
  const remainder = str % 5;
  if (remainder === 0) return `${fullDice}d6`;
  if (remainder === 1 || remainder === 2) return fullDice > 0 ? `${fullDice}d6+${remainder}` : `+${remainder}`;
  if (remainder === 3) return `${fullDice}½d6`;
  return `${fullDice + 1}d6-1`;
}

export const characteristicRoll = (value: number) => `${9 + Math.floor(value / 5)}-`;

// -----------------------------------------------------------------------------
// Operations
// -----------------------------------------------------------------------------

/** Sets a characteristic's total value, re-costing it against the template and maxima */
export function setCharacteristicValue(character: Character, type: CharacteristicType, value: number): Character {
  const rule = characteristicRulesFor(character.hdcTemplate)[type];
  if (!rule) return character;
  const levels = value - rule.base;
  const cost = characteristicCost(type, levels, character.rules?.characteristicMaxima?.[type], rule);
  return {
    ...character,
    characteristics: character.characteristics.map((c) =>
      c.type === type ? { ...c, totalValue: value, levels, baseCost: cost, realCost: cost } : c,
    ),
  };
}

/** Applies new maxima (and optionally races), re-costing characteristics priced against them */
export function withMaxima(character: Character, maxima: CharacteristicMaxima, races?: string[]): Character {
  const rules: Rules = {
    ...(character.rules ?? ({ name: 'Campaign' } as Rules)),
    characteristicMaxima: maxima,
    races: races ?? character.rules?.races,
  };
  const templateRules = characteristicRulesFor(character.hdcTemplate);
  return {
    ...character,
    rules,
    characteristics: character.characteristics.map((c) => {
      const cost = characteristicCost(c.type, c.levels, maxima[c.type], templateRules[c.type]);
      return cost === c.realCost ? c : { ...c, baseCost: cost, realCost: cost };
    }),
  };
}

// -----------------------------------------------------------------------------
// View data
// -----------------------------------------------------------------------------

export interface CharacteristicView {
  type: CharacteristicType;
  label: string;
  value: number;
  bonus: number;
  effective: number;
  roll?: string;
  unit?: string;
  cost: number;
  maximum?: number;
  over: boolean;
  /** Extra points paid for levels above the maximum */
  surcharge: number;
  /** Resistant defense from powers/equipment (PD/ED) */
  resistant?: number;
}

export interface CharacteristicsView {
  groups: { id: string; label: string; stats: CharacteristicView[] }[];
  str?: { lift: string; damage: string; throw: string };
  usesMaxima: boolean;
}

export function buildCharacteristicsView(character: Character): CharacteristicsView {
  const rules = characteristicRulesFor(character.hdcTemplate);
  const maxima = character.rules?.characteristicMaxima ?? {};
  const modifications = calculateStatModifications(character);
  const byType = new Map(character.characteristics.map((c) => [c.type, c]));

  const statView = (type: CharacteristicType, label: string, showRoll?: boolean, unit?: string): CharacteristicView => {
    const rule = rules[type]!;
    const value = byType.get(type)?.totalValue ?? rule.base;
    const levels = value - rule.base;
    const maximum = maxima[type];
    const cost = characteristicCost(type, levels, maximum, rule);
    const bonus = getStatModificationTotal(modifications, type);
    const resistant = type === 'PD' || type === 'ED' ? getStatModificationTotal(modifications, `r${type}`) : 0;
    return {
      type,
      label,
      value,
      bonus,
      effective: value + bonus,
      roll: showRoll ? characteristicRoll(value + bonus) : undefined,
      unit,
      cost,
      maximum,
      over: maximum !== undefined && value > maximum,
      surcharge: cost - characteristicCost(type, levels, undefined, rule),
      resistant: resistant || undefined,
    };
  };

  const groups = CHARACTERISTIC_GROUPS.map((g) => ({
    id: g.id,
    label: g.label,
    stats: g.stats.filter((s) => rules[s.type]).map((s) => statView(s.type, s.label, s.showRoll, s.unit)),
  })).filter((g) => g.stats.length > 0);

  const strStat = groups.flatMap((g) => g.stats).find((s) => s.type === 'STR');
  return {
    groups,
    str: strStat
      ? { lift: liftFor(strStat.effective), damage: hthDamageFor(strStat.effective), throw: `${strStat.effective * 2}m` }
      : undefined,
    usesMaxima: templateUsesMaxima(character.hdcTemplate),
  };
}
