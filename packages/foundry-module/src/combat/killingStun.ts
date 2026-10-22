/**
 * House rule for killing attack STUN (pure math; the Foundry wiring is in killingStunRule.ts).
 *
 * BODY is resolved as normal: rolled BODY minus resistant defense. The STUN multiplier is then
 * applied to the BODY that got through, and only the non-resistant defense comes off the STUN:
 *
 *   STUN = (BODY - rDEF) x (STUNx + bonus) - DEF
 *
 * Knocked Out (x2), STUN vulnerabilities, Damage Reduction and the minimum damage rule (STUN at
 * least equals BODY taken) apply in the same order hero6e applies them.
 *
 * The BODY multiplied for STUN can optionally include the hit location BODY multiplier:
 * (BODY - rDEF) x BODYx x (STUNx + bonus) - DEF. BODY taken is hero6e's either way.
 */

export type StunMultiplierMode = 'hero6e' | 'rolled' | 'fixed';

/** hero6e's STUN multiplier dice (its NonStandardStunMultiplierForKillingAttackBackingSetting) */
export interface StunMultiplierDice {
  d6Count?: number;
  d6Less1DieCount?: number;
  halfDieCount?: number;
  constant?: number;
}

export interface StunMultiplier {
  value: number;
  /** Where it came from, for the card ("Chest STUNx", "1d3 roll: 2", "fixed") */
  label: string;
}

/** The numbers hero6e put on its apply-damage card for a killing attack */
export interface KillingCardDamage {
  /** BODY before defenses (after Damage Negation and BODY vulnerabilities) */
  bodyBeforeDefense: number;
  resistant: number;
  normal: number;
  /** Damage Reduction percentage */
  damageReduction: number;
  /** The STUNx hero6e used: the hit location's, or its roll */
  stunMultiplier: number;
  stunMultiplierLabel: string;
  knockedOut: boolean;
  /** STUN vulnerability multiplier (1 when none) */
  vulnerability: number;
  /** The hit location's BODY multiplier hero6e applied (undefined without hit locations) */
  bodyMultiplier?: number;
  bodyMultiplierLabel?: string;
  /** hero6e's final BODY and STUN */
  body: number;
  stun: number;
  bodyOnly: boolean;
  takesNoStun: boolean;
  inflictsStunned: boolean;
}

/** The decoded text of hero6e's apply-damage card */
export interface DamageCardText {
  /** "Defense: 7 normal; 8 resistant; damage reduction 25%" */
  defense: string;
  /** Tooltip of the BODY result ("12 - 8 resistant defense = 4\nx1 (Chest) = 4") */
  bodyBreakdown: string;
  /** Tooltip of the STUN result ("12 BODY x3 (Chest STUNx) = 36\n36 - 15 defense = 21") */
  stunBreakdown: string;
  /** The result line ("4 BODY; 21 STUN") */
  effect: string;
  /** The effects line ("inflicts Stunned; minimum damage invoked") */
  effects: string;
}

const NUM = String.raw`(-?\d+(?:\.\d+)?)`;

/** Reads a killing attack's damage from hero6e's card; null when the card isn't one */
export function readKillingCard(text: DamageCardText): KillingCardDamage | null {
  const body = new RegExp(String.raw`^${NUM} - (\d+) resistant defense = `, 'm').exec(
    text.bodyBreakdown
  );
  const stunx = new RegExp(String.raw`^${NUM} BODY x${NUM} \((.+?)\) = `, 'm').exec(
    text.stunBreakdown
  );
  const defense = /(\d+) normal; (\d+) resistant/.exec(text.defense);
  const result = new RegExp(String.raw`${NUM} BODY;\s*${NUM} STUN`).exec(text.effect);
  if (!body || !stunx || !defense || !result) return null;

  // "Fire x1.5 STUN (24x1.5=36)"; knocked out has the same shape and is read from the breakdown
  const vulnerability = new RegExp(String.raw`(?<!Knocked Out )x${NUM} STUN \(\d`).exec(
    text.effects
  );
  // "x2 (Head) = 8"; damage reduction is "x75% (damage reduction)" and doesn't match
  const bodyx = new RegExp(String.raw`^x${NUM} \((.+?)\) = `, 'm').exec(text.bodyBreakdown);
  return {
    bodyBeforeDefense: Number(body[1]),
    resistant: Number(defense[2]),
    normal: Number(defense[1]),
    damageReduction: Number(/damage reduction (\d+)%/.exec(text.defense)?.[1] ?? 0),
    stunMultiplier: Number(stunx[2]),
    stunMultiplierLabel: stunx[3] ?? '',
    knockedOut: /x2 \(knocked out\)/.test(text.stunBreakdown),
    vulnerability: vulnerability ? Number(vulnerability[1]) : 1,
    bodyMultiplier: bodyx ? Number(bodyx[1]) : undefined,
    bodyMultiplierLabel: bodyx?.[2],
    body: Number(result[1]),
    stun: Number(result[2]),
    bodyOnly: /\(BODY only attack\)/.test(text.stunBreakdown),
    takesNoStun: /Takes No STUN/i.test(text.effects),
    inflictsStunned: /inflicts Stunned/.test(text.effects),
  };
}

/**
 * Rolls a STUN multiplier the way hero6e does when hit locations are off: its custom dice when
 * set, otherwise 1d3 (6e) or 1d6-1 (5e), plus Increased/Decreased STUN Multiplier levels (min 1).
 */
