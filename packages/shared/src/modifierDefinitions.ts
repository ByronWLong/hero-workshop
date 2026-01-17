/**
 * Hero System 6th Edition Modifier Definitions
 * 
 * BASECOST values:
 * - Positive values = Advantages (increase power cost)
 * - Negative values = Limitations (reduce power cost)
 * - Values are fractions (e.g., 0.25 = +1/4, -0.5 = -1/2)
 */

// ============================================================================
// TYPES
// ============================================================================

export interface ModifierOption {
  xmlId: string;
  display: string;
  baseCost: number;
  lvlVal?: number;
  lvlMultiplier?: number;
}

export interface ModifierAdder {
  xmlId: string;
  display: string;
  abbreviation?: string;
  baseCost: number;
  required?: boolean;
  exclusive?: boolean;
  lvlCost?: number;
  lvlVal?: number;
  minVal?: number;
  options?: ModifierOption[];
}

export interface ModifierDefinition {
  xmlId: string;
  display: string;
  abbreviation?: string;
  baseCost: number;
  lvlCost?: number;
  lvlVal?: number;
  lvlPower?: number;
  minCost?: number;
  maxCost?: number;
  minVal?: number;
  maxVal?: number;
  levelStart?: number;
  exclusive?: boolean;
  isAdvantage: boolean;
  isLimitation: boolean;
  hasOptions: boolean;
  hasLevels: boolean;
  options?: ModifierOption[];
  adders?: ModifierAdder[];
  description?: string;
}

// ============================================================================
// ADVANTAGES (Positive BASECOST values)
// ============================================================================

