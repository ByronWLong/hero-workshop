/**
 * Hero System 6th Edition Modifier Definitions
 * 
 * BASECOST values:
 * - Positive values = Advantages (increase power cost)
 * - Negative values = Limitations (reduce power cost)
 * - Values are fractions (e.g., 0.25 = +1/4, -0.5 = -1/2)
 */

import { MODIFIER_CATALOG_6E, POWER_CATALOG_6E, type CatalogAdder, type CatalogEntry, type CatalogOption } from './generated/catalog6e.js';
import { heroRoundCost } from './utils.js';

/** Hero Designer's template has a few unclosed brackets ("Costs Endurance (to maintain") */
const balanced = (s: string) => s + ')'.repeat(Math.max(0, (s.match(/\(/g) ?? []).length - (s.match(/\)/g) ?? []).length));

// ============================================================================
// TYPES
// ============================================================================

export interface ModifierOption {
  xmlId: string;
  /** Hero Designer's name for the option, which it stores as OPTION_ALIAS ("OAF", "4") */
  display: string;
  /** A fuller name for choosing it ("Obvious Accessible Focus (OAF)"), when it has one */
  label?: string;
  baseCost: number;
  lvlCost?: number;
  lvlVal?: number;
  levelStart?: number;
  /** Adders only this option offers (Area Of Effect's Accurate is for a Radius only) */
  adders?: ModifierAdder[];
}

export interface ModifierAdder {
  xmlId: string;
  display: string;
  /** The display with its level placeholder, for leveled adders ("x[LVL] Shots") */
  levelDisplay?: string;
  abbreviation?: string;
  baseCost: number;
  required?: boolean;
  exclusive?: boolean;
  lvlCost?: number;
  lvlVal?: number;
  /** The level multiplies rather than adds ("x[LVL] Shots": 2 to the levels) */
  lvlPower?: number;
  minVal?: number;
  levelStart?: number;
  options?: ModifierOption[];
  excludes?: string[];
  /** Adders that must be taken with this one */
  requires?: string[];
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
  /** Modifiers of this modifier (Gestures' "throughout" doubles its value) */
  subModifiers?: ModifierDefinition[];
  /** Power types it applies to (template TYPE), and what it can't be combined with */
  types?: string[];
  excludes?: string[];
  requires?: string[];
  /** What the modifier's free-text detail (Hero Designer's INPUT) is, e.g. AVAD's "Defense" */
  inputLabel?: string;
  description?: string;
}

// ============================================================================
// DEFINITIONS
// ============================================================================

/**
 * What the editor shows differently from Hero Designer's template. Everything else, costs,
 * options and adders included, comes from the template (Main6E.hdt) so new template data is
 * never hidden behind an older hand-written copy.
 */
const CURATED: Record<string, { display?: string; isLimitation?: boolean; optionLabels?: Record<string, string>; optionOrder?: string[] }> = {
  // The template's name carries the level ("x[LVL] Characteristics or Powers simultaneously");
  // its BASECOST is -1/2 but it's an advantage (levels start at 2)
  EXPANDEDEFFECT: { display: 'Expanded Effect', isLimitation: false },
  CHARGES: {
    optionLabels: {
      ONE: '1 Charge', TWO: '2 Charges', THREE: '3 Charges', FOUR: '4 Charges', SIX: '6 Charges', EIGHT: '8 Charges',
      TWELVE: '12 Charges', SIXTEEN: '16 Charges', THIRTYTWO: '32 Charges', SIXTYFOUR: '64 Charges',
      ONETWENTYFIVE: '125 Charges', TWOFIFTY: '250 Charges', FIVEHUNDRED: '500 Charges', ONETHOUSAND: '1000 Charges',
      TWOTHOUSAND: '2000 Charges', FOURTHOUSAND: '4000 Charges', EIGHTTHOUSAND: '8000 Charges', SIXTEENTHOUSAND: '16000 Charges',
    },
  },
  FOCUS: {
    optionLabels: {
      IIF: 'Inobvious Inaccessible Focus (IIF)',
      IAF: 'Inobvious Accessible Focus (IAF)',
      OIF: 'Obvious Inaccessible Focus (OIF)',
      OAF: 'Obvious Accessible Focus (OAF)',
    },
  },
  // Rolls from worst to best, then the skill-based ones
  REQUIRESASKILLROLL: { optionOrder: ['8', '9', '10', '11', '12', '13', '14'] },
};

