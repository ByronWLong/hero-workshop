/**
 * The world's currencies, a GM setting (Hero Workshop isn't only for fantasy games, so they're
 * the GM's to choose; see shared `currency.ts` for the presets).
 */

import { DEFAULT_CURRENCIES, currencyHdc, normalizeCurrencies, type Currency } from '@hero-workshop/shared';
import { MODULE_ID } from '../sync/session';
import { itemDataFromXml } from '../sync/worldItems';

export const CURRENCIES_SETTING = 'currencies';

export function registerCurrencySettings(openWindow: () => void): void {
  game.settings.register(MODULE_ID, CURRENCIES_SETTING, {
    name: 'Currencies',
    scope: 'world',
    config: false,
    type: Array,
    default: DEFAULT_CURRENCIES,
  });
  game.settings.registerMenu(MODULE_ID, 'currencyConfig', {
    name: 'HERO_WORKSHOP.Currencies',
    label: 'HERO_WORKSHOP.ManageCurrencies',
    hint: 'HERO_WORKSHOP.CurrenciesHint',
    icon: 'fa-solid fa-coins',
    restricted: true,
    type: class extends (foundry.applications.api.ApplicationV2 as unknown as new () => object) {
      render() {
        openWindow();
        return this;
      }
    },
  });
}

export function getCurrencies(): Currency[] {
  const value = game.settings.get(MODULE_ID, CURRENCIES_SETTING);
  return Array.isArray(value) ? normalizeCurrencies(value as Partial<Currency>[]) : [];
}

export async function saveCurrencies(currencies: Currency[]): Promise<void> {
  await game.settings.set(MODULE_ID, CURRENCIES_SETTING, currencies);
}

/** A currency's HDC ID: the same for it everywhere, and well clear of Hero Designer's timestamp IDs */
export function currencyId(currency: Currency): number {
  let hash = 0;
  for (const ch of currency.name.toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return 9_000_000_000_000 + (hash % 1_000_000_000);
}

/** One of a currency, as hero6e item data */
export async function currencyItemData(currency: Currency): Promise<Record<string, unknown>> {
  const [data] = await itemDataFromXml(currencyHdc(currency, currencyId(currency)));
  if (!data) throw new Error(`hero6e could not make an item for ${currency.name}`);
  const { _id, folder, sort, ...rest } = data as typeof data & { _id?: string };
  void _id;
  void folder;
  void sort;
  return { ...rest, img: currency.img || data.img };
}

/** Whether item data is one of the world's currencies (they go by name, as Item Piles matches them) */
export function isCurrencyItem(item: { name?: string; type?: string }): boolean {
  return item.type === 'equipment' && getCurrencies().some((c) => c.name === item.name);
}
