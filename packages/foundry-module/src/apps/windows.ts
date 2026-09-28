/**
 * Hero Workshop's smaller windows: the HDC inspector, new-character form and race library.
 */

import {
  CHARACTER_TEMPLATES,
  HdcDocument,
  MAXIMA_CHARACTERISTICS,
  buildPointSummary,
  parseHdcDocument,
  raceMaxima,
  validateForFoundry,
  type CharacterTemplateId,
  type CharacteristicType,
  type RaceDefinition,
} from '@hero-workshop/shared';
import { downloadHdc, type NewCharacterOptions } from '../sync/session';
import { getRaceLibrary, newRaceId, raceFromActor, raceFromRulesFile, saveRaceLibrary } from '../races/library';
import { HeroWorkshopApplication, template } from './base';

// =============================================================================
// Inspector
// =============================================================================

export class HdcInspector extends HeroWorkshopApplication {
  static DEFAULT_OPTIONS = {
    classes: ['hero-workshop', 'hero-workshop-inspector'],
    position: { width: 860, height: 700 },
    window: { icon: 'fa-solid fa-file-code', resizable: true },
    actions: { download: HdcInspector.#onDownload },
  };

  static PARTS = {
    tabs: { template: 'templates/generic/tab-navigation.hbs' },
    body: { template: template('inspector.hbs'), scrollable: ['.hw-scroll'] },
  };

  static TABS = {
    primary: {
      tabs: [
        { id: 'summary', label: 'Summary', icon: 'fa-solid fa-list' },
        { id: 'check', label: 'Foundry check', icon: 'fa-solid fa-stethoscope' },
        { id: 'xml', label: 'XML', icon: 'fa-solid fa-code' },
      ],
      initial: 'summary',
    },
  };

  constructor(readonly actor: FoundryActor) {
    super({ id: `hero-workshop-inspector-${actor.id}`, window: { title: `HDC: ${actor.name}` } });
  }

  async _prepareContext(options: unknown) {
    const base = await (super._prepareContext as (o: unknown) => Promise<Record<string, unknown>>).call(this, options);
    const xml = this.actor.system._hdcXml ?? '';
    const doc = HdcDocument.parse(xml);
    const issues = validateForFoundry(doc);
    doc.ensureIds();
    const character = parseHdcDocument(doc);
    return {
      ...base,
      xml,
      issues,
      name: character.characterInfo.characterName || this.actor.name,
      summary: buildPointSummary(character),
      counts: [
        ['Skills', character.skills.length],
        ['Perks', character.perks.length],
        ['Talents', character.talents.length],
        ['Martial Arts', character.martialArts.length],
        ['Powers', character.powers.length],
        ['Complications', character.disadvantages.length],
        ['Equipment', character.equipment?.length ?? 0],
      ].map(([label, count]) => ({ label, count })),
    };
  }

  static #onDownload(this: HdcInspector) {
    downloadHdc(this.actor.system._hdcXml ?? '', this.actor.name);
  }
}

// =============================================================================
// New character
// =============================================================================

export class NewCharacterWindow extends HeroWorkshopApplication {
  static DEFAULT_OPTIONS = {
    id: 'hero-workshop-new-character',
    tag: 'form',
    classes: ['hero-workshop', 'hero-workshop-new'],
    position: { width: 640 },
    window: { title: 'Hero Workshop: New Character', icon: 'fa-solid fa-user-plus' },
    form: { handler: NewCharacterWindow.#onSubmit, closeOnSubmit: true },
  };

  static PARTS = {
    form: { template: template('new-character.hbs') },
    footer: { template: 'templates/generic/form-footer.hbs' },
  };

  #templateId: CharacterTemplateId = 'heroic';
  #values: { name: string; actorType: string; basePoints: number; disadPoints: number } = {
    name: '',
    actorType: 'pc',
    basePoints: CHARACTER_TEMPLATES.heroic.basePoints,
    disadPoints: CHARACTER_TEMPLATES.heroic.disadPoints,
  };

  constructor(readonly onStart: (options: NewCharacterOptions) => void) {
    super({});
  }

