/**
 * A character's money: how many of each of the world's currencies they have. Each currency is
 * a piece of equipment named after it whose QUANTITY is the count (as Item Piles finds them, by
 * name), possibly in several stacks (a purse, a strongbox left at the inn).
 */

import type { Character, Equipment } from '../types.js';
import { primaryCurrency, type Currency } from '../currency.js';

export interface MoneyRow {
  currency: Currency;
  /** How many the character has, in all their stacks */
  count: number;
  /** In how many items */
  stacks: number;
}

export interface MoneyView {
  rows: MoneyRow[];
  /** What it's all worth, in the primary currency */
  total: number;
  primary?: Currency;
}

const countOf = (item: Equipment) => item.quantity ?? 1;

/** A currency's stacks, carried ones first (spending comes out of what's at hand) */
function stacksOf(character: Character, currency: Currency): Equipment[] {
  const stacks = (character.equipment ?? []).filter((e) => e.name === currency.name);
  return [...stacks].sort((a, b) => Number(b.carried ?? true) - Number(a.carried ?? true));
}

export function moneyView(character: Character, currencies: Currency[]): MoneyView {
  const primary = primaryCurrency(currencies);
  const rows = currencies.map((currency) => {
    const stacks = stacksOf(character, currency);
    return { currency, count: stacks.reduce((n, e) => n + countOf(e), 0), stacks: stacks.length };
  });
  const dollars = rows.reduce((sum, r) => sum + r.count * r.currency.value, 0);
  const total = primary ? Math.round((dollars / primary.value) * 100) / 100 : dollars;
  return { rows, total, ...(primary ? { primary } : {}) };
}

const newId = () => `new-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/**
 * Gives the character `count` of a currency in all: more goes on the first (carried) stack, or a
 * new one; less comes off the stacks in turn, and an emptied stack goes
 */
export function setMoney(character: Character, currency: Currency, count: number): Character {
  const wanted = Math.max(0, Math.floor(count));
  const stacks = stacksOf(character, currency);
  const have = stacks.reduce((n, e) => n + countOf(e), 0);
  if (wanted === have) return character;
  const equipment = [...(character.equipment ?? [])];

  if (wanted > have) {
    const first = stacks[0];
    if (first) {
      equipment[equipment.indexOf(first)] = { ...first, quantity: countOf(first) + wanted - have };
    } else {
      equipment.push({
        id: newId(),
        name: currency.name,
        xmlId: 'CUSTOMPOWER',
        levels: 0,
        baseCost: 0,
        activeCost: 0,
        realCost: 0,
        price: currency.value,
        weight: currency.grams / 1000,
        quantity: wanted,
        carried: true,
        affectsPrimary: false,
        affectsTotal: false,
        modifiers: [],
        adders: [],
        position: equipment.length,
        ...(currency.img ? { icon: currency.img } : {}),
      } as Equipment);
    }
    return { ...character, equipment };
  }

  let owed = have - wanted;
  const emptied = new Set<string>();
  for (const stack of stacks) {
    if (!owed) break;
    const taken = Math.min(owed, countOf(stack));
    owed -= taken;
    if (taken === countOf(stack)) emptied.add(stack.id);
    else equipment[equipment.indexOf(stack)] = { ...stack, quantity: countOf(stack) - taken };
  }
  return { ...character, equipment: equipment.filter((e) => !emptied.has(e.id)) };
}
