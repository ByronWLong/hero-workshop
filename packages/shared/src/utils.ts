/**
 * Utility functions shared between frontend and backend
 */

import type { Character, Characteristic, Power, Skill, Disadvantage, Modifier, Adder } from './types.js';

/**
 * HERO System rounding - rounds .5 in the player's favor
 * For costs (lower is better): .5 rounds DOWN
 * For effects/bonuses (higher is better): .5 rounds UP
 */
export function heroRoundCost(value: number): number {
  // For costs, .5 rounds down (player's favor = less cost)
  // Check if the decimal part is exactly .5
  const decimal = value - Math.floor(value);
  if (Math.abs(decimal - 0.5) < 0.0001) {
    return Math.floor(value); // Round down for .5
  }
  return Math.round(value); // Standard rounding otherwise
}

export function heroRoundEffect(value: number): number {
  // For effects/bonuses, .5 rounds up (player's favor = more effect)
  // Check if the decimal part is exactly .5
  const decimal = value - Math.floor(value);
  if (Math.abs(decimal - 0.5) < 0.0001) {
    return Math.ceil(value); // Round up for .5
  }
  return Math.round(value); // Standard rounding otherwise
}

/**
 * Calculate the total active cost of a power including modifiers
 */
export function calculateActiveCost(baseCost: number, modifiers: Modifier[] = []): number {
  const advantageTotal = modifiers
    .filter((m) => m.isAdvantage)
    .reduce((sum, m) => sum + m.value, 0);

  return heroRoundCost(baseCost * (1 + advantageTotal));
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

  return heroRoundCost(activeCost / (1 + limitationTotal));
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

/**
 * Set of characteristic types that can appear as direct powers (in equipment, compound powers, etc.)
 */
export const CHARACTERISTIC_POWER_TYPES = new Set([
  'STR', 'DEX', 'CON', 'INT', 'EGO', 'PRE',
  'OCV', 'DCV', 'OMCV', 'DMCV',
  'SPD', 'PD', 'ED', 'REC', 'END', 'BODY', 'STUN',
  'RUNNING', 'SWIMMING', 'LEAPING'
]);

/**
 * Interface for a stat modification from powers/equipment
 */
export interface StatModification {
  source: string;
  stat: string;
  amount: number;
  active: boolean;
}

/**
 * Calculate all stat modifications from powers and equipment
 * This extracts stat bonuses/penalties from characteristic powers, density increase, growth, etc.
 * This is the single source of truth used by both CharacteristicsTab and EffectiveStatsCard.
 */
export function calculateStatModifications(character: Character): StatModification[] {
  const modifications: StatModification[] = [];
  
  // Process powers
  const powers = character.powers ?? [];
  for (const power of powers) {
    const levels = power.levels ?? 0;
    const powerName = power.alias || power.name;
    const powerType = power.type ?? '';
    
    // Handle direct characteristic powers (STR, DEX, CON, etc.)
    // These can be standalone or inside compound powers (equipment)
    // Only include if affectsPrimary is true (default)
    if (CHARACTERISTIC_POWER_TYPES.has(powerType)) {
      if (power.affectsPrimary !== false) {
        // Find parent power name for better source attribution
        let sourceName = powerName || `+${powerType}`;
        if (power.parentId) {
          const parentPower = powers.find(p => p.id === power.parentId);
          if (parentPower) {
            sourceName = `⚔️ ${parentPower.name || parentPower.alias}`;
          }
        }
        
        modifications.push({
          source: sourceName,
          stat: powerType,
          amount: levels,
          active: true,
        });
      }
      continue; // Skip other processing for characteristic powers
    }
    
    // For non-characteristic powers, check the appropriate flag
    // Powers that affect primary stats (like Density Increase adding STR)
    if (power.affectsPrimary !== false) {
      // Density Increase adds STR, PD, ED, mass
      if (powerType === 'DENSITY_INCREASE' || power.name.toLowerCase().includes('density increase')) {
        modifications.push(
          { source: powerName, stat: 'STR', amount: levels * 5, active: true },
          { source: powerName, stat: 'PD', amount: levels, active: true },
          { source: powerName, stat: 'ED', amount: levels, active: true },
          { source: powerName, stat: 'Mass', amount: levels * 100, active: true }, // Rough kg per level
        );
      }
      
      // Growth adds STR, CON, PD, ED, BODY, STUN, but reduces DCV/OCV, KB
      if (powerType === 'GROWTH' || power.name.toLowerCase().includes('growth')) {
        // Each level = +5 STR, +1 PD, +1 ED, +1 BODY, +2 STUN, -2m KB
        // At certain thresholds: size categories change
        modifications.push(
          { source: powerName, stat: 'STR', amount: levels * 5, active: true },
          { source: powerName, stat: 'CON', amount: levels, active: true },
          { source: powerName, stat: 'PD', amount: levels, active: true },
          { source: powerName, stat: 'ED', amount: levels, active: true },
          { source: powerName, stat: 'BODY', amount: levels, active: true },
          { source: powerName, stat: 'STUN', amount: levels * 2, active: true },
        );
        if (levels >= 6) {
          modifications.push({ source: powerName, stat: 'DCV', amount: -1, active: true });
        }
        if (levels >= 12) {
          modifications.push({ source: powerName, stat: 'DCV', amount: -1, active: true });
        }
      }
      
      // Shrinking reduces perception of character
      if (powerType === 'SHRINKING' || power.name.toLowerCase().includes('shrinking')) {
        modifications.push(
          { source: powerName, stat: 'DCV', amount: Math.floor(levels / 3), active: true },
          { source: powerName, stat: 'Perception', amount: -levels * 2, active: true },
        );
      }
    }
    
    // Powers that affect totals (like rPD/rED) - check affectsTotal
    if (power.affectsTotal !== false) {
      // Resistant Protection / Forcefield
      if (powerType === 'RESISTANT_PROTECTION' || 
          power.name.toLowerCase().includes('resistant protection') ||
          power.name.toLowerCase().includes('forcefield') ||
          power.name.toLowerCase().includes('force field')) {
        // Use pdLevels/edLevels if available, otherwise use levels for both
        const pdLevels = (power as { pdLevels?: number }).pdLevels ?? levels;
        const edLevels = (power as { edLevels?: number }).edLevels ?? levels;
        modifications.push(
          { source: powerName, stat: 'rPD', amount: pdLevels, active: true },
          { source: powerName, stat: 'rED', amount: edLevels, active: true },
        );
      }
      
      // Armor
      if (powerType === 'ARMOR' || power.name.toLowerCase().includes('armor')) {
        const pdLevels = (power as { pdLevels?: number }).pdLevels ?? levels;
        const edLevels = (power as { edLevels?: number }).edLevels ?? levels;
        modifications.push(
          { source: powerName, stat: 'rPD', amount: pdLevels, active: true },
          { source: powerName, stat: 'rED', amount: edLevels, active: true },
        );
      }
    }
    
    // Other defensive powers - check affectsTotal for defenses
    if (power.affectsTotal !== false) {
      // Flash Defense
      if (powerType === 'FLASH_DEFENSE' || power.name.toLowerCase().includes('flash defense')) {
        modifications.push(
          { source: powerName, stat: 'Flash Def', amount: levels, active: true },
        );
      }
      
      // Mental Defense
      if (powerType === 'MENTAL_DEFENSE' || power.name.toLowerCase().includes('mental defense')) {
        modifications.push(
          { source: powerName, stat: 'Mental Def', amount: levels, active: true },
        );
      }
    
      // Power Defense
      if (powerType === 'POWER_DEFENSE' || power.name.toLowerCase().includes('power defense')) {
        modifications.push(
          { source: powerName, stat: 'Power Def', amount: levels, active: true },
        );
      }
      
      // KB Resistance
      if (powerType === 'KNOCKBACK_RESISTANCE' || power.name.toLowerCase().includes('knockback resist')) {
        modifications.push(
          { source: powerName, stat: 'KB Resist', amount: levels, active: true },
        );
      }
      
      // Movement powers
      if (powerType === 'FLIGHT' || power.name.toLowerCase().includes('flight')) {
        modifications.push(
          { source: powerName, stat: 'Flight', amount: levels, active: true },
        );
      }
      if (powerType === 'RUNNING' || power.name.toLowerCase() === 'running') {
        modifications.push(
          { source: powerName, stat: 'Running', amount: levels, active: true },
        );
      }
      if (powerType === 'SWIMMING' || power.name.toLowerCase() === 'swimming') {
        modifications.push(
          { source: powerName, stat: 'Swimming', amount: levels, active: true },
        );
      }
      if (powerType === 'LEAPING' || power.name.toLowerCase() === 'leaping') {
        modifications.push(
          { source: powerName, stat: 'Leaping', amount: levels, active: true },
        );
      }
      if (powerType === 'TELEPORTATION' || power.name.toLowerCase().includes('teleport')) {
        modifications.push(
          { source: powerName, stat: 'Teleport', amount: levels, active: true },
        );
      }
    }
  }
  
  // Process equipment (for carried equipment with powers)
  // Equipment rPD/rED doesn't stack - track highest values separately
  let highestEquipmentRpd = { amount: 0, source: '' };
  let highestEquipmentRed = { amount: 0, source: '' };
  
  const equipment = character.equipment ?? [];
  for (const item of equipment) {
    if (!item.carried) continue;
    
    const itemName = item.name || item.alias || 'Equipment';
    
    // Process subPowers for compound equipment (like Helm of Strength)
    if (item.subPowers && item.subPowers.length > 0) {
      for (const subPower of item.subPowers) {
        // Cast to string for comparison since actual XMLID values may not match PowerType
        const subType = (subPower.type ?? '') as string;
        const subLevels = subPower.levels ?? 0;
        
        // Check if it's a characteristic power (these DO stack)
        // Only include if affectsPrimary is true (default)
        if (CHARACTERISTIC_POWER_TYPES.has(subType)) {
          if (subPower.affectsPrimary !== false) {
            modifications.push({
              source: `⚔️ ${itemName}`,
              stat: subType,
              amount: subLevels,
              active: true,
            });
          }
        }
        
        // Resistant Protection / Forcefield from equipment (doesn't stack - track highest)
        // Use affectsTotal to determine if this should be included in displayed totals
        if (subType === 'FORCEFIELD' || subType === 'RESISTANT_PROTECTION' || subType === 'ARMOR') {
          if (subPower.affectsTotal !== false) {
            // When pdLevels/edLevels aren't explicitly set, divide levels by 2
            // since equipment defensive powers typically split between PD and ED
            const pdLevels = subPower.pdLevels ?? Math.floor(subLevels / 2);
            const edLevels = subPower.edLevels ?? Math.floor(subLevels / 2);
            if (pdLevels > highestEquipmentRpd.amount) {
              highestEquipmentRpd = { amount: pdLevels, source: `⚔️ ${itemName}` };
            }
            if (edLevels > highestEquipmentRed.amount) {
              highestEquipmentRed = { amount: edLevels, source: `⚔️ ${itemName}` };
            }
          }
        }
        
        // Combat values from equipment (already handled by CHARACTERISTIC_POWER_TYPES check above)
      }
    }
    
    // Legacy: Check for defensive equipment by name (for non-compound items)
    if (!item.subPowers || item.subPowers.length === 0) {
      if (!item.activeCost || item.activeCost === 0) continue;
      
      const levels = item.levels ?? 1;
      if (item.name.toLowerCase().includes('armor') || 
          item.name.toLowerCase().includes('protection') ||
          item.name.toLowerCase().includes('shield')) {
        if (levels > highestEquipmentRpd.amount) {
          highestEquipmentRpd = { amount: levels, source: `⚔️ ${itemName}` };
        }
        if (levels > highestEquipmentRed.amount) {
          highestEquipmentRed = { amount: levels, source: `⚔️ ${itemName}` };
        }
      }
    }
  }
  
  // Add only the highest equipment rPD/rED (they don't stack)
  if (highestEquipmentRpd.amount > 0) {
    modifications.push({ source: highestEquipmentRpd.source, stat: 'rPD', amount: highestEquipmentRpd.amount, active: true });
  }
  if (highestEquipmentRed.amount > 0) {
    modifications.push({ source: highestEquipmentRed.source, stat: 'rED', amount: highestEquipmentRed.amount, active: true });
  }
  
  return modifications;
}

/**
 * Get the total modification amount for a specific stat
 */
export function getStatModificationTotal(modifications: StatModification[], stat: string): number {
  return modifications
    .filter(m => m.stat === stat && m.active)
    .reduce((sum, m) => sum + m.amount, 0);
}

/**
 * Calculate effective characteristic value (base + modifications)
 */
export function calculateEffectiveCharacteristic(
  character: Character,
  charType: string,
  modifications?: StatModification[]
): { base: number; effective: number; bonus: number } {
  const char = character.characteristics.find(c => c.type === charType);
  const base = char?.totalValue ?? 0;
  
  const mods = modifications ?? calculateStatModifications(character);
  const bonus = getStatModificationTotal(mods, charType);
  
  return {
    base,
    effective: base + bonus,
    bonus
  };
}
