/**
 * Hero System 6th Edition Power Definitions
 * 
 * These definitions contain the base costs, durations, ranges, and other properties
 * for all standard HERO System powers as used in Hero Designer.
 */

// ============================================================================
// Type Definitions
// ============================================================================

export type PowerDuration = 'INSTANT' | 'CONSTANT' | 'PERSISTENT' | 'INHERENT';
export type PowerRange = 'SELF' | 'No' | 'Yes' | 'LOS' | 'SPECIAL';
export type PowerTarget = 'SELFONLY' | 'DCV' | 'ECV' | 'OCV' | 'HEX' | 'N/A';
export type PowerDefense = 'NORMAL' | 'MENTAL' | 'POWER' | 'FLASH' | 'NONE';
export type PowerType = 'ATTACK' | 'DEFENSE' | 'MOVEMENT' | 'SENSORY' | 'BODYAFFECTING' | 'ADJUSTMENT' | 'MENTAL' | 'STANDARD' | 'SPECIAL' | 'SIZE' | 'SENSEAFFECTING';

export interface PowerAdder {
  xmlId: string;
  display: string;
  baseCost: number;
  lvlCost?: number;
  lvlVal?: number;
  minVal?: number;
  levelStart?: number;
  exclusive?: boolean;
  required?: boolean;
  includeInBase?: boolean;
  excludes?: string[];
}

export interface PowerOption {
  xmlId: string;
  display: string;
  baseCost: number;
  lvlCost?: number;
  lvlVal?: number;
}

export interface PowerDefinition {
  xmlId: string;
  display: string;
  abbreviation?: string;
  description: string;
  
  // Cost structure
  baseCost: number;
  lvlCost: number;  // Cost per level/die
  lvlVal: number;   // What each level represents (e.g., 1 die, 1 meter, etc.)
  levelStart?: number;
  minVal?: number;
  
  // Power properties
  duration: PowerDuration;
  range: PowerRange;
  target: PowerTarget;
  defense?: PowerDefense;
  types: PowerType[];
  
  // Combat properties
  doesDamage?: boolean;
  doesKnockback?: boolean;
  doesBody?: boolean;
  isKilling?: boolean;
  standardEffectAllowed?: boolean;
  usesEnd?: boolean;
  visible?: boolean;
  continuingEffect?: boolean;
  
  // Special properties
  exclusive?: boolean;
  warningSign?: boolean;
  
  // Available adders
  adders?: PowerAdder[];
  
  // Available options (for powers with choices)
  options?: PowerOption[];
}

// ============================================================================
// Attack Powers
// ============================================================================

