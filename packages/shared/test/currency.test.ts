import { describe, expect, it } from 'vitest';
import { CURRENCY_PRESETS, currencyHdc, normalizeCurrencies, parseHdcFile, primaryCurrency } from '../src/index.js';

// Money as equipment: one item per currency, priced and weighed per coin

const coins = CURRENCY_PRESETS.coins.currencies;

describe('currencies', () => {
  it('counts in the currency worth $1', () => {
    expect(primaryCurrency(coins)?.abbreviation).toBe('gp');
    expect(primaryCurrency([{ name: 'Crown', abbreviation: 'cr', value: 5, grams: 1 }, { name: 'Penny', abbreviation: 'd', value: 0.05, grams: 1 }])?.name).toBe('Crown');
    expect(coins.map((c) => [c.abbreviation, c.value, c.grams])).toEqual([
      ['pp', 10, 10],
      ['gp', 1, 20],
      ['ep', 0.5, 14],
      ['sp', 0.1, 10],
      ['cp', 0.01, 8],
    ]);
  });

  it('drops unnamed and worthless entries', () => {
    expect(normalizeCurrencies([{ name: ' Gold ', abbreviation: 'gp', value: 1, grams: -2 }, { name: '', value: 1 }, { name: 'Lint', value: 0 }])).toEqual([
      { name: 'Gold', abbreviation: 'gp', value: 1, grams: 0 },
    ]);
  });

  it('makes a coin a piece of equipment priced and weighed per coin', () => {
    const gold = parseHdcFile(currencyHdc(coins[1], 4242)).equipment![0];
    expect([gold.id, gold.name, gold.price, gold.weight, gold.quantity ?? 1, gold.carried, gold.realCost]).toEqual([
      '4242', 'Gold piece', 1, 0.02, 1, true, 0,
    ]);
    // In pounds, as Hero Designer stores it
    expect(currencyHdc(coins[1], 1)).toMatch(/WEIGHT="0\.0440924/);
  });
});
