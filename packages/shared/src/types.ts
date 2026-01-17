/**
 * Hero Workshop - Shared Type Definitions
 * 
 * These types mirror the structure of .hdc files used by Hero Designer.
 */

// ============================================================================
// Core Character Types
// ============================================================================

export interface Character {
  version: string;
  basicConfiguration: BasicConfiguration;
  characterInfo: CharacterInfo;
  characteristics: Characteristic[];
  skills: Skill[];
  perks: Perk[];
  talents: Talent[];
  martialArts: MartialManeuver[];
  powers: Power[];
  disadvantages: Disadvantage[];
  equipment?: Equipment[];
  image?: CharacterImage;
  rules?: Rules;
  template?: Template;
}

export interface BasicConfiguration {
  basePoints: number;
  disadPoints: number;
  experience: number;
  exportTemplate?: string;
  ncm?: NormalCharacteristicMaxima;
}

export interface NormalCharacteristicMaxima {
  id: string;
  name: string;
  alias: string;
  position: number;
  levels: number;
  baseCost: number;
  notes?: string;
}

export interface CharacterInfo {
  characterName: string;
  alternateIdentities?: string;
  playerName?: string;
  height?: number;
  weight?: number;
  hairColor?: string;
  eyeColor?: string;
  campaignName?: string;
  genre?: string;
  gm?: string;
  background?: string;
  personality?: string;
  quote?: string;
  tactics?: string;
  campaignUse?: string;
  appearance?: string;
  notes1?: string;
  notes2?: string;
  notes3?: string;
  notes4?: string;
  notes5?: string;
}

export interface CharacterImage {
  data: string; // Base64 encoded
  fileName?: string;
  filePath?: string;
}

// ============================================================================
// Generic Object Base
// ============================================================================

export interface GenericObjectBase {
  id: string;
  name: string;
  alias?: string;
  abbreviation?: string;
  position: number;
  levels: number;
  baseCost: number;
  levelCost?: number;
  activeCost?: number;
  realCost?: number;
  notes?: string;
  display?: string;
  textOutput?: string;
  input?: string;
  inputLabel?: string;
  isEquipment?: boolean;
  isPower?: boolean;
  modifiers?: Modifier[];
  adders?: Adder[];
  parentId?: string; // Reference to parent LIST element if in a group
}

// ============================================================================
// Characteristics
// ============================================================================

export interface Characteristic extends GenericObjectBase {
  type: CharacteristicType;
  baseValue: number;
  totalValue: number;
  affectsPrimary: boolean;
  affectsTotal: boolean;
  useEndReserve?: boolean;
  addModifiersToBase?: boolean;
  roll?: number;
}

export type CharacteristicType = 
  | 'STR' | 'DEX' | 'CON' | 'INT' | 'EGO' | 'PRE'  // Primary
  | 'OCV' | 'DCV' | 'OMCV' | 'DMCV'                 // Combat
  | 'SPD' | 'PD' | 'ED' | 'REC' | 'END' | 'BODY' | 'STUN'  // Secondary
  | 'RUNNING' | 'SWIMMING' | 'LEAPING';             // Movement

// ============================================================================
// Skills
// ============================================================================

export interface Skill extends GenericObjectBase {
  type: SkillType;
  characteristic?: CharacteristicType | 'GENERAL';
  roll?: number;
  proficiency?: boolean;
  familiarity?: boolean;
  everyman?: boolean;
  categories?: string[];
  /** True if this is a skill enhancer (Jack of All Trades, Scholar, etc.) */
  isEnhancer?: boolean;
  /** The type of skill enhancer */
  enhancerType?: SkillEnhancerType;
  /** True if this is a grouping element (LIST) for organizing skills */
  isGroup?: boolean;
  /** True if this group should only contain everyman skills */
  isEverymanGroup?: boolean;
  /** Option for languages, skill levels, etc. */
  option?: string;
  optionAlias?: string;
  /** True if this is a native language (costs 0 pts) */
  nativeTongue?: boolean;
  /** The XMLID of the original skill (LANGUAGES, PROFESSIONAL_SKILL, etc.) */
  xmlid?: string;
}

export type SkillType =
  | 'CHARACTERISTIC_BASED'
  | 'BACKGROUND'
  | 'COMBAT'
  | 'KNOWLEDGE'
  | 'LANGUAGE'
  | 'PROFESSIONAL'
  | 'SCIENCE'
  | 'TRANSPORT_FAMILIARITY'
  | 'WEAPON_FAMILIARITY'
  | 'SKILL_LEVELS'
  | 'GENERAL';