export const ATTACK_POWERS: Record<string, PowerDefinition> = {
  ENERGYBLAST: {
    xmlId: 'ENERGYBLAST',
    display: 'Blast',
    description: 'A character with Blast can attack at Range, doing Normal Damage. Examples include a superhero\'s force blast, throwing weapons, magical energy bolts, or blaster rifles.',
    baseCost: 0,
    lvlCost: 5,
    lvlVal: 1,
    levelStart: 1,
    minVal: 0,
    duration: 'INSTANT',
    range: 'Yes',
    target: 'DCV',
    defense: 'NORMAL',
    types: ['STANDARD', 'ATTACK'],
    doesDamage: true,
    doesKnockback: true,
    doesBody: true,
    isKilling: false,
    standardEffectAllowed: true,
    usesEnd: true,
    visible: true,
    adders: [
      { xmlId: 'PLUSONEHALFDIE', display: '+1/2 d6', baseCost: 3, exclusive: true, includeInBase: true, excludes: ['PLUSONEPIP'] },
      { xmlId: 'PLUSONEPIP', display: '+1 pip', baseCost: 2, exclusive: true, includeInBase: true, excludes: ['PLUSONEHALFDIE'] },
      { xmlId: 'ALTERABLEORIGIN', display: 'Alterable Origin Point', baseCost: 5, exclusive: true },
      { xmlId: 'REDUCEDNEGATION', display: 'Reduced Negation', baseCost: 0, lvlCost: 2, lvlVal: 1, minVal: 1, levelStart: 1 },
    ],
  },

  HANDTOHANDATTACK: {
    xmlId: 'HANDTOHANDATTACK',
    display: 'Hand-To-Hand Attack',
    abbreviation: 'HA',
    description: 'Hand-to-Hand Attack adds extra damage dice to a character\'s hand-to-hand combat attacks.',
    baseCost: 0,
    lvlCost: 5,
    lvlVal: 1,
    levelStart: 1,
    minVal: 0,
    duration: 'INSTANT',
    range: 'No',
    target: 'DCV',
    defense: 'NORMAL',
    types: ['STANDARD', 'ATTACK'],
    doesDamage: true,
    doesKnockback: true,
    doesBody: true,
    isKilling: false,
    standardEffectAllowed: true,
    usesEnd: true,
    visible: true,
    adders: [
      { xmlId: 'PLUSONEHALFDIE', display: '+1/2 d6', baseCost: 3, exclusive: true, includeInBase: true, excludes: ['PLUSONEPIP'] },
      { xmlId: 'PLUSONEPIP', display: '+1 pip', baseCost: 2, exclusive: true, includeInBase: true, excludes: ['PLUSONEHALFDIE'] },
    ],
  },

  // Killing Attacks (RKA = Ranged, HKA = Hand-to-Hand)
  RKA: {
    xmlId: 'RKA',
    display: 'Killing Attack - Ranged',
    abbreviation: 'RKA',
    description: 'A Ranged Killing Attack does BODY damage directly, making it more lethal than Normal Damage. Examples include guns, lasers, and magical death rays.',
    baseCost: 0,
    lvlCost: 15,
    lvlVal: 1,
    levelStart: 1,
    minVal: 0,
    duration: 'INSTANT',
    range: 'Yes',
    target: 'DCV',
    defense: 'NORMAL',
    types: ['STANDARD', 'ATTACK'],
    doesDamage: true,
    doesKnockback: true,
    doesBody: true,
    isKilling: true,
    standardEffectAllowed: true,
    usesEnd: true,
    visible: true,
    adders: [
      { xmlId: 'PLUSONEHALFDIE', display: '+1/2 d6', baseCost: 10, exclusive: true, includeInBase: true, excludes: ['PLUSONEPIP', 'MINUSONEPIP'] },
      { xmlId: 'PLUSONEPIP', display: '+1 pip', baseCost: 5, exclusive: true, includeInBase: true, excludes: ['PLUSONEHALFDIE', 'MINUSONEPIP'] },
      { xmlId: 'MINUSONEPIP', display: '+1d6 -1', baseCost: 10, exclusive: true, includeInBase: true, excludes: ['PLUSONEHALFDIE', 'PLUSONEPIP'] },
      { xmlId: 'ALTERABLEORIGIN', display: 'Alterable Origin Point', baseCost: 5, exclusive: true },
      { xmlId: 'REDUCEDNEGATION', display: 'Reduced Negation', baseCost: 0, lvlCost: 2, lvlVal: 1, minVal: 1, levelStart: 1 },
    ],
  },

  HKA: {
    xmlId: 'HKA',
    display: 'Killing Attack - Hand-To-Hand',
    abbreviation: 'HKA',
    description: 'A Hand-to-Hand Killing Attack does BODY damage directly in close combat. Examples include swords, claws, and vibro-blades.',
    baseCost: 0,
    lvlCost: 15,
    lvlVal: 1,
    levelStart: 1,
    minVal: 0,
    duration: 'INSTANT',
    range: 'No',
    target: 'DCV',
    defense: 'NORMAL',
    types: ['STANDARD', 'ATTACK'],
    doesDamage: true,
    doesKnockback: true,
    doesBody: true,
    isKilling: true,
    standardEffectAllowed: true,
    usesEnd: true,
    visible: true,
    adders: [
      { xmlId: 'PLUSONEHALFDIE', display: '+1/2 d6', baseCost: 10, exclusive: true, includeInBase: true, excludes: ['PLUSONEPIP', 'MINUSONEPIP'] },
      { xmlId: 'PLUSONEPIP', display: '+1 pip', baseCost: 5, exclusive: true, includeInBase: true, excludes: ['PLUSONEHALFDIE', 'MINUSONEPIP'] },
      { xmlId: 'MINUSONEPIP', display: '+1d6 -1', baseCost: 10, exclusive: true, includeInBase: true, excludes: ['PLUSONEHALFDIE', 'PLUSONEPIP'] },
      { xmlId: 'ALTERABLEORIGIN', display: 'Alterable Origin Point', baseCost: 5, exclusive: true },
      { xmlId: 'REDUCEDNEGATION', display: 'Reduced Negation', baseCost: 0, lvlCost: 2, lvlVal: 1, minVal: 1, levelStart: 1 },
    ],
  },
  
  DRAIN: {
    xmlId: 'DRAIN',
    display: 'Drain',
    description: 'Drain temporarily reduces a target\'s Characteristics, Powers, or other abilities. The effect fades over time.',
    baseCost: 0,
    lvlCost: 10,
    lvlVal: 1,
    levelStart: 1,
    minVal: 0,
    duration: 'INSTANT',
    range: 'Yes',
    target: 'DCV',
    defense: 'POWER',
    types: ['ADJUSTMENT', 'ATTACK'],
    doesDamage: false,
    doesKnockback: false,
    standardEffectAllowed: true,
    usesEnd: true,
    visible: true,
    continuingEffect: true,
    adders: [
      { xmlId: 'PLUSONEHALFDIE', display: '+1/2 d6', baseCost: 5, exclusive: true, includeInBase: true, excludes: ['PLUSONEPIP'] },
      { xmlId: 'PLUSONEPIP', display: '+1 pip', baseCost: 3, exclusive: true, includeInBase: true, excludes: ['PLUSONEHALFDIE'] },
    ],
  },

  FLASH: {
    xmlId: 'FLASH',
    display: 'Flash',
    description: 'Flash blinds or impairs one or more of a target\'s Sense Groups. The target\'s affected senses are impaired for a number of Segments equal to the dice rolled.',
    baseCost: 0,
    lvlCost: 5,
    lvlVal: 1,
    levelStart: 1,
    minVal: 0,
    duration: 'INSTANT',
    range: 'Yes',
    target: 'DCV',
    defense: 'FLASH',
    types: ['STANDARD', 'ATTACK', 'SENSEAFFECTING'],
    doesDamage: true, // Flash "damage" affects senses
    doesKnockback: false,
    standardEffectAllowed: true,
    usesEnd: true,
    visible: true,
    continuingEffect: true,
    // Flash has special costs for different sense groups
    // TARGETINGCOST: 5 per die for targeting senses
    // NONTARGETINGCOST: 3 per die for nontargeting senses
    adders: [
      { xmlId: 'ALTERABLEORIGIN', display: 'Alterable Origin Point', baseCost: 5, exclusive: true },
    ],
  },

  ENTANGLE: {
    xmlId: 'ENTANGLE',
    display: 'Entangle',
    description: 'Entangle restrains a target, preventing movement and possibly other actions. The target must break free by destroying the Entangle\'s BODY or exceeding its STR.',
    baseCost: 0,
    lvlCost: 10,
    lvlVal: 1,
    levelStart: 1,
    minVal: 0,
    duration: 'INSTANT',
    range: 'Yes',
    target: 'DCV',
    types: ['STANDARD', 'ATTACK'],
    standardEffectAllowed: true,
    usesEnd: true,
    visible: true,
    continuingEffect: true,
    adders: [
      { xmlId: 'PLUSONEHALFDIE', display: '+1/2 d6', baseCost: 5, exclusive: true, includeInBase: true },
      { xmlId: 'DISMISSABLE', display: 'Dismissable', baseCost: 5, exclusive: true },
      { xmlId: 'ALTERABLEORIGIN', display: 'Alterable Origin Point', baseCost: 5, exclusive: true },
    ],
  },

  EGOATTACK: {
    xmlId: 'EGOATTACK',
    display: 'Mental Blast',
    description: 'Mental Blast directly attacks another character\'s mind to cause STUN damage. Examples include pain infliction, induced sleep, or harmful mental feedback.',
    baseCost: 0,
    lvlCost: 10,
    lvlVal: 1,
    levelStart: 1,
    minVal: 0,
    duration: 'INSTANT',
    range: 'LOS',
    target: 'ECV',
    defense: 'MENTAL',
    types: ['MENTAL'],
    doesDamage: true,
    doesKnockback: false,
    standardEffectAllowed: true,
    usesEnd: true,
    visible: true,
    adders: [
      { xmlId: 'PLUSONEHALFDIE', display: '+1/2 d6', baseCost: 5, exclusive: true, includeInBase: true, excludes: ['PLUSONEPIP'] },
      { xmlId: 'PLUSONEPIP', display: '+1 pip', baseCost: 3, exclusive: true, includeInBase: true, excludes: ['PLUSONEHALFDIE'] },
    ],
  },

  TRANSFORM: {
    xmlId: 'TRANSFORM',
    display: 'Transform',
    description: 'Transform changes one thing into another - a person into a frog, a car into a pile of rust, or air into poison gas.',
    baseCost: 0,
    lvlCost: 5, // Minor Transform is 5/die, Major is 10/die, Severe is 15/die
    lvlVal: 1,
    levelStart: 1,
    minVal: 0,
    duration: 'INSTANT',
    range: 'Yes',
    target: 'DCV',
    defense: 'POWER',
    types: ['STANDARD', 'ATTACK'],
    doesDamage: true,
    standardEffectAllowed: true,
    usesEnd: true,
    visible: true,
    continuingEffect: true,
    warningSign: true,
    adders: [
      { xmlId: 'ALTERABLEORIGIN', display: 'Alterable Origin Point', baseCost: 5, exclusive: true },
      { xmlId: 'REDUCEDNEGATION', display: 'Reduced Negation', baseCost: 0, lvlCost: 2, lvlVal: 1, minVal: 1, levelStart: 1 },
    ],
  },

  DISPEL: {
    xmlId: 'DISPEL',
    display: 'Dispel',
    description: 'Dispel turns off another character\'s powers. Examples include spells designed to disrupt other spells, or the ability to destroy gadgets.',
    baseCost: 0,
    lvlCost: 3,
    lvlVal: 1,
    levelStart: 1,
    minVal: 0,
    duration: 'INSTANT',
    range: 'Yes',
    target: 'DCV',
    defense: 'POWER',
    types: ['STANDARD', 'ATTACK'],
    usesEnd: true,
    visible: true,
    continuingEffect: true,
    adders: [
      { xmlId: 'PLUSONEHALFDIE', display: '+1/2 d6', baseCost: 1.5, exclusive: true, includeInBase: true, excludes: ['PLUSONEPIP'] },
      { xmlId: 'PLUSONEPIP', display: '+1 pip', baseCost: 1, exclusive: true, includeInBase: true, excludes: ['PLUSONEHALFDIE'] },
    ],
  },
};

// ============================================================================
// Defensive Powers
// ============================================================================

