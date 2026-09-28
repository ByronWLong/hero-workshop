/**
 * The Hero Workshop editor window (actors, new characters and world items).
 *
 * Flow: drift review -> edit -> review -> apply. The window keeps the edited Character model;
 * form changes and actions go through the shared editing operations, then re-render.
 */

import {
  HdcDocument,
  MAXIMA_CHARACTERISTICS,
  SECTION_FOR_HDC,
  buildCharacteristicsView,
  buildItemTree,
  buildPointSummary,
  combinedRaceMaxima,
  extractItems,
  insertItems,
  parseHdcFile,
  removeItem,
  setCharacteristicValue,
  updateHdc,
  withInsertedItems,
  withMaxima,
  type Character,
  type CharacteristicType,
  type HdcWriteReport,
  type ItemTransfer,
  type PowerKind,
  type SectionId,
} from '@hero-workshop/shared';
import type { TabId } from '../sync/tabs';
import { applyDrift, type DriftChange } from '../sync/drift';
import type { ActorSession, AppliedDocument } from '../sync/session';
import { DRAG_TYPE, dragData, transferFromItem, type HeroWorkshopDragData } from '../sync/worldItems';
import { canManageRaces, getRaceLibrary } from '../races/library';
import { HeroWorkshopApplication, template } from './base';
import { chooseRaces } from './race-picker';
import { ItemDialog } from './item-dialog';
import { PowerDialog } from './power-dialog';

type Stage = 'drift' | 'edit' | 'review' | 'applying';

const ALL_TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'info', label: 'Info', icon: 'fa-solid fa-id-card' },
  { id: 'characteristics', label: 'Characteristics', icon: 'fa-solid fa-dumbbell' },
  { id: 'skills', label: 'Skills', icon: 'fa-solid fa-book' },
  { id: 'perks', label: 'Perks', icon: 'fa-solid fa-medal' },
  { id: 'talents', label: 'Talents', icon: 'fa-solid fa-star' },
  { id: 'martialarts', label: 'Martial Arts', icon: 'fa-solid fa-hand-fist' },
  { id: 'powers', label: 'Powers', icon: 'fa-solid fa-bolt' },
  { id: 'disadvantages', label: 'Complications', icon: 'fa-solid fa-triangle-exclamation' },
  { id: 'equipment', label: 'Equipment', icon: 'fa-solid fa-suitcase' },
];

const INFO_FIELDS: { key: keyof Character['characterInfo']; label: string; multiline?: boolean }[] = [
  { key: 'characterName', label: 'Name' },
  { key: 'alternateIdentities', label: 'Alternate identities' },
  { key: 'playerName', label: 'Player' },
  { key: 'campaignName', label: 'Campaign' },
  { key: 'genre', label: 'Genre' },
  { key: 'gm', label: 'GM' },
  { key: 'hairColor', label: 'Hair' },
  { key: 'eyeColor', label: 'Eyes' },
  { key: 'appearance', label: 'Appearance', multiline: true },
  { key: 'background', label: 'Background', multiline: true },
  { key: 'personality', label: 'Personality', multiline: true },
  { key: 'quote', label: 'Quote', multiline: true },
  { key: 'tactics', label: 'Tactics', multiline: true },
  { key: 'campaignUse', label: 'Campaign use', multiline: true },
];

export interface EditorOptions {
  session: ActorSession;
  windowId: string;
  onApplied(document: AppliedDocument): void;
}

export class HeroWorkshopEditor extends HeroWorkshopApplication {
  static DEFAULT_OPTIONS = {
    classes: ['hero-workshop', 'hero-workshop-editor'],
    position: { width: 1100, height: 820 },
    window: { icon: 'fa-solid fa-user-pen', resizable: true },
    actions: {
      download: HeroWorkshopEditor.#onDownload,
      review: HeroWorkshopEditor.#onReview,
      backToEdit: HeroWorkshopEditor.#onBackToEdit,
      apply: HeroWorkshopEditor.#onApply,
      keepDrift: HeroWorkshopEditor.#onKeepDrift,
      discardDrift: HeroWorkshopEditor.#onDiscardDrift,
      chooseRaces: HeroWorkshopEditor.#onChooseRaces,
      manageRaces: HeroWorkshopEditor.#onManageRaces,
      addItem: HeroWorkshopEditor.#onAddItem,
      editItem: HeroWorkshopEditor.#onEditItem,
      deleteItem: HeroWorkshopEditor.#onDeleteItem,
    },
  };

