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
import { currencyItemData, getCurrencies, isCurrencyItem } from './currencies';

const ITEM_PILES = 'item-piles';
/** Flag on a compound's part or a framework's slot */
const PART_FLAG = 'part';
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
  if (updates.length) await actor.updateEmbeddedDocuments('Item', updates);
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
  return itemData;
}

/** An item's contents travel with it (and a dropped compound's parts with the compound) */
function transferContents({ item, items, raw = false }: { item: PileItem; items: unknown[]; raw?: boolean }): unknown[] {
  for (const child of descendants(item)) items.push(raw ? child : child.toObject());
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

    Hooks.on('item-piles-preTransferItems', ((source: PileActor, sourceUpdates: { itemsToUpdate: { _id?: string }[]; itemsToDelete: string[] }) => {
      keepPartsOfStaysBehind(source, sourceUpdates.itemsToUpdate, sourceUpdates.itemsToDelete);
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

    if (game.user.isGM) await markAllParts();
  });
}
