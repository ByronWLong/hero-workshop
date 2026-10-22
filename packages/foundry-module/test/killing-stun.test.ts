import { describe, expect, it } from 'vitest';
import {
  houseKillingStun,
  readKillingCard,
  rollStunMultiplier,
  roundFavorTarget,
  stunMultiplierFor,
  type DamageCardText,
} from '../src/combat/killingStun';

/** A 12 BODY killing attack to the Chest vs 8 rPD + 7 PD, as hero6e writes the card */
function chestCard(overrides: Partial<DamageCardText> = {}): DamageCardText {
  return {
    defense: 'Defense: 7 normal; 8 resistant',
    bodyBreakdown: '12 - 8 resistant defense = 4\nx1 (Chest) = 4',
    stunBreakdown: '12 BODY x3 (Chest STUNx) = 36\n36 - 15 defense = 21',
    effect: '4 BODY; 21 STUN',
    effects: '',
    ...overrides,
  };
}

describe('readKillingCard', () => {
  it('reads defenses, BODY and the STUN multiplier hero6e used', () => {
    expect(readKillingCard(chestCard())).toMatchObject({
      bodyBeforeDefense: 12,
      resistant: 8,
      normal: 7,
      damageReduction: 0,
      stunMultiplier: 3,
      stunMultiplierLabel: 'Chest STUNx',
      knockedOut: false,
      vulnerability: 1,
      body: 4,
      stun: 21,
    });
  });

  it('reads knocked out, vulnerability, damage reduction and Stunned', () => {
    const card = readKillingCard(
      chestCard({
        defense: 'Defense: Damage Negation 1DC(s); 7 normal; 8 resistant; damage reduction 50%',
        stunBreakdown: '12 BODY x2 (STUNx roll) = 24\nx2 (knocked out) = 48\n72 - 15 defense = 57',
        effects: 'Knocked Out x2 STUN (24x2=48);Fire x1.5 STUN (48x1.5=72);inflicts Stunned',
      })
    );
    expect(card).toMatchObject({
      damageReduction: 50,
      stunMultiplierLabel: 'STUNx roll',
      knockedOut: true,
      vulnerability: 1.5,
      inflictsStunned: true,
    });
  });

  it('ignores normal attack cards', () => {
    expect(
      readKillingCard({
        defense: 'Defense: 7 normal; 8 resistant',
        bodyBreakdown: '9 - 15 defense = 0',
        stunBreakdown: '31 - 15 defense = 16',
        effect: '0 BODY; 16 STUN',
        effects: '',
      })
    ).toBeNull();
  });
});

describe('houseKillingStun', () => {
  const card = readKillingCard(chestCard())!;

  it('multiplies the BODY that got through and subtracts only normal defense', () => {
    // (12 - 8) x3 - 7 = 5, where hero6e has 36 - 15 = 21
    const house = houseKillingStun(card, { value: 3, label: 'Chest STUNx' }, 0);
    expect(house.stun).toBe(5);
    expect(house.summary).toBe('4 BODY x3 (Chest STUNx) - 7 DEF');
  });

  it('adds the bonus to the multiplier, rounding halves toward the target', () => {
    // 4 x 3.5 = 14 - 7 = 7
    expect(houseKillingStun(card, { value: 3, label: 'Chest STUNx' }, 0.5).stun).toBe(7);
    // 3 BODY through x2.5 = 7.5 - 0 = 7.5 -> 7
    const odd = { ...card, bodyBeforeDefense: 11, normal: 0, body: 3 };
    expect(houseKillingStun(odd, { value: 2, label: 'fixed' }, 0.5).stun).toBe(7);
  });

  it('keeps the minimum damage rule', () => {
    // 4 BODY x1 - 7 < 4 BODY taken
    expect(houseKillingStun(card, { value: 1, label: 'Hand STUNx' }, 0).stun).toBe(4);
  });

  it('takes no STUN when no BODY gets through', () => {
    const blocked = { ...card, bodyBeforeDefense: 6, body: 0 };
    expect(houseKillingStun(blocked, { value: 5, label: 'Head STUNx' }, 2).stun).toBe(0);
  });

  it('applies knocked out, vulnerability and damage reduction in hero6e order', () => {
    const hurt = { ...card, knockedOut: true, vulnerability: 1.5, damageReduction: 50 };
    // 4 x3 = 12, x2 = 24, x1.5 = 36, -7 = 29, x50% = 14.5 -> 14
    expect(houseKillingStun(hurt, { value: 3, label: 'Chest STUNx' }, 0).stun).toBe(14);
  });

  it('zeroes BODY-only attacks and targets that take no STUN', () => {
    expect(houseKillingStun({ ...card, bodyOnly: true }, { value: 3, label: '' }, 0).stun).toBe(0);
    expect(houseKillingStun({ ...card, takesNoStun: true }, { value: 3, label: '' }, 0).stun).toBe(
      0
    );
  });
});

