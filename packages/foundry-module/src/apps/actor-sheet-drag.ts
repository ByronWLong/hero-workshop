/**
 * Dragging items off hero6e's actor sheets, so a player can open a Bestiary creature in a
 * compendium and drag its powers onto their own character.
 *
 * - hero6e only lets an actor's owners start a drag. Dragging only copies an item, so (as in
 *   core Foundry) anyone who can see the sheet's items may start one; dropping still needs
 *   ownership of the actor it's dropped on.
 * - hero6e sets the drag data after an `await`, when the event's `currentTarget` is gone (and
 *   with `fromUuidSync`, which can't read a compendium actor's items), so no data is set. The
 *   row's `data-document-uuid` is enough for a drop, so it's set straight away.
 * - hero6e's rows for lists, frameworks and compounds can't be dragged, and its drop handling
 *   can't copy one from another actor (it looks for the members in the item's folder). Their
 *   rows are made draggable, and Hero Workshop copies them with their members or parts.
 */

import { MODULE_ID } from '../sync/session';
import { copyFamilyToActor } from '../sync/worldItems';

interface ObservableActor {
  testUserPermission(user: unknown, permission: string): boolean;
}

interface FamilyItem extends FoundryItem {
  uuid: string;
  childItems?: unknown[];
}

type Sheet = { actor?: ObservableActor & FoundryActor };
type CanDragStart = (this: Sheet, selector?: string) => boolean;
type OnDragStart = (this: Sheet, event: DragEvent) => unknown;
type OnDropItem = (this: Sheet, event: DragEvent, data: { uuid?: string }) => unknown;

interface SheetPrototype {
  _canDragStart?: CanDragStart;
  _onDragStart?: OnDragStart;
  _onDropItem?: OnDropItem;
  [CAN_PATCHED]?: boolean;
  [START_PATCHED]?: boolean;
  [DROP_PATCHED]?: boolean;
}

const CAN_PATCHED = Symbol(`${MODULE_ID}.canDragStart`);
const START_PATCHED = Symbol(`${MODULE_ID}.onDragStart`);
const DROP_PATCHED = Symbol(`${MODULE_ID}.onDropItem`);

/** The prototype in a sheet's chain that defines a method (the most derived one) */
function owner(proto: object | null, method: string): SheetPrototype | undefined {
  for (; proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
    if (Object.prototype.hasOwnProperty.call(proto, method)) return proto as SheetPrototype;
  }
  return undefined;
}

/** Drag data for a sheet row, from its document UUID */
function dragDataFor(event: DragEvent): { type: string; uuid: string } | undefined {
  const row = (event.currentTarget as HTMLElement | null)?.closest<HTMLElement>('[data-document-uuid]');
  const uuid = row?.dataset.documentUuid;
  if (!uuid) return undefined;
  const parsed = (foundry.utils as unknown as { parseUuid(uuid: string): { type?: string } | null }).parseUuid(uuid);
  return parsed?.type ? { type: parsed.type, uuid } : undefined;
}

/** An item from another actor that has members or parts (hero6e can't copy those) */
async function familyFromOtherActor(uuid: string | undefined, actor: FoundryActor | undefined): Promise<FamilyItem | undefined> {
  if (!uuid || !actor) return undefined;
  const item = (await fromUuid(uuid)) as FamilyItem | null;
  const source = item?.actor as (FoundryActor & { uuid?: string }) | null | undefined;
  if (!item || !source || source.uuid === (actor as { uuid?: string }).uuid) return undefined;
  return item.childItems?.length ? item : undefined;
}

/** Copies a list, framework or compound onto the actor, with its members or parts */
async function copyFamily(item: FamilyItem, actor: FoundryActor): Promise<void> {
  try {
    await copyFamilyToActor(item, actor as unknown as Parameters<typeof copyFamilyToActor>[1]);
    ui.notifications.info(game.i18n.format('HERO_WORKSHOP.CopiedToActor', { name: item.name, actor: actor.name }));
  } catch (e) {
    console.error(e);
    ui.notifications.error(`Hero Workshop could not copy ${item.name}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Makes a sheet's list, framework and compound rows draggable (call on render; hero6e marks
 * only single items).
 */
export function makeFamilyRowsDraggable(sheet: { actor?: FoundryActor; element?: HTMLElement; _dragDrop?: { bind(html: HTMLElement): unknown } }): void {
  const html = sheet.element;
  const actor = sheet.actor as (FoundryActor & { items: { get(id: string): FamilyItem | undefined } }) | undefined;
  if (!html || !actor || !sheet._dragDrop) return;
  let changed = false;
  for (const row of html.querySelectorAll<HTMLElement>('[data-document-uuid]:not(.draggable)')) {
    const uuid = row.dataset.documentUuid ?? '';
    if (!uuid.includes('.Item.')) continue;
    if (!actor.items.get(uuid.split('.').pop()!)?.childItems?.length) continue;
    row.classList.add('draggable');
    changed = true;
  }
  if (changed) sheet._dragDrop.bind(html);
}

/** Wraps the registered actor sheets' drag and drop (call once the sheet classes exist) */
export function wrapActorSheetDrag(): void {
  const config = CONFIG as unknown as {
    Actor?: { sheetClasses?: Record<string, Record<string, { cls?: { prototype: object } }>> };
  };
  const classes = Object.values(config.Actor?.sheetClasses ?? {}).flatMap((byId) => Object.values(byId).map((s) => s.cls));
  for (const cls of classes) {
    const canProto = owner(cls?.prototype ?? null, '_canDragStart');
    if (canProto?._canDragStart && !canProto[CAN_PATCHED]) {
      const canDragStart = canProto._canDragStart;
      canProto._canDragStart = function (this: Sheet, selector?: string) {
        return canDragStart.call(this, selector) || !!this.actor?.testUserPermission(game.user, 'OBSERVER');
      };
      canProto[CAN_PATCHED] = true;
    }
    const startProto = owner(cls?.prototype ?? null, '_onDragStart');
    if (startProto?._onDragStart && !startProto[START_PATCHED]) {
      const onDragStart = startProto._onDragStart;
      startProto._onDragStart = function (this: Sheet, event: DragEvent) {
        const data = event.dataTransfer ? dragDataFor(event) : undefined;
        if (!data) return onDragStart.call(this, event);
        // Core's and hero6e's drag handlers can both fire for one row
        if (!event.dataTransfer!.getData('text/plain')) event.dataTransfer!.setData('text/plain', JSON.stringify(data));
      };
      startProto[START_PATCHED] = true;
    }
    const dropProto = owner(cls?.prototype ?? null, '_onDropItem');
    if (dropProto?._onDropItem && !dropProto[DROP_PATCHED]) {
      const onDropItem = dropProto._onDropItem;
      dropProto._onDropItem = async function (this: Sheet, event: DragEvent, data: { uuid?: string }) {
        // Only an item on another actor needs a look (hero6e's handler stays synchronous otherwise)
        const uuid = data?.uuid ?? '';
        const at = uuid.lastIndexOf('.Item.');
        const actorUuid = (this.actor as { uuid?: string } | undefined)?.uuid;
        if (at < 0 || !this.actor || uuid.slice(0, at) === actorUuid) return onDropItem.call(this, event, data);
        const family = await familyFromOtherActor(uuid, this.actor);
        if (!family) return onDropItem.call(this, event, data);
        event.preventDefault?.();
        await copyFamily(family, this.actor);
      };
      dropProto[DROP_PATCHED] = true;
    }
  }
}
