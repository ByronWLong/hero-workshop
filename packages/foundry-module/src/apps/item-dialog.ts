/**
 * Add/edit dialog for skills, perks, talents, complications and martial arts maneuvers.
 * Fields, choices and costs come from the shared item forms; this window only renders them.
 */

import {
  itemForm,
  itemFormValues,
  saveItemForm,
  type Character,
  type FormSection,
  type FormValues,
} from '@hero-workshop/shared';
import { HeroWorkshopApplication, pickImage, template } from './base';
import { DEFAULT_ICON } from '../sync/icons';

export interface ItemDialogOptions {
  section: FormSection;
  itemId?: string;
  character: () => Character;
  onSave(character: Character): void;
  /** Icon shown when the item has no custom one (its current Foundry icon) */
  defaultIcon?: string;
}

/** Existing items get one dialog each; new-item dialogs are always fresh */
export const itemDialogId = (section: string, itemId?: string) =>
  `hero-workshop-item-${section}-${itemId ?? `new-${Date.now().toString(36)}`}`;

export class ItemDialog extends HeroWorkshopApplication {
  static DEFAULT_OPTIONS = {
    tag: 'form',
    classes: ['hero-workshop', 'hero-workshop-item'],
    position: { width: 520 },
    window: { icon: 'fa-solid fa-pen-to-square', resizable: true },
    form: { handler: ItemDialog.#onSubmit, closeOnSubmit: true },
    actions: {
      pickIcon: ItemDialog.#onPickIcon,
      clearIcon: ItemDialog.#onClearIcon,
    },
  };

  static PARTS = {
    form: { template: template('dialogs/item.hbs'), scrollable: ['.hw-scroll'] },
    footer: { template: template('footer.hbs') },
  };

  #values: FormValues;

  constructor(readonly config: ItemDialogOptions) {
    const values = itemFormValues(config.character(), config.section, config.itemId);
    super({
      id: itemDialogId(config.section, config.itemId),
      window: { title: itemForm(config.section, values, !config.itemId).title },
    });
    this.#values = values;
  }

  async _prepareContext() {
    const form = itemForm(this.config.section, this.#values, !this.config.itemId);
    const custom = String(this.#values.icon ?? '');
    return {
      ...form,
      icon: { src: custom || this.config.defaultIcon || DEFAULT_ICON, custom: !!custom },
      costs: form.costLabel ? [{ label: 'Cost', value: `${form.cost} ${form.costLabel}` }] : [],
      buttons: [{ type: 'submit', icon: 'fa-solid fa-check', label: this.config.itemId ? 'Save' : 'Add', cssClass: 'bright' }],
    };
  }

  protected onFieldChange(field: string, value: string, target: HTMLInputElement): void {
    this.#values = {
      ...this.#values,
      [field]: target.type === 'checkbox' ? target.checked : target.type === 'number' ? Number(value) : value,
    };
    // Re-render so dependent fields (e.g. a skill's characteristic choices) and the cost update
    void this.render();
  }

  static async #onPickIcon(this: ItemDialog) {
    const path = await pickImage(String(this.#values.icon || this.config.defaultIcon || ''));
    this.#values = { ...this.#values, icon: path };
    void this.render();
  }

  static #onClearIcon(this: ItemDialog) {
    this.#values = { ...this.#values, icon: '' };
    void this.render();
  }

  static #onSubmit(this: ItemDialog) {
    const { section, itemId, character, onSave } = this.config;
    onSave(saveItemForm(character(), section, itemId, this.#values));
  }
}