  static PARTS = {
    header: { template: template('editor/header.hbs') },
    body: { template: template('editor/body.hbs'), scrollable: ['.hw-scroll'] },
  };

  static TABS = { primary: { tabs: ALL_TABS, initial: 'info' } };

  readonly session: ActorSession;
  readonly #onAppliedCallback: (document: AppliedDocument) => void;
  #stage: Stage;
  #baseXml: string;
  #original: Character;
  #character: Character;
  #driftDoc?: HdcDocument;
  #drift: DriftChange[] = [];
  #driftSelected = new Set<string>();
  #keptFromFoundry = 0;
  #review?: { xml: string; report: HdcWriteReport };
  #error?: string;
  /** Names of items dropped in from Foundry or another editor, for the review */
  #imported: string[] = [];

  constructor(options: EditorOptions) {
    super({
      id: `hero-workshop-editor-${options.windowId}`,
      window: { title: `Hero Workshop: ${options.session.actorName}` },
    });
    this.session = options.session;
    this.#onAppliedCallback = options.onApplied;
    this.#baseXml = options.session.hdcXml;
    this.#original = parseHdcFile(this.#baseXml);
    this.#character = this.#original;

    const doc = HdcDocument.parse(this.#baseXml);
    this.#drift = options.session.detectDrift(doc);
    this.#driftDoc = doc;
    this.#driftSelected = new Set(this.#drift.filter((c) => c.recommended).map((c) => c.key));
    this.#stage = this.#drift.length ? 'drift' : 'edit';
    const view = options.session.view;
    if (view?.initialTab) this.tabGroups.primary = view.initialTab;
  }

  get character(): Character {
    return this.#character;
  }

  /** Replaces the edited character and re-renders */
  setCharacter(character: Character): void {
    this.#character = character;
    void this.render();
  }

  get #dirty(): boolean {
    return this.#character !== this.#original || this.#baseXml !== this.session.hdcXml;
  }

  _getTabsConfig(group: string) {
    if (group !== 'primary') return null;
    const visible = this.session.view?.visibleTabs;
    const tabs = visible ? ALL_TABS.filter((t) => visible.includes(t.id)) : ALL_TABS;
    return { tabs, initial: tabs[0]?.id ?? 'info' };
  }

  async _prepareContext(options: unknown) {
    const base = await (super._prepareContext as (o: unknown) => Promise<Record<string, unknown>>).call(this, options);
    const character = this.#character;
    const tabs = base.tabs as Record<string, { id: string; cssClass?: string; active: boolean }>;
    const listTab = (id: SectionId) => ({ ...tabs[id], rows: buildItemTree(character, id), section: id });

    return {
      ...base,
      stage: this.#stage,
      isNew: this.session.isNew,
      title: character.characterInfo.characterName || this.session.actorName,
      dirty: this.#dirty,
      canApply: this.#dirty || this.session.isNew,
      error: this.#error,
      hideSidebar: !!this.session.view?.hideSidebar,
      summary: buildPointSummary(character),
      drift: this.#driftContext(),
      review: this.#reviewContext(),
      info: tabs.info && {
        ...tabs.info,
        fields: INFO_FIELDS.map((f) => ({ ...f, value: character.characterInfo[f.key] ?? '' })),
        config: character.basicConfiguration,
      },
      characteristics: tabs.characteristics && {
        ...tabs.characteristics,
        ...buildCharacteristicsView(character),
        races: character.rules?.races ?? [],
        maxima: MAXIMA_CHARACTERISTICS.map((type) => ({ type, value: character.rules?.characteristicMaxima?.[type] ?? '' })),
        canManageRaces: canManageRaces(),
      },
      lists: (['skills', 'perks', 'talents', 'martialarts', 'powers', 'disadvantages', 'equipment'] as SectionId[])
        .filter((id) => tabs[id])
        .map(listTab),
    };
  }