export const ADVANTAGES: Record<string, ModifierDefinition> = {};

export const LIMITATIONS: Record<string, ModifierDefinition> = {
  // --- Spell (Fantasy Hero) ---
  // Not in Hero Designer's 6E template (its 5E one has it); hero6e supports it in 6E as SPELL
  SPELL: {
    xmlId: 'SPELL',
    display: 'Spell',
    baseCost: -0.5,
    exclusive: true,
    isAdvantage: false,
    isLimitation: true,
    hasOptions: false,
    hasLevels: false,
    description: "(Fantasy Hero) A spell can't use the same combat modifiers and maneuvers as regular attacks.",
  },
};

for (const entry of MODIFIER_CATALOG_6E) {
  const definition = curated(modifierFromCatalog(entry));
  (definition.isLimitation ? LIMITATIONS : ADVANTAGES)[entry.xmlId] = definition;
}

function curated(def: ModifierDefinition): ModifierDefinition {
  const c = CURATED[def.xmlId];
  if (!c) return def;
  const isLimitation = c.isLimitation ?? def.isLimitation;
  const order = c.optionOrder ?? [];
  const rank = (o: ModifierOption) => (order.includes(o.xmlId) ? order.indexOf(o.xmlId) : order.length);
  return {
    ...def,
    display: c.display ?? def.display,
    isLimitation,
    isAdvantage: !isLimitation,
    options: def.options
      ?.map((o) => (c.optionLabels?.[o.xmlId] ? { ...o, label: c.optionLabels[o.xmlId] } : o))
      .map((o, i) => ({ o, i }))
      .sort((a, b) => rank(a.o) - rank(b.o) || a.i - b.i)
      .map(({ o }) => o),
  };
}

// Modifiers only some powers can take (e.g. Hand-To-Hand Attack's mandatory limitation), by power
const POWER_SPECIFIC = new Map<string, ModifierDefinition[]>();
const POWER_SPECIFIC_BY_ID: Record<string, ModifierDefinition> = {};
for (const power of POWER_CATALOG_6E) {
  // A power's own definition can differ from a general modifier with the same XMLID (Drain's
  // Costs Endurance (to maintain) has no Full/Half options), so it's kept as the power defines it
  const own = (power.modifiers ?? []).map((e) => modifierFromCatalog(e));
  if (!own.length) continue;
  POWER_SPECIFIC.set(power.xmlId, own);
  for (const m of own) POWER_SPECIFIC_BY_ID[m.xmlId] ??= m;
}

/** A modifier as this power defines it, else the general definition */
export function modifierFor(xmlId: string, powerXmlId?: string, powerModifiers: PowerModifier[] = []): ModifierDefinition | undefined {
  const def = (powerXmlId && POWER_SPECIFIC.get(powerXmlId)?.find((m) => m.xmlId === xmlId)) || getModifierByXmlId(xmlId);
  // Time Limit's values depend on the power's duration (TimeLimit.setParent)
  if (def && xmlId === 'TIMELIMIT') return timeLimitFor(def, { xmlId: powerXmlId, modifiers: powerModifiers });
  return def;
}

/** Modifiers this power can take beyond the general ones */
export function powerSpecificModifiers(powerXmlId: string | undefined): ModifierDefinition[] {
  return (powerXmlId && POWER_SPECIFIC.get(powerXmlId)) || [];
}

