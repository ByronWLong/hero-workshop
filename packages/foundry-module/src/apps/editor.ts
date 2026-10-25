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
  insertParts,
  isContainerTransfer,
  moveItem,
  parseHdcFile,
  placementParent,
  powerTypeChoices,
  removeItem,
  equipmentLoad,
  setCarried,
  setCharacteristicValue,
  typeChoices,
  hasLists,
  updateHdc,
  withInsertedItems,
  withMaxima,
  type Character,
  type CharacteristicType,
  type FormSection,
  type HdcWriteReport,
  type ItemTransfer,
  type PowerKind,
  type SectionId,
  moneyView,
  setMoney,
} from '@hero-workshop/shared';
import type { TabId } from '../sync/tabs';
import { getCurrencies } from '../integrations/currencies';
import { applyDrift, type DriftChange } from '../sync/drift';
import { DEFAULT_ICON } from '../sync/icons';
import type { ActorSession, AppliedDocument } from '../sync/session';
import { DRAG_TYPE, dragData, transferFromItem, type HeroWorkshopDragData } from '../sync/worldItems';
import { canManageRaces, getRaceLibrary } from '../races/library';
import { HeroWorkshopApplication, template } from './base';
import { chooseRaces } from './race-picker';
import { chooseActor } from './actor-chooser';
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