export const DEFENSIVE_POWERS: Record<string, PowerDefinition> = {
  FORCEFIELD: {
    xmlId: 'FORCEFIELD',
    display: 'Resistant Protection',
    description: 'Resistant Protection provides a character with points of Resistant Defense against Physical and Energy attacks.',
    baseCost: 0,
    lvlCost: 3,
    lvlVal: 2, // 3 points per 2 DEF
    duration: 'PERSISTENT',
    range: 'No',
    target: 'SELFONLY',
    types: ['STANDARD', 'DEFENSE'],
    usesEnd: false,
    visible: true,
    adders: [
      { 
        xmlId: 'FLASHDEFENSE', 
        display: 'Flash Defense', 
        baseCost: 0, 
        lvlCost: 3, 
        lvlVal: 2,
        levelStart: 1,
        minVal: 1,
        includeInBase: true 
      },
    ],
  },

  MENTALDEFENSE: {
    xmlId: 'MENTALDEFENSE',
    display: 'Mental Defense',
    abbreviation: 'MD',
    description: 'Mental Defense provides resistance to Mental Attacks - the character can withstand some effects of Mental Powers.',
    baseCost: 0,
    lvlCost: 1,
    lvlVal: 1,
    levelStart: 1,
    minVal: 1,
    duration: 'PERSISTENT',
    range: 'SELF',
    target: 'SELFONLY',
    types: ['SPECIAL', 'DEFENSE'],
    usesEnd: false,
  },

  POWERDEFENSE: {
    xmlId: 'POWERDEFENSE',
    display: 'Power Defense',
    abbreviation: 'PowD',
    description: 'Power Defense provides resistance to Drains, Transfers, Transforms, and related attacks.',
    baseCost: 0,
    lvlCost: 1,
    lvlVal: 1,
    levelStart: 1,
    minVal: 1,
    duration: 'PERSISTENT',
    range: 'No',
    target: 'SELFONLY',
    types: ['SPECIAL', 'DEFENSE'],
    usesEnd: false,
  },

  FLASHDEFENSE: {
    xmlId: 'FLASHDEFENSE',
    display: 'Flash Defense',
    description: 'Flash Defense reduces the effect of Flash attacks against the character\'s senses.',
    baseCost: 0,
    lvlCost: 1,
    lvlVal: 1,
    levelStart: 1,
    minVal: 1,
    duration: 'PERSISTENT',
    range: 'SELF',
    target: 'SELFONLY',
    types: ['SPECIAL', 'DEFENSE'],
    usesEnd: false,
  },

  KBRESISTANCE: {
    xmlId: 'KBRESISTANCE',
    display: 'Knockback Resistance',
    description: 'Knockback Resistance reduces both the meters traveled and the amount of damage done by Knockback.',
    baseCost: 0,
    lvlCost: 1,
    lvlVal: 1, // -1m KB per point
    levelStart: 1,
    minVal: 1,
    duration: 'PERSISTENT',
    range: 'No',
    target: 'SELFONLY',
    types: ['SPECIAL', 'DEFENSE'],
    usesEnd: false,
  },

  DAMAGENEGATION: {
    xmlId: 'DAMAGENEGATION',
    display: 'Damage Negation',
    description: 'Damage Negation reduces the damage of attacks made against the character by reducing the number of Damage Classes.',
    baseCost: 0,
    lvlCost: 5, // Cost depends on type (Physical/Energy/Mental)
    lvlVal: 1,
    duration: 'PERSISTENT',
    range: 'SELF',
    target: 'SELFONLY',
    types: ['STANDARD', 'DEFENSE'],
    usesEnd: false,
    warningSign: true,
    adders: [
      { xmlId: 'PHYSICAL', display: 'Physical DCs', baseCost: 0, lvlCost: 5, lvlVal: 1, minVal: 0, required: true },
      { xmlId: 'ENERGY', display: 'Energy DCs', baseCost: 0, lvlCost: 5, lvlVal: 1, minVal: 0, required: true },
      { xmlId: 'MENTAL', display: 'Mental DCs', baseCost: 0, lvlCost: 5, lvlVal: 1, minVal: 0 },
    ],
  },

  DAMAGEREDUCTION: {
    xmlId: 'DAMAGEREDUCTION',
    display: 'Damage Reduction',
    description: 'Damage Reduction reduces damage from attacks by a percentage.',
    baseCost: 10, // Starting cost for 25% reduction
    lvlCost: 0,
    lvlVal: 0,
    duration: 'PERSISTENT',
    range: 'SELF',
    target: 'SELFONLY',
    types: ['STANDARD', 'DEFENSE'],
    usesEnd: false,
    warningSign: true,
    options: [
      { xmlId: 'LVL25NORMAL', display: 'Damage Reduction, 25%', baseCost: 10 },
      { xmlId: 'LVL25RESISTANT', display: 'Damage Reduction, Resistant, 25%', baseCost: 15 },
      { xmlId: 'LVL25MENTAL', display: 'Mental Damage Reduction, 25%', baseCost: 15 },
      { xmlId: 'LVL50NORMAL', display: 'Damage Reduction, 50%', baseCost: 20 },
      { xmlId: 'LVL50RESISTANT', display: 'Damage Reduction, Resistant, 50%', baseCost: 30 },
      { xmlId: 'LVL50MENTAL', display: 'Mental Damage Reduction, 50%', baseCost: 30 },
      { xmlId: 'LVL75NORMAL', display: 'Damage Reduction, 75%', baseCost: 40 },
      { xmlId: 'LVL75RESISTANT', display: 'Damage Reduction, Resistant, 75%', baseCost: 60 },
      { xmlId: 'LVL75MENTAL', display: 'Mental Damage Reduction, 75%', baseCost: 60 },
    ],
  },

  MISSILEDEFLECTION: {
    xmlId: 'MISSILEDEFLECTION',
    display: 'Deflection',
    description: 'Deflection allows a character to block or avoid incoming Ranged attacks.',
    baseCost: 20,
    lvlCost: 0,
    lvlVal: 0,
    duration: 'INSTANT',
    range: 'Yes',
    target: 'OCV',
    types: ['STANDARD', 'DEFENSE'],
    usesEnd: true,
    warningSign: true,
  },

  FORCEWALL: {
    xmlId: 'FORCEWALL',
    display: 'Barrier',
    description: 'Barrier creates a defensive wall. Examples include protective screens of energy, force domes, or walls of enchanted fire.',
    baseCost: 3,
    lvlCost: 3,
    lvlVal: 2,
    duration: 'INSTANT',
    range: 'Yes',
    target: 'HEX',
    types: ['STANDARD', 'DEFENSE'],
    usesEnd: true,
    visible: true,
    continuingEffect: true,
  },
};

// ============================================================================
// Movement Powers
// ============================================================================