  #driftContext() {
    const groups = new Map<string, { itemName: string; changes: unknown[] }>();
    for (const change of this.#drift) {
      const group = groups.get(change.itemName) ?? { itemName: change.itemName, changes: [] };
      group.changes.push({ ...change, selected: this.#driftSelected.has(change.key) });
      groups.set(change.itemName, group);
    }
    return { groups: [...groups.values()], selectedCount: this.#driftSelected.size };
  }

  #reviewContext() {
    const report = this.#review?.report;
    if (!report) return undefined;
    return {
      changes: report.changes,
      warnings: report.warnings,
      errors: report.foundryIssues.filter((i) => i.severity === 'error').map((i) => i.message),
      notes: report.foundryIssues.filter((i) => i.severity === 'warning').map((i) => i.message),
      keptFromFoundry: this.#keptFromFoundry,
      imported: this.#imported,
      applyLabel: this.session.isNew ? 'Create character' : (this.session.view?.applyLabel ?? 'Apply to actor'),
    };
  }

  // ---------------------------------------------------------------------------
  // Form fields
  // ---------------------------------------------------------------------------

  protected onFieldChange(field: string, value: string): void {
    const [kind, key] = field.split('.') as [string, string];
    let character = this.#character;

    if (kind === 'drift') {
      if (value === 'true') this.#driftSelected.add(key);
      else this.#driftSelected.delete(key);
      void this.render();
      return;
    }
    if (kind === 'info') {
      character = { ...character, characterInfo: { ...character.characterInfo, [key]: value } };
    } else if (kind === 'config') {
      const n = Number(value);
      if (!Number.isFinite(n)) return;
      character = { ...character, basicConfiguration: { ...character.basicConfiguration, [key]: n } };
    } else if (kind === 'char') {
      const n = parseInt(value, 10);
      if (!Number.isFinite(n)) return;
      character = setCharacteristicValue(character, key as CharacteristicType, n);
    } else if (kind === 'max') {
      const maxima = { ...(character.rules?.characteristicMaxima ?? {}) };
      const n = parseInt(value, 10);
      if (value.trim() === '' || !Number.isFinite(n)) delete maxima[key as CharacteristicType];
      else maxima[key as CharacteristicType] = n;
      character = withMaxima(character, maxima);
    } else {
      return;
    }
    this.setCharacter(character);
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  static #onKeepDrift(this: HeroWorkshopEditor) {
    const selected = this.#drift.filter((c) => this.#driftSelected.has(c.key));
    if (selected.length && this.#driftDoc) {
      applyDrift(this.#driftDoc, selected);
      this.#baseXml = this.#driftDoc.toString();
      this.#original = parseHdcFile(this.#baseXml);
      this.#character = this.#original;
    }
    this.#keptFromFoundry = selected.length;
    this.#stage = 'edit';
    void this.render();
  }

  static #onDiscardDrift(this: HeroWorkshopEditor) {
    this.#driftSelected.clear();
    HeroWorkshopEditor.#onKeepDrift.call(this);
  }

  static #onReview(this: HeroWorkshopEditor) {
    try {
      this.#review = updateHdc(this.#baseXml, this.#character);
      this.#error = undefined;
      this.#stage = 'review';
    } catch (e) {
      console.error(e);
      this.#error = e instanceof Error ? e.message : String(e);
    }
    void this.render();
  }