export function rollStunMultiplier(
  dice: StunMultiplierDice | undefined,
  is5e: boolean,
  additional: number,
  d6: () => number
): StunMultiplier {
  const custom =
    dice && (dice.d6Count || dice.d6Less1DieCount || dice.halfDieCount || dice.constant);
  const parts = custom ? dice : is5e ? { d6Less1DieCount: 1 } : { halfDieCount: 1 };

  const terms: string[] = [];
  const rolls: number[] = [];
  let total = parts.constant ?? 0;
  const roll = (count: number | undefined, term: string, face: (n: number) => number) => {
    if (!count) return;
    terms.push(`${count}${term}`);
    for (let i = 0; i < count; i++) {
      const n = face(d6());
      rolls.push(n);
      total += n;
    }
  };
  roll(parts.d6Count, 'd6', (n) => n);
  roll(parts.d6Less1DieCount, 'd6-1', (n) => n - 1);
  roll(parts.halfDieCount, 'd3', (n) => Math.ceil(n / 2));
  if (parts.constant) terms.push(String(parts.constant));
  if (additional) terms.push(`${additional > 0 ? '+' : ''}${additional} levels`);

  return {
    value: Math.max(1, total + additional),
    label: `${terms.join(' ')} roll: ${rolls.join(', ')}`,
  };
}

/**
 * The STUN multiplier the house rule uses. `rolled` is this click's own roll, made only when
 * the setting asks for a roll but hero6e used a hit location's STUNx instead.
 */
export function stunMultiplierFor(
  mode: StunMultiplierMode,
  card: KillingCardDamage,
  { fixed, additional, rolled }: { fixed: number; additional: number; rolled?: StunMultiplier }
): StunMultiplier {
  if (mode === 'fixed') {
    return {
      value: Math.max(1, fixed + additional),
      label: additional
        ? `fixed ${fixed} ${additional > 0 ? '+' : ''}${additional} levels`
        : 'fixed',
    };
  }
  if (mode === 'rolled' && rolled) return rolled;
  return { value: card.stunMultiplier, label: card.stunMultiplierLabel };
}

/** hero6e's roundFavorPlayerTowardsZero: one decimal kept, .0-.5 rounds toward zero */
export function roundFavorTarget(value: number): number {
  const tenths = Math.trunc(value * 10);
  const digit = Math.abs(tenths % 10);
  if (digit <= 5) return (tenths - Math.sign(tenths) * digit) / 10;
  return (tenths + Math.sign(tenths) * (10 - digit)) / 10;
}

export interface HouseStun {
  stun: number;
  /** One line per step, for the card's STUN tooltip */
  breakdown: string[];
  /** The rule as one line, for the card ("4 BODY x3 (Chest STUNx) - 7 DEF") */
  summary: string;
}

/**
 * STUN taken under the house rule. With `includeBodyMultiplier`, the BODY multiplied for STUN
 * includes the hit location BODY multiplier (nothing changes without hit locations).
 */
export function houseKillingStun(
  card: KillingCardDamage,
  multiplier: StunMultiplier,
  bonus: number,
  includeBodyMultiplier = false
): HouseStun {
  const bodyThrough = Math.max(0, card.bodyBeforeDefense - card.resistant);
  const x = multiplier.value + bonus;
  const xText = bonus ? `x${x} (${multiplier.label} +${bonus})` : `x${x} (${multiplier.label})`;
  const breakdown = [
    `${card.bodyBeforeDefense} - ${card.resistant} resistant defense = ${bodyThrough} BODY`,
  ];

  let base = bodyThrough;
  if (includeBodyMultiplier && card.bodyMultiplier !== undefined) {
    base = bodyThrough * card.bodyMultiplier;
    breakdown.push(
      `${bodyThrough} x${card.bodyMultiplier} (${card.bodyMultiplierLabel} BODYx) = ${base} BODY`
    );
  }
  let stun = base * x;
  breakdown.push(`${base} BODY ${xText} = ${stun}`);
  if (card.knockedOut) {
    stun *= 2;
    breakdown.push(`x2 (knocked out) = ${stun}`);
  }
  if (card.vulnerability > 1) {
    stun = Math.floor(stun * card.vulnerability);
    breakdown.push(`x${card.vulnerability} (vulnerability) = ${stun}`);
  }
  const beforeDefense = stun;
  stun = roundFavorTarget(Math.max(0, stun - card.normal));
  breakdown.push(`${beforeDefense} - ${card.normal} normal defense = ${stun}`);

  if (card.damageReduction > 0) {
    stun = roundFavorTarget(stun * (1 - card.damageReduction / 100));
    breakdown.push(`x${100 - card.damageReduction}% (damage reduction) = ${stun}`);
  }
  if (stun < card.body) {
    stun = card.body;
    breakdown.push(`${stun} (minimum damage: STUN at least equals BODY)`);
  }
  if (card.bodyOnly) {
    stun = 0;
    breakdown.push('0 (BODY only attack)');
  } else if (card.takesNoStun) {
    stun = 0;
    breakdown.push('0 (takes no STUN)');
  }

  return {
    stun: roundFavorTarget(stun),
    breakdown,
    summary: `${base} BODY ${xText} - ${card.normal} DEF`,
  };
}