export const MOVEMENT_POWERS: Record<string, PowerDefinition> = {
  RUNNING: {
    xmlId: 'RUNNING',
    display: 'Running',
    description: 'Running is a character\'s ground movement rate.',
    baseCost: 0,
    lvlCost: 1,
    lvlVal: 1, // 1m per point
    levelStart: 0, // Added to base of 12m
    minVal: 0,
    duration: 'CONSTANT',
    range: 'SELF',
    target: 'SELFONLY',
    types: ['MOVEMENT'],
    usesEnd: true,
    visible: true,
    adders: [
      { xmlId: 'IMPROVEDNONCOMBAT', display: 'x[LVL] Noncombat', baseCost: 0, lvlCost: 5, lvlVal: 1, levelStart: 1, minVal: 1 },
    ],
  },

  SWIMMING: {
    xmlId: 'SWIMMING',
    display: 'Swimming',
    description: 'Swimming is a character\'s movement rate in water or other liquids.',
    baseCost: 0,
    lvlCost: 1,
    lvlVal: 2, // 2m per point
    levelStart: 0, // Added to base of 4m
    minVal: 0,
    duration: 'CONSTANT',
    range: 'SELF',
    target: 'SELFONLY',
    types: ['MOVEMENT'],
    usesEnd: true,
    visible: true,
    adders: [
      { xmlId: 'IMPROVEDNONCOMBAT', display: 'x[LVL] Noncombat', baseCost: 0, lvlCost: 5, lvlVal: 1, levelStart: 1, minVal: 1 },
    ],
  },

  LEAPING: {
    xmlId: 'LEAPING',
    display: 'Leaping',
    description: 'Leaping is a character\'s ability to leap long distances.',
    baseCost: 0,
    lvlCost: 1,
    lvlVal: 2, // 2m per point
    levelStart: 0, // Added to base of 4m
    minVal: 0,
    duration: 'CONSTANT',
    range: 'SELF',
    target: 'SELFONLY',
    types: ['MOVEMENT'],
    usesEnd: true,
    visible: true,
    adders: [
      { xmlId: 'ACCURATE', display: 'Accurate', baseCost: 5 },
    ],
  },

  FLIGHT: {
    xmlId: 'FLIGHT',
    display: 'Flight',
    description: 'Flight allows a character to fly through the air, vacuum, space, or most other three-dimensional environments.',
    baseCost: 0,
    lvlCost: 1,
    lvlVal: 1, // 1m per point
    levelStart: 1,
    minVal: 1,
    duration: 'CONSTANT',
    range: 'SELF',
    target: 'SELFONLY',
    types: ['MOVEMENT'],
    usesEnd: true,
    visible: true,
    adders: [
      { xmlId: 'IMPROVEDNONCOMBAT', display: 'x[LVL] Noncombat', baseCost: 0, lvlCost: 5, lvlVal: 1, levelStart: 1, minVal: 1 },
    ],
  },

  TELEPORTATION: {
    xmlId: 'TELEPORTATION',
    display: 'Teleportation',
    description: 'Teleportation allows instant movement from one location to another.',
    baseCost: 0,
    lvlCost: 1,
    lvlVal: 1, // 1m per point
    levelStart: 1,
    minVal: 1,
    duration: 'INSTANT',
    range: 'No',
    target: 'SELFONLY',
    types: ['MOVEMENT'],
    usesEnd: true,
    visible: true,
    adders: [
      { xmlId: 'INCREASEDMASS', display: 'x[LVL] Increased Mass', baseCost: 0, lvlCost: 5, lvlVal: 1, levelStart: 1, minVal: 1, exclusive: true },
      { xmlId: 'POSITIONSHIFT', display: 'Position Shift', baseCost: 5, exclusive: true },
      { xmlId: 'NORELATIVEVELOCITY', display: 'No Relative Velocity', baseCost: 10, exclusive: true },
    ],
  },

  TUNNELING: {
    xmlId: 'TUNNELING',
    display: 'Tunneling',
    description: 'Tunneling allows a character to move through solid matter.',
    baseCost: 2, // Base 2 for 1m + DEF to tunnel through
    lvlCost: 1,
    lvlVal: 1, // 1m per point
    levelStart: 1,
    minVal: 1,
    duration: 'CONSTANT',
    range: 'SELF',
    target: 'SELFONLY',
    types: ['MOVEMENT'],
    usesEnd: true,
    visible: true,
    adders: [
      { xmlId: 'IMPROVEDNONCOMBAT', display: 'x[LVL] Noncombat', baseCost: 0, lvlCost: 5, lvlVal: 1, levelStart: 1, minVal: 1 },
      { xmlId: 'DEFBONUS', display: '+[LVL] PD', baseCost: 0, lvlCost: 2, lvlVal: 1, levelStart: 1, minVal: 1, includeInBase: true, exclusive: true },
      { xmlId: 'FILLIN', display: 'Fill In', baseCost: 10, exclusive: true },
    ],
  },

  SWINGING: {
    xmlId: 'SWINGING',
    display: 'Swinging',
    description: 'Swinging allows a character to swing great distances from a line.',
    baseCost: 0,
    lvlCost: 1,
    lvlVal: 2, // 2m per point
    levelStart: 1,
    minVal: 1,
    duration: 'CONSTANT',
    range: 'SELF',
    target: 'SELFONLY',
    types: ['MOVEMENT'],
    usesEnd: true,
    visible: true,
    adders: [
      { xmlId: 'IMPROVEDNONCOMBAT', display: 'x[LVL] Noncombat', baseCost: 0, lvlCost: 5, lvlVal: 1, levelStart: 1, minVal: 1 },
    ],
  },
};

// ============================================================================
// Body-Affecting Powers
// ============================================================================

export const BODY_AFFECTING_POWERS: Record<string, PowerDefinition> = {
  GROWTH: {
    xmlId: 'GROWTH',
    display: 'Growth',
    description: 'Growth increases a character\'s size, providing bonuses to STR, BODY, STUN, and other attributes.',
    baseCost: 25, // Large size base cost
    lvlCost: 0,
    lvlVal: 0,
    duration: 'CONSTANT',
    range: 'SELF',
    target: 'SELFONLY',
    types: ['SIZE', 'BODYAFFECTING'],
    usesEnd: true,
    visible: true,
    exclusive: true,
    options: [
      { xmlId: 'LARGE', display: 'Large', baseCost: 25 },
      { xmlId: 'ENORMOUS', display: 'Enormous', baseCost: 50 },
      { xmlId: 'HUGE', display: 'Huge', baseCost: 90 },
      { xmlId: 'GIGANTIC', display: 'Gigantic', baseCost: 120 },
      { xmlId: 'GARGANTUAN', display: 'Gargantuan', baseCost: 150 },
      { xmlId: 'COLOSSAL', display: 'Colossal', baseCost: 215 },
    ],
  },

  SHRINKING: {
    xmlId: 'SHRINKING',
    display: 'Shrinking',
    description: 'Shrinking decreases a character\'s size, making them harder to hit but also reducing their reach.',
    baseCost: 0,
    lvlCost: 6, // 6 points per level of shrinking
    lvlVal: 1,
    levelStart: 1,
    minVal: 1,
    duration: 'CONSTANT',
    range: 'SELF',
    target: 'SELFONLY',
    types: ['SIZE', 'BODYAFFECTING'],
    usesEnd: true,
    visible: true,
    exclusive: true,
    // Each level: +2 DCV, -2 to PER rolls to perceive, KB x6, mass x.125
  },

  DENSITYINCREASE: {
    xmlId: 'DENSITYINCREASE',
    display: 'Density Increase',
    abbreviation: 'DI',
    description: 'Density Increase allows a character to increase their density, becoming stronger and tougher while gaining mass.',
    baseCost: 0,
    lvlCost: 4, // 4 points per level
    lvlVal: 1,
    levelStart: 1,
    minVal: 1,
    duration: 'CONSTANT',
    range: 'SELF',
    target: 'SELFONLY',
    types: ['STANDARD', 'BODYAFFECTING'],
    usesEnd: true,
    visible: false,
    exclusive: true,
    // Each level: +5 STR, +1 PD, +1 ED, -1m KB, mass x2
  },

  DESOLIDIFICATION: {
    xmlId: 'DESOLIDIFICATION',
    display: 'Desolidification',
    description: 'Desolidification allows a character to become intangible, walking through walls and ignoring most attacks.',
    baseCost: 40,
    lvlCost: 0,
    lvlVal: 0,
    duration: 'CONSTANT',
    range: 'SELF',
    target: 'SELFONLY',
    types: ['STANDARD', 'BODYAFFECTING'],
    usesEnd: true,
    visible: true,
    exclusive: true,
    warningSign: true,
  },

  STRETCHING: {
    xmlId: 'STRETCHING',
    display: 'Stretching',
    description: 'Stretching allows a character to extend their limbs and body to reach further.',
    baseCost: 0,
    lvlCost: 1,
    lvlVal: 1, // 1m per point
    levelStart: 1,
    minVal: 1,
    duration: 'CONSTANT',
    range: 'SELF',
    target: 'SELFONLY',
    types: ['STANDARD', 'BODYAFFECTING'],
    usesEnd: true,
    visible: true,
    adders: [
      { xmlId: 'NONCOMBAT', display: 'x[LVL] Noncombat', baseCost: 0, lvlCost: 5, lvlVal: 1, levelStart: 1, minVal: 1, exclusive: true },
      { xmlId: 'DIMENSIONS', display: 'x[LVL] body dimension', baseCost: 0, lvlCost: 5, lvlVal: 1, includeInBase: true },
    ],
  },

  EXTRALIMBS: {
    xmlId: 'EXTRALIMBS',
    display: 'Extra Limbs',
    description: 'Extra Limbs provides one or more usable extra limbs such as a prehensile tail, extra arms, or tentacles.',
    baseCost: 5,
    lvlCost: 0,
    lvlVal: 1, // Number of limbs
    levelStart: 1,
    minVal: 1,
    duration: 'PERSISTENT',
    range: 'SELF',
    target: 'SELFONLY',
    types: ['SPECIAL', 'BODYAFFECTING'],
    usesEnd: false,
    visible: true,
  },

  MULTIFORM: {
    xmlId: 'MULTIFORM',
    display: 'Multiform',
    description: 'Multiform allows a character to change into one or more alternate forms with different abilities.',
    baseCost: 0,
    lvlCost: 1,
    lvlVal: 5, // 1 point per 5 character points in alternate form
    levelStart: 50,
    minVal: 0,
    duration: 'PERSISTENT',
    range: 'SELF',
    target: 'SELFONLY',
    types: ['STANDARD', 'BODYAFFECTING'],
    usesEnd: false,
  },

  DUPLICATION: {
    xmlId: 'DUPLICATION',
    display: 'Duplication',
    description: 'Duplication allows a character to create duplicates of themselves.',
    baseCost: 0,
    lvlCost: 1,
    lvlVal: 5, // 1 point per 5 character points in duplicate
    duration: 'PERSISTENT',
    range: 'SELF',
    target: 'SELFONLY',
    types: ['SPECIAL', 'BODYAFFECTING'],
    usesEnd: false,
    exclusive: true,
    warningSign: true,
    adders: [
      { xmlId: 'HALFPHASERECOMBINATION', display: 'Half Phase Recombination', baseCost: 5 },
    ],
  },

  SHAPESHIFT: {
    xmlId: 'SHAPESHIFT',
    display: 'Shape Shift',
    description: 'Shape Shift allows a character to alter their appearance, but not their actual capabilities.',
    baseCost: 0,
    lvlCost: 0,
    lvlVal: 0,
    duration: 'CONSTANT',
    range: 'No',
    target: 'SELFONLY',
    types: ['STANDARD', 'BODYAFFECTING'],
    usesEnd: true,
    visible: true,
    // Cost varies based on sight group and variety of shapes
    adders: [
      { xmlId: 'SHAPES', display: 'Variety of Shapes', baseCost: 3, exclusive: true, includeInBase: true },
    ],
    options: [
      { xmlId: '4', display: 'four (max) shapes', baseCost: 3 },
      { xmlId: 'LIMITED', display: 'limited group of shapes', baseCost: 5 },
      { xmlId: 'ANY', display: 'any shape', baseCost: 10 },
    ],
  },
};