  static #onBackToEdit(this: HeroWorkshopEditor) {
    this.#stage = 'edit';
    void this.render();
  }

  static async #onApply(this: HeroWorkshopEditor) {
    if (!this.#review) return;
    this.#stage = 'applying';
    void this.render();
    try {
      const name = this.#character.characterInfo.characterName;
      const applied = await this.session.apply(this.#review.xml, {
        characterName: name !== this.#original.characterInfo.characterName ? name : undefined,
      });
      this.#onAppliedCallback(applied);
      await this.close();
    } catch (e) {
      console.error(e);
      this.#error = e instanceof Error ? e.message : String(e);
      this.#stage = 'edit';
      void this.render();
    }
  }

  static #onDownload(this: HeroWorkshopEditor) {
    const xml = this.#dirty ? updateHdc(this.#baseXml, this.#character).xml : this.#baseXml;
    this.session.download(xml, this.#character.characterInfo.characterName || this.session.actorName);
  }

  static async #onChooseRaces(this: HeroWorkshopEditor) {
    const library = getRaceLibrary();
    const selected = await chooseRaces(library, this.#character.rules?.races ?? []);
    if (!selected) return;
    const chosen = selected
      .map((name) => library.find((r) => r.name.toLowerCase() === name.toLowerCase()))
      .filter((r) => r !== undefined);
    const maxima = this.#character.rules?.characteristicMaxima ?? {};
    // Only characteristics the chosen races define are replaced
    const next = chosen.length ? { ...maxima, ...combinedRaceMaxima(chosen) } : maxima;
    this.setCharacter(withMaxima(this.#character, next, selected));
  }

  static #onAddItem(this: HeroWorkshopEditor, _event: Event, target: HTMLElement) {
    void this.editItem(target.dataset.section as SectionId, undefined, target.dataset.kind as PowerKind | undefined);
  }

  static #onEditItem(this: HeroWorkshopEditor, _event: Event, target: HTMLElement) {
    void this.editItem(target.dataset.section as SectionId, target.dataset.itemId);
  }

  /** Opens the item dialog for a new (no id) or existing item */
  async editItem(section: SectionId, itemId?: string, kind?: PowerKind): Promise<void> {
    // An item's dialog that's already open just comes to the front
    if (itemId) {
      const instances = (foundry.applications as unknown as { instances: Map<string, { bringToFront(): void }> }).instances;
      const open =
        instances.get(`hero-workshop-power-${section}-${itemId}`) ?? instances.get(`hero-workshop-item-${section}-${itemId}`);
      if (open) {
        open.bringToFront();
        return;
      }
    }
    if (section === 'powers' || section === 'equipment') {
      await new PowerDialog({
        section,
        itemId,
        kind,
        character: () => this.#character,
        onSave: (character) => this.setCharacter(character),
      }).render({ force: true });
      return;
    }
    await new ItemDialog({
      section,
      itemId,
      character: () => this.#character,
      onSave: (character) => this.setCharacter(character),
    }).render({ force: true });
  }

  #focusHandled = false;
  #dragListening = false;

  _onRender(context: unknown, options: unknown): void {
    super._onRender(context, options);
    if (!this.#dragListening) {
      this.#dragListening = true;
      this.#listenForDrags();
    }
    // Opened from an actor's item: go straight to that item's dialog
    const focus = this.session.view?.focusItemId;
    if (this.#focusHandled || !focus || this.#stage !== 'edit') return;
    this.#focusHandled = true;
    const section = this.session.view?.initialTab;
    if (section && section !== 'info' && section !== 'characteristics') void this.editItem(section, focus);
  }

  // ---------------------------------------------------------------------------
  // Drag and drop: rows drag out as HDC (to the Items sidebar or another editor); Foundry
  // items and other editors' rows drop in, optionally onto a list or framework row
  // ---------------------------------------------------------------------------

  /** Other items can't be added when the editor is working on a single world item */
  get #acceptsDrops(): boolean {
    return this.#stage === 'edit' && !this.session.view?.visibleTabs;
  }

  #listenForDrags(): void {
    const el = this.element;
    el.addEventListener('dragstart', (event) => {
      const row = (event.target as HTMLElement).closest?.<HTMLElement>('.hw-item-row[draggable]');
      if (!row || !event.dataTransfer) return;
      const data = this.#dragDataFor(row.dataset.section as SectionId, row.dataset.itemId!);
      if (!data) return;
      event.dataTransfer.setData('text/plain', JSON.stringify(data));
      event.dataTransfer.effectAllowed = 'copy';
      row.classList.add('hw-dragging');
    });
    el.addEventListener('dragend', () => el.querySelectorAll('.hw-dragging').forEach((r) => r.classList.remove('hw-dragging')));
    el.addEventListener('dragover', (event) => {
      if (!this.#acceptsDrops) return;
      event.preventDefault();
      this.#highlightDropTarget(event);
    });
    el.addEventListener('dragleave', (event) => {
      if (!el.contains(event.relatedTarget as Node)) this.#highlightDropTarget();
    });
    el.addEventListener('drop', (event) => {
      this.#highlightDropTarget();
      if (!this.#acceptsDrops) return;
      event.preventDefault();
      void this.#onDrop(event);
    });
  }

  #highlightDropTarget(event?: DragEvent): void {
    const target = event && (event.target as HTMLElement).closest?.<HTMLElement>('.hw-item-row[data-accepts-children]');
    this.element.querySelectorAll('.hw-drop-target').forEach((r) => r !== target && r.classList.remove('hw-drop-target'));
    target?.classList.add('hw-drop-target');
    this.element.classList.toggle('hw-drop-active', !!event);
  }

  #dragDataFor(section: SectionId, id: string): HeroWorkshopDragData | undefined {
    // Drag the item as it is now, including unsaved edits
    const written = this.#dirty ? updateHdc(this.#baseXml, this.#character) : undefined;
    const xml = written?.xml ?? this.#baseXml;
    const hdcId = written?.report.idMap[id] ?? id;
    const transfer = extractItems(xml, hdcId);
    if (!transfer) return undefined;
    const name = buildItemTree(this.#character, section).flatMap(function flat(r): typeof r[] {
      return [r, ...r.children.flatMap(flat)];
    }).find((r) => r.id === id)?.name ?? 'item';
    return { type: DRAG_TYPE, name, transfer, sourceWindow: this.id };
  }

  async #onDrop(event: DragEvent): Promise<void> {
    const data = dragData(event);
    if (!data) return;
    let transfer: ItemTransfer | undefined;
    let name = 'item';
    if (data.type === DRAG_TYPE) {
      const drag = data as unknown as HeroWorkshopDragData;
      if (drag.sourceWindow === this.id) return;
      transfer = drag.transfer;
      name = drag.name;
    } else if (data.type === 'Item' && typeof data.uuid === 'string') {
      const item = (await fromUuid(data.uuid)) as FoundryItem | null;
      if (!item) return;
      name = item.name;
      transfer = await transferFromItem(item);
      if (!transfer) {
        ui.notifications.warn(`${item.name} has no Hero Designer data to add.`);
        return;
      }
    } else {
      return;
    }

    // Dropped on a list or framework in the same section: put it inside
    const row = (event.target as HTMLElement).closest?.<HTMLElement>('.hw-item-row[data-accepts-children]');
    const section = SECTION_FOR_HDC[transfer.section];
    const parentId =
      row && row.dataset.section === section && /^\d+$/.test(row.dataset.itemId ?? '') ? row.dataset.itemId : undefined;
    this.addItems(transfer, name, parentId);
  }

  /** Adds copied items to the character, keeping their Hero Designer data intact */
  addItems(transfer: ItemTransfer, name: string, parentId?: string): void {
    const section = SECTION_FOR_HDC[transfer.section];
    const { xml } = insertItems(this.#baseXml, transfer, { parentId });
    const before = this.#original;
    this.#baseXml = xml;
    this.#original = parseHdcFile(xml);
    this.#character = withInsertedItems(this.#character, before, this.#original, section);
    this.#imported.push(name);
    this.changeTab(section, 'primary');
    void this.render();
  }

  static async #onDeleteItem(this: HeroWorkshopEditor, _event: Event, target: HTMLElement) {
    const section = target.dataset.section as SectionId;
    const id = target.dataset.itemId!;
    const row = buildItemTree(this.#character, section);
    const find = (rows: typeof row): (typeof row)[number] | undefined =>
      rows.reduce<(typeof row)[number] | undefined>((hit, r) => hit ?? (r.id === id ? r : find(r.children)), undefined);
    const item = find(row);
    const DialogV2 = (foundry.applications.api as unknown as { DialogV2: { confirm(o: Record<string, unknown>): Promise<boolean> } }).DialogV2;
    const confirmed = await DialogV2.confirm({
      window: { title: `Delete ${item?.name ?? 'item'}` },
      content: `<p>Delete <strong>${foundry.utils.escapeHTML?.(item?.name ?? '') ?? ''}</strong>${item?.children.length ? ' and everything in it' : ''}?</p>`,
      rejectClose: false,
    });
    if (confirmed) this.setCharacter(removeItem(this.#character, section, id));
  }

  static #onManageRaces() {
    const api = game.modules.get('hero-workshop')?.api as { openRaceLibrary?: () => void } | undefined;
    api?.openRaceLibrary?.();
  }
}