  async _prepareContext() {
    const preset = CHARACTER_TEMPLATES[this.#templateId];
    return {
      ...this.#values,
      templates: (Object.keys(CHARACTER_TEMPLATES) as CharacterTemplateId[]).map((id) => ({
        id,
        label: CHARACTER_TEMPLATES[id].label,
        checked: id === this.#templateId,
        hint: CHARACTER_TEMPLATES[id].actorType
          ? `hero6e ${CHARACTER_TEMPLATES[id].actorType} actor`
          : `${CHARACTER_TEMPLATES[id].basePoints} points, ${CHARACTER_TEMPLATES[id].disadPoints} in complications`,
      })),
      isPerson: !preset.actorType,
      buttons: [{ type: 'submit', icon: 'fa-solid fa-hammer', label: 'Start building' }],
    };
  }

  protected onFieldChange(field: string, value: string): void {
    if (field === 'template') {
      this.#templateId = value as CharacterTemplateId;
      const preset = CHARACTER_TEMPLATES[this.#templateId];
      this.#values = { ...this.#values, basePoints: preset.basePoints, disadPoints: preset.disadPoints };
      void this.render();
    } else if (field === 'name' || field === 'actorType') {
      this.#values = { ...this.#values, [field]: value };
    } else if (field === 'basePoints' || field === 'disadPoints') {
      this.#values = { ...this.#values, [field]: Number(value) || 0 };
    }
  }

  static #onSubmit(this: NewCharacterWindow, _event: Event, _form: HTMLFormElement, formData: { object: Record<string, unknown> }) {
    const data = formData.object;
    const preset = CHARACTER_TEMPLATES[this.#templateId];
    const name = String(data.name ?? '').trim();
    if (!name) {
      ui.notifications.warn('Give the character a name.');
      throw new Error('Name required');
    }
    this.onStart({
      name,
      template: preset.template,
      actorType: preset.actorType ?? String(data.actorType ?? 'pc'),
      basePoints: Number(data.basePoints) || 0,
      disadPoints: Number(data.disadPoints) || 0,
    });
  }
}

// =============================================================================
// Race library
// =============================================================================

export class RaceLibraryWindow extends HeroWorkshopApplication {
  static DEFAULT_OPTIONS = {
    id: 'hero-workshop-race-library',
    classes: ['hero-workshop', 'hero-workshop-races'],
    position: { width: 1300, height: 640 },
    window: { title: 'Hero Workshop: Race Library', icon: 'fa-solid fa-dna', resizable: true },
    actions: {
      addRace: RaceLibraryWindow.#onAdd,
      deleteRace: RaceLibraryWindow.#onDelete,
      importActor: RaceLibraryWindow.#onImportActor,
      importFile: RaceLibraryWindow.#onImportFile,
      save: RaceLibraryWindow.#onSave,
    },
  };

  static PARTS = {
    body: { template: template('race-library.hbs'), scrollable: ['.hw-scroll'] },
  };

  #draft: RaceDefinition[] = getRaceLibrary();
  #error?: string;

  constructor(readonly editable: boolean) {
    super({});
  }

  async _prepareContext() {
    const saved = JSON.stringify(getRaceLibrary());
    return {
      editable: this.editable,
      dirty: saved !== JSON.stringify(this.#draft),
      error: this.#error,
      columns: MAXIMA_CHARACTERISTICS,
      actors: game.actors.contents.map((a) => ({ id: a.id, name: a.name })),
      races: [...this.#draft]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((race) => {
          const maxima = raceMaxima(race);
          return {
            id: race.id,
            name: race.name,
            stats: MAXIMA_CHARACTERISTICS.map((type) => ({
              type,
              value: race.stats[type] ?? '',
              tooltip: maxima[type] !== undefined ? `Maximum ${maxima[type]}` : 'Not listed',
            })),
          };
        }),
    };
  }

  protected onFieldChange(field: string, value: string): void {
    const [, id, key] = field.split('.') as [string, string, string];
    this.#draft = this.#draft.map((race) => {
      if (race.id !== id) return race;
      if (key === 'name') return { ...race, name: value };
      const stats = { ...race.stats };
      const n = parseInt(value, 10);
      if (value.trim() === '' || !Number.isFinite(n)) delete stats[key as CharacteristicType];
      else stats[key as CharacteristicType] = n;
      return { ...race, stats };
    });
    void this.render();
  }

  #add(race: RaceDefinition) {
    this.#error = undefined;
    this.#draft = [...this.#draft, race];
    void this.render();
  }

  static #onAdd(this: RaceLibraryWindow) {
    this.#add({ id: newRaceId(), name: 'New race', stats: {} });
  }

  static #onDelete(this: RaceLibraryWindow, _event: Event, target: HTMLElement) {
    this.#draft = this.#draft.filter((r) => r.id !== target.dataset.raceId);
    void this.render();
  }

  static #onImportActor(this: RaceLibraryWindow) {
    const select = this.element.querySelector<HTMLSelectElement>('select[name="importActor"]');
    const actor = select?.value ? game.actors.get(select.value) : undefined;
    if (actor) this.#add(raceFromActor(actor));
  }

  static #onImportFile(this: RaceLibraryWindow) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.hdc,.hdr,.xml';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        this.#add(raceFromRulesFile(new Uint8Array(await file.arrayBuffer())));
      } catch (e) {
        this.#error = e instanceof Error ? e.message : String(e);
        void this.render();
      }
    });
    input.click();
  }

  static async #onSave(this: RaceLibraryWindow) {
    const races = this.#draft.filter((r) => r.name.trim());
    await saveRaceLibrary(races);
    this.#draft = races;
    ui.notifications.info(game.i18n.format('HERO_WORKSHOP.RacesSaved', { count: races.length }));
    void this.render();
  }
}