// ============================================================================
// Sensory Powers
// ============================================================================

export const SENSORY_POWERS: Record<string, PowerDefinition> = {
  ENHANCEDSENSES: {
    xmlId: 'ENHANCEDSENSES',
    display: 'Enhanced Senses',
    description: 'Enhanced Senses grants improved perception capabilities beyond normal human senses. Includes abilities like Nightvision, Ultrasonic Perception, Infrared Vision, and more.',
    baseCost: 0,
    lvlCost: 5,
    lvlVal: 1,
    levelStart: 0,
    minVal: 0,
    duration: 'PERSISTENT',
    range: 'SELF',
    target: 'SELFONLY',
    types: ['STANDARD', 'SENSORY'],
    usesEnd: false,
    adders: [
      // Sense types (costs from Main6E.hdt)
      { xmlId: 'NIGHTVISION', display: 'Nightvision', baseCost: 5 },
      { xmlId: 'INFRAREDPERCEPTION', display: 'Infrared Perception', baseCost: 5 },
      { xmlId: 'ULTRAVIOLETPERCEPTION', display: 'Ultraviolet Perception', baseCost: 5 },
      { xmlId: 'ULTRASONICPERCEPTION', display: 'Ultrasonic Perception', baseCost: 3 },
      { xmlId: 'RADAR', display: 'Radar', baseCost: 15 },
      { xmlId: 'ACTIVESONAR', display: 'Active Sonar', baseCost: 15 },
      { xmlId: 'SPATIALAWARENESS', display: 'Spatial Awareness', baseCost: 32 },
      { xmlId: 'MENTALAWARENESS', display: 'Mental Awareness', baseCost: 5 },
      { xmlId: 'HRRP', display: 'High Range Radio Perception', baseCost: 12 },
      { xmlId: 'RADIOPERCEPTION', display: 'Radio Perception', baseCost: 8 },
      { xmlId: 'RADIOPERCEIVETRANSMIT', display: 'Radio Perception/Transmission', baseCost: 10 },
      { xmlId: 'CLAIRSENTIENCE', display: 'Clairsentience', baseCost: 20 },
      // Sense modifiers (costs vary by scope - using SENSECOST as default)
      { xmlId: 'DISCRIMINATORY', display: 'Discriminatory', baseCost: 5 },
      { xmlId: 'ANALYZESENSE', display: 'Analyze', baseCost: 5 },
      { xmlId: 'RAPID', display: 'Rapid', baseCost: 5, lvlCost: 5, lvlVal: 1 },
      { xmlId: 'TARGETINGSENSE', display: 'Targeting', baseCost: 10 },
      { xmlId: 'RANGE', display: 'Range', baseCost: 5 },
      { xmlId: 'TELESCOPIC', display: 'Telescopic', baseCost: 0, lvlCost: 1, lvlVal: 2, minVal: 1 },
      { xmlId: 'MICROSCOPIC', display: 'Microscopic', baseCost: 0, lvlCost: 3, lvlVal: 1, minVal: 1 },
      { xmlId: 'INCREASEDARC240', display: 'Increased Arc Of Perception (240 Degrees)', baseCost: 2 },
      { xmlId: 'INCREASEDARC360', display: 'Increased Arc Of Perception (360 Degrees)', baseCost: 5 },
      { xmlId: 'TRANSMIT', display: 'Transmit', baseCost: 5 },
      { xmlId: 'TRACKINGSCENT', display: 'Tracking Scent', baseCost: 5 },
      { xmlId: 'PENETRATIVE', display: 'Penetrative', baseCost: 10 },
      { xmlId: 'PARTIALLYPENETRATIVE', display: 'Partially Penetrative', baseCost: 5 },
      { xmlId: 'ENHANCEDPERCEPTION', display: 'Enhanced Perception', baseCost: 0, lvlCost: 1, lvlVal: 1, minVal: 1 },
    ],
  },

  NIGHTVISION: {
    xmlId: 'NIGHTVISION',
    display: 'Nightvision',
    description: 'The character can see in low-light conditions without penalty.',
    baseCost: 5,
    lvlCost: 0,
    lvlVal: 0,
    duration: 'PERSISTENT',
    range: 'SELF',
    target: 'SELFONLY',
    types: ['STANDARD', 'SENSORY'],
    usesEnd: false,
    adders: [
      { xmlId: 'TELESCOPIC', display: '+[LVL] vs Range Modifier', baseCost: 0, lvlCost: 1, lvlVal: 2, minVal: 1 },
      { xmlId: 'INCREASEDARC240', display: 'Increased Arc Of Perception (240 Degrees)', baseCost: 2 },
      { xmlId: 'INCREASEDARC360', display: 'Increased Arc Of Perception (360 Degrees)', baseCost: 5 },
    ],
  },

  INFRAREDPERCEPTION: {
    xmlId: 'INFRAREDPERCEPTION',
    display: 'Infrared Perception',
    abbreviation: 'IR Perception',
    description: 'The character can perceive heat patterns and traces, but can only perceive the outline of people and objects.',
    baseCost: 5,
    lvlCost: 0,
    lvlVal: 0,
    duration: 'PERSISTENT',
    range: 'SELF',
    target: 'SELFONLY',
    types: ['SPECIAL', 'SENSORY'],
    usesEnd: false,
  },

  ULTRAVIOLETPERCEPTION: {
    xmlId: 'ULTRAVIOLETPERCEPTION',
    display: 'Ultraviolet Perception',
    abbreviation: 'UV Perception',
    description: 'The character can perceive ultraviolet light. He perceives as well at night as during the day, provided there is a source of UV light such as the moon or stars.',
    baseCost: 5,
    lvlCost: 0,
    lvlVal: 0,
    duration: 'PERSISTENT',
    range: 'SELF',
    target: 'SELFONLY',
    types: ['SPECIAL', 'SENSORY'],
    usesEnd: false,
  },

  ULTRASONICPERCEPTION: {
    xmlId: 'ULTRASONICPERCEPTION',
    display: 'Ultrasonic Perception',
    description: 'The character can perceive very high and low frequency sounds, such as dog whistles or Active Sonar.',
    baseCost: 3,
    lvlCost: 0,
    lvlVal: 0,
    duration: 'PERSISTENT',
    range: 'SELF',
    target: 'SELFONLY',
    types: ['SPECIAL', 'SENSORY'],
    usesEnd: false,
  },

  RADAR: {
    xmlId: 'RADAR',
    display: 'Radar',
    description: 'A character with Radar can sense nearby objects by emitting radio waves which bounce off those objects and return to him.',
    baseCost: 15,
    lvlCost: 0,
    lvlVal: 0,
    duration: 'PERSISTENT',
    range: 'SELF',
    target: 'SELFONLY',
    types: ['SPECIAL', 'SENSORY'],
    usesEnd: false,
  },

  ACTIVESONAR: {
    xmlId: 'ACTIVESONAR',
    display: 'Active Sonar',
    description: 'A character with Active Sonar can sense nearby objects by emitting high-frequency sound which bounces off those objects and returns to him.',
    baseCost: 15,
    lvlCost: 0,
    lvlVal: 0,
    duration: 'PERSISTENT',
    range: 'SELF',
    target: 'SELFONLY',
    types: ['SPECIAL', 'SENSORY'],
    usesEnd: false,
  },

  SPATIALAWARENESS: {
    xmlId: 'SPATIALAWARENESS',
    display: 'Spatial Awareness',
    description: 'The character may sense his surroundings without having any contact with them. It can simulate a wide variety of senses from "mystical awareness" to passive sonar to molecular analysis.',
    baseCost: 32,
    lvlCost: 0,
    lvlVal: 0,
    duration: 'PERSISTENT',
    range: 'SELF',
    target: 'SELFONLY',
    types: ['SPECIAL', 'SENSORY'],
    usesEnd: false,
  },

  MENTALAWARENESS: {
    xmlId: 'MENTALAWARENESS',
    display: 'Mental Awareness',
    description: 'The character can perceive the use of Mental Powers within his Line of Sight. He can perceive the user and target of a Mental Power, but not the type of Mental Power.',
    baseCost: 5,
    lvlCost: 0,
    lvlVal: 0,
    duration: 'PERSISTENT',
    range: 'SELF',
    target: 'SELFONLY',
    types: ['SPECIAL', 'SENSORY'],
    usesEnd: false,
  },

  HRRP: {
    xmlId: 'HRRP',
    display: 'High Range Radio Perception',
    abbreviation: 'HRRP',
    description: 'The character can perceive and transmit along the entire broadcast spectrum, from radio to television to cellular phone transmissions; HRRP also allows him to sense radar emissions.',
    baseCost: 12,
    lvlCost: 0,
    lvlVal: 0,
    duration: 'PERSISTENT',
    range: 'SELF',
    target: 'SELFONLY',
    types: ['SPECIAL', 'SENSORY'],
    usesEnd: false,
  },

  RADIOPERCEPTION: {
    xmlId: 'RADIOPERCEPTION',
    display: 'Radio Perception',
    description: 'The character can perceive local AM, FM, and police-band radio signals.',
    baseCost: 8,
    lvlCost: 0,
    lvlVal: 0,
    duration: 'PERSISTENT',
    range: 'SELF',
    target: 'SELFONLY',
    types: ['SPECIAL', 'SENSORY'],
    usesEnd: false,
  },

  RADIOPERCEIVETRANSMIT: {
    xmlId: 'RADIOPERCEIVETRANSMIT',
    display: 'Radio Perception/Transmission',
    description: 'The character can perceive and transmit local AM, FM, and police-band radio signals.',
    baseCost: 10,
    lvlCost: 0,
    lvlVal: 0,
    duration: 'PERSISTENT',
    range: 'SELF',
    target: 'SELFONLY',
    types: ['SPECIAL', 'SENSORY'],
    usesEnd: false,
  },

  CLAIRSENTIENCE: {
    xmlId: 'CLAIRSENTIENCE',
    display: 'Clairsentience',
    description: 'Clairsentience allows a character to use senses at a distance, and sometimes to perceive the future or past.',
    baseCost: 20,
    lvlCost: 0,
    lvlVal: 0,
    duration: 'CONSTANT',
    range: 'Yes',
    target: 'HEX',
    types: ['STANDARD', 'SENSORY'],
    usesEnd: true,
    visible: false,
    warningSign: true,
    adders: [
      { xmlId: 'INCREASEDRANGE', display: 'x[LVL] Range', baseCost: 0, lvlCost: 5, lvlVal: 1 },
    ],
  },

  IMAGES: {
    xmlId: 'IMAGES',
    display: 'Images',
    description: 'Images creates illusory sensory impressions. The more senses affected, the more convincing the illusion.',
    baseCost: 10,
    lvlCost: 0,
    lvlVal: 0,
    duration: 'CONSTANT',
    range: 'Yes',
    target: 'HEX',
    types: ['STANDARD', 'ATTACK', 'SENSEAFFECTING'],
    usesEnd: true,
    visible: true,
    // Cost varies based on sense groups affected
    adders: [
      { xmlId: 'ALTERABLEORIGIN', display: 'Alterable Origin Point', baseCost: 5, exclusive: true },
      { xmlId: 'REDUCEDNEGATION', display: 'Reduced Negation', baseCost: 0, lvlCost: 2, lvlVal: 1, minVal: 1, levelStart: 1 },
    ],
  },

  INVISIBILITY: {
    xmlId: 'INVISIBILITY',
    display: 'Invisibility',
    description: 'Invisibility makes a character invisible to one or more Sense Groups.',
    baseCost: 20, // Base cost for Sight Group
    lvlCost: 0,
    lvlVal: 0,
    duration: 'CONSTANT',
    range: 'SELF',
    target: 'SELFONLY',
    types: ['STANDARD', 'SENSEAFFECTING'],
    usesEnd: true,
    visible: false,
    // Additional sense groups cost extra
  },

  DETECT: {
    xmlId: 'DETECT',
    display: 'Detect',
    description: 'Detect allows the character to perceive something specific - gold, minds, magic, etc.',
    baseCost: 3, // Base for a single thing
    lvlCost: 1,
    lvlVal: 1,
    levelStart: 0,
    minVal: 0,
    duration: 'PERSISTENT',
    range: 'SELF',
    target: 'SELFONLY',
    types: ['SPECIAL', 'SENSORY'],
    usesEnd: false,
    options: [
      { xmlId: 'SINGLE', display: 'A Single Thing', baseCost: 3, lvlCost: 1, lvlVal: 1 },
      { xmlId: 'CLASS', display: 'A Class Of Things', baseCost: 5, lvlCost: 1, lvlVal: 1 },
      { xmlId: 'LARGECLASS', display: 'A Large Class Of Things', baseCost: 8, lvlCost: 1, lvlVal: 1 },
    ],
  },

  DARKNESS: {
    xmlId: 'DARKNESS',
    display: 'Darkness',
    description: 'Darkness creates an area where one or more Sense Groups cannot perceive.',
    baseCost: 0,
    lvlCost: 5, // Per 1m radius for Sight Group
    lvlVal: 1,
    levelStart: 1,
    minVal: 1,
    duration: 'CONSTANT',
    range: 'Yes',
    target: 'HEX',
    types: ['STANDARD', 'ATTACK', 'SENSEAFFECTING'],
    usesEnd: true,
    visible: true,
    adders: [
      { xmlId: 'ALTERABLEORIGIN', display: 'Alterable Origin Point', baseCost: 5, exclusive: true },
    ],
  },
};

