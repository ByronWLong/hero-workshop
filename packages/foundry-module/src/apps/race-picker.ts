/**
 * "Choose races" window: a searchable list of the world library's races, plus free-text
 * names for races that aren't in it. It follows the library as the GM edits it (the race
 * library opens from here). Resolves with the chosen race names, or undefined if closed.
 */

import { canManageRaces, getRaceLibrary } from '../races/library';
import { MODULE_ID } from '../sync/session';
import { HeroWorkshopApplication, template } from './base';
import { RaceLibraryWindow } from './windows';

export const RACE_PICKER_ID = `${MODULE_ID}-race-picker`;

export function chooseRaces(current: string[]): Promise<string[] | undefined> {
  return new Promise((resolve) => void new RacePickerWindow(current, resolve).render({ force: true }));
}

class RacePickerWindow extends HeroWorkshopApplication {
  static DEFAULT_OPTIONS = {
    classes: ['hero-workshop', 'hero-workshop-race-picker'],
    position: { width: 440, height: 600 },
    window: { title: 'Choose races', icon: 'fa-solid fa-people-group', resizable: true },
    actions: {
      apply: RacePickerWindow.#onApply,
      openLibrary: RacePickerWindow.#onOpenLibrary,
    },
  };

  static PARTS = {
    body: { template: template('dialogs/race-picker.hbs'), scrollable: ['.hw-pick-list'] },
    footer: { template: template('footer.hbs') },
  };

  /** Chosen library races, by lower-cased name */
  #selected: Set<string>;
  #others: string;
  /** Races chosen when the window opened are listed first */
  readonly #initial: Set<string>;
  #resolve?: (races: string[] | undefined) => void;

  constructor(current: string[], resolve: (races: string[] | undefined) => void) {
    super({ id: `${RACE_PICKER_ID}-${foundry.utils.randomID()}` });
    const known = new Set(getRaceLibrary().map((r) => r.name.toLowerCase()));
    this.#selected = new Set(current.map((c) => c.toLowerCase()).filter((c) => known.has(c)));
    this.#initial = new Set(this.#selected);
    this.#others = current.filter((c) => !known.has(c.toLowerCase())).join(', ');
    this.#resolve = resolve;
  }

  async _prepareContext() {
    const library = getRaceLibrary();
    const chosen = library.filter((r) => this.#selected.has(r.name.toLowerCase())).map((r) => r.name);
    const first = (name: string) => (this.#initial.has(name.toLowerCase()) ? 0 : 1);
    return {
      races: [...library]
        .sort((a, b) => first(a.name) - first(b.name) || a.name.localeCompare(b.name))
        .map((r) => ({ name: r.name, checked: this.#selected.has(r.name.toLowerCase()), notes: r.notes })),
      hasLibrary: library.length > 0,
      others: this.#others,
      libraryLabel: canManageRaces() ? 'Race library' : 'View races',
      status: chosen.length ? `${chosen.length} selected: ${chosen.join(', ')}` : 'No races selected',
      buttons: [{ action: 'apply', icon: 'fa-solid fa-check', label: 'Apply', cssClass: 'bright' }],
    };
  }

  protected onFieldChange(field: string, value: string, target: HTMLInputElement): void {
    if (field === 'others') {
      this.#others = value;
      return;
    }
    const name = target.value.toLowerCase();
    if (value === 'true') this.#selected.add(name);
    else this.#selected.delete(name);
    void this.render({ parts: ['footer'] });
  }

  static #onApply(this: RacePickerWindow) {
    const picked = getRaceLibrary()
      .filter((r) => this.#selected.has(r.name.toLowerCase()))
      .map((r) => r.name);
    const typed = this.#others
      .split(',')
      .map((s) => s.trim())
      .filter((t) => t && !picked.some((p) => p.toLowerCase() === t.toLowerCase()));
    this.#resolve?.([...picked, ...typed]);
    this.#resolve = undefined;
    void this.close();
  }

  static #onOpenLibrary() {
    void new RaceLibraryWindow(canManageRaces()).render({ force: true });
  }

  _onClose(options: unknown): void {
    super._onClose(options);
    this.#resolve?.(undefined);
    this.#resolve = undefined;
  }
}