describe('STUN from BODY including the location BODY multiplier', () => {
  /** 14 BODY to the Head vs 8 rPD + 2 PD: hero6e doubles the 6 that get through */
  const head = readKillingCard(
    chestCard({
      defense: 'Defense: 2 normal; 8 resistant',
      bodyBreakdown: '14 - 8 resistant defense = 6\nx2 (Head) = 12',
      stunBreakdown: '14 BODY x5 (Head STUNx) = 70\n70 - 10 defense = 60',
      effect: '12 BODY; 60 STUN',
    })
  )!;
  const headx = { value: 5, label: 'Head STUNx' };

  it('reads the location BODY multiplier', () => {
    expect(head).toMatchObject({ bodyMultiplier: 2, bodyMultiplierLabel: 'Head', body: 12 });
  });

  it('multiplies the BODY that got through, with or without the location BODYx', () => {
    // 6 x5 - 2 = 28
    expect(houseKillingStun(head, headx, 0).stun).toBe(28);
    // 6 x2 = 12 x5 - 2 = 58
    const included = houseKillingStun(head, headx, 0, true);
    expect(included.stun).toBe(58);
    expect(included.summary).toBe('12 BODY x5 (Head STUNx) - 2 DEF');
  });

  it('rounds half BODY only after the defense comes off', () => {
    // Hand: 3 BODY through x0.5 = 1.5 x(1 + 0.5) = 2.25 - 0 = 2.25 -> 2
    const hand = readKillingCard(
      chestCard({
        defense: 'Defense: 0 normal; 8 resistant',
        bodyBreakdown: '11 - 8 resistant defense = 3\nx0.5 (Hand) = 1',
        stunBreakdown: '11 BODY x1 (Hand STUNx) = 11\n11 - 8 defense = 3',
        effect: '1 BODY; 3 STUN',
      })
    )!;
    expect(houseKillingStun(hand, { value: 1, label: 'Hand STUNx' }, 0.5, true).stun).toBe(2);
  });

  it('changes nothing without hit locations', () => {
    const card = readKillingCard(
      chestCard({
        bodyBreakdown: '12 - 8 resistant defense = 4',
        stunBreakdown: '12 BODY x2 (STUNx roll) = 24\n24 - 15 defense = 9',
      })
    )!;
    expect(card.bodyMultiplier).toBeUndefined();
    const x = { value: 2, label: 'STUNx roll' };
    expect(houseKillingStun(card, x, 0, true).stun).toBe(houseKillingStun(card, x, 0).stun);
  });
});

describe('STUN multiplier', () => {
  const card = readKillingCard(chestCard())!;

  it("uses hero6e, a fixed value plus levels, or this click's roll", () => {
    expect(stunMultiplierFor('hero6e', card, { fixed: 2, additional: 0 }).value).toBe(3);
    expect(stunMultiplierFor('fixed', card, { fixed: 2, additional: 1 }).value).toBe(3);
    expect(stunMultiplierFor('fixed', card, { fixed: 2, additional: -2 }).value).toBe(1);
    const rolled = { value: 2, label: '1d3 roll: 2' };
    expect(stunMultiplierFor('rolled', card, { fixed: 2, additional: 0, rolled })).toBe(rolled);
    // Hit locations off: hero6e already rolled it
    expect(stunMultiplierFor('rolled', card, { fixed: 2, additional: 0 }).value).toBe(3);
  });

  it('uses the hit location STUNx, or the fixed value when the hit had no location', () => {
    expect(card.bodyMultiplier).toBe(1);
    expect(stunMultiplierFor('locationOrFixed', card, { fixed: 2, additional: 0 })).toEqual({
      value: 3,
      label: 'Chest STUNx',
    });
    const noLocations = readKillingCard(
      chestCard({
        bodyBreakdown: '12 - 8 resistant defense = 4',
        stunBreakdown: '12 BODY x3 (STUNx roll) = 36\n36 - 15 defense = 21',
      })
    )!;
    expect(stunMultiplierFor('locationOrFixed', noLocations, { fixed: 2, additional: 1 })).toEqual({
      value: 3,
      label: 'fixed 2 +1 levels',
    });
  });

  it("rolls 1d3 in 6e, 1d6-1 in 5e, or hero6e's custom dice", () => {
    const six = () => 6;
    expect(rollStunMultiplier(undefined, false, 0, six).value).toBe(3);
    expect(rollStunMultiplier(undefined, true, 0, six).value).toBe(5);
    expect(
      rollStunMultiplier(
        { d6Count: 0, d6Less1DieCount: 0, halfDieCount: 0, constant: 0 },
        false,
        1,
        () => 1
      ).value
    ).toBe(2);
    expect(rollStunMultiplier({ d6Count: 1, constant: 1 }, false, 0, () => 4)).toEqual({
      value: 5,
      label: '1d6 1 roll: 4',
    });
    expect(rollStunMultiplier(undefined, false, -2, () => 1).value).toBe(1);
  });
});

describe('roundFavorTarget', () => {
  it('matches hero6e rounding', () => {
    expect(roundFavorTarget(7.5)).toBe(7);
    expect(roundFavorTarget(7.6)).toBe(8);
    expect(roundFavorTarget(7)).toBe(7);
    expect(roundFavorTarget(0.5)).toBe(0);
  });
});