// ============================================================================
// Mental Powers
// ============================================================================

export const MENTAL_POWERS: Record<string, PowerDefinition> = {
  MENTALILLUSIONS: {
    xmlId: 'MENTALILLUSIONS',
    display: 'Mental Illusions',
    description: 'Mental Illusions creates false perceptions in the target\'s mind.',
    baseCost: 0,
    lvlCost: 5,
    lvlVal: 1,
    levelStart: 1,
    minVal: 0,
    duration: 'INSTANT',
    range: 'LOS',
    target: 'ECV',
    defense: 'MENTAL',
    types: ['MENTAL'],
    standardEffectAllowed: true,
    usesEnd: true,
    visible: true,
    continuingEffect: true,
    adders: [
      { xmlId: 'PLUSONEHALFDIE', display: '+1/2 d6', baseCost: 3, exclusive: true, includeInBase: true, excludes: ['PLUSONEPIP'] },
      { xmlId: 'PLUSONEPIP', display: '+1 pip', baseCost: 2, exclusive: true, includeInBase: true, excludes: ['PLUSONEHALFDIE'] },
    ],
  },

  MINDCONTROL: {
    xmlId: 'MINDCONTROL',
    display: 'Mind Control',
    description: 'Mind Control allows a character to implant suggestions or commands in a target\'s mind.',
    baseCost: 0,
    lvlCost: 5,
    lvlVal: 1,
    levelStart: 1,
    minVal: 0,
    duration: 'INSTANT',
    range: 'LOS',
    target: 'ECV',
    defense: 'MENTAL',
    types: ['MENTAL'],
    standardEffectAllowed: true,
    usesEnd: true,
    visible: true,
    continuingEffect: true,
    adders: [
      { xmlId: 'PLUSONEHALFDIE', display: '+1/2 d6', baseCost: 3, exclusive: true, includeInBase: true, excludes: ['PLUSONEPIP'] },
      { xmlId: 'PLUSONEPIP', display: '+1 pip', baseCost: 2, exclusive: true, includeInBase: true, excludes: ['PLUSONEHALFDIE'] },
    ],
  },

  MINDSCAN: {
    xmlId: 'MINDSCAN',
    display: 'Mind Scan',
    description: 'Mind Scan allows a character to search for and locate specific minds.',
    baseCost: 0,
    lvlCost: 5,
    lvlVal: 1,
    levelStart: 1,
    minVal: 0,
    duration: 'CONSTANT',
    range: 'SPECIAL',
    target: 'ECV',
    defense: 'MENTAL',
    types: ['MENTAL'],
    standardEffectAllowed: true,
    usesEnd: true,
    visible: true,
    continuingEffect: true,
    adders: [
      { xmlId: 'PLUSONEHALFDIE', display: '+1/2 d6', baseCost: 3, exclusive: true, includeInBase: true, excludes: ['PLUSONEPIP'] },
      { xmlId: 'PLUSONEPIP', display: '+1 pip', baseCost: 2, exclusive: true, includeInBase: true, excludes: ['PLUSONEHALFDIE'] },
    ],
  },

  TELEPATHY: {
    xmlId: 'TELEPATHY',
    display: 'Telepathy',
    description: 'Telepathy allows a character to read another character\'s thoughts or communicate mentally.',
    baseCost: 0,
    lvlCost: 5,
    lvlVal: 1,
    levelStart: 1,
    minVal: 0,
    duration: 'INSTANT',
    range: 'LOS',
    target: 'ECV',
    defense: 'MENTAL',
    types: ['MENTAL'],
    standardEffectAllowed: true,
    usesEnd: true,
    visible: true,
    continuingEffect: true,
    adders: [
      { xmlId: 'PLUSONEHALFDIE', display: '+1/2 d6', baseCost: 3, exclusive: true, includeInBase: true, excludes: ['PLUSONEPIP'] },
      { xmlId: 'PLUSONEPIP', display: '+1 pip', baseCost: 2, exclusive: true, includeInBase: true, excludes: ['PLUSONEHALFDIE'] },
    ],
  },

  MINDLINK: {
    xmlId: 'MINDLINK',
    display: 'Mind Link',
    description: 'Mind Link creates a permanent mental communication connection with specific individuals.',
    baseCost: 5,
    lvlCost: 0,
    lvlVal: 0,
    duration: 'PERSISTENT',
    range: 'LOS',
    target: 'ECV',
    defense: 'MENTAL',
    types: ['MENTAL', 'SENSORY'],
    usesEnd: false,
    continuingEffect: true,
  },
};

