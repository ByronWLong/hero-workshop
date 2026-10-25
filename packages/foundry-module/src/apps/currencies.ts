/**
 * The world's currencies (GM only): what money is in this game, each as a piece of equipment
 * whose quantity is how many a character has. Item Piles uses them as its currencies.
 */

import { CURRENCY_PRESETS, normalizeCurrencies, primaryCurrency, type Currency } from '@hero-workshop/shared';
import { HeroWorkshopApplication, template } from './base';
import { getCurrencies, saveCurrencies } from '../integrations/currencies';
import { updatePileCurrencies } from '../integrations/item-piles';

type PresetId = keyof typeof CURRENCY_PRESETS;

export class CurrencyWindow extends HeroWorkshopApplication {
  static DEFAULT_OPTIONS = {
    id: 'hero-workshop-currencies',
    classes: ['hero-workshop', 'hero-workshop-currencies'],
    position: { width: 760, height: 'auto' as const },
    window: { title: 'Hero Workshop: Currencies', icon: 'fa-solid fa-coins', resizable: true },
    actions: {
      addCurrency: CurrencyWindow.#onAdd,
      deleteCurrency: CurrencyWindow.#onDelete,
      usePreset: CurrencyWindow.#onUsePreset,
      pickIcon: CurrencyWindow.#onPickIcon,
      save: CurrencyWindow.#onSave,
    },
  };

  static PARTS = {
    body: { template: template('currencies.hbs'), scrollable: [''] },
    footer: { template: template('footer.hbs') },
  };

  #draft: Partial<Currency>[] = getCurrencies();
  #preset: PresetId = 'coins';

  async _prepareContext() {
    const dirty = JSON.stringify(normalizeCurrencies(this.#draft)) !== JSON.stringify(getCurrencies());
    const primary = primaryCurrency(normalizeCurrencies(this.#draft));
    const itemPiles = !!game.modules.get('item-piles')?.active;
    return {
      status: dirty ? 'Unsaved changes' : `${this.#draft.length} ${this.#draft.length === 1 ? 'currency' : 'currencies'}`,
      buttons: [{ action: 'save', icon: 'fa-solid fa-floppy-disk', label: 'Save', cssClass: 'bright', disabled: !dirty }],
      itemPiles,
      primary: primary?.name,
      presets: (Object.keys(CURRENCY_PRESETS) as PresetId[]).map((id) => ({
        id,
        label: CURRENCY_PRESETS[id].label,
        selected: id === this.#preset,
      })),
      currencies: this.#draft.map((c, index) => ({ ...c, index, isPrimary: !!primary && c.name?.trim() === primary.name })),
    };
  }

  protected onFieldChange(field: string, value: string): void {
    if (field === 'preset') {
      this.#preset = value as PresetId;
      return;
    }
    const [, index, key] = field.split('.') as [string, string, keyof Currency];
    this.#draft = this.#draft.map((c, i) => {
      if (i !== Number(index)) return c;
      return { ...c, [key]: key === 'value' || key === 'grams' ? Number(value) : value };
    });
    void this.render();
  }

  static #onAdd(this: CurrencyWindow) {
    this.#draft = [...this.#draft, { name: '', abbreviation: '', value: 1, grams: 0 }];
    void this.render();
  }

  static #onDelete(this: CurrencyWindow, _event: Event, target: HTMLElement) {
    const index = Number(target.dataset.index);
    this.#draft = this.#draft.filter((_c, i) => i !== index);
    void this.render();
  }

  static #onUsePreset(this: CurrencyWindow) {
    this.#draft = CURRENCY_PRESETS[this.#preset].currencies.map((c) => ({ ...c }));
    void this.render();
  }

  static #onPickIcon(this: CurrencyWindow, _event: Event, target: HTMLElement) {
    const index = Number(target.dataset.index);
    const Picker = (foundry.applications as unknown as {
      apps: { FilePicker: { implementation: new (o: Record<string, unknown>) => { render(o: unknown): unknown } } };
    }).apps.FilePicker.implementation;
    new Picker({
      type: 'image',
      current: this.#draft[index]?.img,
      callback: (path: string) => this.onFieldChange(`currency.${index}.img`, path),
    }).render(true);
  }

  static async #onSave(this: CurrencyWindow) {
    const currencies = normalizeCurrencies(this.#draft);
    await saveCurrencies(currencies);
    await updatePileCurrencies();
    this.#draft = currencies;
    ui.notifications.info(game.i18n.format('HERO_WORKSHOP.CurrenciesSaved', { count: currencies.length }));
    void this.render();
  }
}
