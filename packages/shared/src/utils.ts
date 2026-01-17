/**
 * Utility functions shared between frontend and backend
 */

import type { Character, Characteristic, Power, Skill, Disadvantage, Modifier, Adder } from './types.js';

/**
 * Calculate the total active cost of a power including modifiers
 */
export function calculateActiveCost(baseCost: number, modifiers: Modifier[] = []): number {
  const advantageTotal = modifiers
    .filter((m) => m.isAdvantage)
    .reduce((sum, m) => sum + m.value, 0);

  return Math.ceil(baseCost * (1 + advantageTotal));
}

/**
 * Calculate the real cost of a power after limitations
 */
export function calculateRealCost(activeCost: number, modifiers: Modifier[] = []): number {
  const limitationTotal = modifiers
    .filter((m) => m.isLimitation)
    .reduce((sum, m) => sum + Math.abs(m.value), 0);

  if (limitationTotal === 0) {
    return activeCost;
  }

  return Math.ceil(activeCost / (1 + limitationTotal));
}

/**
 * Calculate total cost from adders
 * For leveled adders: cost = baseCost + (levels * lvlCost)
 * e.g., TELESCOPIC: baseCost=0, levels=6, lvlCost=1 => 0 + 6*1 = 6
 */
export function calculateAdderCost(adders: Adder[]): number {
  return adders.reduce((sum, adder) => {
    const baseCost = adder.baseCost ?? 0;
    const levels = adder.levels ?? 0;
    const lvlCost = adder.lvlCost ?? 0;
    return sum + baseCost + (levels * lvlCost);
  }, 0);
}

/**
 * Calculate a characteristic roll (e.g., 9 + (value / 5))
 */
export function calculateCharacteristicRoll(
  value: number,
  rollBase: number = 9,
  rollDenominator: number = 5
): number {
  return rollBase + Math.floor(value / rollDenominator);
}

/**
 * Calculate total characteristic points spent
 */
export function calculateCharacteristicTotal(characteristics: Characteristic[]): number {
  return characteristics.reduce((total, char) => {
    const cost = char.realCost ?? char.baseCost ?? 0;
    return total + cost;
  }, 0);
}

/**
 * Calculate total skill points spent
 */
export function calculateSkillTotal(skills: Skill[]): number {
  return skills.reduce((total, skill) => {
    const cost = skill.realCost ?? skill.baseCost ?? 0;
    return total + cost;
  }, 0);
}

/**
 * Calculate total power points spent
 * Only counts top-level powers and containers - children are included in their parent's cost
 */
export function calculatePowerTotal(powers: Power[]): number {
  // Build a set of all power IDs to check if parentId points to a valid power
  const powerIds = new Set(powers.map(p => p.id));
  
  return powers.reduce((total, power) => {
    // Skip powers that are children of another power (their cost is in the parent)
    if (power.parentId && powerIds.has(power.parentId)) {
      return total;
    }
    const cost = power.realCost ?? power.baseCost ?? 0;
    return total + cost;
  }, 0);
}

/**
 * Calculate total disadvantage points
 */
export function calculateDisadvantageTotal(disadvantages: Disadvantage[]): number {
  return disadvantages.reduce((total, disad) => {
    return total + (disad.points ?? 0);
  }, 0);
}

/**
 * Calculate total character points spent
 */
export function calculateTotalPointsSpent(character: Character): number {
  const chars = calculateCharacteristicTotal(character.characteristics);
  const skills = calculateSkillTotal(character.skills);
  const perks = character.perks.reduce((t, p) => t + (p.realCost ?? p.baseCost ?? 0), 0);
  const talents = character.talents.reduce((t, t2) => t + (t2.realCost ?? t2.baseCost ?? 0), 0);
  const martialArts = character.martialArts.reduce(
    (t, m) => t + (m.realCost ?? m.baseCost ?? 0),
    0
  );
  const powers = calculatePowerTotal(character.powers);

  return chars + skills + perks + talents + martialArts + powers;
}

/**
 * Calculate a breakdown of point costs by category
 */
export interface CostBreakdown {
  characteristics: number;
  skills: number;
  perks: number;
  talents: number;
  martialArts: number;
  powers: number;
  total: number;
}

export function calculateCostBreakdown(character: Character): CostBreakdown {
  const characteristics = calculateCharacteristicTotal(character.characteristics);
  const skills = calculateSkillTotal(character.skills);
  const perks = character.perks.reduce((t, p) => t + (p.realCost ?? p.baseCost ?? 0), 0);
  const talents = character.talents.reduce((t, t2) => t + (t2.realCost ?? t2.baseCost ?? 0), 0);
  const martialArts = character.martialArts.reduce(
    (t, m) => t + (m.realCost ?? m.baseCost ?? 0),
    0
  );
  const powers = calculatePowerTotal(character.powers);
  
  return {
    characteristics,
    skills,
    perks,
    talents,
    martialArts,
    powers,
    total: characteristics + skills + perks + talents + martialArts + powers,
  };
}

/**
 * Calculate available points
 */
export function calculateAvailablePoints(character: Character): number {
  const basePoints = character.basicConfiguration.basePoints;
  const experience = character.basicConfiguration.experience;
  const disadLimit = character.basicConfiguration.disadPoints;
  const disadsEarned = Math.min(
    calculateDisadvantageTotal(character.disadvantages),
    disadLimit
  );
  const spent = calculateTotalPointsSpent(character);

  return basePoints + experience + disadsEarned - spent;
}

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Format a number with sign (e.g., +5 or -3)
 */
export function formatWithSign(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

/**
 * Parse dice notation (e.g., "2d6", "1d6+1", "4d6 AVAD")
 */
export function parseDiceNotation(notation: string): {
  dice: number;
  sides: number;
  modifier: number;
  suffix: string;
} {
  const match = notation.match(/^(\d+)d(\d+)([+-]\d+)?(.*)$/i);
  if (!match) {
    return { dice: 0, sides: 6, modifier: 0, suffix: '' };
  }

  return {
    dice: parseInt(match[1] ?? '0', 10),
    sides: parseInt(match[2] ?? '6', 10),
    modifier: parseInt(match[3] ?? '0', 10),
    suffix: match[4]?.trim() ?? '',
  };
}

/**
 * Calculate damage class from dice
 */
export function calculateDamageClass(dice: number, killing: boolean = false): number {
  if (killing) {
    return dice * 3;
  }
  return dice;
}