// ============================================================================
// Adjustment Powers
// ============================================================================

export const ADJUSTMENT_POWERS: Record<string, PowerDefinition> = {
  AID: {
    xmlId: 'AID',
    display: 'Aid',
    description: 'Aid temporarily increases a target\'s Characteristics, Powers, or other abilities.',
    baseCost: 0,
    lvlCost: 6,
    lvlVal: 1,
    levelStart: 1,
    minVal: 0,
    duration: 'INSTANT',
    range: 'No',
    target: 'DCV',
    defense: 'POWER',
    types: ['ADJUSTMENT'],
    standardEffectAllowed: true,
    usesEnd: true,
    visible: true,
    continuingEffect: true,
    adders: [
      { xmlId: 'PLUSONEHALFDIE', display: '+1/2 d6', baseCost: 3, exclusive: true, includeInBase: true, excludes: ['PLUSONEPIP'] },
      { xmlId: 'PLUSONEPIP', display: '+1 pip', baseCost: 2, exclusive: true, includeInBase: true, excludes: ['PLUSONEHALFDIE'] },
    ],
  },

  ABSORPTION: {
    xmlId: 'ABSORPTION',
    display: 'Absorption',
    description: 'Absorption allows a character to absorb the BODY damage of an attack and convert it into Character Points for a specific Power or Characteristic.',
    baseCost: 0,
    lvlCost: 1,
    lvlVal: 1,
    levelStart: 1,
    minVal: 1,
    duration: 'CONSTANT',
    range: 'SELF',
    target: 'SELFONLY',
    types: ['ADJUSTMENT'],
    usesEnd: false,
    visible: true,
    warningSign: true,
  },

  HEALING: {
    xmlId: 'HEALING',
    display: 'Healing',
    description: 'Healing restores lost BODY, STUN, or other damage to a target.',
    baseCost: 0,
    lvlCost: 10,
    lvlVal: 1,
    levelStart: 1,
    minVal: 0,
    duration: 'INSTANT',
    range: 'No',
    target: 'DCV',
    defense: 'POWER',
    types: ['ADJUSTMENT'],
    standardEffectAllowed: true,
    usesEnd: true,
    visible: true,
    adders: [
      { xmlId: 'PLUSONEHALFDIE', display: '+1/2 d6', baseCost: 5, exclusive: true, includeInBase: true, excludes: ['PLUSONEPIP'] },
      { xmlId: 'PLUSONEPIP', display: '+1 pip', baseCost: 3, exclusive: true, includeInBase: true, excludes: ['PLUSONEHALFDIE'] },
    ],
  },
};

// ============================================================================
// Special Powers
// ============================================================================

