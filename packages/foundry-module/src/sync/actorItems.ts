/**
 * Items added to an actor in Foundry (dropped on its sheet from the Items sidebar, a
 * compendium or another actor) are written into the actor's stored HDC straight away, so
 * the editor doesn't later report them as changes made in Foundry.
 *
 * Creations are collected per actor for a moment, because one drop creates several items
 * (a list and its members, a compound and its parts). Compounds that arrive without their
 * parts get them first (see expandCompound), then everything is written in one update.
 */

import { HdcDocument, ICON_ATTR, parseXml } from '@hero-workshop/shared';
import { applyDrift } from './drift';
import { isCustomIcon } from './icons';
import { MODULE_ID, createActorSession } from './session';
import { expandCompound } from './worldItems';

const pending = new Map<string, { actor: FoundryActor; items: FoundryItem[]; timer: ReturnType<typeof setTimeout> }>();
/** Writes run one at a time per actor, each on the HDC the previous one saved */
const writing = new Map<string, Promise<void>>();

/** Queues an item just created on an actor for writing into the actor's HDC */
export function queueCreatedItem(item: FoundryItem): void {
  const actor = item.actor;
  if (!actor?.system._hdcXml) return;
  const entry = pending.get(actor.id);
  if (entry) {
    clearTimeout(entry.timer);
    entry.items.push(item);
    entry.timer = setTimeout(() => schedule(actor.id), 100);
  } else {
    pending.set(actor.id, { actor, items: [item], timer: setTimeout(() => schedule(actor.id), 100) });
  }
}

function schedule(actorId: string): void {
  enqueue(actorId, () => flush(actorId));
}

/** Runs a write after any earlier writes for the same actor */
function enqueue(actorId: string, work: () => Promise<void>): void {
  const previous = writing.get(actorId) ?? Promise.resolve();
  const next = previous.then(work).catch((e: unknown) => console.error(`${MODULE_ID} | updating HDC`, e));
  writing.set(actorId, next);
  void next.finally(() => {
    if (writing.get(actorId) === next) writing.delete(actorId);
  });
}

async function flush(actorId: string): Promise<void> {
  const entry = pending.get(actorId);
  pending.delete(actorId);
  if (!entry) return;
  const { actor, items } = entry;
  try {
    const ids = new Set(items.map((i) => i.id));
    for (const item of items) {
      if (item.system.XMLID !== 'COMPOUNDPOWER') continue;
      const hasParts = actor.items.contents.some((i) => i.system.PARENTID === item.system.ID);
      if (!hasParts) for (const part of await expandCompound(item)) ids.add(part.id);
    }
    await writeAddedItems(actor, ids);
  } catch (e) {
    console.error(`${MODULE_ID} | writing new items into ${actor.name}'s HDC`, e);
  }
}

/** Writes the given (Foundry-created) items into the actor's stored HDC */
async function writeAddedItems(actor: FoundryActor, itemIds: Set<string>): Promise<void> {
  const xml = actor.system._hdcXml;
  if (!xml) return;
  const doc = HdcDocument.parse(xml);
  const session = createActorSession(actor);
  // The same insertion the editor's "Changes made in Foundry" review would apply
  const added = session
    .detectDrift(doc)
    .filter((c) => c.kind === 'added' && itemIds.has(c.key.replace(/^added:/, '')) && c.recommended);
  if (!added.length) return;
  applyDrift(doc, added);
  // Then whatever hero6e filled in on creation that the item's XML lacks (e.g. a Combat
  // Skill Level's attack list), so the new items match Foundry exactly
  const hdcIds = actor.items.contents.filter((i) => itemIds.has(i.id)).map((i) => `item:${String(i.system.ID)}:`);
  const filledIn = session.detectDrift(doc).filter((c) => c.recommended && hdcIds.some((prefix) => c.key.startsWith(prefix)));
  applyDrift(doc, filledIn);
  await actor.update({ 'system._hdcXml': doc.toString() });

  // Record them as synced, so a later deletion in Foundry is recognised as one
  const synced = new Set((actor.getFlag(MODULE_ID, 'syncedIds') as string[] | undefined) ?? []);
  const names: Record<string, string> = {};
  for (const item of actor.items.contents) {
    if (!itemIds.has(item.id) || !item.system.ID) continue;
    synced.add(String(item.system.ID));
    names[String(item.system.ID)] = item.name;
  }
  await actor.setFlag(MODULE_ID, 'syncedIds', [...synced]);
  await actor.setFlag(MODULE_ID, 'syncedNames', names);
}

/**
 * Records an icon changed on an item's Foundry sheet in its Hero Designer data: the actor's
 * HDC for an owned item, the item's own XML for a world item. A default icon clears it.
 */
export function recordIconChange(item: FoundryItem): void {
  const icon = isCustomIcon(item.img) ? item.img : undefined;
  const actor = item.actor;
  if (actor) {
    enqueue(actor.id, async () => {
      const xml = actor.system._hdcXml;
      const id = item.system.ID;
      if (!xml || id === undefined || id === null || id === '') return;
      const doc = HdcDocument.parse(xml);
      const el = doc.findById(String(id));
      if (!el || (el.getAttr(ICON_ATTR) ?? undefined) === icon) return;
      if (icon) el.setAttr(ICON_ATTR, icon);
      else el.removeAttr(ICON_ATTR);
      await actor.update({ 'system._hdcXml': doc.toString() });
    });
    return;
  }
  const fragment = item.system._hdcXml;
  if (typeof fragment !== 'string' || !fragment.trim()) return;
  const el = parseXml(fragment.trim()).root;
  if ((el.getAttr(ICON_ATTR) ?? undefined) === icon) return;
  if (icon) el.setAttr(ICON_ATTR, icon);
  else el.removeAttr(ICON_ATTR);
  void item.update({ 'system._hdcXml': el.toString() });
}