function modifierFromCatalog(e: CatalogEntry): ModifierDefinition {
  // Option-priced modifiers (e.g. Delayed Return Rate, Required Hands) have no BASECOST of their own
  const optionCosts = (e.options ?? []).map((o) => o.baseCost ?? 0);
  const baseCost = e.baseCost || (optionCosts.find((c) => c !== 0) ?? 0);
  const isLimitation = e.isLimitation ?? (baseCost < 0 || (baseCost === 0 && (e.lvlCost ?? 0) < 0));
  return {
    xmlId: e.xmlId,
    display: balanced(withoutLevel(e.display)),
    abbreviation: e.abbreviation,
    baseCost,
    lvlCost: e.lvlCost,
    lvlVal: e.lvlVal,
    lvlPower: e.lvlPower,
    minCost: e.minCost,
    maxCost: e.maxCost,
    minVal: e.minVal,
    maxVal: e.maxVal,
    levelStart: e.levelStart,
    exclusive: e.exclusive,
    isAdvantage: !isLimitation,
    isLimitation,
    hasOptions: !!e.options?.length,
    hasLevels: e.lvlCost !== undefined && e.lvlCost !== 0,
    options: e.options?.map(optionFromCatalog),
    adders: e.adders?.map(adderFromCatalog),
    subModifiers: e.modifiers?.length ? e.modifiers.map(modifierFromCatalog) : undefined,
    types: e.types,
    excludes: e.excludes,
    requires: e.requires,
    inputLabel: e.inputLabel,
    description: e.description,
  };
}

/** Hero Designer display names carry a level placeholder ("Reduced Negation ([LVL])") */
function withoutLevel(display: string): string {
  return display.replace(/\s*\(\[LVL\]\)|\s*\[LVL\]/g, '').trim();
}

function optionFromCatalog(o: CatalogOption): ModifierOption {
  return {
    xmlId: o.xmlId,
    display: o.display,
    baseCost: o.baseCost ?? 0,
    lvlCost: o.lvlCost,
    lvlVal: o.lvlVal,
    levelStart: o.levelStart,
    adders: o.adders?.length ? o.adders.map(adderFromCatalog) : undefined,
  };
}

function adderFromCatalog(a: CatalogAdder): ModifierAdder {
  return {
    xmlId: a.xmlId,
    display: withoutLevel(a.display),
    levelDisplay: a.display.includes('[LVL]') ? a.display : undefined,
    baseCost: a.baseCost,
    required: a.required,
    exclusive: a.exclusive,
    lvlCost: a.lvlCost,
    lvlVal: a.lvlVal,
    lvlPower: a.lvlPower,
    minVal: a.minVal,
    levelStart: a.levelStart,
    options: a.options?.map(optionFromCatalog),
    excludes: a.excludes,
    requires: a.requires,
  };
}

/** The adders a modifier offers with this option chosen: its own plus the option's */
export function modifierAdders(def: ModifierDefinition | undefined, optionId?: string): ModifierAdder[] {
  const option = optionId ? def?.options?.find((o) => o.xmlId === optionId) : undefined;
  return [...(def?.adders ?? []), ...(option?.adders ?? [])];
}

// ============================================================================
// No Normal Defense
// ============================================================================

/**
 * 6E's No Normal Defense is a shortcut, not a modifier of its own in Hero Designer: Attack
 * Versus Alternate Defense from a Very Common defense to a Rare one, with All Or Nothing, naming
 * the rare defense. The editor offers and shows it as its own advantage.
 */
export const NND = {
  /** The add-advantage choice that stands for it */
  choice: 'AVAD:NND',
  display: 'No Normal Defense (NND)',
  option: 'VERYRARE',
  optionDisplay: 'Very Common -> Rare',
  adder: 'NND',
} as const;