const SECTION_NOUNS: Record<SectionId, string> = {
  skills: 'skill',
  perks: 'perk',
  talents: 'talent',
  martialarts: 'maneuver',
  powers: 'power',
  disadvantages: 'complication',
  equipment: 'equipment',
};

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
    window: {
      icon: 'fa-solid fa-user-pen',
      resizable: true,
      controls: [{ icon: 'fa-solid fa-file-arrow-down', label: 'Download .hdc', action: 'download' }],
    },
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
      toggleCarried: HeroWorkshopEditor.#onToggleCarried,
      moveToActor: HeroWorkshopEditor.#onMoveToActor,
      toggleCollapse: HeroWorkshopEditor.#onToggleCollapse,
      collapseAll: HeroWorkshopEditor.#onCollapseAll,
    },
  };

  static PARTS = {
    body: { template: template('editor/body.hbs'), scrollable: ['.hw-sidebar', '.hw-tabs-body', '.hw-panel'] },
    footer: { template: template('footer.hbs') },
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
  /** Items dropped in from Foundry or another editor, or moved by dragging, for the review */
  #imported: string[] = [];
  /** Edits folded into the base document before a drop rearranged it, for the review */
  #folded?: Pick<HdcWriteReport, 'changes' | 'warnings'>;
  /** Lists, compounds and frameworks shown closed ("section:id"), remembered per actor */
  #collapsed: Set<string>;

  constructor(options: EditorOptions) {
    super({
      id: `hero-workshop-editor-${options.windowId}`,
      window: { title: `Hero Workshop: ${options.session.actorName}${options.session.view?.readOnly ? ' (read-only)' : ''}` },
    });
    if (options.session.view?.readOnly) this.makeReadOnly();
    this.session = options.session;
    this.#onAppliedCallback = options.onApplied;
    this.#baseXml = options.session.hdcXml;
    this.#original = parseHdcFile(this.#baseXml);
    this.#character = this.#original;

    const doc = HdcDocument.parse(this.#baseXml);
    this.#drift = options.session.detectDrift(doc);
    this.#driftDoc = doc;
    this.#driftSelected = new Set(this.#drift.filter((c) => c.recommended).map((c) => c.key));
    // Only interrupt for changes worth keeping. The rest (e.g. items hero6e never imported)
    // are kept as they are unless picked, which is also what skipping the step does
    this.#stage = this.#drift.some((c) => c.recommended) && !this.readOnly ? 'drift' : 'edit';
    const view = options.session.view;
    if (view?.initialTab) this.tabGroups.primary = view.initialTab;
    this.#collapsed = new Set(readCollapsed(this.session.actorId));
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
    // Rows show the item's custom icon, else its icon in Foundry
    type Row = ReturnType<typeof buildItemTree>[number];
    type ImageRow = Omit<Row, 'children'> & { img: string; collapsed: boolean; inside: number; children: ImageRow[] };
    const count = (list: Row[]): number => list.reduce((n, r) => n + (r.isGroup ? 0 : 1) + count(r.children), 0);
    const withImages = (rows: Row[], section: SectionId): ImageRow[] =>
      rows.map((r) => ({
        ...r,
        img: r.icon ?? this.session.itemImage?.(r.id) ?? DEFAULT_ICON,
        collapsed: r.children.length > 0 && this.#collapsed.has(`${section}:${r.id}`),
        // What a closed row has in it
        inside: count(r.children),
        children: withImages(r.children, section),
      }));
    const listTab = (id: SectionId) => {
      const rows = withImages(buildItemTree(character, id), id);
      const containers = rows.flatMap(function open(r): ImageRow[] {
        return r.children.length ? [r, ...r.children.flatMap(open)] : [];
      });
      return {
        ...tabs[id],
        rows,
        // Rows with something in them open and close; the toolbar does them all
        canCollapse: containers.length > 0,
        allCollapsed: containers.length > 0 && containers.every((r) => r.collapsed),
        section: id,
        noun: SECTION_NOUNS[id],
        count: count(rows),
        points: rows.reduce((n, r) => n + r.cost, 0),
        // A single world item's editor saves only that item, so nothing else can be added
        canAdd: !this.session.view?.visibleTabs && !this.readOnly,
        canAddList: id !== 'powers' && id !== 'equipment' && hasLists(id as FormSection),
        // Type a power, skill, talent… to open its form with it chosen
        addChoices:
          id === 'powers' || id === 'equipment' ? powerTypeChoices() : typeChoices(id as FormSection)?.groups,
        addField: `addType.${id}`,
        addPlaceholder: id === 'equipment' ? 'Add equipment by power…' : `Add a ${SECTION_NOUNS[id]} by name…`,
        // Equipment: carried and stored, what that weighs, and items moved to other actors
        ...(id === 'equipment' ? this.#equipmentContext() : {}),
      };
    };
    const characteristics = buildCharacteristicsView(character);

    return {
      ...base,
      stage: this.#stage,
      isNew: this.session.isNew,
      title: character.characterInfo.characterName || this.session.actorName,
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
        ...characteristics,
        groups: characteristics.groups.map((g) => ({
          ...g,
          stats: g.stats.map((stat) => ({
            ...stat,
            canMax: characteristics.usesMaxima && MAXIMA_CHARACTERISTICS.includes(stat.type),
            detail: stat.type === 'STR' && characteristics.str
              ? `Lift ${characteristics.str.lift} · ${characteristics.str.damage} HTH · throw ${characteristics.str.throw}`
              : undefined,
          })),
        })),
        races: character.rules?.races ?? [],
        canManageRaces: canManageRaces(),
      },
      lists: (['skills', 'perks', 'talents', 'martialarts', 'powers', 'disadvantages', 'equipment'] as SectionId[])
        .filter((id) => tabs[id])
        .map(listTab),
      ...this.#footerContext(),
    };
  }

  #equipmentContext() {
    const load = equipmentLoad(this.#character);
    const currencies = getCurrencies();
    const money = moneyView(this.#character, currencies);
    const penalty = load.dcv ? `${load.dcv} DCV and DEX Rolls${load.move ? `, ${load.move}m movement` : ''}` : 'no penalty';
    return {
      canCarry: !this.readOnly && !this.session.view?.visibleTabs,
      canMove: !!this.session.moveItem && !this.readOnly,
      load: {
        ...load,
        text: `Carrying ${load.carried} kg of ${load.lift} kg (${load.percent}%): ${penalty}`,
        stored: load.stored ? `${load.stored} kg stored` : '',
      },
      // Money, per currency (the world's currencies, set by the GM); not for a single world item
      money: currencies.length && !this.session.view?.visibleTabs
        ? {
            editable: !this.readOnly,
            rows: money.rows.map((r, index) => ({
              index,
              name: r.currency.name,
              abbreviation: r.currency.abbreviation,
              img: r.currency.img,
              count: r.count,
              tooltip: r.stacks > 1 ? `${r.currency.name}: ${r.count} in ${r.stacks} stacks` : r.currency.name,
            })),
            total: money.primary && currencies.length > 1 ? `${money.total} ${money.primary.abbreviation}` : '',
          }
        : undefined,
    };
  }

  /** The footer bar: status on the left, the stage's actions on the right */
  #footerContext() {
    const error = this.#error;
    switch (this.#stage) {
      case 'drift':
        return {
          status: `${this.#driftSelected.size} of ${this.#drift.length} selected`,
          buttons: [
            { action: 'discardDrift', icon: 'fa-solid fa-xmark', label: 'Discard Foundry changes' },
            { action: 'keepDrift', icon: 'fa-solid fa-check', label: 'Keep selected', cssClass: 'bright' },
          ],
        };
      case 'review': {
        const review = this.#reviewContext()!;
        return {
          error,
          buttons: [
            { action: 'backToEdit', icon: 'fa-solid fa-arrow-left', label: 'Back to editing' },
            { action: 'apply', icon: 'fa-solid fa-floppy-disk', label: review.applyLabel, cssClass: 'bright', disabled: review.errors.length > 0 },
          ],
        };
      }
      case 'applying':
        return { buttons: [] };
      default:
        if (this.readOnly) {
          return {
            status: 'Read-only: nothing here can be changed',
            buttons: [{ action: 'close', icon: 'fa-solid fa-xmark', label: 'Close' }],
          };
        }
        return {
          error,
          status: this.#dirty ? 'Unsaved changes' : this.session.isNew ? 'New character' : 'No changes yet',
          buttons: [
            {
              action: 'review',
              icon: 'fa-solid fa-check',
              label: this.session.isNew ? 'Review & create' : 'Review & apply',
              cssClass: 'bright',
              disabled: !(this.#dirty || this.session.isNew),
            },
          ],
        };
    }
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
      changes: [...(this.#folded?.changes ?? []), ...report.changes],
      warnings: [...(this.#folded?.warnings ?? []), ...report.warnings],
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

    if (kind === 'addType') {
      void this.editItem(key as SectionId, undefined, undefined, value);
      return;
    }

    // Coins: how many of a currency, in all
    if (kind === 'money') {
      const currency = getCurrencies()[Number(key)];
      const n = Number(value);
      if (!currency || !Number.isFinite(n)) return;
      this.setCharacter(setMoney(character, currency, n));
      return;
    }

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
    const selected = await chooseRaces(this.#character.rules?.races ?? []);
    if (!selected) return;
    // Read after choosing: the library may have been edited from the picker
    const library = getRaceLibrary();
    const chosen = selected
      .map((name) => library.find((r) => r.name.toLowerCase() === name.toLowerCase()))
      .filter((r) => r !== undefined);
    const maxima = this.#character.rules?.characteristicMaxima ?? {};
    // Only characteristics the chosen races define are replaced
    const next = chosen.length ? { ...maxima, ...combinedRaceMaxima(chosen) } : maxima;
    this.setCharacter(withMaxima(this.#character, next, selected));
  }

  static #onAddItem(this: HeroWorkshopEditor, _event: Event, target: HTMLElement) {
    void this.editItem(target.dataset.section as SectionId, undefined, target.dataset.kind as PowerKind | undefined, target.dataset.type);
  }

  static #onEditItem(this: HeroWorkshopEditor, _event: Event, target: HTMLElement) {
    void this.editItem(target.dataset.section as SectionId, target.dataset.itemId);
  }

  /** Opens the item dialog for a new (no id) or existing item */
  async editItem(section: SectionId, itemId?: string, kind?: PowerKind, type?: string): Promise<void> {
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
        xmlId: type,
        readOnly: this.readOnly,
        defaultIcon: itemId ? this.session.itemImage?.(itemId) : undefined,
        character: () => this.#character,
        onSave: (character) => this.setCharacter(character),
      }).render({ force: true });
      return;
    }
    await new ItemDialog({
      section,
      itemId,
      type,
      readOnly: this.readOnly,
      defaultIcon: itemId ? this.session.itemImage?.(itemId) : undefined,
      character: () => this.#character,
      onSave: (character) => this.setCharacter(character),
    }).render({ force: true });
  }

  #focusHandled = false;
  #dragListening = false;
  /** The row being dragged, when it's one of this editor's */
  #dragging?: { itemId: string; section: string; container: boolean };

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
    return this.#stage === 'edit' && !this.session.view?.visibleTabs && !this.readOnly;
  }

  #listenForDrags(): void {
    const el = this.element;
    el.addEventListener('dragstart', (event) => {
      const row = (event.target as HTMLElement).closest?.<HTMLElement>('.hw-item-row[draggable]');
      if (!row || !event.dataTransfer) return;
      const data = this.#dragDataFor(row.dataset.section as SectionId, row.dataset.itemId!);
      if (!data) return;
      event.dataTransfer.setData('text/plain', JSON.stringify(data));
      event.dataTransfer.effectAllowed = 'copyMove';
      row.classList.add('hw-dragging');
      this.#dragging = { itemId: row.dataset.itemId!, section: row.dataset.section!, container: row.dataset.acceptsChildren !== undefined };
    });
    el.addEventListener('dragend', () => {
      this.#dragging = undefined;
      this.#highlightDropTarget();
      el.querySelectorAll('.hw-dragging').forEach((r) => r.classList.remove('hw-dragging'));
    });
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

  /**
   * Where a drop lands: on a row's top or bottom edge, beside it (reordering); in the middle of a
   * list or framework (members) or a compound or piece of equipment (parts), inside it. Lists and
   * frameworks can't go inside anything.
   */
  #dropTarget(event: DragEvent): { row: HTMLElement; mode: 'before' | 'after' | 'into' } | undefined {
    const row = (event.target as HTMLElement).closest?.<HTMLElement>('.hw-item-row');
    if (!row) return undefined;
    const dragging = this.#dragging;
    if (dragging && dragging.itemId === row.dataset.itemId && dragging.section === row.dataset.section) return undefined;
    const container = dragging?.container ?? false;
    const canInto = !container && (row.dataset.acceptsChildren !== undefined || row.dataset.acceptsParts !== undefined);
    // Rows only reorder within their own section
    if (dragging && dragging.section !== row.dataset.section) return canInto ? { row, mode: 'into' } : undefined;
    const { top, height } = row.getBoundingClientRect();
    const y = height ? (event.clientY - top) / height : 0.5;
    if (canInto && y > 0.25 && y < 0.75) return { row, mode: 'into' };
    if (y < 0.5) return { row, mode: 'before' };
    // Just under an open list's or compound's heading is the top of what's in it
    const open = !row.parentElement?.classList.contains('hw-collapsed');
    const first = open ? row.nextElementSibling?.querySelector<HTMLElement>(':scope > .hw-item > .hw-item-row') : null;
    return first && canInto ? { row: first, mode: 'before' } : { row, mode: 'after' };
  }

  /** A closed list held under a drag for a moment opens, so the item can go anywhere in it */
  #openTimer?: { row: HTMLElement; timer: ReturnType<typeof setTimeout> };

  #openWhileDragging(row: HTMLElement | undefined): void {
    if (this.#openTimer?.row === row) return;
    if (this.#openTimer) clearTimeout(this.#openTimer.timer);
    this.#openTimer = undefined;
    if (!row?.parentElement?.classList.contains('hw-collapsed')) return;
    const timer = setTimeout(() => {
      this.#openTimer = undefined;
      this.#setCollapsed(row.dataset.section!, row.dataset.itemId!, false);
    }, 700);
    this.#openTimer = { row, timer };
  }

  #highlightDropTarget(event?: DragEvent): void {
    const target = event && this.#dropTarget(event);
    this.#openWhileDragging(target?.mode === 'into' ? target.row : undefined);
    const cls = target && (target.mode === 'into' ? 'hw-drop-target' : `hw-drop-${target.mode}`);
    for (const name of ['hw-drop-target', 'hw-drop-before', 'hw-drop-after']) {
      this.element.querySelectorAll(`.${name}`).forEach((r) => (r !== target?.row || name !== cls) && r.classList.remove(name));
    }
    if (target && cls) target.row.classList.add(cls);
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
    return { type: DRAG_TYPE, name, transfer, sourceWindow: this.id, itemId: id };
  }

  /**
   * Writes the edits made so far into the base document, so a drop can rearrange its elements
   * (e.g. copy a part into another compound) without losing them. Returns their new HDC IDs.
   */
  #foldEdits(): Record<string, string> {
    if (this.#character === this.#original) return {};
    const { xml, report } = updateHdc(this.#baseXml, this.#character);
    this.#folded = {
      changes: [...(this.#folded?.changes ?? []), ...report.changes],
      warnings: [...(this.#folded?.warnings ?? []), ...report.warnings],
    };
    this.#setBase(xml);
    return report.idMap;
  }

  #setBase(xml: string): void {
    this.#baseXml = xml;
    this.#original = parseHdcFile(xml);
    this.#character = this.#original;
  }

  async #onDrop(event: DragEvent): Promise<void> {
    const data = dragData(event);
    if (!data) return;
    const target = this.#dropTarget(event);
    const row = target?.mode === 'into' ? target.row : undefined;
    let transfer: ItemTransfer | undefined;
    let name = 'item';
    let idMap: Record<string, string> = {};
    /** The dragged item's HDC ID, when it's copied within this editor */
    let source: string | undefined;

    if (data.type === DRAG_TYPE) {
      const drag = data as unknown as HeroWorkshopDragData;
      name = drag.name;
      if (drag.sourceWindow === this.id) {
        // Within the editor, an item moves beside the row it's dropped next to, or is copied into
        // the list, framework or compound it's dropped on
        if (!drag.itemId || !target) return;
        idMap = this.#foldEdits();
        source = idMap[drag.itemId] ?? drag.itemId;
        transfer = extractItems(this.#baseXml, source);
      } else {
        transfer = drag.transfer;
      }
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
    if (!transfer) return;

    try {
      const beside = target && target.mode !== 'into' && target.row.dataset.section === SECTION_FOR_HDC[transfer.section];
      if (target && beside) {
        if (!source) idMap = this.#foldEdits();
        const id = target.row.dataset.itemId!;
        this.#place(transfer, name, { id: idMap[id] ?? id, after: target.mode === 'after' }, source);
        return;
      }
      if (row && row.dataset.acceptsChildren === undefined) {
        // A compound, one of its parts, or a piece of equipment (which becomes a compound)
        if (!source) idMap = this.#foldEdits();
        this.#addParts(transfer, name, idMap[row.dataset.itemId!] ?? row.dataset.itemId!, source);
        return;
      }
      // Dropped on a list or framework in the same section: put it inside
      const section = SECTION_FOR_HDC[transfer.section];
      const listId = row && row.dataset.section === section ? (idMap[row.dataset.itemId!] ?? row.dataset.itemId!) : undefined;
      const parentId = listId && /^\d+$/.test(listId) ? listId : undefined;
      if (source) {
        if (parentId) this.#copyInto(transfer, name, source, parentId);
        else void this.render();
        return;
      }
      this.addItems(transfer, name, parentId);
    } catch (e) {
      ui.notifications.warn(e instanceof Error ? e.message : String(e));
      void this.render();
    }
  }

  /** Adds copied items to the character, keeping their Hero Designer data intact */
  addItems(transfer: ItemTransfer, name: string, parentId?: string): void {
    const section = SECTION_FOR_HDC[transfer.section];
    const { xml, id } = insertItems(this.#baseXml, transfer, { parentId });
    const before = this.#original;
    this.#baseXml = xml;
    this.#original = parseHdcFile(xml);
    this.#character = withInsertedItems(this.#character, before, this.#original, section);
    // Put in a list, it's carried or stored as the list now is in the editor
    const list = parentId && section === 'equipment' ? this.#character.equipment?.find((e) => e.id === parentId) : undefined;
    if (list && id) this.#character = setCarried(this.#character, id, list.carried ?? true);
    this.#imported.push(`Added ${name}`);
    this.changeTab(section, 'primary');
    void this.render();
  }

  /**
   * Adds copies of items to a compound as parts (a single item becomes a compound first).
   * `source` is the dragged item's HDC ID when it comes from this editor.
   */
  #addParts(transfer: ItemTransfer, name: string, targetId: string, source?: string): void {
    const doc = HdcDocument.parse(this.#baseXml);
    const target = doc.findById(targetId);
    if (!target) return;
    const compound = target.parent?.hasAttr('XMLID') ? target.parent : target;
    if (source) {
      const el = doc.findById(source);
      // Dropped on its own compound, or a compound on one of its own parts
      if (!el || el === compound || el.parent === compound) return void this.render();
    }
    const { xml } = insertParts(this.#baseXml, transfer, targetId);
    this.#setBase(xml);
    this.#imported.push(`Added ${name} to ${compound.getAttr('NAME') || compound.getAttr('ALIAS') || 'the compound'}`);
    void this.render();
  }

  /**
   * Puts an item beside another: an item of this editor's beside one in the same list, framework
   * or compound moves there; anything else is added there as a copy. A list or framework dropped
   * among a list's items goes beside that list.
   */
  #place(transfer: ItemTransfer, name: string, at: { id: string; after: boolean }, source?: string): void {
    if (source) {
      const moved = moveItem(this.#baseXml, source, at);
      // Dropped where it already is
      if (moved === this.#baseXml) return void this.render();
      if (moved) {
        this.#setBase(moved);
        this.#imported.push(`Moved ${name}`);
        return void this.render();
      }
    }
    const where = placementParent(this.#baseXml, at.id);
    if (!where) return void this.render();
    const parentAt = where.parentId && isContainerTransfer(transfer) ? { id: where.parentId, after: at.after } : at;
    const parentId = parentAt === at ? (where.compound ?? where.parentId) : undefined;
    // Not beside (and so inside) itself
    if (source && parentId) {
      const doc = HdcDocument.parse(this.#baseXml);
      for (let id: string | undefined = parentId; id; id = doc.findById(id)?.getAttr('PARENTID')) {
        if (id === source) return void this.render();
      }
    }
    const { xml } = where.compound
      ? insertParts(this.#baseXml, transfer, where.compound, { at })
      : insertItems(this.#baseXml, transfer, { at: parentAt });
    const parent = parentId ? HdcDocument.parse(this.#baseXml).findById(parentId) : undefined;
    this.#setBase(xml);
    this.#imported.push(parent ? `Added ${name} to ${parent.getAttr('NAME') || parent.getAttr('ALIAS') || 'the list'}` : `Added ${name}`);
    this.changeTab(SECTION_FOR_HDC[transfer.section], 'primary');
    void this.render();
  }

  /** Copies an item of this editor's into a list or framework */
  #copyInto(transfer: ItemTransfer, name: string, source: string, parentId: string): void {
    const doc = HdcDocument.parse(this.#baseXml);
    // Not into itself or one of its own members, nor the list it's already in
    for (let id: string | undefined = parentId; id; id = doc.findById(id)?.getAttr('PARENTID')) {
      if (id === source) return void this.render();
    }
    if (doc.findById(source)?.getAttr('PARENTID') === parentId) return void this.render();
    const { xml } = insertItems(this.#baseXml, transfer, { parentId });
    this.#setBase(xml);
    const list = doc.findById(parentId);
    this.#imported.push(`Added ${name} to ${list?.getAttr('NAME') || list?.getAttr('ALIAS') || 'the list'}`);
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

  /**
   * Opens or closes a row in place (re-rendering would lose the scroll position and any
   * drag in progress), and remembers it for this actor
   */
  #setCollapsed(section: string, id: string, collapsed: boolean): void {
    const key = `${section}:${id}`;
    if (collapsed) this.#collapsed.add(key);
    else this.#collapsed.delete(key);
    writeCollapsed(this.session.actorId, this.#collapsed);
    const row = this.element.querySelector<HTMLElement>(`.hw-item-row[data-section="${section}"][data-item-id="${CSS.escape(id)}"]`);
    const item = row?.parentElement;
    if (!row || !item) return;
    item.classList.toggle('hw-collapsed', collapsed);
    const toggle = row.querySelector<HTMLElement>('.hw-item-collapse');
    toggle?.setAttribute('aria-expanded', String(!collapsed));
    toggle?.setAttribute('data-tooltip', collapsed ? 'Open' : 'Close');
  }

  static #onToggleCollapse(this: HeroWorkshopEditor, event: Event, target: HTMLElement) {
    event.stopPropagation();
    const section = target.dataset.section!;
    const id = target.dataset.itemId!;
    this.#setCollapsed(section, id, !this.#collapsed.has(`${section}:${id}`));
  }

  /** Closes every row with something in it, or opens them all if they're all closed */
  static #onCollapseAll(this: HeroWorkshopEditor, _event: Event, target: HTMLElement) {
    const section = target.dataset.section as SectionId;
    const ids = buildItemTree(this.#character, section).flatMap(function open(r): string[] {
      return r.children.length ? [r.id, ...r.children.flatMap(open)] : [];
    });
    const close = !ids.every((id) => this.#collapsed.has(`${section}:${id}`));
    for (const id of ids) {
      if (close) this.#collapsed.add(`${section}:${id}`);
      else this.#collapsed.delete(`${section}:${id}`);
    }
    writeCollapsed(this.session.actorId, this.#collapsed);
    void this.render();
  }

  static #onToggleCarried(this: HeroWorkshopEditor, event: Event, target: HTMLElement) {
    event.stopPropagation();
    const id = target.dataset.itemId!;
    const item = (this.#character.equipment ?? []).find((e) => e.id === id);
    if (item) this.setCharacter(setCarried(this.#character, id, !(item.carried ?? true)));
  }

  /** Moves an item to another actor straight away (the editor then shows the actor without it) */
  static async #onMoveToActor(this: HeroWorkshopEditor, event: Event, target: HTMLElement) {
    event.stopPropagation();
    const move = this.session.moveItem;
    if (!move) return;
    if (this.#dirty) {
      ui.notifications.warn('Apply or discard your changes before moving items to another actor.');
      return;
    }
    const id = target.dataset.itemId!;
    const name = (this.#character.equipment ?? []).find((e) => e.id === id)?.name ?? 'the item';
    const actor = await chooseActor({
      title: `Move ${name} to…`,
      hint: `${name} goes to the chosen actor, with everything in it, and off ${this.session.actorName}.`,
      ownedWorldActors: { except: this.session.actorId },
    });
    if (!actor) return;
    try {
      const moved = await move.call(this.session, id, actor);
      ui.notifications.info(game.i18n.format('HERO_WORKSHOP.MovedToActor', { name: moved, from: this.session.actorName, actor: actor.name }));
    } catch (e) {
      console.error(e);
      ui.notifications.error(game.i18n.format('HERO_WORKSHOP.MoveFailed', { name, reason: e instanceof Error ? e.message : String(e) }));
      return;
    }
    // Start again from the actor's HDC as it now is
    this.#baseXml = this.session.hdcXml;
    this.#original = parseHdcFile(this.#baseXml);
    this.#character = this.#original;
    void this.render();
  }

  static #onManageRaces() {
    const api = game.modules.get('hero-workshop')?.api as { openRaceLibrary?: () => void } | undefined;
    api?.openRaceLibrary?.();
  }
}

/** Which rows an actor's editor shows closed, kept in this browser (a convenience only) */
const collapsedKey = (actorId: string | undefined) => `hero-workshop.collapsed.${actorId ?? 'new'}`;

function readCollapsed(actorId: string | undefined): string[] {
  try {
    const stored = JSON.parse(localStorage.getItem(collapsedKey(actorId)) ?? '[]') as unknown;
    return Array.isArray(stored) ? stored.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

function writeCollapsed(actorId: string | undefined, keys: Set<string>): void {
  try {
    if (keys.size) localStorage.setItem(collapsedKey(actorId), JSON.stringify([...keys]));
    else localStorage.removeItem(collapsedKey(actorId));
  } catch {
    // Storage blocked: rows still open and close, just not remembered
  }
}