/** Skill Enhancers reduce the cost of related skills bought under them */
export type SkillEnhancerType =
  | 'JACK_OF_ALL_TRADES'  // PS skills at 2 pts for full skill
  | 'LINGUIST'            // Languages at reduced cost
  | 'SCHOLAR'             // KS skills at 2 pts for full skill
  | 'SCIENTIST'           // SS skills at 2 pts for full skill
  | 'TRAVELER'            // AK/CK skills at 2 pts for full skill
  | 'WELL_CONNECTED';     // Contacts at reduced cost

// ============================================================================
// Powers
// ============================================================================

export interface Power extends GenericObjectBase {
  type: PowerType;
  effectDice?: string;
  endCost?: number;
  range?: PowerRange;
  target?: string;
  duration?: PowerDuration;
  defense?: string;
  doesDamage?: boolean;
  doesKnockback?: boolean;
  killing?: boolean;
  standardEffect?: boolean;
  framework?: PowerFramework;
  parentId?: string;
  isContainer?: boolean;  // True for LIST elements that group other powers
}

export type PowerType = 
  | 'ABSORPTION' | 'AID' | 'ARMOR' | 'AUTOMATON' | 'BLAST' | 'CHANGE_ENVIRONMENT'
  | 'CHARACTERISTICS' | 'CLAIRSENTIENCE' | 'CLINGING' | 'DARKNESS' | 'DEFLECTION'
  | 'DENSITY_INCREASE' | 'DESOLIDIFICATION' | 'DISPEL' | 'DRAIN' | 'DUPLICATION'
  | 'EGO_ATTACK' | 'ENDURANCE_RESERVE' | 'ENHANCED_SENSES' | 'ENTANGLE'
  | 'EXTRA_LIMBS' | 'FAST_MOVEMENT' | 'FIND_WEAKNESS' | 'FLASH' | 'FLASH_DEFENSE'
  | 'FLIGHT' | 'FTL_TRAVEL' | 'GROWTH' | 'HAND_ATTACK' | 'HEALING' | 'IMAGES'
  | 'INVISIBILITY' | 'KILLING_ATTACK' | 'KNOCKBACK_RESISTANCE' | 'LEAPING'
  | 'LIFE_SUPPORT' | 'LUCK' | 'MENTAL_DEFENSE' | 'MENTAL_ILLUSIONS' | 'MIND_CONTROL'
  | 'MIND_LINK' | 'MIND_SCAN' | 'MULTIFORM' | 'POWER_DEFENSE' | 'REGENERATION'
  | 'RESISTANT_PROTECTION' | 'RUNNING' | 'SHAPE_SHIFT' | 'SHRINKING' | 'STRETCHING'
  | 'SUMMON' | 'SWIMMING' | 'SWINGING' | 'TELEKINESIS' | 'TELEPATHY' | 'TELEPORTATION'
  | 'TRANSFORM' | 'TUNNELING' | 'LIST' | 'COMPOUNDPOWER' | 'GENERIC';

export type PowerRange = 'SELF' | 'NO_RANGE' | 'STANDARD' | 'LIMITED' | 'LINE_OF_SIGHT';
export type PowerDuration = 'INSTANT' | 'CONSTANT' | 'PERSISTENT' | 'INHERENT';

export interface PowerFramework {
  type: 'MULTIPOWER' | 'ELEMENTAL_CONTROL' | 'VARIABLE_POWER_POOL';
  poolSize?: number;
  controlCost?: number;
  slots?: Power[];
}

// ============================================================================
// Disadvantages
// ============================================================================

export interface Disadvantage extends GenericObjectBase {
  type: DisadvantageType;
  points: number;
  category?: string;
}

export type DisadvantageType =
  | 'ACCIDENTAL_CHANGE' | 'DEPENDENCE' | 'DEPENDENT_NPC' | 'DISTINCTIVE_FEATURES'
  | 'ENRAGED' | 'HUNTED' | 'NEGATIVE_REPUTATION' | 'PHYSICAL_COMPLICATION'
  | 'PSYCHOLOGICAL_COMPLICATION' | 'RIVALRY' | 'SOCIAL_COMPLICATION'
  | 'SUSCEPTIBILITY' | 'UNLUCK' | 'VULNERABILITY' | 'GENERIC';

// ============================================================================
// Perks
// ============================================================================

export interface Perk extends GenericObjectBase {
  type: PerkType;
}

export type PerkType =
  | 'ANONYMITY' | 'BASE' | 'COMPUTER_LINK' | 'CONTACT' | 'DEEP_COVER'
  | 'FAVOR' | 'FOLLOWER' | 'FRINGE_BENEFIT' | 'MONEY' | 'POSITIVE_REPUTATION'
  | 'REPUTATION' | 'VEHICLE' | 'VEHICLE_BASE' | 'GENERIC';

