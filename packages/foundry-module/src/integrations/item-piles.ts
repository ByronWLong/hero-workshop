/**
 * Item Piles (https://foundryvtt.com/packages/item-piles) for hero6e, which Item Piles has no
 * integration for:
 *
 * - Only equipment can be dropped, looted or traded; powers, skills, perks and the rest stay off
 *   its lists.
 * - A compound's parts and a framework's slots are parts of one thing: they're left off its lists
 *   (Hero Workshop flags them; Item Piles can only filter on stored data) and go wherever the
 *   compound or framework goes. A list's contents go with the list too, and show under it.
 * - hero6e links an item to its list or compound by HDC ID (PARENTID), which Item Piles leaves
 *   alone. Items arriving without their list are taken out of it, and an arriving HDC ID already
 *   used on the actor gets a new one.
 * - Money is equipment: the world's currencies (Hero Workshop's setting) are Item Piles'
 *   currencies, each an item whose quantity is how many coins there are.
 */

import { primaryCurrency } from '@hero-workshop/shared';
import { MODULE_ID } from '../sync/session';
import { itemFamily } from '../sync/worldItems';
import { currencyItemData, getCurrencies, isCurrencyItem } from './currencies';

const ITEM_PILES = 'item-piles';
/** Flag on a compound's part or a framework's slot */
const PART_FLAG = 'part';
/**
 * Flag (a UUID) on a list or framework that arrived from the Items sidebar or a compendium,
 * where its members are separate items in its folder: they're brought over once it lands
 */
const FROM_FLAG = 'membersFrom';
/** Flag (the HDC ID) on items Item Piles must never stack: lists, compounds and what's in them */
const UNIQUE_FLAG = 'unique';
/** What a part belongs to: it can't be taken out on its own */
const WHOLES = new Set(['COMPOUNDPOWER', 'MULTIPOWER', 'ELEMENTAL_CONTROL', 'VPP']);
const CONTAINERS = new Set(['LIST', ...WHOLES]);
/** hero6e item types that aren't things a character carries */
const NOT_LOOT = 'skill,perk,talent,martialart,power,complication,disadvantage,maneuver,characteristic';

interface PileItem {
  id: string;
  name: string;
  type: string;
  documentName: string;
  system: Record<string, unknown>;
  parentItem?: PileItem | null;
  childItems?: PileItem[];
  toObject(): ItemData;
  getFlag(scope: string, key: string): unknown;
}

interface ItemData {
  _id?: string;
  name?: string;
  type?: string;
  system?: Record<string, unknown>;
  flags?: Record<string, Record<string, unknown>>;
}

type PileActor = Omit<FoundryActor, 'items'> & { items: { contents: PileItem[]; get(id: string): PileItem | undefined } };

/** An Item document (Item Piles passes documents or plain data) */
const isItemDocument = (item: unknown): item is PileItem => (item as { documentName?: string } | null)?.documentName === 'Item';

interface ItemPilesApi {
  addSystemIntegration(data: Record<string, unknown>, version?: string): unknown;
  setCurrencies(currencies: unknown[]): Promise<unknown>;
}

interface ItemPilesGlobal {
  API: ItemPilesApi;
  CONSTANTS: { ITEM_TYPE_METHODS: Record<string, string> };
}

const itemPiles = () => (game as unknown as { itempiles?: ItemPilesGlobal }).itempiles;

export const itemPilesActive = () => !!game.modules.get(ITEM_PILES)?.active;

/** Whether an item is a compound's part or a framework's slot */
function isPart(item: PileItem): boolean {
  return WHOLES.has(String(item.parentItem?.system.XMLID ?? ''));
}

/** Everything in an item: a list's contents, a compound's parts, theirs */
function descendants(item: PileItem): PileItem[] {
  return (item.childItems ?? []).flatMap((child) => [child, ...descendants(child)]);
}

// ---------------------------------------------------------------------------------------------
// Part flags
// ---------------------------------------------------------------------------------------------

