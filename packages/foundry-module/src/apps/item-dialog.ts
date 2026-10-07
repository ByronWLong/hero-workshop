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
  /** Keeps dialogs for different documents apart (copies of an item share its HDC ID) */
  idScope?: string;
}

/** Existing items get one dialog each; new-item dialogs are always fresh */
export const itemDialogId = (section: string, itemId?: string, idScope?: string) =>
  `hero-workshop-item-${idScope ? `${idScope}-` : ''}${section}-${itemId ?? `new-${Date.now().toString(36)}`}`;

export class ItemDialog extends HeroWorkshopApplication {
  static DEFAULT_OPTIONS = {
    tag: 'form',
    classes: ['hero-workshop', 'hero-workshop-item'],
    position: { width: 520 },
    window: { icon: 'fa-solid fa-pen-to-square', resizable: true },
    form: { handler: ItemDialog.#onSubmit, closeOnSubmit: true },
    actions: {
      addAttack: ItemDialog.#onAddAttack,
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
      id: itemDialogId(config.section, config.itemId, config.idScope),
      window: { title: itemForm(config.section, values, !config.itemId, config.character()).title },
    });
    this.#values = values;
  }

  async _prepareContext() {
    const form = itemForm(this.config.section, this.#values, !this.config.itemId, this.config.character());
    const custom = String(this.#values.icon ?? '');
    // Checklists are shown under their options' headings
    const fields = form.fields.map((field) => {
      if (field.type !== 'attacks') return field;
      const groups: { name: string; options: typeof field.options }[] = [];
      for (const option of field.options ?? []) {
        const name = option.group ?? '';
        let group = groups.find((g) => g.name === name);
        if (!group) groups.push((group = { name, options: [] }));
        group.options!.push(option);
      }
      return { ...field, groups };
    });
    return {
      ...form,
      fields,
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

  #attacks(): string[] {
    return Array.isArray(this.#values.attacks) ? this.#values.attacks : [];
  }

  /** Ticking an attack links the skill's levels to it */
  #toggleAttack(name: string, on: boolean) {
    const others = this.#attacks().filter((n) => n.toLowerCase() !== name.toLowerCase());
    this.#values = { ...this.#values, attacks: on ? [...others, name] : others };
    void this.render();
  }

  static #onAddAttack(this: ItemDialog) {
    const input = this.element.querySelector<HTMLInputElement>('.hw-attack-other input');
    const name = input?.value.trim();
    if (name) this.#toggleAttack(name, true);
  }

  _onRender(context: unknown, options: unknown): void {
    super._onRender(context, options);
    this.element.querySelectorAll<HTMLInputElement>('input[data-attack]').forEach((box) => {
      box.addEventListener('change', () => this.#toggleAttack(box.dataset.attack!, box.checked));
    });
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
