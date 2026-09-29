/**
 * Add/edit dialog for powers, power lists, compound powers and equipment.
 * All rules (costs, adders, modifiers, saving) live in the shared power editing module.
 */

import {
  addAdder,
  addCustomModifier,
  addModifier,
  compoundPartsCharacter,
  powerDraft,
  powerFormView,
  removeAdder,
  removeModifier,
  removeSubPower,
  savePowerDraft,
  selectPower,
  setAdderLevels,
  setModifierLevels,
  setModifierOption,
  setModifierValue,
  setSubPowers,
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
  /** Distinguishes dialogs for a compound's parts from the editor's own dialogs */
  idScope?: string;
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
      addPart: PowerDialog.#onAddPart,
      editPart: PowerDialog.#onEditPart,
      removePart: PowerDialog.#onRemovePart,
    },
  };

  static PARTS = {
    form: { template: template('dialogs/power.hbs'), scrollable: ['.hw-scroll'] },
    footer: { template: template('footer.hbs') },
  };

  #draft: PowerDraft;

  constructor(readonly config: PowerDialogOptions) {
    const draft = powerDraft(config.character(), config.section, config.itemId, config.kind);
    const noun = config.idScope
      ? 'part'
      : config.section === 'equipment'
        ? draft.kind === 'compound' ? 'compound equipment' : 'equipment'
        : TITLES[draft.kind];
    const key = config.itemId ?? `new-${draft.kind}-${Date.now().toString(36)}`;
    super({
      id: `hero-workshop-power-${config.idScope ? `${config.idScope}-` : ''}${config.section}-${key}`,
      window: { title: `${config.itemId ? 'Edit' : 'Add'} ${noun}` },
      // Lists have only a few fields; powers need room for adders and modifiers
      ...(draft.kind === 'list' ? { position: { width: 560, height: 'auto' } } : {}),
    });
    this.#draft = draft;
  }

  async _prepareContext() {
    const view = powerFormView(this.config.character(), this.config.section, this.#draft, this.config.itemId);
    return {
      ...view,
      costs: view.isPower || view.kind === 'compound'
        ? [
            { label: 'Base', value: view.costs.base },
            { label: 'Active', value: view.costs.active },
            { label: 'Real', value: view.costs.real },
            { label: 'END', value: view.costs.end },
          ]
        : [],
      buttons: [{ type: 'submit', icon: 'fa-solid fa-check', label: this.config.itemId ? 'Save' : 'Add', cssClass: 'bright' }],
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

  // A compound's parts are edited with this same form, on a scratch character holding the parts

  #openPart(itemId?: string) {
    void new PowerDialog({
      section: 'powers',
      itemId,
      idScope: this.id,
      character: () => compoundPartsCharacter(this.config.character(), this.#draft),
      onSave: (character) => this.#update(setSubPowers(this.#draft, character.powers)),
    }).render({ force: true });
  }

  static #onAddPart(this: PowerDialog) {
    this.#openPart();
  }

  static #onEditPart(this: PowerDialog, _event: Event, target: HTMLElement) {
    const id = target.closest<HTMLElement>('[data-id]')?.dataset.id;
    const open = (foundry.applications as unknown as { instances: Map<string, { bringToFront(): void }> }).instances
      .get(`hero-workshop-power-${this.id}-powers-${id}`);
    if (open) open.bringToFront();
    else this.#openPart(id);
  }

  static #onRemovePart(this: PowerDialog, _event: Event, target: HTMLElement) {
    this.#update(removeSubPower(this.#draft, target.dataset.id!));
  }

  static #onSubmit(this: PowerDialog) {
    const { section, itemId, character, onSave } = this.config;
    onSave(savePowerDraft(character(), section, itemId, this.#draft));
  }
}