/** Flags an actor's parts (and unflags former ones) */
async function markParts(actor: PileActor): Promise<void> {
  const updates = actor.items.contents
    .filter((item) => item.type === 'equipment')
    .filter((item) => isPart(item) !== (item.getFlag(MODULE_ID, PART_FLAG) === true))
    .map((item) => ({ _id: item.id, [`flags.${MODULE_ID}.${PART_FLAG}`]: isPart(item) }));
  if (!updates.length) return;
  await actor.updateEmbeddedDocuments('Item', updates);
  refreshPileWindows(actor as unknown as FoundryActor);
}

/**
 * Flags a part as it's created, when its compound is already there (Hero Workshop adding a
 * dropped compound's parts), so an open pile window never lists it
 */
export function flagNewPart(item: PileItem & { parent?: PileActor | null; updateSource(data: Record<string, unknown>): void }): void {
  if (!itemPilesActive() || item.type !== 'equipment') return;
  const parentId = item.system.PARENTID;
  if (parentId === undefined || parentId === null || parentId === '' || item.getFlag(MODULE_ID, PART_FLAG) === true) return;
  const parent = item.parent?.items.contents.find((i) => String(i.system.ID) === String(parentId));
  if (parent && WHOLES.has(String(parent.system.XMLID ?? ''))) item.updateSource({ [`flags.${MODULE_ID}.${PART_FLAG}`]: true });
}

// ---------------------------------------------------------------------------------------------
// Open pile windows
// ---------------------------------------------------------------------------------------------

interface Readable<T> {
  subscribe(run: (value: T) => void): () => void;
  set(value: T): void;
}

interface PileStore {
  allItems: Readable<{ unsubscribe?(): void }[]>;
  attributes: Readable<{ unsubscribe?(): void }[]>;
  populateItems(): void;
  refreshItems(): void;
}

const read = <T>(store: Readable<T>): T => {
  let value!: T;
  store.subscribe((v) => (value = v))();
  return value;
};