export const ADVANTAGES: Record<string, ModifierDefinition> = {
  // --- Area of Effect ---
  AOE: {
    xmlId: 'AOE',
    display: 'Area Of Effect',
    abbreviation: 'AOE',
    baseCost: 0,
    lvlCost: 0.25,
    lvlVal: 1,
    lvlPower: 2,
    minCost: 0.25,
    minVal: 1,
    maxVal: 999999999,
    levelStart: 1,
    exclusive: false,
    isAdvantage: true,
    isLimitation: false,
    hasOptions: true,
    hasLevels: true,
    options: [
      { xmlId: 'RADIUS', display: 'Radius', baseCost: 0, lvlMultiplier: 2 },
      { xmlId: 'CONE', display: 'Cone', baseCost: 0, lvlMultiplier: 4 },
      { xmlId: 'LINE', display: 'Line', baseCost: 0, lvlMultiplier: 8 },
      { xmlId: 'SURFACE', display: 'Surface', baseCost: 0, lvlMultiplier: 1 },
    ],
    adders: [
      { xmlId: 'ACCURATE', display: 'Accurate', baseCost: 0.25, exclusive: true },
      { xmlId: 'THINCONE', display: 'Thin Cone', baseCost: -0.25, exclusive: true },
    ],
    description: 'Allows a Power to affect an area instead of a single target.',
  },

  // --- Armor Piercing ---
  ARMORPIERCING: {
    xmlId: 'ARMORPIERCING',
    display: 'Armor Piercing',
    abbreviation: 'AP',
    baseCost: 0,
    lvlCost: 0.25,
    lvlVal: 1,
    minVal: 1,
    minCost: 0.25,
    maxCost: 10,
    levelStart: 1,
    exclusive: true,
    isAdvantage: true,
    isLimitation: false,
    hasOptions: false,
    hasLevels: true,
    description: 'Attack acts against one half of the defense it normally acts against. Additional levels negate Hardened.',
  },

  // --- Autofire ---
  AUTOFIRE: {
    xmlId: 'AUTOFIRE',
    display: 'Autofire',
    baseCost: 0,
    exclusive: true,
    isAdvantage: true,
    isLimitation: false,
    hasOptions: true,
    hasLevels: false,
    options: [
      { xmlId: 'TWO', display: '2 Shots', baseCost: 0.25 },
      { xmlId: 'THREE', display: '3 Shots', baseCost: 0.25 },
      { xmlId: 'FIVE', display: '5 Shots', baseCost: 0.5 },
    ],
    adders: [
      { xmlId: 'DOUBLE', display: 'x[LVL] Shots', baseCost: 0, lvlCost: 0.5, lvlVal: 1, minVal: 1 },
      { xmlId: 'ODDPOWER', display: 'Non-Standard Attack Power', baseCost: 1 },
    ],
    description: 'Character can use a Power to hit a target more than once in a single Phase.',
  },

  // --- AVAD (Attack Versus Alternate Defense) ---
  AVAD: {
    xmlId: 'AVAD',
    display: 'Attack Versus Alternate Defense',
    abbreviation: 'AVAD',
    baseCost: 0,
    exclusive: true,
    isAdvantage: true,
    isLimitation: false,
    hasOptions: true,
    hasLevels: false,
    options: [
      { xmlId: 'VERYVERY', display: 'Very Common -> Very Common', baseCost: 0 },
      { xmlId: 'VERYCOMMON', display: 'Very Common -> Common', baseCost: 0.5 },
      { xmlId: 'VERYUNCOMMON', display: 'Very Common -> Uncommon', baseCost: 1 },
      { xmlId: 'VERYRARE', display: 'Very Common -> Rare', baseCost: 1.5 },
      { xmlId: 'COMMONVERY', display: 'Common -> Very Common', baseCost: -0.5 },
      { xmlId: 'COMMONCOMMON', display: 'Common -> Common', baseCost: 0 },
      { xmlId: 'COMMONUNCOMMON', display: 'Common -> Uncommon', baseCost: 0.5 },
      { xmlId: 'COMMONRARE', display: 'Common -> Rare', baseCost: 1 },
      { xmlId: 'UNCOMMONVERY', display: 'Uncommon -> Very Common', baseCost: -1 },
      { xmlId: 'UNCOMMONCOMMON', display: 'Uncommon -> Common', baseCost: -0.5 },
      { xmlId: 'UNCOMMONUNCOMMON', display: 'Uncommon -> Uncommon', baseCost: 0 },
      { xmlId: 'UNCOMMONRARE', display: 'Uncommon -> Rare', baseCost: 0.5 },
      { xmlId: 'RAREVERY', display: 'Rare -> Very Common', baseCost: -1.5 },
      { xmlId: 'RARECOMMON', display: 'Rare -> Common', baseCost: -1 },
      { xmlId: 'RAREUNCOMMON', display: 'Rare -> Uncommon', baseCost: -0.5 },
      { xmlId: 'RARERARE', display: 'Rare -> Rare', baseCost: 0 },
    ],
    adders: [
      { xmlId: 'NND', display: 'All Or Nothing (NND)', abbreviation: 'NND', baseCost: -0.5, exclusive: true },
    ],
    description: 'A Power with AVAD is affected by a defense other than the one that\'s standard for it.',
  },

  // --- Cumulative ---
  CUMULATIVE: {
    xmlId: 'CUMULATIVE',
    display: 'Cumulative',
    baseCost: 0.5,
    lvlCost: 0.25,
    lvlVal: 1,
    lvlPower: 2,
    isAdvantage: true,
    isLimitation: false,
    hasOptions: false,
    hasLevels: true,
    description: 'Allows successive effect rolls to be added together.',
  },

  // --- Damage Over Time ---
  DAMAGEOVERTIME: {
    xmlId: 'DAMAGEOVERTIME',
    display: 'Damage Over Time',
    baseCost: 1,
    exclusive: true,
    isAdvantage: true,
    isLimitation: false,
    hasOptions: false,
    hasLevels: false,
    adders: [
      {
        xmlId: 'INCREMENTS',
        display: 'Number of Damage Increments',
        baseCost: 0,
        required: true,
        options: [
          { xmlId: '2', display: '2', baseCost: 0.25 },
          { xmlId: '3', display: '3', baseCost: 0.5 },
          { xmlId: '4', display: '4', baseCost: 0.75 },
          { xmlId: '6', display: '5-6', baseCost: 1 },
          { xmlId: '8', display: '7-8', baseCost: 1.25 },
          { xmlId: '12', display: '9-12', baseCost: 1.5 },
          { xmlId: '16', display: '13-16', baseCost: 1.75 },
          { xmlId: '32', display: '17-32', baseCost: 2 },
          { xmlId: '64', display: '33-64', baseCost: 2.25 },
          { xmlId: '128', display: '65-128', baseCost: 2.5 },
          { xmlId: '256', display: '129-256', baseCost: 2.75 },
        ],
      },
    ],
    description: 'The attack does damage over time.',
  },

  // --- Does Knockback ---
  DOESKB: {
    xmlId: 'DOESKB',
    display: 'Does Knockback',
    baseCost: 0.25,
    exclusive: true,
    isAdvantage: true,
    isLimitation: false,
    hasOptions: false,
    hasLevels: false,
    description: 'Enables an Attack Power which normally doesn\'t do Knockback to do Knockback.',
  },

  // --- Double Knockback ---
  DOUBLEKB: {
    xmlId: 'DOUBLEKB',
    display: 'Double Knockback',
    baseCost: 0.5,
    exclusive: false,
    isAdvantage: true,
    isLimitation: false,
    hasOptions: false,
    hasLevels: false,
    description: 'Power has a greater chance of doing Knockback and does more when it does.',
  },

  // --- Indirect ---
  INDIRECT: {
    xmlId: 'INDIRECT',
    display: 'Indirect',
    baseCost: 0,
    exclusive: true,
    isAdvantage: true,
    isLimitation: false,
    hasOptions: true,
    hasLevels: false,
    options: [
      { xmlId: 'SAMEDIRECT', display: 'Source Point same, path direct', baseCost: 0.25 },
      { xmlId: 'CHARACTERINDIRECT', display: 'Source is Character, path indirect but same', baseCost: 0.25 },
      { xmlId: 'SAMEINDIRECT', display: 'Source Point same, path indirect but same', baseCost: 0.5 },
      { xmlId: 'CHARACTERANY', display: 'Source is Character, path can change', baseCost: 0.5 },
      { xmlId: 'SAMEANY', display: 'Source Point same, path can change', baseCost: 0.75 },
      { xmlId: 'ANYDIRECT', display: 'Source can vary, path direct', baseCost: 0.5 },
      { xmlId: 'ANYINDIRECT', display: 'Source can vary, path indirect but same', baseCost: 0.75 },
      { xmlId: 'ANYANY', display: 'Source can vary, path can change', baseCost: 1 },
    ],
    description: 'Power can originate from somewhere other than the character.',
  },

  // --- Invisible Power Effects ---
  INVISIBLE: {
    xmlId: 'INVISIBLE',
    display: 'Invisible Power Effects',
    abbreviation: 'IPE',
    baseCost: 0,
    exclusive: true,
    isAdvantage: true,
    isLimitation: false,
    hasOptions: true,
    hasLevels: false,
    options: [
      { xmlId: 'OBVIOUSINOBVIOUSONE', display: 'Obvious, Inobvious to [one Sense Group]', baseCost: 0.25 },
      { xmlId: 'OBVIOUSINOBVIOUSTWO', display: 'Obvious, Inobvious to [two Sense Groups]', baseCost: 0.5 },
      { xmlId: 'OBVIOUSINVISIBLEONE', display: 'Obvious, Invisible to [one Sense Group]', baseCost: 0.5 },
      { xmlId: 'OBVIOUSINVISIBLETWO', display: 'Obvious, Invisible to [two Sense Groups]', baseCost: 1 },
      { xmlId: 'OBVIOUSINVISIBLE', display: 'Obvious, Fully Invisible', baseCost: 1 },
      { xmlId: 'INOBVIOUSINVISIBLEONE', display: 'Inobvious, Invisible to [one Sense Group]', baseCost: 0.25 },
      { xmlId: 'INOBVIOUSINVISIBLETWO', display: 'Inobvious, Invisible to [two Sense Groups]', baseCost: 0.5 },
      { xmlId: 'INOBVIOUSINVISIBLE', display: 'Inobvious, Fully Invisible', baseCost: 0.5 },
    ],
    adders: [
      {
        xmlId: 'EFFECTSTARGET',
        display: 'Effects of Power on target',
        baseCost: 0,
        required: true,
        options: [
          { xmlId: 'DEFAULT', display: '[default/no change]', baseCost: 0 },
          { xmlId: 'INOBVIOUS', display: 'Inobvious', baseCost: 0.25 },
          { xmlId: 'INVISIBLE', display: 'Invisible', baseCost: 0.5 },
        ],
      },
      {
        xmlId: 'EFFECTSOTHER',
        display: 'Effects of Power on other characters',
        baseCost: 0,
        required: true,
        options: [
          { xmlId: 'DEFAULT', display: '[default/no change]', baseCost: 0 },
          { xmlId: 'INOBVIOUS', display: 'Inobvious', baseCost: 0.25 },
          { xmlId: 'INVISIBLE', display: 'Invisible', baseCost: 0.5 },
        ],
      },
    ],
    description: 'The special effects of a Power are not perceivable when in use.',
  },

  // --- Line Of Sight ---
  LOS: {
    xmlId: 'LOS',
    display: 'Line Of Sight',
    abbreviation: 'LOS',
    baseCost: 0.5,
    exclusive: true,
    isAdvantage: true,
    isLimitation: false,
    hasOptions: false,
    hasLevels: false,
    description: 'Power works on a Line of Sight basis like Mental Powers.',
  },

  // --- Megascale ---
  MEGASCALE: {
    xmlId: 'MEGASCALE',
    display: 'MegaScale',
    baseCost: 1,
    lvlCost: 0.25,
    lvlVal: 1,
    lvlPower: 10,
    minVal: 0,
    levelStart: 0,
    exclusive: false,
    isAdvantage: true,
    isLimitation: false,
    hasOptions: false,
    hasLevels: true,
    adders: [
      { xmlId: 'NOSCALE', display: 'Cannot alter scale', baseCost: -0.25, exclusive: true },
    ],
    description: 'A Power works over a much greater area than an ordinary Power.',
  },

  // --- No Range Modifier ---
  NORANGEMODIFIER: {
    xmlId: 'NORANGEMODIFIER',
    display: 'No Range Modifier',
    abbreviation: 'NRM',
    baseCost: 0.5,
    exclusive: true,
    isAdvantage: true,
    isLimitation: false,
    hasOptions: false,
    hasLevels: false,
    description: 'Character ignores Range Modifier when making Attack Rolls.',
  },

  // --- Penetrating ---
  PENETRATING: {
    xmlId: 'PENETRATING',
    display: 'Penetrating',
    baseCost: 0,
    lvlCost: 0.5,
    lvlVal: 1,
    minVal: 1,
    levelStart: 1,
    exclusive: true,
    isAdvantage: true,
    isLimitation: false,
    hasOptions: false,
    hasLevels: true,
    description: 'Power automatically does some damage no matter how strong the target\'s defenses.',
  },

  // --- Ranged ---
  RANGED: {
    xmlId: 'RANGED',
    display: 'Ranged',
    baseCost: 0.5,
    exclusive: true,
    isAdvantage: true,
    isLimitation: false,
    hasOptions: true,
    hasLevels: false,
    options: [
      { xmlId: 'RANGED', display: 'Ranged', baseCost: 0.5 },
      { xmlId: 'LIMITEDRANGE', display: 'Limited Range', baseCost: 0.25 },
      { xmlId: 'RANGEBASEDONSTR', display: 'Range Based On STR', baseCost: 0.25 },
    ],
    description: 'Powers which ordinarily have No Range can be used at Range.',
  },

  // --- Reduced Endurance ---
  REDUCEDEND: {
    xmlId: 'REDUCEDEND',
    display: 'Reduced Endurance',
    baseCost: 0,
    exclusive: true,
    isAdvantage: true,
    isLimitation: false,
    hasOptions: true,
    hasLevels: false,
    options: [
      { xmlId: 'HALFEND', display: 'Half END (1/2 END)', baseCost: 0.25 },
      { xmlId: 'ZERO', display: '0 END', baseCost: 0.5 },
    ],
    description: 'Allows a character to reduce the END Cost of a Power.',
  },

  // --- Sticky ---
  STICKY: {
    xmlId: 'STICKY',
    display: 'Sticky',
    baseCost: 0,
    exclusive: true,
    isAdvantage: true,
    isLimitation: false,
    hasOptions: true,
    hasLevels: false,
    options: [
      { xmlId: 'STANDARD', display: 'Standard', baseCost: 0.5 },
      { xmlId: 'ONEFORALL', display: 'Freeing one victim frees all victims', baseCost: 0.25 },
    ],
    description: 'Any character who touches someone affected by the Power will also be affected.',
  },

  // --- Transdimensional ---
  TRANSDIMENSIONAL: {
    xmlId: 'TRANSDIMENSIONAL',
    display: 'Transdimensional',
    baseCost: 0,
    exclusive: true,
    isAdvantage: true,
    isLimitation: false,
    hasOptions: true,
    hasLevels: false,
    options: [
      { xmlId: 'SINGLE', display: 'Single Dimension', baseCost: 0.5 },
      { xmlId: 'GROUP', display: 'Related Group of Dimensions', baseCost: 0.75 },
      { xmlId: 'ANY', display: 'Any Dimension', baseCost: 1 },
    ],
    description: 'Power can affect targets in other dimensions.',
  },

  // --- Trigger ---
  TRIGGER: {
    xmlId: 'TRIGGER',
    display: 'Trigger',
    baseCost: 0,
    minCost: 0.25,
    exclusive: true,
    isAdvantage: true,
    isLimitation: false,
    hasOptions: true,
    hasLevels: false,
    options: [
      { xmlId: 'SET', display: 'Set Trigger', baseCost: 0.25 },
      { xmlId: 'VARIABLE', display: 'Variable Trigger', baseCost: 0.5 },
    ],
    adders: [
      {
        xmlId: 'ACTIVATION',
        display: 'Activation Modifiers',
        baseCost: 0,
        required: true,
        options: [
          { xmlId: 'ZEROPHASE', display: 'Requires a Zero Phase Action', baseCost: 0 },
          { xmlId: 'NOTIME', display: 'Takes no time', baseCost: 0.25 },
        ],
      },
      {
        xmlId: 'RESET',
        display: 'Reset Parameters',
        baseCost: 0,
        required: true,
        options: [
          { xmlId: 'TURN', display: 'Requires a Turn or more to reset', baseCost: -0.5 },
          { xmlId: 'PHASE', display: 'Requires a Full Phase to reset', baseCost: -0.25 },
          { xmlId: 'HALFPHASE', display: 'Requires a Half Phase Action to reset', baseCost: 0 },
          { xmlId: 'ZEROPHASE', display: 'Requires a Zero Phase Action to reset', baseCost: 0.25 },
          { xmlId: 'AUTOMATIC', display: 'Resets automatically, immediately after it activates', baseCost: 0.5 },
        ],
      },
      { xmlId: 'MULTIPLE', display: 'Character can set Trigger multiple times', baseCost: 0 },
      { xmlId: 'EXPIRE', display: 'Trigger can expire (it has a time limit)', baseCost: -0.25 },
      { xmlId: 'NOCONTROL', display: 'Character does not control activation of personal Trigger', baseCost: -0.25 },
      { xmlId: 'TWOCONDITIONS', display: 'Two activation conditions apply simultaneously', baseCost: 0.25 },
      { xmlId: 'THREECONDITIONS', display: 'Three or more activation conditions apply simultaneously', baseCost: 0.5 },
    ],
    description: 'Power can be set to activate under certain conditions.',
  },

  // --- Uncontrolled ---
  UNCONTROLLED: {
    xmlId: 'UNCONTROLLED',
    display: 'Uncontrolled',
    baseCost: 0.5,
    exclusive: true,
    isAdvantage: true,
    isLimitation: false,
    hasOptions: false,
    hasLevels: false,
    description: 'A Constant Power can maintain itself without conscious thought from its user.',
  },

  // --- Usable On Others (UOO) ---
  UOO: {
    xmlId: 'UOO',
    display: 'Usable On Others',
    abbreviation: 'UOO',
    baseCost: 0,
    maxCost: 10,
    exclusive: true,
    isAdvantage: true,
    isLimitation: false,
    hasOptions: true,
    hasLevels: false,
    options: [
      { xmlId: 'UBO', display: 'Usable By Other (UBO)', baseCost: 0.25 },
      { xmlId: 'UOO', display: 'Usable On Others', baseCost: 0.25 },
    ],
    adders: [
      { xmlId: 'GRANTORTAKEBACK', display: 'Grantor can take back power at any time', baseCost: 0.25, exclusive: true },
      { xmlId: 'TOTALCONTROL', display: 'Grantor controls the power totally', baseCost: 0.5, exclusive: true },
      { xmlId: 'GRANTORPAYSEND', display: 'Grantor pays the END whenever the power is used', baseCost: -0.25 },
      { xmlId: 'NOSELFUSE', display: 'Grantor can only grant the power to others', baseCost: -0.5 },
    ],
    description: 'Character can grant a Power to someone else.',
  },

  // --- Affects Desolidified ---
  AFFECTSDESOLID: {
    xmlId: 'AFFECTSDESOLID',
    display: 'Affects Desolidified',
    abbreviation: 'Affects Desol',
    baseCost: 0,
    minCost: 0.25,
    maxCost: 0.5,
    exclusive: true,
    isAdvantage: true,
    isLimitation: false,
    hasOptions: true,
    hasLevels: false,
    options: [
      { xmlId: 'ANY', display: 'Any form of Desolidification', baseCost: 0.5 },
      { xmlId: 'ONE', display: 'One Special Effect of Desolidification', baseCost: 0.25 },
    ],
    description: 'Power can affect a character who is Desolidified.',
  },

  // --- Hardened ---
  HARDENED: {
    xmlId: 'HARDENED',
    display: 'Hardened',
    baseCost: 0,
    lvlCost: 0.25,
    lvlVal: 1,
    minVal: 1,
    minCost: 0.25,
    maxCost: 10,
    levelStart: 1,
    exclusive: true,
    isAdvantage: true,
    isLimitation: false,
    hasOptions: false,
    hasLevels: true,
    description: 'Enables a defense to counteract Armor Piercing.',
  },

  // --- Impenetrable ---
  IMPENETRABLE: {
    xmlId: 'IMPENETRABLE',
    display: 'Impenetrable',
    baseCost: 0,
    lvlCost: 0.25,
    lvlVal: 1,
    minVal: 1,
    minCost: 0.25,
    maxCost: 10,
    levelStart: 1,
    exclusive: true,
    isAdvantage: true,
    isLimitation: false,
    hasOptions: false,
    hasLevels: true,
    description: 'Defense is particularly resistant to Penetrating Attacks.',
  },

  // --- Constant (for Attacks) ---
  CONTINUOUS: {
    xmlId: 'CONTINUOUS',
    display: 'Constant',
    baseCost: 0.5,
    exclusive: true,
    isAdvantage: true,
    isLimitation: false,
    hasOptions: false,
    hasLevels: false,
    description: 'Attack Power can be used on a continuing basis without a new Attack Roll.',
  },

  // --- Persistent ---
  PERSISTENT: {
    xmlId: 'PERSISTENT',
    display: 'Persistent',
    baseCost: 0.25,
    exclusive: true,
    isAdvantage: true,
    isLimitation: false,
    hasOptions: false,
    hasLevels: false,
    description: 'Power remains "turned on" even if character is unconscious.',
  },

  // --- Costs Endurance Only To Activate ---
  COSTSENDONLYTOACTIVATE: {
    xmlId: 'COSTSENDONLYTOACTIVATE',
    display: 'Costs Endurance Only To Activate',
    baseCost: 0.25,
    exclusive: true,
    isAdvantage: true,
    isLimitation: false,
    hasOptions: false,
    hasLevels: false,
    description: 'A Constant Power only costs END to turn on; no END to maintain.',
  },

  // --- Half Range Modifier ---
  HALFRANGEMODIFIER: {
    xmlId: 'HALFRANGEMODIFIER',
    display: 'Half Range Modifier',
    baseCost: 0.25,
    exclusive: true,
    isAdvantage: true,
    isLimitation: false,
    hasOptions: false,
    hasLevels: false,
    description: 'Character uses half the normal Range Modifier when making Attack Rolls.',
  },

  // --- Personal Immunity ---
  PERSONALIMMUNITY: {
    xmlId: 'PERSONALIMMUNITY',
    display: 'Personal Immunity',
    baseCost: 0.25,
    exclusive: true,
    isAdvantage: true,
    isLimitation: false,
    hasOptions: false,
    hasLevels: false,
    description: 'Prevents the character from being affected by his own Power.',
  },

  // --- Increased Maximum Range ---
  INCREASEDMAXRANGE: {
    xmlId: 'INCREASEDMAXRANGE',
    display: 'Increased Maximum Range',
    baseCost: 0,
    lvlCost: 0.25,
    lvlVal: 1,
    lvlPower: 2,
    exclusive: true,
    isAdvantage: true,
    isLimitation: false,
    hasOptions: false,
    hasLevels: true,
    description: 'Power has increased maximum range.',
  },

  // --- Expanded Effect (for Adjustment Powers) ---
  EXPANDEDEFFECT: {
    xmlId: 'EXPANDEDEFFECT',
    display: 'Expanded Effect',
    baseCost: -0.5,  // Base is -1/2 but with levels starting at 2, minimum is +1/2
    lvlCost: 0.5,
    lvlVal: 1,
    minVal: 2,
    levelStart: 2,
    exclusive: false,
    isAdvantage: true,  // Despite negative baseCost, this is an advantage
    isLimitation: false,
    hasOptions: false,
    hasLevels: true,
    description: 'Allows an Adjustment Power to have its full effect against two or more Characteristics or Powers simultaneously.',
  },

  // --- Variable Effect (for Adjustment Powers) ---
  VARIABLEEFFECT: {
    xmlId: 'VARIABLEEFFECT',
    display: 'Variable Effect',
    baseCost: 0.5,
    exclusive: true,
    isAdvantage: true,
    isLimitation: false,
    hasOptions: false,
    hasLevels: false,
    description: 'Allows an Adjustment Power to affect any one Characteristic or Power the character chooses at the time of use.',
  },
};

