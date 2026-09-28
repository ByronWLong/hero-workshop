/**
 * @hero-workshop/shared
 * 
 * Shared types and utilities for Hero Workshop
 */

// Export types first (these are the primary type definitions)
export * from './types.js';
export * from './utils.js';
export * from './characteristics.js';

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
  CHARACTERISTIC_POWERS,
  SKILL_LEVEL_POWERS,
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

// Lossless HDC parsing/writing (shared by the backend and the Foundry module)
export * from './hdc/index.js';

// Framework-independent editing operations and view data
export * from './editor/characteristics.js';
export * from './editor/lists.js';
export * from './editor/items.js';
export * from './editor/powers.js';
