/**
 * Add/edit dialog for powers, power lists, compound powers and equipment.
 * All rules (costs, adders, modifiers, saving) live in the shared power editing module.
 */

import {
  addAdder,
  addCustomModifier,
  addModifier,
  compoundPartsCharacter,
  itemFormValues,
  saveItemForm,
  powerDraft,
  powerFormView,
  powerTypeChoices,
  removeAdder,
  removeModifier,
  removeSubPower,
  savePowerDraft,
  selectPower,
  setAdderLevels,
  setModifierLevels,
  setModifierOption,
  setModifierValue,
  setModifierInput,
  convertSpellModifier,
  convertCustomSpells,
  setModifierAdder,
  setRequiredSkill,
  setSubPowers,
  type Character,
  type PowerDraft,
  type PowerKind,
  type PowerSection,
} from '@hero-workshop/shared';
import { HeroWorkshopApplication, pickImage, template } from './base';
import { DEFAULT_ICON } from '../sync/icons';

export interface PowerDialogOptions {
  section: PowerSection;
  itemId?: string;
  kind?: PowerKind;
  character: () => Character;
  onSave(character: Character): void;
  /** Distinguishes dialogs for a compound's parts from the editor's own dialogs */
  idScope?: string;
  /** A compound's part, edited on a scratch character holding the parts */
  isPart?: boolean;
  /** Icon shown when the item has no custom one (its current Foundry icon) */
  defaultIcon?: string;
  /** A part of a piece of equipment (equipment is bought with money, so it's never "free") */
  inEquipment?: boolean;
  /** A new power's power, already chosen (the editor's "Add" type-ahead) */
  xmlId?: string;
}

const kindAllowsFree = (kind: PowerKind) => kind !== 'list';

