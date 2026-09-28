/**
 * Add/edit dialog for powers, power lists, compound powers and equipment.
 * All rules (costs, adders, modifiers, saving) live in the shared power editing module.
 */

import {
  addAdder,
  addCustomModifier,
  addModifier,
  powerDraft,
  powerFormView,
  removeAdder,
  removeModifier,
  savePowerDraft,
  selectPower,
  setAdderLevels,
  setModifierLevels,
  setModifierOption,
  setModifierValue,
  type Character,
  type PowerDraft,
  type PowerKind,
  type PowerSection,
} from '@hero-workshop/shared';
import { HeroWorkshopApplication, template } from './base';

export interface PowerDialogOptions {
  section: PowerSection;
  itemId?: string;
  kind?: PowerKind;
  character: () => Character;
  onSave(character: Character): void;
}

const TITLES: Record<PowerKind, string> = { power: 'power', list: 'power list', compound: 'compound power' };

export class PowerDialog extends HeroWorkshopApplication {
  static DEFAULT_OPTIONS = {
    tag: 'form',
    classes: ['hero-workshop', 'hero-workshop-power'],
    position: { width: 720, height: 760 },
    window: { icon: 'fa-solid fa-bolt', resizable: true },
    form: { handler: PowerDialog.#onSubmit, closeOnSubmit: true },
    actions: {
      removeAdder: PowerDialog.#onRemoveAdder,
      removeModifier: PowerDialog.#onRemoveModifier,
      addCustomModifier: PowerDialog.#onAddCustomModifier,
    },
  };

  static PARTS = {
    form: { template: template('dialogs/power.hbs'), scrollable: ['.hw-scroll'] },
    footer: { template: 'templates/generic/form-footer.hbs' },
  };

  #draft: PowerDraft;

  constructor(readonly config: PowerDialogOptions) {
    const draft = powerDraft(config.character(), config.section, config.itemId, config.kind);
    const noun = config.section === 'equipment' ? 'equipment' : TITLES[draft.kind];
    super({
      id: `hero-workshop-power-${config.section}-${config.itemId ?? `new-${draft.kind}-${Date.now().toString(36)}`}`,
      window: { title: `${config.itemId ? 'Edit' : 'Add'} ${noun}` },
    });
    this.#draft = draft;
  }

  async _prepareContext() {
    const view = powerFormView(this.config.character(), this.config.section, this.#draft, this.config.itemId);
    return {
      ...view,
      buttons: [{ type: 'submit', icon: 'fa-solid fa-check', label: this.config.itemId ? 'Save' : 'Add' }],
    };
  }

  #update(draft: PowerDraft) {
    this.#draft = draft;
    void this.render();
  }

  protected onFieldChange(field: string, value: string, target: HTMLInputElement): void {
    const draft = this.#draft;
    const n = Number(value);
    const [kind, id, prop] = field.split('.');

    switch (kind) {
      case 'xmlId':
        return this.#update(selectPower(draft, value));
      case 'addAdder':
        return value ? this.#update(addAdder(draft, value)) : undefined;
      case 'addModifier':
        return value ? this.#update(addModifier(draft, value)) : undefined;
      case 'adder':
        return this.#update(setAdderLevels(draft, id!, n));
      case 'mod':
        if (prop === 'option') return this.#update(setModifierOption(draft, id!, value));
        if (prop === 'levels') return this.#update(setModifierLevels(draft, id!, n));
        if (prop === 'value') return this.#update(setModifierValue(draft, id!, n));
        return;
      case 'barrier':
        return this.#update({ ...draft, barrier: { ...draft.barrier, [id!]: n } });
      case 'custom':
        return; // Read when "Add" is pressed
      default:
        if (target.type === 'checkbox') return this.#update({ ...draft, [field]: target.checked });
        if (target.type === 'number') return this.#update({ ...draft, [field]: Number.isFinite(n) ? n : 0 });
        this.#update({ ...draft, [field]: value });
    }
  }

  static #onRemoveAdder(this: PowerDialog, _event: Event, target: HTMLElement) {
    this.#update(removeAdder(this.#draft, target.dataset.id!));
  }

  static #onRemoveModifier(this: PowerDialog, _event: Event, target: HTMLElement) {
    this.#update(removeModifier(this.#draft, target.dataset.id!));
  }

  static #onAddCustomModifier(this: PowerDialog) {
    const name = this.element.querySelector<HTMLInputElement>('[data-field="custom.name"]')?.value.trim();
    const value = Number(this.element.querySelector<HTMLInputElement>('[data-field="custom.value"]')?.value);
    if (!name || !Number.isFinite(value) || value === 0) {
      ui.notifications.warn('Give the custom modifier a name and a non-zero value (e.g. 0.5 or -0.25).');
      return;
    }
    this.#update(addCustomModifier(this.#draft, name, value));
  }

  static #onSubmit(this: PowerDialog) {
    const { section, itemId, character, onSave } = this.config;
    onSave(savePowerDraft(character(), section, itemId, this.#draft));
  }
}