/** An AVAD set up as No Normal Defense */
export function isNnd(m: { xmlId?: string; optionId?: string; adders?: { xmlId?: string }[] }): boolean {
  return m.xmlId === 'AVAD' && m.optionId === NND.option && !!m.adders?.some((a) => a.xmlId === NND.adder);
}

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
  return ADVANTAGES[xmlId] || LIMITATIONS[xmlId] || POWER_SPECIFIC_BY_ID[xmlId];
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
  if (adders) {
    for (const adder of adders) {
      const adderDef = modifierAdders(modifier, selectedOption).find(a => a.xmlId === adder.xmlId);
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

/**
 * A modifier's value held within its template MINCOST/MAXCOST, as Hero Designer holds it
 * (Modifier.getTotalValue): Requires A Roll is at most -1/4, so its 14- roll (+1/4 in the
 * template) comes to -1/4
 */
export function clampModifierValue(def: Pick<ModifierDefinition, 'minCost' | 'maxCost'> | undefined, value: number): number {
  if (def?.minCost !== undefined && value < def.minCost) return def.minCost;
  if (def?.maxCost !== undefined && value > def.maxCost) return def.maxCost;
  return value;
}

/** Hero Designer's 6E level multipliers (Main6E.hdt): a Cone reaches 4x a Radius, a Line 8x */
const AOE_SHAPES: Record<string, number> = { RADIUS: 2, CONE: 4, LINE: 8, SURFACE: 1, ANY: 1 };

/**
 * Area of Effect, as Hero Designer prices it in 6E (AreaEffect.getTotalValue): +1/4 for each
 * doubling of the area's size over the shape's multiplier, at least +1/4 (4m Radius +1/4,
 * 8m +1/2, 16m +3/4, 32m +1)
 */
export function aoeValue(shape: string, size: number): number {
  if (size <= 0) return 0.25;
  const doublings = Math.ceil(Math.log(size / (AOE_SHAPES[shape] ?? 1)) / Math.log(2) - 1e-9);
  return Math.max(1, doublings) * 0.25;
}

// ============================================================================
// Charges
// ============================================================================

/**
 * Rows of the Charges Table that an option moves the power down (6E1 368-370): Boostable one,
 * Recoverable two (Main6E.hdt's BOOSTABLELEVEL/RECOVERABLELEVEL), Continuing by its duration
 * (the option's LVLVAL), Clips one per level, applied last
 */
const CHARGES_ROWS: Record<string, (a: { optionId?: string; levels?: number }, def: ModifierAdder | undefined) => number> = {
  CONTINUING: (a, def) => def?.options?.find((o) => o.xmlId === a.optionId)?.lvlVal ?? 0,
  BOOSTABLE: () => 1,
  RECOVERABLE: () => 2,
  CLIPS: (a) => a.levels ?? 0,
};

/**
 * Prices Charges' table-shifting adders as Hero Designer does (Charges.setSelectedOption): each
 * is worth the difference between the row it starts from and the row it moves to. Rows past the
 * end of the table keep going up by the last step (+1/4). Other adders keep their own cost.
 */
export function priceChargesAdders<A extends { xmlId?: string; optionId?: string; levels?: number; baseCost: number }>(
  def: ModifierDefinition,
  optionId: string | undefined,
  adders: A[],
): A[] {
  const rows = def.options ?? [];
  if (!rows.length) return adders;
  const last = rows[rows.length - 1]!.baseCost;
  const step = rows.length > 1 ? last - rows[rows.length - 2]!.baseCost : 0.25;
  const row = (i: number) => (i < rows.length ? rows[Math.max(0, i)]!.baseCost : last + (i - rows.length + 1) * step);
  const start = Math.max(0, rows.findIndex((o) => o.xmlId === optionId));
  const adderDefs = modifierAdders(def, optionId);
  const order = Object.keys(CHARGES_ROWS);
  let at = start;
  const priced = new Map<A, number>();
  for (const a of [...adders].sort((x, y) => order.indexOf(x.xmlId ?? '') - order.indexOf(y.xmlId ?? ''))) {
    const shift = a.xmlId ? CHARGES_ROWS[a.xmlId] : undefined;
    if (!shift) continue;
    const n = shift(a, adderDefs.find((d) => d.xmlId === a.xmlId));
    priced.set(a, row(at + n) - row(at));
    at += n;
  }
  return adders.map((a) => (priced.has(a) ? { ...a, baseCost: priced.get(a)! } : a));
}

/**
 * The most Charges can be worth (Charges.getTotalValue): +1 (0 END on an Autofire attack, 6E1
 * 368) on a power that costs END, -0 on one that doesn't; Boostable raises it by its own value.
 * Continuing Charges aren't capped on a power that costs END. Undefined means no cap.
 */
export function chargesMaxValue(adders: { xmlId?: string; baseCost: number }[], powerUsesEnd: boolean): number | undefined {
  if (powerUsesEnd && adders.some((a) => a.xmlId === 'CONTINUING')) return undefined;
  const boostable = adders.find((a) => a.xmlId === 'BOOSTABLE')?.baseCost ?? 0;
  return (powerUsesEnd ? 1 : 0) + boostable;
}

/**
 * Whether a power costs END apart from its Charges (Charges.parentUsesEND): Costs Endurance makes
 * it, Reduced Endurance (0 END) stops it, half END doesn't
 */
export function costsEndBesidesCharges(defaultUsesEnd: boolean, modifiers: { xmlId?: string; optionId?: string }[]): boolean {
  const reduced = modifiers.find((m) => m.xmlId === 'REDUCEDEND');
  if (reduced) return reduced.optionId === 'HALFEND';
  return defaultUsesEnd || modifiers.some((m) => m.xmlId === 'COSTSEND');
}

// ============================================================================
// Modifiers of modifiers
// ============================================================================

const SUB_MODIFIERS: Record<string, ModifierDefinition> = {};
for (const def of [...Object.values(ADVANTAGES), ...Object.values(LIMITATIONS)]) {
  for (const sub of def.subModifiers ?? []) SUB_MODIFIERS[`${def.xmlId}/${sub.xmlId}`] = sub;
}

/** One of a modifier's own modifiers, as the template defines it under that modifier */
export function subModifierFor(parentXmlId: string | undefined, xmlId: string | undefined): ModifierDefinition | undefined {
  return parentXmlId && xmlId ? SUB_MODIFIERS[`${parentXmlId}/${xmlId}`] : undefined;
}

/** Rounds to the nearest 1/4, halves away from zero, as Hero Designer rounds modifier values */
const nearestQuarter = (value: number) => (Math.sign(value) * Math.round(Math.abs(value) * 4)) / 4;

/**
 * A modifier's value with its own modifiers applied, as Hero Designer works it out
 * (Modifier.getTotalValue): value x (1 + their advantages) / (1 + their limitations), to the
 * nearest 1/4, before the modifier's own MINCOST/MAXCOST. So Gestures "throughout" (+1) doubles
 * Gestures and Extra Time "Only to Activate" (-1) halves Extra Time (6E1 375, 381).
 *
 * Damage Over Time's are different (DamageOverTime.getTotalValue): "defenses only apply once"
 * doubles the increments' value and "lock out" doubles the time's (or zeroes it if positive).
 */
export function withSubModifiers(
  m: { xmlId?: string; adders?: { xmlId?: string; baseCost: number; levels?: number; lvlCost?: number }[]; modifiers?: { xmlId?: string; value: number }[] },
  value: number,
): number {
  const subs = m.modifiers ?? [];
  if (!subs.length) return value;
  let total = value;
  let others = subs;
  if (m.xmlId === 'DAMAGEOVERTIME') {
    const cost = (id: string) => {
      const a = m.adders?.find((x) => x.xmlId === id);
      return a ? a.baseCost + (a.levels ?? 0) * (a.lvlCost ?? 0) : 0;
    };
    const time = cost('TIMEBETWEEN');
    if (subs.some((s) => s.xmlId === 'ONEDEFENSE')) total += cost('INCREMENTS');
    if (subs.some((s) => s.xmlId === 'LOCKOUT')) total += time > 0 ? -time : time;
    others = subs.filter((s) => s.xmlId !== 'ONEDEFENSE' && s.xmlId !== 'LOCKOUT');
  }
  const advantages = others.filter((s) => s.value > 0).reduce((sum, s) => sum + s.value, 0);
  const limitations = others.filter((s) => s.value < 0).reduce((sum, s) => sum - s.value, 0);
  return nearestQuarter((total * (1 + advantages)) / (1 + limitations));
}

/**
 * Whether a modifier offers one of its own modifiers on this power (Gestures.getAvailableModifiers):
 * "throughout" is for powers that last (not Instant ones), unless the power takes Extra Time or is
 * Mind Control, Mind Scan, Mind Link, Telepathy or Barrier
 */
export function subModifierOffered(
  xmlId: string,
  power: { xmlId?: string; duration?: string; modifiers?: { xmlId?: string }[] },
): boolean {
  if (!['THROUGHOUT', 'CONSTANT', 'CONTINUOUSCONCENTRATION'].includes(xmlId)) return true;
  const mods = power.modifiers ?? [];
  const constant = mods.some((m) => m.xmlId === 'CONTINUOUS');
  if ((power.duration ?? 'INSTANT') !== 'INSTANT' || constant) return true;
  if (mods.some((m) => m.xmlId === 'EXTRATIME' || m.xmlId === 'REGENEXTRATIME')) return true;
  return ['MINDCONTROL', 'MINDSCAN', 'MINDLINK', 'TELEPATHY', 'FORCEWALL'].includes(power.xmlId ?? '');
}

/** How a modifier's own modifiers show in its name: ", throughout" (their abbreviation or alias) */
export function subModifierSuffix(parentXmlId: string | undefined, subs: { xmlId?: string; alias?: string; name: string }[] | undefined): string {
  return (subs ?? [])
    .map((s) => `, ${subModifierFor(parentXmlId, s.xmlId)?.abbreviation ?? s.alias ?? s.name}`)
    .join('');
}

// ============================================================================
// Values that depend on the power
// ============================================================================

/** What the power-dependent rules need to know of a power's other modifiers */
export interface PowerModifier {
  xmlId?: string;
  optionId?: string;
  adders?: { xmlId?: string; baseCost: number }[];
}

/** The power, as the power-dependent rules see it */
export interface PowerContext {
  xmlId?: string;
  modifiers: PowerModifier[];
}

/** The template's powers (Mind Scan also appears as an empty entry; the complete one is kept) */
export const POWER_TEMPLATE = new Map(
  POWER_CATALOG_6E.filter((p) => p.duration || !POWER_CATALOG_6E.some((o) => o !== p && o.xmlId === p.xmlId)).map((p) => [p.xmlId, p]),
);

/** Whether a power costs END by its template (USESEND), absent meaning it does */
const templateUsesEnd = (powerXmlId: string | undefined) => POWER_TEMPLATE.get(powerXmlId ?? '')?.usesEnd !== false;

/**
 * A power's duration with its modifiers (GenericObject.getDuration): Instant makes it Instant,
 * Nonpersistent makes a Persistent power Constant, Inherent/Persistent/Constant advantages raise
 * it, and a Persistent power that costs END is Constant
 */
export function effectiveDuration(power: PowerContext): string {
  const base = POWER_TEMPLATE.get(power.xmlId ?? '')?.duration ?? 'INSTANT';
  const has = (id: string) => power.modifiers.some((m) => m.xmlId === id);
  if (has('INSTANT')) return 'INSTANT';
  const lasting = (duration: string) =>
    costsEndBesidesCharges(templateUsesEnd(power.xmlId), power.modifiers) && !has('COSTSENDTOMAINTAIN') ? 'CONSTANT' : duration;
  if (base === 'PERSISTENT' || base === 'INHERENT') return has('NONPERSISTENT') ? 'CONSTANT' : lasting(base);
  if (has('INHERENT')) return lasting('INHERENT');
  if (has('PERSISTENT')) return lasting('PERSISTENT');
  if (has('CONTINUOUS')) return 'CONSTANT';
  return base === 'CONSTANT' ? 'CONSTANT' : 'INSTANT';
}

const options = (table: [string, string, number][]): ModifierOption[] => table.map(([xmlId, display, baseCost]) => ({ xmlId, display, baseCost }));

/** Time Limit's tables (6E1 346; TimeLimit.setParent) */
const TIME_LIMIT = {
  /** Instant powers: an Advantage */
  instant: options([
    ['EXTRAPHASE', 'Extra Phase', 0.25], ['1TURN', '1 Turn', 0.5], ['1MINUTE', '1 Minute', 0.75], ['5MINUTES', '5 Minutes', 1],
    ['20MINUTES', '20 Minutes', 1.25], ['1HOUR', '1 Hour', 1.5], ['6HOURS', '6 Hours', 1.75], ['1DAY', '1 Day', 2],
    ['1WEEK', '1 Week', 2.25], ['1MONTH', '1 Month', 2.5], ['1SEASON', '1 Season', 2.75], ['1YEAR', '1 Year', 3],
    ['5YEARS', '5 Years', 3.25], ['25YEARS', '25 Years', 3.5], ['1CENTURY', '1 Century', 3.75],
  ]),
  /** Constant powers: an Advantage */
  constant: options([
    ['1TURN', '1 Turn', 0.25], ['1MINUTE', '1 Minute', 0.5], ['5MINUTES', '5 Minutes', 0.75], ['20MINUTES', '20 Minutes', 1],
    ['1HOUR', '1 Hour', 1.25], ['6HOURS', '6 Hours', 1.5], ['1DAY', '1 Day', 1.75], ['1WEEK', '1 Week', 2],
    ['1MONTH', '1 Month', 2.25], ['1SEASON', '1 Season', 2.5], ['1YEAR', '1 Year', 2.75], ['5YEARS', '5 Years', 3],
    ['25YEARS', '25 Years', 3.25], ['1CENTURY', '1 Century', 3.5],
  ]),
  /** Persistent powers, and Instant ones that linger: a Limitation */
  limitation: options([
    ['EXTRAPHASE', 'Extra Phase', -3], ['1TURN', '1 Turn', -2.5], ['1MINUTE', '1 Minute', -2], ['5MINUTES', '5 Minutes', -1.5],
    ['20MINUTES', '20 Minutes', -1], ['1HOUR', '1 Hour', -0.75], ['6HOURS', '6 Hours', -0.5], ['1DAY', '1 Day', -0.25],
    ['1WEEK', '1 Week', 0],
  ]),
};

/**
 * Time Limit as this power can take it: an Advantage for Instant and Constant powers, a Limitation
 * for Persistent ones and for Instant powers whose effect lingers (Telepathy, Mind Control,
 * Entangle, Barrier)
 */
function timeLimitFor(def: ModifierDefinition, power: PowerContext): ModifierDefinition {
  const duration = effectiveDuration(power);
  const lingers = ['TELEPATHY', 'MINDCONTROL', 'ENTANGLE', 'FORCEWALL'].includes(power.xmlId ?? '');
  const table =
    duration === 'PERSISTENT' || (duration === 'INSTANT' && lingers)
      ? TIME_LIMIT.limitation
      : duration === 'CONSTANT'
        ? TIME_LIMIT.constant
        : duration === 'INSTANT'
          ? TIME_LIMIT.instant
          : [];
  if (!table.length) return def;
  const isLimitation = table[0]!.baseCost < 0;
  return { ...def, options: table, hasOptions: true, baseCost: table[0]!.baseCost, isLimitation, isAdvantage: !isLimitation };
}

/** Powers whose Autofire costs +1 more however they're targeted (Autofire.getTotalValue) */
const AUTOFIRE_SURCHARGED = ['DRAIN', 'TRANSFORM', 'TRANSFER', 'AID', 'DISPEL', 'HEALING', 'SUCCOR', 'SUPPRESS'];

/**
 * A modifier's value on this power, where Hero Designer makes it depend on the power:
 * - Autofire costs +1 more on an ability that doesn't target DCV (Mental and area attacks, among
 *   others) and on Drain, Transform, Aid, Dispel and Healing (6E1 327), unless its Non-Standard
 *   Attack Power adder already pays it; Images and Absorption are exempt. (Hero Designer looks for
 *   5E's NND/AVLD here, so a 6E AVAD isn't surcharged; the book says it should be.)
 * - Reduced Endurance costs double on an Autofire power (6E1 327)
 * - Increased Endurance Cost is worth half with Costs END Only To Activate (6E1 345)
 * - Charges are capped (chargesMaxValue)
 */
export function valueOnPower(m: PowerModifier & { value: number }, power: PowerContext): number {
  const others = power.modifiers.filter((o) => o !== m);
  const has = (id: string) => others.some((o) => o.xmlId === id);
  switch (m.xmlId) {
    case 'AUTOFIRE': {
      const template = POWER_TEMPLATE.get(power.xmlId ?? '');
      if (!template || m.adders?.some((a) => a.xmlId === 'ODDPOWER')) return m.value;
      if (template.xmlId === 'IMAGES' || template.xmlId === 'ABSORPTION') return m.value;
      const surcharged =
        (template.target !== undefined && template.target !== 'DCV') ||
        has('AOE') ||
        !!template.types?.includes('MENTAL') ||
        has('NND') ||
        has('AVLD') ||
        AUTOFIRE_SURCHARGED.includes(template.xmlId);
      return surcharged ? m.value + 1 : m.value;
    }
    case 'REDUCEDEND':
      return has('AUTOFIRE') ? m.value * 2 : m.value;
    case 'INCREASEDEND':
      return has('COSTSENDONLYTOACTIVATE') ? m.value / 2 : m.value;
    case 'CHARGES': {
      const max = chargesMaxValue(m.adders ?? [], costsEndBesidesCharges(templateUsesEnd(power.xmlId), others));
      return max !== undefined && m.value > max ? max : m.value;
    }
    default:
      return m.value;
  }
}

/** Modifiers whose value depends on the power's other modifiers, so they're repriced together */
export const POWER_DEPENDENT_MODIFIERS = new Set(['AUTOFIRE', 'REDUCEDEND', 'INCREASEDEND', 'CHARGES', 'TIMELIMIT']);

// ============================================================================
// END cost
// ============================================================================

/** Rounds to a whole number, halves down, as Hero Designer rounds END (Rounder.roundHalfDown) */
const roundHalfDown = (value: number) => Math.ceil(value - 0.5);

/**
 * A power's END cost per use, as Hero Designer works it out (GenericObject.getEndUsage): 1 END
 * per 10 Active Points (halves round down), at least 1.
 * - Charges cost no END, unless the power also Costs Endurance (6E1 367)
 * - Costs Endurance makes a 0-END power cost END; its Half END option halves it (6E1 374)
 * - Reduced Endurance halves it, figured on the Active Points without itself, or makes it 0
 *   (6E1 345); Costs END Only To Activate is likewise left out of the Active Points
 * - Increased Endurance Cost multiplies it (x2 ... x10), unless it only applies in some
 *   circumstances (6E1 374)
 * The modifiers include any the power gets from its list.
 */
export function powerEndCost(
  base: number,
  usesEnd: boolean,
  modifiers: { xmlId?: string; optionId?: string; value: number; adders?: { xmlId?: string }[] }[],
  perEnd = 10,
): number {
  const find = (id: string) => modifiers.find((m) => m.xmlId === id);
  let denominator = usesEnd ? perEnd : 0;
  let multiplier = 1;
  let leftOut: (typeof modifiers)[number] | undefined;
  if (find('CHARGES')) denominator = 0;
  const costsEnd = find('COSTSEND');
  if (costsEnd) {
    denominator = perEnd;
    if (costsEnd.optionId === 'HALFEND') multiplier = 0.5;
  }
  const reduced = find('REDUCEDEND');
  if (reduced) {
    if (reduced.optionId === 'HALFEND') multiplier = 0.5;
    else denominator = 0;
    leftOut = reduced;
  }
  leftOut = find('COSTSENDONLYTOACTIVATE') ?? leftOut;
  const increased = find('INCREASEDEND');
  if (increased && !increased.adders?.some((a) => a.xmlId === 'CIRCUMSTANCE')) {
    multiplier = Math.round(LIMITATIONS.INCREASEDEND?.options?.find((o) => o.xmlId === increased.optionId)?.lvlVal ?? 1);
  }
  if (!denominator) return 0;
  const advantages = modifiers.filter((m) => m !== leftOut && m.value > 0).reduce((sum, m) => sum + m.value, 0);
  const active = heroRoundCost(base * (1 + advantages));
  const atLeastOne = (end: number) => (roundHalfDown(end) === 0 && active > 0 ? 1 : end);
  const end = atLeastOne(roundHalfDown(atLeastOne(active / denominator)) * multiplier);
  return Math.max(0, roundHalfDown(end));
}