export const SPECIAL_POWERS: Record<string, PowerDefinition> = {
  LIFESUPPORT: {
    xmlId: 'LIFESUPPORT',
    display: 'Life Support',
    abbreviation: 'LS',
    description: 'Life Support allows a character to operate in unfriendly or deadly environments without harm.',
    baseCost: 0,
    lvlCost: 0,
    lvlVal: 0,
    duration: 'PERSISTENT',
    range: 'No',
    target: 'SELFONLY',
    types: ['STANDARD'],
    usesEnd: false,
    // Life Support is purchased as separate adders
    adders: [
      { xmlId: 'EXTENDEDBREATHING', display: 'Extended Breathing', baseCost: 1, exclusive: true, includeInBase: true },
      { xmlId: 'SAFEENVIRONMENT', display: 'Safe Environment', baseCost: 2, exclusive: true },
      { xmlId: 'SELFCONTAINED', display: 'Self-Contained Breathing', baseCost: 10, exclusive: true },
      { xmlId: 'IMMUNETOAGING', display: 'Immune to Aging', baseCost: 3, exclusive: true },
      { xmlId: 'IMMUNETODISEASE', display: 'Immune to Disease', baseCost: 3, exclusive: true },
      { xmlId: 'SLEEPLESS', display: 'Sleeping: No need to sleep', baseCost: 3, exclusive: true },
      { xmlId: 'EATINGLESS', display: 'Eating: No need to eat', baseCost: 1, exclusive: true },
      { xmlId: 'EXCRETIONLESS', display: 'Excretion: No need to excrete', baseCost: 1, exclusive: true },
    ],
  },

  REGENERATION: {
    xmlId: 'REGENERATION',
    display: 'Regeneration',
    description: 'Regeneration allows a character to heal damage over time.',
    baseCost: 0,
    lvlCost: 2, // Varies by rate
    lvlVal: 1, // BODY healed per time period
    levelStart: 1,
    minVal: 1,
    duration: 'PERSISTENT',
    range: 'SELF',
    target: 'SELFONLY',
    types: ['SPECIAL'],
    usesEnd: false,
    warningSign: true,
    options: [
      { xmlId: 'WEEK', display: 'Week', baseCost: 0, lvlCost: 2, lvlVal: 1 },
      { xmlId: 'DAY', display: 'Day', baseCost: 0, lvlCost: 4, lvlVal: 1 },
      { xmlId: '6HOURS', display: '6 Hours', baseCost: 0, lvlCost: 6, lvlVal: 1 },
      { xmlId: '1HOUR', display: 'Hour', baseCost: 0, lvlCost: 8, lvlVal: 1 },
      { xmlId: '20MINUTES', display: '20 Minutes', baseCost: 0, lvlCost: 10, lvlVal: 1 },
      { xmlId: '5MINUTES', display: '5 Minutes', baseCost: 0, lvlCost: 12, lvlVal: 1 },
      { xmlId: '1MINUTE', display: 'Minute', baseCost: 0, lvlCost: 14, lvlVal: 1 },
      { xmlId: '1TURN', display: 'Turn', baseCost: 0, lvlCost: 16, lvlVal: 1 },
    ],
  },

  TELEKINESIS: {
    xmlId: 'TELEKINESIS',
    display: 'Telekinesis',
    abbreviation: 'TK',
    description: 'Telekinesis allows a character to move objects with the power of their mind.',
    baseCost: 0,
    lvlCost: 3,
    lvlVal: 2, // STR equivalent
    levelStart: 2,
    minVal: 2,
    duration: 'CONSTANT',
    range: 'Yes',
    target: 'DCV',
    defense: 'NORMAL',
    types: ['STANDARD', 'ATTACK'],
    doesDamage: true,
    doesKnockback: true,
    doesBody: true,
    usesEnd: true,
    visible: true,
    adders: [
      { xmlId: 'ALTERABLEORIGIN', display: 'Alterable Origin Point', baseCost: 5, exclusive: true },
      { xmlId: 'AFFECTSPOROUS', display: 'Affects Porous', baseCost: 10, exclusive: true },
    ],
  },

  LUCK: {
    xmlId: 'LUCK',
    display: 'Luck',
    description: 'Luck represents a quality of fate which helps events turn in a character\'s favor.',
    baseCost: 0,
    lvlCost: 5,
    lvlVal: 1, // d6 of luck per level
    levelStart: 1,
    minVal: 1,
    duration: 'PERSISTENT',
    range: 'No',
    target: 'SELFONLY',
    types: ['SPECIAL'],
    usesEnd: false,
  },

  ENDURANCERESERVE: {
    xmlId: 'ENDURANCERESERVE',
    display: 'Endurance Reserve',
    description: 'Endurance Reserve is an independent source of Endurance which provides END to power abilities.',
    baseCost: 0,
    lvlCost: 1,
    lvlVal: 4, // 4 END per point
    levelStart: 0,
    minVal: 0,
    duration: 'PERSISTENT',
    range: 'SELF',
    target: 'SELFONLY',
    types: ['SPECIAL'],
    usesEnd: false,
  },

  CLINGING: {
    xmlId: 'CLINGING',
    display: 'Clinging',
    description: 'Clinging allows a character to cling to walls and sheer surfaces and move on them as if they were level.',
    baseCost: 10,
    lvlCost: 1,
    lvlVal: 3, // +3 STR equivalent per point
    duration: 'CONSTANT',
    range: 'SELF',
    target: 'SELFONLY',
    types: ['STANDARD'],
    usesEnd: false,
    exclusive: true,
  },

  SUMMON: {
    xmlId: 'SUMMON',
    display: 'Summon',
    description: 'Summon allows a character to call forth creatures or beings to serve them.',
    baseCost: 0,
    lvlCost: 1,
    lvlVal: 5, // Points per 5 character points of creature
    levelStart: 1,
    minVal: 1,
    duration: 'INSTANT',
    range: 'No',
    target: 'N/A',
    types: ['STANDARD'],
    usesEnd: true,
    visible: true,
    continuingEffect: true,
    warningSign: true,
    adders: [
      { xmlId: 'INCREASETOTAL', display: 'x[LVL] Number Of Beings', baseCost: 0, lvlCost: 5, lvlVal: 1, levelStart: 1, minVal: 1, includeInBase: true },
    ],
  },

  CHANGEENVIRONMENT: {
    xmlId: 'CHANGEENVIRONMENT',
    display: 'Change Environment',
    abbreviation: 'CE',
    description: 'Change Environment causes changes to the environment, such as altering temperature, creating magnetic fields, or causing plants to bloom.',
    baseCost: 0,
    lvlCost: 0, // Cost based on effect and area
    lvlVal: 0,
    duration: 'CONSTANT',
    range: 'Yes',
    target: 'DCV',
    types: ['STANDARD', 'ATTACK'],
    usesEnd: true,
    visible: true,
    adders: [
      { xmlId: 'ALTERABLEORIGIN', display: 'Alterable Origin Point', baseCost: 5, exclusive: true },
    ],
  },

  COMPOUNDPOWER: {
    xmlId: 'COMPOUNDPOWER',
    display: 'Compound Power',
    description: 'A container for multiple powers that are purchased and function together.',
    baseCost: 0,
    lvlCost: 0,
    lvlVal: 0,
    duration: 'INHERENT',
    range: 'No',
    target: 'N/A',
    types: ['SPECIAL'],
    usesEnd: false,
  },

  MULTIPOWER: {
    xmlId: 'MULTIPOWER',
    display: 'Multipower',
    description: 'A pool of points that can be allocated to different slots.',
    baseCost: 0,
    lvlCost: 1,
    lvlVal: 1,
    duration: 'INHERENT',
    range: 'No',
    target: 'N/A',
    types: ['SPECIAL'],
    usesEnd: false,
  },
};

// ============================================================================
// Combined Export
// ============================================================================

export const ALL_POWERS: Record<string, PowerDefinition> = {
  ...ATTACK_POWERS,
  ...DEFENSIVE_POWERS,
  ...MOVEMENT_POWERS,
  ...BODY_AFFECTING_POWERS,
  ...SENSORY_POWERS,
  ...MENTAL_POWERS,
  ...ADJUSTMENT_POWERS,
  ...SPECIAL_POWERS,
};

/**
 * Get a power definition by its XML ID
 */
export function getPowerDefinition(xmlId: string): PowerDefinition | undefined {
  return ALL_POWERS[xmlId];
}

/**
 * Get all powers of a specific type
 */
export function getPowersByType(type: PowerType): PowerDefinition[] {
  return Object.values(ALL_POWERS).filter(power => power.types.includes(type));
}

/**
 * Calculate the base cost for a power at a given level
 */
export function calculatePowerBaseCost(power: PowerDefinition, levels: number): number {
  return power.baseCost + (power.lvlCost * levels);
}

/**
 * Get the display name for a power
 */
export function getPowerDisplayName(xmlId: string): string {
  const power = getPowerDefinition(xmlId);
  return power?.display ?? xmlId;
}
