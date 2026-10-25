/**
 * Money as equipment: each currency (a gold piece, a dollar) is a plain piece of equipment
 * whose QUANTITY is how many the character has, priced and weighed per coin. hero6e prices
 * equipment in dollars, so a currency's value is what one is worth in those.
 *
 * Which currencies a game uses is the GM's choice (Hero Workshop isn't only for fantasy), so
 * these are presets to start from.
 */

import { HdcDocument } from './hdc/document.js';
import { createElement } from './hdc/xml.js';
import { blankHdc } from './hdc/write.js';

export interface Currency {
  /** The item's name ("Gold piece") */
  name: string;
  /** Short form for amounts ("gp"; "$" for dollars) */
  abbreviation: string;
  /** What one is worth, in hero6e's price unit (dollars) */
  value: number;
  /** What one weighs, in grams */
  grams: number;
  /** Icon */
  img?: string;
}

export interface CurrencyPreset {
  label: string;
  currencies: Currency[];
}

export const CURRENCY_PRESETS = {
  coins: {
    label: 'Fantasy coins (platinum, gold, electrum, silver, copper)',
    currencies: [
      { name: 'Platinum piece', abbreviation: 'pp', value: 10, grams: 10, img: 'icons/commodities/currency/coin-inset-snail-silver.webp' },
      { name: 'Gold piece', abbreviation: 'gp', value: 1, grams: 20, img: 'icons/commodities/currency/coin-embossed-crown-gold.webp' },
      { name: 'Electrum piece', abbreviation: 'ep', value: 0.5, grams: 14, img: 'icons/commodities/currency/coin-inset-copper-axe.webp' },
      { name: 'Silver piece', abbreviation: 'sp', value: 0.1, grams: 10, img: 'icons/commodities/currency/coin-engraved-moon-silver.webp' },
      { name: 'Copper piece', abbreviation: 'cp', value: 0.01, grams: 8, img: 'icons/commodities/currency/coin-engraved-waves-copper.webp' },
    ],
  },
  dollars: {
    label: 'Dollars',
    currencies: [{ name: 'Dollars', abbreviation: '$', value: 1, grams: 0, img: 'icons/commodities/currency/coins-stitched-pouch-brown.webp' }],
  },
} satisfies Record<string, CurrencyPreset>;

export const DEFAULT_CURRENCIES = CURRENCY_PRESETS.dollars.currencies;

/** The currency amounts are counted in: the one worth $1, or else the most valuable */
export function primaryCurrency(currencies: Currency[]): Currency | undefined {
  return currencies.find((c) => c.value === 1) ?? [...currencies].sort((a, b) => b.value - a.value)[0];
}

/** Cleans up a currency list as entered (no blank names, no negative values or weights) */
export function normalizeCurrencies(currencies: Partial<Currency>[]): Currency[] {
  return currencies
    .map((c) => ({
      name: String(c.name ?? '').trim(),
      abbreviation: String(c.abbreviation ?? '').trim(),
      value: Math.max(0, Number(c.value) || 0),
      grams: Math.max(0, Number(c.grams) || 0),
      ...(c.img ? { img: String(c.img) } : {}),
    }))
    .filter((c) => c.name && c.value > 0);
}

/**
 * A Hero Designer document holding one of a currency, as a piece of equipment (a 0-point
 * custom power) priced and weighed per coin. `id` is its HDC ID.
 */
export function currencyHdc(currency: Currency, id: number): string {
  const doc = HdcDocument.parse(blankHdc());
  const el = createElement('POWER', {
    XMLID: 'CUSTOMPOWER',
    ID: String(id),
    BASECOST: '0.0',
    LEVELS: '0',
    ALIAS: currency.name,
    POSITION: '0',
    MULTIPLIER: '1.0',
    GRAPHIC: 'Burst',
    COLOR: '255 255 255',
    SFX: 'Default',
    SHOW_ACTIVE_COST: 'Yes',
    INCLUDE_NOTES_IN_PRINTOUT: 'Yes',
    NAME: currency.name,
    INPUT: '',
    USESTANDARDEFFECT: 'No',
    QUANTITY: '1',
    AFFECTS_PRIMARY: 'No',
    AFFECTS_TOTAL: 'No',
    DOESBODY: 'No',
    DOESDAMAGE: 'No',
    DOESKNOCKBACK: 'No',
    KILLING: 'No',
    PRICE: String(currency.value),
    // Hero Designer stores weight in pounds
    WEIGHT: String(currency.grams / 1000 / 0.453592),
    CARRIED: 'Yes',
    DEFENSE: 'NORMAL',
    END: 'No',
    VISIBLE: 'Yes',
    RANGE: 'No',
    DURATION: 'INHERENT',
    TARGET: 'SELFONLY',
    ENDCOLUMNOUTPUT: '',
    USECUSTOMENDCOLUMN: 'No',
  });
  doc.ensureSection('EQUIPMENT').appendElement(el);
  return doc.toString();
}