const refreshing = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Rebuilds the lists of any pile window open on an actor, as reopening it would. Item Piles
 * adds a new item to an open window as it is (a coin as an item rather than a currency, a part
 * before it's flagged) and only sorts that out when the window is next opened.
 */
export function refreshPileWindows(actor: FoundryActor | null | undefined): void {
  const uuid = (actor as { uuid?: string } | null | undefined)?.uuid;
  if (!uuid || !itemPilesActive()) return;
  clearTimeout(refreshing.get(uuid));
  refreshing.set(
    uuid,
    setTimeout(() => {
      refreshing.delete(uuid);
      const windows = Object.values((ui as unknown as { windows: Record<string, unknown> }).windows) as {
        id?: string;
        actor?: { uuid?: string };
        svelte?: { applicationShell?: { store?: PileStore } };
      }[];
      for (const app of windows) {
        const id = String(app.id ?? '');
        if (!(id.startsWith('item-pile-inventory-') || id.startsWith('item-pile-vault-')) || app.actor?.uuid !== uuid) continue;
        const store = app.svelte?.applicationShell?.store;
        if (!store) continue;
        for (const entry of [...read(store.allItems), ...read(store.attributes)]) entry.unsubscribe?.();
        store.allItems.set([]);
        store.attributes.set([]);
        store.populateItems();
        store.refreshItems();
      }
    }, 150),
  );
}

// ---------------------------------------------------------------------------------------------
// Looking at a pile's items
// ---------------------------------------------------------------------------------------------

let lastOpened: { uuid: string; at: number } | undefined;

/** Opens a pile's item in Hero Workshop, read-only (a double-click also clicks, so once) */
function openInWorkshop(item: PileItem & { uuid: string }): void {
  const now = Date.now();
  if (lastOpened?.uuid === item.uuid && now - lastOpened.at < 800) return;
  lastOpened = { uuid: item.uuid, at: now };
  const api = game.modules.get(MODULE_ID)?.api as { openItemEditor?(item: unknown, options?: Record<string, unknown>): void } | undefined;
  api?.openItemEditor?.(item, { standalone: true, readOnly: true });
}

const hasHdc = (item: PileItem) => typeof item.system._hdcXml === 'string' && !!item.system._hdcXml.trim();

/** Clicking a pile's item: Hero Workshop, if items open there (its setting), else hero6e's sheet */
function previewItem(item: unknown): unknown {
  if (!isItemDocument(item) || !hasHdc(item)) return item;
  let inWorkshop = true;
  try {
    inWorkshop = game.settings.get(MODULE_ID, 'openItemsInWorkshop') !== false;
  } catch {
    // Setting not registered: Hero Workshop
  }
  if (!inWorkshop) return item;
  openInWorkshop(item as PileItem & { uuid: string });
  return false;
}

interface PileWindow {
  id?: string;
  actor?: PileActor;
  recipient?: unknown;
}

/** The open pile or vault window an element is in */
function windowOf(element: HTMLElement): PileWindow | undefined {
  const id = element.closest<HTMLElement>('[id^="item-pile-inventory-"], [id^="item-pile-vault-"]')?.id;
  if (!id) return undefined;
  return (Object.values((ui as unknown as { windows: Record<string, unknown> }).windows) as PileWindow[]).find((app) => app.id === id);
}

/**
 * The name of the item an element of a pile window shows: a vault square's tooltip, or the name
 * in a list row (the nearest enclosing element holding just one)
 */
function itemNameAt(element: HTMLElement): string | undefined {
  // A vault square, or the hover box around it (which takes its clicks)
  const square =
    element.closest<HTMLElement>('.grid-item[data-fast-tooltip]') ??
    element.closest<HTMLElement>('.item-piles-grid-item-hover')?.querySelector<HTMLElement>('.grid-item[data-fast-tooltip]');
  if (square) return square.dataset.fastTooltip;
  for (let el: HTMLElement | null = element; el && !el.id?.startsWith('item-pile-'); el = el.parentElement) {
    const names = el.querySelectorAll('.item-piles-name');
    if (names.length === 1) return names[0]!.textContent?.trim();
    if (names.length > 1) return undefined;
  }
  return undefined;
}

/**
 * Double-clicking a pile's item opens it in Hero Workshop. (Item Piles' list does nothing on a
 * double-click. Its vault takes the item when there's a character to take it, and otherwise,
 * the GM looking in, does nothing; then Hero Workshop opens.) Item Piles' windows don't say
 * which item a row is, so it's found by the name shown.
 */
function listenForDoubleClicks(): void {
  document.addEventListener('dblclick', (event) => {
    const target = event.target as HTMLElement | null;
    const app = target && windowOf(target);
    if (!target || !app?.actor) return;
    if (app.id?.startsWith('item-pile-vault-') && app.recipient) return;
    const name = itemNameAt(target);
    const item = name ? app.actor.items.contents.find((i) => i.name === name && !isPart(i) && hasHdc(i)) : undefined;
    if (item) openInWorkshop(item as PileItem & { uuid: string });
  });
}

interface ContextMenuItem {
  icon: string;
  label: string;
  onPress(): void;
}

/** A vault item's right-click menu: Hero Workshop, and hero6e's sheet for its owners */
function addMenuEntries(item: unknown, menu: ContextMenuItem[]): void {
  if (!isItemDocument(item) || !hasHdc(item)) return;
  menu.push({ icon: 'fa-solid fa-user-pen', label: 'Hero Workshop', onPress: () => openInWorkshop(item as PileItem & { uuid: string }) });
  const sheet = (item as unknown as { isOwner?: boolean; sheet?: { render(force: boolean): unknown } });
  if (sheet.isOwner && sheet.sheet) menu.push({ icon: 'fa-solid fa-file-lines', label: 'hero6e sheet', onPress: () => void sheet.sheet!.render(true) });
}

const marking = new Map<string, ReturnType<typeof setTimeout>>();

/** Flags an actor's parts once its items have settled (an upload creates many at once) */
export function queuePartMarking(actor: FoundryActor | null | undefined): void {
  if (!actor || !itemPilesActive()) return;
  const key = (actor as { uuid?: string }).uuid ?? actor.id;
  clearTimeout(marking.get(key));
  marking.set(
    key,
    setTimeout(() => {
      marking.delete(key);
      // hero6e is still setting the actor up: try again when it's done
      if (actor.getFlag('hero6efoundryvttv2', 'uploading')) return queuePartMarking(actor);
      markParts(actor as unknown as PileActor).catch((e: unknown) => console.error(`${MODULE_ID} | flagging parts on ${actor.name}`, e));
    }, 500),
  );
}

/** Flags the parts on every actor, world and token (the GM, once Item Piles is ready) */
async function markAllParts(): Promise<void> {
  const actors = new Set<FoundryActor>(game.actors.contents);
  for (const scene of (game as unknown as { scenes: { contents: { tokens: { contents: { actorLink: boolean; actor: FoundryActor | null }[] } }[] } }).scenes.contents) {
    for (const token of scene.tokens.contents) if (!token.actorLink && token.actor) actors.add(token.actor);
  }
  for (const actor of actors) {
    try {
      await markParts(actor as unknown as PileActor);
    } catch (e) {
      console.error(`${MODULE_ID} | flagging parts on ${actor.name}`, e);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Moving items
// ---------------------------------------------------------------------------------------------

/** Lists, compounds and what's in them never stack with look-alikes (their contents would be lost) */
function transformItem(itemData: ItemData): ItemData {
  const system = itemData.system;
  if (!system || isCurrencyItem(itemData)) return itemData;
  if (CONTAINERS.has(String(system.XMLID ?? '')) || system.PARENTID) {
    itemData.flags ??= {};
    itemData.flags[MODULE_ID] = { ...itemData.flags[MODULE_ID], [UNIQUE_FLAG]: String(system.ID ?? '') };
  }
  // A world or compendium list or framework comes alone: note where its members are
  const xmlId = String(system.XMLID ?? '');
  const from = CONTAINERS.has(xmlId) && xmlId !== 'COMPOUNDPOWER' && itemData._id ? sidebarItemUuid(itemData._id) : undefined;
  if (from) itemData.flags![MODULE_ID] = { ...itemData.flags![MODULE_ID], [FROM_FLAG]: from };
  return itemData;
}

/** The UUID of a world or compendium item, by document id */
function sidebarItemUuid(id: string): string | undefined {
  const world = game.items.get(id);
  if (world) return world.uuid;
  for (const pack of game.packs.contents) {
    const index = (pack as unknown as { documentName?: string; collection: string; index: { has(id: string): boolean } });
    if (index.documentName === 'Item' && index.index.has(id)) return `Compendium.${index.collection}.Item.${id}`;
  }
  return undefined;
}

/**
 * A list or framework that arrived alone (from the sidebar or a compendium): its members, from
 * its folder there, follow it onto the actor
 */
export async function bringMembers(item: PileItem & { parent?: PileActor | null; unsetFlag?(scope: string, key: string): Promise<unknown> }): Promise<void> {
  const from = item.getFlag(MODULE_ID, FROM_FLAG);
  const actor = item.parent;
  if (typeof from !== 'string' || !actor) return;
  await item.unsetFlag?.(MODULE_ID, FROM_FLAG);
  if (actor.items.contents.some((i) => i.parentItem?.id === item.id)) return;
  const source = (await fromUuid(from)) as FoundryItem | null;
  if (!source) return;
  const members = (await itemFamily(source)).slice(1) as unknown as PileItem[];
  if (!members.length) return;
  const sourceId = String(source.system.ID ?? '');
  const map: Record<string, { item: ItemData; items: ItemData[] }> = {};
  for (const member of members) {
    const data = member.toObject() as ItemData & { folder?: unknown; sort?: unknown };
    delete data._id;
    delete data.folder;
    delete data.sort;
    data.system ??= {};
    // Its list or framework may have been given a new HDC ID on arrival
    if (String(data.system.PARENTID ?? '') === sourceId) data.system.PARENTID = item.system.ID;
    if (WHOLES.has(String(item.system.XMLID ?? '')) && data.system.PARENTID === item.system.ID) {
      data.flags ??= {};
      data.flags[MODULE_ID] = { ...data.flags[MODULE_ID], [PART_FLAG]: true };
    }
    map[member.id] = { item: data, items: [] };
  }
  fitItems({ actor, map });
  const target = actor as unknown as { createEmbeddedDocuments(type: string, data: unknown[]): Promise<unknown> };
  await target.createEmbeddedDocuments('Item', Object.values(map).map((e) => e.item));
}

/**
 * A list's or framework's folder dropped on a vault, which only takes items: the list or
 * framework itself is dropped instead (its members follow). Item Piles' list view takes folders.
 */
export function listenForFolderDrops(): void {
  document.addEventListener(
    'drop',
    (event) => {
      const vault = (event.target as HTMLElement | null)?.closest?.<HTMLElement>('[id^="item-pile-vault-"]');
      if (!vault || !game.user.isGM) return;
      let data: { type?: string; uuid?: string };
      try {
        data = JSON.parse(event.dataTransfer?.getData('text/plain') ?? '');
      } catch {
        return;
      }
      if (data.type !== 'Folder' || !data.uuid) return;
      const folder = fromUuidSync(data.uuid) as { contents?: { uuid?: string; system?: Record<string, unknown> }[] } | null;
      const contents = folder?.contents ?? [];
      const ids = new Set(contents.map((i) => String(i.system?.ID ?? '')));
      // The folder's list or framework: the item nothing else in the folder contains
      const head = contents.find((i) => CONTAINERS.has(String(i.system?.XMLID ?? '')) && !ids.has(String(i.system?.PARENTID ?? '')));
      if (!head?.uuid) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const app = (Object.values((ui as unknown as { windows: Record<string, unknown> }).windows) as {
        id?: string;
        svelte?: { applicationShell?: { store?: { onDrop(data: Record<string, unknown>): Promise<unknown> } } };
      }[]).find((w) => w.id === vault.id);
      void app?.svelte?.applicationShell?.store?.onDrop({ type: 'Item', uuid: head.uuid });
    },
    true,
  );
}

/** An item's contents travel with it (and a dropped compound's parts with the compound) */
function transferContents({ item, items, raw = false }: { item: PileItem; items: unknown[]; raw?: boolean }): unknown[] {
  for (const child of descendants(item)) {
    if (raw) {
      items.push(child);
      continue;
    }
    // Flagged on the way, so the receiving window never lists it
    const data = child.toObject();
    if (isPart(child)) {
      data.flags ??= {};
      data.flags[MODULE_ID] = { ...data.flags[MODULE_ID], [PART_FLAG]: true };
    }
    items.push(data);
  }
  return items;
}

/**
 * Items about to be created on an actor: their PARENTIDs and HDC IDs made to fit it. An HDC ID
 * the actor already uses gets a new one (and so do its contents' links to it); an item whose
 * list or compound isn't arriving with it, and isn't on the actor, comes out of it.
 */
function fitItems({ actor, map }: { actor: PileActor; map: Record<string, { item: ItemData; items: ItemData[] }> }): void {
  const incoming = Object.values(map).flatMap((entry) => [entry.item, ...entry.items]);
  const onActor = new Set(actor.items.contents.map((i) => String(i.system.ID ?? '')));
  let next = Math.max(Date.now(), ...[...onActor].map(Number).filter(Number.isSafeInteger)) + 1;
  const renumbered = new Map<string, number>();
  for (const data of incoming) {
    const id = String(data.system?.ID ?? '');
    if (!data.system || !id || !onActor.has(id)) continue;
    renumbered.set(id, next);
    data.system.ID = next++;
  }
  const arriving = new Set(incoming.map((d) => String(d.system?.ID ?? '')));
  for (const data of incoming) {
    const parent = data.system?.PARENTID;
    if (!data.system || parent === undefined || parent === null || parent === '') continue;
    const renamed = renumbered.get(String(parent));
    if (renamed !== undefined && incoming.some((d) => d.system?.ID === renamed)) data.system.PARENTID = renamed;
    else if (!arriving.has(String(parent)) && !onActor.has(String(parent))) {
      delete data.system.PARENTID;
      // hero6e's copy of the element says where it was too
      if (typeof data.system._hdcXml === 'string') data.system._hdcXml = data.system._hdcXml.replace(/\sPARENTID="[^"]*"/, '');
    }
  }
}

/**
 * Some of a stack leaving (two of six nets): the compound stays, so its parts stay with it, and
 * copies go with the ones leaving. Item Piles would move the parts off it.
 */
function keepPartsOfStaysBehind(actor: PileActor, itemsToUpdate: { _id?: string }[], itemsToDelete: string[]): void {
  const staying = new Set(itemsToUpdate.map((u) => u._id));
  if (!staying.size) return;
  for (const id of [...itemsToDelete]) {
    let ancestor = actor.items.get(id)?.parentItem;
    for (; ancestor; ancestor = ancestor.parentItem) if (staying.has(ancestor.id)) break;
    if (ancestor) itemsToDelete.splice(itemsToDelete.indexOf(id), 1);
  }
}

/**
 * A compound joining a stack of the same (a second net on a pile of them): the stack grows, but
 * its parts are one set for the whole stack, so their counts stay as they are
 */
function keepPartCounts(target: PileActor, itemsToUpdate: { _id?: string }[] | undefined): void {
  if (!itemsToUpdate) return;
  for (const update of [...itemsToUpdate]) {
    const item = update._id ? target.items.get(update._id) : undefined;
    if (item && isPart(item)) itemsToUpdate.splice(itemsToUpdate.indexOf(update), 1);
  }
}

/**
 * Item Piles hands the receiver every currency, none of some: no "0 Platinum pieces" items
 * (an actor without a coin has none of it)
 */
function skipEmptyCoins(itemsToCreate: ItemData[] | undefined): void {
  if (!itemsToCreate) return;
  for (const data of [...itemsToCreate]) {
    if (isCurrencyItem(data) && !Number(data.system?.QUANTITY)) itemsToCreate.splice(itemsToCreate.indexOf(data), 1);
  }
}

// ---------------------------------------------------------------------------------------------
// Currencies
// ---------------------------------------------------------------------------------------------

/** The world's currencies, as Item Piles currencies */
async function pileCurrencies(): Promise<Record<string, unknown>[]> {
  const currencies = getCurrencies();
  const primary = primaryCurrency(currencies);
  return Promise.all(
    currencies.map(async (currency) => ({
      type: 'item',
      name: currency.name,
      img: currency.img ?? '',
      // A symbol goes in front ($12), letters after (12 gp)
      abbreviation: /^[a-z]/i.test(currency.abbreviation) ? `{#} ${currency.abbreviation}` : `${currency.abbreviation}{#}`,
      primary: currency === primary,
      exchangeRate: primary ? currency.value / primary.value : 1,
      data: { item: await currencyItemData(currency) },
    })),
  );
}

/** What an item costs in the primary currency (hero6e prices in dollars) */
function itemCost(item: ItemData | PileItem): number {
  const system = (isItemDocument(item) ? item.toObject() : item).system ?? {};
  const price = Number(system.PRICE) || 0;
  const primary = primaryCurrency(getCurrencies());
  return primary ? price / primary.value : price;
}

/** Gives Item Piles the world's currencies again (the GM, after changing them) */
export async function updatePileCurrencies(): Promise<void> {
  const api = itemPiles()?.API;
  if (!api || !game.user.isGM) return;
  await api.setCurrencies(await pileCurrencies());
}

// ---------------------------------------------------------------------------------------------

export function registerItemPiles(): void {
  Hooks.once('item-piles-ready', async () => {
    const piles = itemPiles();
    if (!piles) return;
    const METHODS = piles.CONSTANTS.ITEM_TYPE_METHODS;
    const currencies = await pileCurrencies().catch((e: unknown) => {
      console.error(`${MODULE_ID} | building Item Piles currencies`, e);
      return [];
    });
    await piles.API.addSystemIntegration({
      // Raising this makes Item Piles replace the settings a GM may have changed with these
      VERSION: '1.0.0',
      ACTOR_CLASS_TYPE: 'npc',
      ITEM_CLASS_LOOT_TYPE: 'equipment',
      ITEM_CLASS_WEAPON_TYPE: 'equipment',
      ITEM_CLASS_EQUIPMENT_TYPE: 'equipment',
      ITEM_QUANTITY_ATTRIBUTE: 'system.QUANTITY',
      ITEM_PRICE_ATTRIBUTE: 'system.PRICE',
      ITEM_FILTERS: [
        { path: 'type', filters: NOT_LOOT },
        { path: `flags.${MODULE_ID}.${PART_FLAG}`, filters: 'true' },
      ],
      ITEM_SIMILARITIES: ['name', 'type', 'system.XMLID', `flags.${MODULE_ID}.${UNIQUE_FLAG}`],
      ITEM_TRANSFORMER: transformItem,
      PREVIEW_ITEM_TRANSFORMER: previewItem,
      ITEM_COST_TRANSFORMER: itemCost,
      CURRENCIES: currencies,
      CURRENCY_DECIMAL_DIGITS: 0.01,
      ITEM_TYPE_HANDLERS: {
        GLOBAL: {
          // A list's contents show under it (hero6e links them by HDC ID; Item Piles by document id)
          [METHODS.IS_CONTAINED!]: ({ item }: { item: unknown }) => (isItemDocument(item) ? (item.parentItem?.id ?? '') : ''),
          [METHODS.IS_CONTAINED_PATH!]: 'system.PARENTID',
          [METHODS.CONTAINER_TRANSFORMER!]: fitItems,
        },
        equipment: {
          [METHODS.TRANSFER!]: transferContents,
        },
      },
    });

    Hooks.on('item-piles-preRightClickItem', addMenuEntries as (...args: never[]) => unknown);
    type ItemUpdates = { itemsToUpdate: { _id?: string }[]; itemsToDelete: string[] };
    Hooks.on('item-piles-preTransferItems', ((source: PileActor, sourceUpdates: ItemUpdates, target: PileActor, targetUpdates: ItemUpdates) => {
      keepPartsOfStaysBehind(source, sourceUpdates.itemsToUpdate, sourceUpdates.itemsToDelete);
      keepPartCounts(target, targetUpdates?.itemsToUpdate);
    }) as (...args: never[]) => unknown);
    Hooks.on('item-piles-preRemoveItems', ((actor: PileActor, itemsToUpdate: { _id?: string }[], itemsToDelete: string[]) => {
      keepPartsOfStaysBehind(actor, itemsToUpdate, itemsToDelete);
    }) as (...args: never[]) => unknown);
    type Updates = { itemsToCreate?: ItemData[] };
    for (const hook of ['item-piles-preTransferCurrencies', 'item-piles-preTransferAllCurrencies']) {
      Hooks.on(hook, ((_source: unknown, sourceUpdates: Updates, _target: unknown, targetUpdates: Updates) => {
        skipEmptyCoins(sourceUpdates?.itemsToCreate);
        skipEmptyCoins(targetUpdates?.itemsToCreate);
      }) as (...args: never[]) => unknown);
    }
    Hooks.on('item-piles-preAddCurrencies', ((_target: unknown, _actorUpdates: unknown, itemsToCreate: ItemData[]) => {
      skipEmptyCoins(itemsToCreate);
    }) as (...args: never[]) => unknown);

    listenForFolderDrops();
    listenForDoubleClicks();
    if (game.user.isGM) await markAllParts();
  });
}
