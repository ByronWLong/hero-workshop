/**
 * @hero-workshop/shared
 * 
 * Shared types and utilities for Hero Workshop
 */

// Export types first (these are the primary type definitions)
export * from './types.js';
export * from './utils.js';

// Export power definitions, but rename conflicting types
export { 
  ATTACK_POWERS, 
  DEFENSIVE_POWERS, 
  MOVEMENT_POWERS, 
  BODY_AFFECTING_POWERS, 
  SENSORY_POWERS, 
  MENTAL_POWERS, 
  ADJUSTMENT_POWERS, 
  SPECIAL_POWERS, 
  ALL_POWERS,
  getPowerDefinition,
  getPowersByType,
  calculatePowerBaseCost,
  getPowerDisplayName,
  type PowerDefinition,
  type PowerAdder,
  type PowerOption,
  type PowerDuration as PowerDefDuration,
  type PowerRange as PowerDefRange,
  type PowerTarget,
  type PowerDefense,
  type PowerType as PowerDefType,
} from './powerDefinitions.js';

// Export modifier definitions
export { 
  ADVANTAGES, 
  LIMITATIONS, 
  getAllModifiers,
  getModifierByXmlId,
  calculateModifierValue,
  formatModifierValue,
  type ModifierDefinition,
  type ModifierOption,
  type ModifierAdder,
} from './modifierDefinitions.js';