const TITLES: Record<PowerKind, string> = {
  power: 'power',
  list: 'power list',
  compound: 'compound power',
  multipower: 'Multipower',
  vpp: 'Variable Power Pool',
};

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
      pickIcon: PowerDialog.#onPickIcon,
      matchRollCategory: PowerDialog.#onMatchRollCategory,
      convertToPowerSkill: PowerDialog.#onConvertToPowerSkill,
      convertToSpell: PowerDialog.#onConvertToSpell,
      convertAllSpells: PowerDialog.#onConvertAllSpells,
      clearIcon: PowerDialog.#onClearIcon,
      clearName: PowerDialog.#onClearName,
    },
  };

  static PARTS = {
    form: { template: template('dialogs/power.hbs'), scrollable: [''] },
    footer: { template: template('footer.hbs') },
  };

  #draft: PowerDraft;
  /** "Custom…" was chosen for an input that has a drop-down */
  #customInput = false;

  constructor(readonly config: PowerDialogOptions) {
    const blank = powerDraft(config.character(), config.section, config.itemId, config.xmlId ? 'power' : config.kind);
    const draft = config.xmlId && !config.itemId ? selectPower(blank, config.xmlId) : blank;
    // New items pick their kind in the form, so their title names only the section
    const noun = config.isPart
      ? 'part'
      : config.section === 'equipment'
        ? config.itemId && draft.kind !== 'power' ? TITLES[draft.kind] : 'equipment'
        : config.itemId ? TITLES[draft.kind] : 'power';
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
    // A new top-level item can be one power, a compound of several, or (in Powers) a list
    const isNew = !this.config.itemId && !this.config.isPart;
    const kinds = [
      { value: 'power', label: 'One power', hint: this.config.section === 'equipment' ? 'e.g. armor, a torch' : 'a single power' },
      { value: 'compound', label: 'Compound', hint: this.config.section === 'equipment' ? 'several powers, e.g. a sword: damage + parry' : 'several powers bought together' },
      { value: 'multipower', label: 'Multipower', hint: this.config.section === 'equipment' ? 'one of several uses, e.g. a shield: block or bash' : 'a reserve shared by slots' },
      { value: 'vpp', label: 'Power pool', hint: 'a Variable Power Pool' },
      { value: 'list', label: 'List', hint: this.config.section === 'equipment' ? 'a heading that groups gear' : 'a heading that groups powers' },
    ];
    const examples = view.definition?.inputExamples;
    const input = this.#draft.input ?? '';
    return {
      ...view,
      powerType: {
        text: view.isCustom ? 'Custom power' : (view.definition?.display ?? ''),
        groups: powerTypeChoices(),
      },
      identity: {
        id: `${this.id}-name`,
        label: 'Name',
        placeholder: view.framework?.name ?? (view.isCustom ? 'Custom power' : view.definition?.display) ?? '',
      },
      inputChoice: examples && {
        examples: examples.map((value) => ({ value, selected: value === input && !this.#customInput })),
        custom: this.#customInput || (!!input && !examples.includes(input)),
      },
      // Skills can be changed from here only in the editor's own forms (not a compound part's)
      canConvertSkills: !this.config.idScope,
      // Keeps each dialog's search lists apart
      uid: this.id,
      // Equipment and its parts cost money rather than points, so they can't be GM-given
      canBeFree: kindAllowsFree(this.#draft.kind) && this.config.section !== 'equipment' && !this.config.inEquipment,
      icon: { src: this.#draft.icon || this.config.defaultIcon || DEFAULT_ICON, custom: !!this.#draft.icon },
      kindChoices: isNew ? kinds.map((k) => ({ ...k, checked: k.value === this.#draft.kind })) : undefined,
      costs: view.framework
        ? [
            { label: view.kind === 'vpp' ? 'Pool + control' : 'Reserve', value: view.costs.base },
            { label: 'Active', value: view.costs.active },
            { label: 'Real', value: view.costs.real },
            ...(this.#draft.free ? [{ label: 'Points', value: '0 (free)' }] : []),
          ]
        : view.isPower || view.kind === 'compound'
          ? [
              { label: 'Base', value: view.costs.base },
              { label: 'Active', value: view.costs.active },
              { label: 'Real', value: view.costs.real },
              { label: 'END', value: view.costs.end },
              ...(view.slot ? [{ label: 'As a slot', value: view.slot.cost }] : []),
              ...(this.#draft.free ? [{ label: 'Points', value: '0 (free)' }] : []),
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
    const [kind, id, prop, sub] = field.split('.');

    switch (kind) {
      case 'inputChoice':
        // A suggested value, or "Custom…" (which shows a text box for any other)
        this.#customInput = value === '__custom';
        if (this.#customInput) return this.#update({ ...draft }); // the current value stays, to edit
        return this.#update({ ...draft, input: value });
      case 'kind':
        return this.#update({ ...draft, kind: value as PowerDraft['kind'] });
      case 'xmlId':
        return this.#update(selectPower(draft, value));
      case 'addPart':
        // A compound's "Add a power by name" box opens the part's form with that power chosen
        return value ? this.#openPart(undefined, value) : undefined;
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
        if (prop === 'input') return this.#update(setModifierInput(draft, id!, value));
        if (prop === 'adder') return this.#update(setModifierAdder(draft, id!, sub!, target.checked));
        if (prop === 'skill') return value ? this.#update(setRequiredSkill(draft, id!, value, this.config.character())) : undefined;
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

  #openPart(itemId?: string, xmlId?: string) {
    void new PowerDialog({
      section: 'powers',
      itemId,
      xmlId,
      idScope: this.id,
      isPart: true,
      inEquipment: this.config.section === 'equipment' || this.config.inEquipment,
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

  /** Converts the bound Professional Skill to a Power skill; its other bound spells follow */
  static #onConvertToPowerSkill(this: PowerDialog, _event: Event, target: HTMLElement) {
    const name = target.dataset.skill!;
    const character = this.config.character();
    const skill = character.skills.find((s) => (s.bindingName ?? s.name).toLowerCase() === name.toLowerCase());
    if (!skill) return;
    const converted = saveItemForm(character, 'skills', skill.id, { ...itemFormValues(character, 'skills', skill.id), xmlid: 'POWERSKILL' });
    this.config.onSave(converted);
    this.#update(setRequiredSkill(this.#draft, target.dataset.id!, name, converted));
    ui.notifications.info(`${name} is now a Power skill; spells that roll it use a Skill roll.`);
  }

  static #onConvertToSpell(this: PowerDialog, _event: Event, target: HTMLElement) {
    this.#update(convertSpellModifier(this.#draft, target.dataset.id!));
  }

  /** Converts the character's other custom Spell modifiers right away, and this item's with the form */
  static #onConvertAllSpells(this: PowerDialog) {
    const { character, count } = convertCustomSpells(this.config.character(), this.config.itemId);
    if (count) this.config.onSave(character);
    const draft = this.#draft.modifiers.reduce((d, m) => convertSpellModifier(d, m.id), this.#draft);
    this.#update(draft);
    ui.notifications.info(`Converted ${count} other custom Spell modifier${count === 1 ? '' : 's'}; this one changes when you save.`);
  }

  static #onMatchRollCategory(this: PowerDialog, _event: Event, target: HTMLElement) {
    this.#update(setRequiredSkill(this.#draft, target.dataset.id!, target.dataset.skill!, this.config.character()));
  }

  static async #onPickIcon(this: PowerDialog) {
    const path = await pickImage(this.#draft.icon || this.config.defaultIcon || '');
    this.#update({ ...this.#draft, icon: path });
  }

  static #onClearIcon(this: PowerDialog) {
    this.#update({ ...this.#draft, icon: '' });
  }

  static #onClearName(this: PowerDialog) {
    this.#update({ ...this.#draft, name: '' });
  }

  static #onSubmit(this: PowerDialog) {
    const { section, itemId, character, onSave } = this.config;
    onSave(savePowerDraft(character(), section, itemId, this.#draft));
  }
}