// ============================================================================
// Talents
// ============================================================================

export interface Talent extends GenericObjectBase {
  type: TalentType;
  characteristic?: CharacteristicType;
}

export type TalentType =
  | 'ABSOLUTE_RANGE_SENSE' | 'ABSOLUTE_TIME_SENSE' | 'AMBIDEXTERITY'
  | 'BUMP_OF_DIRECTION' | 'COMBAT_LUCK' | 'DANGER_SENSE' | 'DOUBLE_JOINTED'
  | 'EIDETIC_MEMORY' | 'ENVIRONMENTAL_MOVEMENT' | 'LIGHTNING_CALCULATOR'
  | 'LIGHTNING_REFLEXES' | 'LIGHTSLEEP' | 'OFF_HAND_DEFENSE' | 'PERFECT_PITCH'
  | 'RESISTANCE' | 'SIMULATE_DEATH' | 'SPEED_READING' | 'STRIKING_APPEARANCE'
  | 'UNIVERSAL_TRANSLATOR' | 'GENERIC';

// ============================================================================
// Martial Arts
// ============================================================================

export interface MartialManeuver extends GenericObjectBase {
  ocv: number;
  dcv: number;
  damage?: string;
  effect?: string;
  weaponElements?: WeaponElement[];
}

export interface WeaponElement extends GenericObjectBase {
  weaponType: string;
}

// ============================================================================
// Equipment
// ============================================================================

export interface Equipment extends GenericObjectBase {
  xmlId?: string;
  price?: number;
  weight?: number;
  carried?: boolean;
  activeCost?: number;
  realCost?: number;
  endCost?: number;
  subPowers?: Power[];
}

// ============================================================================
// Modifiers & Adders
// ============================================================================

export interface Modifier {
  id: string;
  name: string;
  alias?: string;
  value: number;
  isAdvantage: boolean;
  isLimitation: boolean;
  notes?: string;
  levels?: number;
  adders?: Adder[];
  input?: string;        // Defense name for AVAD, etc.
  optionId?: string;     // Option identifier (e.g., 'RADIUS', 'LINE' for AOE)
  optionAlias?: string;  // Display name for option (e.g., 'Radius', 'Line')
}

export interface Adder {
  id: string;
  xmlId?: string;  // The XMLID from the template (e.g., 'MINUSONEPIP', 'PLUSONEHALFDIE')
  name: string;
  alias?: string;
  baseCost: number;
  levels?: number;
  lvlCost?: number;
  lvlVal?: number;
  notes?: string;
  optionAlias?: string;
  includeInBase?: boolean;
}

// ============================================================================
// Rules & Templates
// ============================================================================

export interface Rules {
  name: string;
  basePoints: number;
  disadPoints: number;
  apPerEnd: number;
  strApPerEnd: number;
  
  // Response settings (0=none, 1=warn, 2=block)
  attackApMaxValue: number;
  attackApMaxResponse: number;
  defenseApMaxValue: number;
  defenseApMaxResponse: number;
  disadCategoryMaxValue: number;
  disadCategoryMaxResponse: number;
  
  // Characteristic maximums
  characteristicMaxima: Record<CharacteristicType, number>;
  
  // Options
  standardEffectAllowed: boolean;
  multiplierAllowed: boolean;
  literacyFree: boolean;
  nativeLiteracyFree: boolean;
  equipmentAllowed: boolean;
  useSkillMaxima: boolean;
  skillMaximaLimit: number;
  skillRollBase: number;
  skillRollDenominator: number;
  charRollBase: number;
  charRollDenominator: number;
  
  // Notes labels
  notes1Label?: string;
  notes2Label?: string;
  notes3Label?: string;
  notes4Label?: string;
  notes5Label?: string;
  useNotes1?: boolean;
  useNotes2?: boolean;
  useNotes3?: boolean;
  useNotes4?: boolean;
  useNotes5?: boolean;
}

export interface Template {
  id: string;
  name: string;
  edition: '5e' | '6e';
  originalPath?: string;
  characteristics: Characteristic[];
  skills: GenericObjectBase[];
  perks: GenericObjectBase[];
  talents: GenericObjectBase[];
  powers: GenericObjectBase[];
  disadvantages: GenericObjectBase[];
}

// ============================================================================
// API Types
// ============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
  parents?: string[];
  webViewLink?: string;
}

export interface DriveFileList {
  files: DriveFile[];
  nextPageToken?: string;
}

export interface UserInfo {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

// ============================================================================
// Character Summary (for list views)
// ============================================================================

export interface CharacterSummary {
  fileId: string;
  fileName: string;
  characterName: string;
  playerName?: string;
  basePoints: number;
  totalPoints: number;
  modifiedTime: string;
}