// ============================================================================
// LIMITATIONS (Negative BASECOST values)
// ============================================================================

export const LIMITATIONS: Record<string, ModifierDefinition> = {
  // --- Always On ---
  ALWAYSON: {
    xmlId: 'ALWAYSON',
    display: 'Always On',
    baseCost: -0.5,
    minCost: -0.5,
    maxCost: -0.25,
    exclusive: true,
    isAdvantage: false,
    isLimitation: true,
    hasOptions: false,
    hasLevels: false,
    description: 'Power that the character can never turn off.',
  },

  // --- Charges ---
  CHARGES: {
    xmlId: 'CHARGES',
    display: 'Charges',
    baseCost: 0,
    exclusive: true,
    isAdvantage: false,
    isLimitation: true,
    hasOptions: true,
    hasLevels: false,
    options: [
      { xmlId: 'ONE', display: '1 Charge', baseCost: -2, lvlVal: 1 },
      { xmlId: 'TWO', display: '2 Charges', baseCost: -1.5, lvlVal: 2 },
      { xmlId: 'THREE', display: '3 Charges', baseCost: -1.25, lvlVal: 3 },
      { xmlId: 'FOUR', display: '4 Charges', baseCost: -1, lvlVal: 4 },
      { xmlId: 'SIX', display: '6 Charges', baseCost: -0.75, lvlVal: 6 },
      { xmlId: 'EIGHT', display: '8 Charges', baseCost: -0.5, lvlVal: 8 },
      { xmlId: 'TWELVE', display: '12 Charges', baseCost: -0.25, lvlVal: 12 },
      { xmlId: 'SIXTEEN', display: '16 Charges', baseCost: 0, lvlVal: 16 },
      { xmlId: 'THIRTYTWO', display: '32 Charges', baseCost: 0.25, lvlVal: 32 },
      { xmlId: 'SIXTYFOUR', display: '64 Charges', baseCost: 0.5, lvlVal: 64 },
      { xmlId: 'ONETWENTYFIVE', display: '125 Charges', baseCost: 0.75, lvlVal: 125 },
      { xmlId: 'TWOFIFTY', display: '250 Charges', baseCost: 1, lvlVal: 250 },
    ],
    description: 'A character can only use a Power a limited number of times per day.',
  },

  // --- Concentration ---
  CONCENTRATION: {
    xmlId: 'CONCENTRATION',
    display: 'Concentration',
    baseCost: 0,
    exclusive: true,
    isAdvantage: false,
    isLimitation: true,
    hasOptions: true,
    hasLevels: false,
    options: [
      { xmlId: 'HALF', display: '1/2 DCV', baseCost: -0.25 },
      { xmlId: 'ZERO', display: '0 DCV', baseCost: -0.5 },
    ],
    adders: [
      { xmlId: 'OBLIVIOUS', display: 'Character is totally unaware of nearby events', baseCost: -0.25, exclusive: true },
    ],
    description: 'Character must concentrate partially or totally while activating or using a Power.',
  },

  // --- Extra Time ---
  EXTRATIME: {
    xmlId: 'EXTRATIME',
    display: 'Extra Time',
    baseCost: 0,
    exclusive: true,
    isAdvantage: false,
    isLimitation: true,
    hasOptions: true,
    hasLevels: false,
    options: [
      { xmlId: 'PHASE', display: 'Delayed Phase', baseCost: -0.25 },
      { xmlId: 'SEGMENT', display: 'Extra Segment', baseCost: -0.5 },
      { xmlId: 'FULL', display: 'Full Phase', baseCost: -0.5 },
      { xmlId: 'EXTRA', display: 'Extra Phase', baseCost: -0.75 },
      { xmlId: 'TURN', display: '1 Turn (Post-Segment 12)', baseCost: -1.25 },
      { xmlId: '1MINUTE', display: '1 Minute', baseCost: -1.5 },
      { xmlId: '5MINUTES', display: '5 Minutes', baseCost: -2 },
      { xmlId: '20MINUTES', display: '20 Minutes', baseCost: -2.5 },
      { xmlId: '1HOUR', display: '1 Hour', baseCost: -3 },
      { xmlId: '6HOURS', display: '6 Hours', baseCost: -3.5 },
      { xmlId: '1DAY', display: '1 Day', baseCost: -4 },
    ],
    adders: [
      { xmlId: 'NOOTHERACTIONS', display: 'Character May Take No Other Actions', baseCost: -0.25, exclusive: true },
      { xmlId: 'DELAYEDPHASE', display: 'Delayed Phase', baseCost: -0.25 },
    ],
    description: 'Power requires extra time to activate.',
  },

  // --- Focus ---
  FOCUS: {
    xmlId: 'FOCUS',
    display: 'Focus',
    baseCost: 0,
    exclusive: true,
    isAdvantage: false,
    isLimitation: true,
    hasOptions: true,
    hasLevels: false,
    options: [
      { xmlId: 'IIF', display: 'Inobvious Inaccessible Focus (IIF)', baseCost: -0.25 },
      { xmlId: 'IAF', display: 'Inobvious Accessible Focus (IAF)', baseCost: -0.5 },
      { xmlId: 'OIF', display: 'Obvious Inaccessible Focus (OIF)', baseCost: -0.5 },
      { xmlId: 'OAF', display: 'Obvious Accessible Focus (OAF)', baseCost: -1 },
    ],
    adders: [
      {
        xmlId: 'MOBILITY',
        display: 'Mobility',
        baseCost: 0,
        exclusive: true,
        options: [
          { xmlId: 'ARRANGEMENT', display: 'Arrangement', baseCost: -0.25 },
          { xmlId: 'BULKY', display: 'Bulky', baseCost: -0.5 },
          { xmlId: 'IMMOBILE', display: 'Immobile', baseCost: -1 },
        ],
      },
      {
        xmlId: 'BREAKABILITY',
        display: 'Breakability',
        baseCost: 0,
        exclusive: true,
        options: [
          { xmlId: 'FRAGILE', display: 'Fragile', baseCost: -0.25 },
          { xmlId: 'DURABLE', display: 'Durable', baseCost: 0 },
          { xmlId: 'UNBREAKABLE', display: 'Unbreakable', baseCost: 0 },
        ],
      },
      {
        xmlId: 'EXPENDABILITY',
        display: 'Expendability',
        baseCost: 0,
        exclusive: true,
        options: [
          { xmlId: 'EASY', display: 'Easy to obtain new Focus', baseCost: 0 },
          { xmlId: 'DIFFICULT', display: 'Difficult to obtain new Focus', baseCost: -0.25 },
          { xmlId: 'VERYDIFFICULT', display: 'Very Difficult to obtain new Focus', baseCost: -0.5 },
          { xmlId: 'EXTREMELYDIFFICULT', display: 'Extremely Difficult to obtain new Focus', baseCost: -1 },
        ],
      },
      { xmlId: 'MULTIPLEFOCI', display: 'Requires Multiple Foci or functions at reduced effectiveness', baseCost: 0.25, exclusive: true },
    ],
    description: 'Power works through some sort of object or device.',
  },

  // --- Gestures ---
  GESTURES: {
    xmlId: 'GESTURES',
    display: 'Gestures',
    baseCost: -0.25,
    maxCost: -0.25,
    exclusive: true,
    isAdvantage: false,
    isLimitation: true,
    hasOptions: false,
    hasLevels: false,
    adders: [
      { xmlId: 'THROUGHOUT', display: 'Requires Gestures throughout', baseCost: 1, exclusive: true },
      { xmlId: 'BOTHHAND', display: 'Requires both hands', baseCost: -0.25, exclusive: true },
      { xmlId: 'COMPLEX', display: 'Complex', baseCost: -0.25, exclusive: true },
    ],
    description: 'Character must make obvious gestures to activate or use the Power.',
  },

  // --- Incantations ---
  INCANTATIONS: {
    xmlId: 'INCANTATIONS',
    display: 'Incantations',
    baseCost: -0.25,
    maxCost: -0.25,
    exclusive: true,
    isAdvantage: false,
    isLimitation: true,
    hasOptions: false,
    hasLevels: false,
    adders: [
      { xmlId: 'CONSTANT', display: 'Requires Incantations throughout', baseCost: 1, exclusive: true },
      { xmlId: 'COMPLEX', display: 'Complex', baseCost: -0.25, exclusive: true },
    ],
    description: 'Character must speak loud phrases to activate the Power.',
  },

  // --- Linked ---
  LINKED: {
    xmlId: 'LINKED',
    display: 'Linked',
    baseCost: -0.5,
    maxCost: 0,
    exclusive: false,
    isAdvantage: false,
    isLimitation: true,
    hasOptions: false,
    hasLevels: false,
    adders: [
      { xmlId: 'ONLYWHENGREATERATFULL', display: 'Lesser Power can only be used when character uses greater Power at full value', baseCost: -0.25 },
      { xmlId: 'NONPROPORTIONAL', display: 'Lesser Power need not be used proportionally', baseCost: 0.25 },
      { xmlId: 'POWERRARELYOFF', display: 'Greater Power is Constant or in use most or all of the time', baseCost: 0.25 },
      { xmlId: 'ANYPHASE', display: 'Lesser Instant Power can be used in any Phase in which greater Constant Power is in use', baseCost: 0.25 },
    ],
    description: 'Power may only be used with another Power.',
  },

  // --- Limited Range ---
  LIMITEDRANGE: {
    xmlId: 'LIMITEDRANGE',
    display: 'Limited Range',
    baseCost: -0.25,
    exclusive: true,
    isAdvantage: false,
    isLimitation: true,
    hasOptions: false,
    hasLevels: false,
    description: 'Ranged Power has less than the normal range.',
  },

  // --- No Range ---
  NORANGE: {
    xmlId: 'NORANGE',
    display: 'No Range',
    baseCost: -0.5,
    exclusive: true,
    isAdvantage: false,
    isLimitation: true,
    hasOptions: false,
    hasLevels: false,
    description: 'Ranged Power which does not work at Range.',
  },

  // --- Requires A Roll ---
  REQUIRESASKILLROLL: {
    xmlId: 'REQUIRESASKILLROLL',
    display: 'Requires A Roll',
    baseCost: 0,
    minCost: -2.75,
    maxCost: -0.25,
    exclusive: true,
    isAdvantage: false,
    isLimitation: true,
    hasOptions: true,
    hasLevels: false,
    options: [
      { xmlId: '8', display: '8- roll', baseCost: -1.25 },
      { xmlId: '9', display: '9- roll', baseCost: -1 },
      { xmlId: '10', display: '10- roll', baseCost: -0.75 },
      { xmlId: '11', display: '11- roll', baseCost: -0.5 },
      { xmlId: '12', display: '12- roll', baseCost: -0.25 },
      { xmlId: '13', display: '13- roll', baseCost: 0 },
      { xmlId: '14', display: '14- roll', baseCost: 0.25 },
      { xmlId: 'SKILL', display: 'Skill roll', baseCost: -0.5 },
      { xmlId: 'SKILL1PER5', display: 'Skill roll, -1 per 5 Active Points', baseCost: -1 },
      { xmlId: 'SKILL1PER20', display: 'Skill roll, -1 per 20 Active Points', baseCost: -0.25 },
      { xmlId: 'CHAR', display: 'Characteristic roll', baseCost: -0.5 },
      { xmlId: 'CHAR1PER5', display: 'Characteristic roll, -1 per 5 Active Points', baseCost: -1 },
      { xmlId: 'CHAR1PER20', display: 'Characteristic roll, -1 per 20 Active Points', baseCost: -0.25 },
      { xmlId: 'PER', display: 'PER roll', baseCost: -0.5 },
      { xmlId: 'ATTACK', display: 'Attack roll', baseCost: -0.5 },
    ],
    description: 'Power requires a successful roll to activate.',
  },

  // --- Restrainable ---
  RESTRAINABLE: {
    xmlId: 'RESTRAINABLE',
    display: 'Restrainable',
    baseCost: -0.5,
    minCost: -0.5,
    maxCost: -0.25,
    exclusive: true,
    isAdvantage: false,
    isLimitation: true,
    hasOptions: false,
    hasLevels: false,
    adders: [
      { xmlId: 'NOTVSGRABORENTANGLE', display: 'Only by means other than Grabs and Entangles', baseCost: 0.25, exclusive: true },
    ],
    description: 'Power is generated by or based upon an area of the body which can be restrained.',
  },

  // --- Side Effects ---
  SIDEEFFECTS: {
    xmlId: 'SIDEEFFECTS',
    display: 'Side Effects',
    baseCost: 0,
    maxCost: 0,
    exclusive: false,
    isAdvantage: false,
    isLimitation: true,
    hasOptions: true,
    hasLevels: false,
    options: [
      { xmlId: 'MINOR', display: 'Minor Side Effect', baseCost: -0.25 },
      { xmlId: 'MAJOR', display: 'Major Side Effect', baseCost: -0.5 },
      { xmlId: 'EXTREME', display: 'Extreme Side Effect', baseCost: -1 },
    ],
    adders: [
      { xmlId: 'ALWAYSAFTERACT', display: 'Side Effect always occurs whenever the character does some specific act', baseCost: 0.25, exclusive: true },
      { xmlId: 'PREDEFINEDDAMAGE', display: 'Side Effect does a predefined amount of damage', baseCost: 0.25, exclusive: true },
      { xmlId: 'AFFECTSBOTH', display: 'Side Effect affects both character and recipient', baseCost: -0.25, exclusive: true },
      { xmlId: 'ONLYNEARCHARACTER', display: 'Side Effect only affects the environment near the character', baseCost: 0.25, exclusive: true },
      { xmlId: 'ONLYAFFECTSRECIPIENT', display: 'Side Effect only affects the recipient', baseCost: 0.25, exclusive: true },
    ],
    description: 'Power has negative effects on the character when used.',
  },

  // --- Costs Endurance ---
  COSTSEND: {
    xmlId: 'COSTSEND',
    display: 'Costs Endurance',
    abbreviation: 'Costs END',
    baseCost: -0.5,
    exclusive: true,
    isAdvantage: false,
    isLimitation: true,
    hasOptions: true,
    hasLevels: false,
    options: [
      { xmlId: 'ACTIVATE', display: 'Only Costs END to Activate', baseCost: -0.25 },
      { xmlId: 'EVERYPHASE', display: 'Costs END Every Phase', baseCost: -0.5 },
      { xmlId: 'HALFEND', display: 'Costs Half Endurance', baseCost: -0.25 },
    ],
    description: 'Makes a Power which naturally costs no END cost END.',
  },

  // --- Instant ---
  INSTANT: {
    xmlId: 'INSTANT',
    display: 'Instant',
    baseCost: -0.5,
    exclusive: true,
    isAdvantage: false,
    isLimitation: true,
    hasOptions: false,
    hasLevels: false,
    description: 'Converts a Constant Power into an Instant Power.',
  },

  // --- Nonpersistent ---
  NONPERSISTENT: {
    xmlId: 'NONPERSISTENT',
    display: 'Nonpersistent',
    baseCost: -0.25,
    exclusive: true,
    isAdvantage: false,
    isLimitation: true,
    hasOptions: false,
    hasLevels: false,
    description: 'Converts a Persistent Power to a Constant Power.',
  },

  // --- No Conscious Control ---
  NOCONSCIOUSCONTROL: {
    xmlId: 'NOCONSCIOUSCONTROL',
    display: 'No Conscious Control',
    abbreviation: 'NCC',
    baseCost: -2,
    minCost: -2,
    maxCost: -1,
    exclusive: true,
    isAdvantage: false,
    isLimitation: true,
    hasOptions: false,
    hasLevels: false,
    adders: [
      { xmlId: 'EFFECTSONLY', display: 'Only Effects cannot be controlled', baseCost: 1, exclusive: true },
    ],
    description: 'Power is not under the character\'s control. Only turns on when GM chooses.',
  },

  // --- Lockout ---
  LOCKOUT: {
    xmlId: 'LOCKOUT',
    display: 'Lockout',
    baseCost: -0.5,
    exclusive: true,
    isAdvantage: false,
    isLimitation: true,
    hasOptions: false,
    hasLevels: false,
    description: 'Power prevents the character from using some or all of his other powers when it\'s in use.',
  },

  // --- Range Based On Strength ---
  RANGEBASEDONSTR: {
    xmlId: 'RANGEBASEDONSTR',
    display: 'Range Based On Strength',
    abbreviation: 'Range Based On STR',
    baseCost: -0.25,
    exclusive: true,
    isAdvantage: false,
    isLimitation: true,
    hasOptions: false,
    hasLevels: false,
    description: 'Ranged Power whose Range is based on the character\'s STR.',
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get all modifiers combined into a single object
 */
export function getAllModifiers(): Record<string, ModifierDefinition> {
  return { ...ADVANTAGES, ...LIMITATIONS };
}

/**
 * Get a modifier by its XMLID
 */
export function getModifierByXmlId(xmlId: string): ModifierDefinition | undefined {
  return ADVANTAGES[xmlId] || LIMITATIONS[xmlId];
}

/**
 * Calculate the total value of a modifier given its configuration
 */
export function calculateModifierValue(
  modifier: ModifierDefinition,
  selectedOption?: string,
  levels?: number,
  adders?: { xmlId: string; optionId?: string; levels?: number }[]
): number {
  let total = modifier.baseCost;

  // Add option value if selected
  if (selectedOption && modifier.options) {
    const option = modifier.options.find(o => o.xmlId === selectedOption);
    if (option) {
      total = option.baseCost; // Options typically replace base cost
    }
  }

  // Add level cost if applicable
  if (levels && modifier.hasLevels && modifier.lvlCost) {
    total += modifier.lvlCost * (levels - 1); // First level is usually included in base
  }

  // Add adders
  if (adders && modifier.adders) {
    for (const adder of adders) {
      const adderDef = modifier.adders.find(a => a.xmlId === adder.xmlId);
      if (adderDef) {
        if (adder.optionId && adderDef.options) {
          const adderOption = adderDef.options.find(o => o.xmlId === adder.optionId);
          if (adderOption) {
            total += adderOption.baseCost;
          }
        } else {
          total += adderDef.baseCost;
          if (adder.levels && adderDef.lvlCost) {
            total += adderDef.lvlCost * (adder.levels - 1);
          }
        }
      }
    }
  }

  return total;
}

/**
 * Format a modifier value as a fraction string (e.g., "+1/4", "-1/2")
 */
export function formatModifierValue(value: number): string {
  if (value === 0) return '0';
  
  const sign = value > 0 ? '+' : '';
  const absValue = Math.abs(value);
  
  // Common fractions
  const fractions: Record<number, string> = {
    0.25: '1/4',
    0.5: '1/2',
    0.75: '3/4',
    1: '1',
    1.25: '1 1/4',
    1.5: '1 1/2',
    1.75: '1 3/4',
    2: '2',
    2.25: '2 1/4',
    2.5: '2 1/2',
    2.75: '2 3/4',
    3: '3',
    3.5: '3 1/2',
    4: '4',
  };

  const formatted = fractions[absValue] || absValue.toString();
  return `${sign}${value < 0 ? '-' : ''}${formatted}`;
}

// Export default
export default {
  ADVANTAGES,
  LIMITATIONS,
  getAllModifiers,
  getModifierByXmlId,
  calculateModifierValue,
  formatModifierValue,
};
