/**
 * Moving an item from one actor to another (a character's pack to the party's wagon, loot
 * into a stash): the item is copied onto the other actor, as a drag copies it, then taken off
 * the first, from its Foundry items and its stored HDC alike.
 */

import { removeItems } from '@hero-workshop/shared';
import { MODULE_ID } from './session';
import { runQueued } from './actorItems';
import { copyFamilyToActor } from './worldItems';

interface MovableActor extends FoundryActor {
  uuid?: string;
  deleteEmbeddedDocuments(type: string, ids: string[], options?: Record<string, unknown>): Promise<unknown>;
  createEmbeddedDocuments(type: string, data: never[], options?: Record<string, unknown>): Promise<FoundryItem[]>;
}

/** Why an actor can't take part in a move, if it can't */
export function moveProblem(actor: FoundryActor): string | undefined {
  if (actor.pack) return `${actor.name} is in a compendium.`;
  if (actor.token) return `${actor.name} is an unlinked token's actor.`;
  if (!actor.isOwner) return `You don't own ${actor.name}.`;
  if (!actor.system._hdcXml) return `${actor.name} has no Hero Designer data.`;
  return undefined;
}

/** The Foundry item with this HDC ID on the actor */
const itemWithId = (actor: FoundryActor, hdcId: string) => actor.items.contents.find((i) => String(i.system.ID) === hdcId);

/**
 * Moves the item with the given HDC ID (and, for a list, what's in it) from one actor to
 * another. Returns its name.
 */
export async function moveItemToActor(source: FoundryActor, hdcId: string, target: FoundryActor): Promise<string> {
  if ((source as MovableActor).uuid === (target as MovableActor).uuid) throw new Error('it is already there.');
  const problem = moveProblem(source) ?? moveProblem(target);
  if (problem) throw new Error(problem);
  const item = itemWithId(source, hdcId);
  if (!item) throw new Error('it is not one of the actor\u2019s Foundry items.');
  const name = item.name;

  // Onto the target first, so a failure leaves the item where it was. The new items are
  // written into the target's HDC as any drop onto it is
  await copyFamilyToActor(item, target as unknown as Parameters<typeof copyFamilyToActor>[1]);

  // Then off the source: its stored HDC, and its Foundry items (a list's members and a
  // compound's parts are items of their own)
  await runQueued(source.id, async () => {
    const xml = source.system._hdcXml;
    const removed = xml ? removeItems(xml, hdcId) : undefined;
    const ids = new Set(removed?.removedIds ?? [hdcId]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const i of source.items.contents) {
        const parent = i.system.PARENTID;
        if (parent !== undefined && parent !== null && ids.has(String(parent)) && !ids.has(String(i.system.ID))) {
          ids.add(String(i.system.ID));
          grew = true;
        }
      }
    }
    if (removed) await source.update({ 'system._hdcXml': removed.xml });
    const synced = ((source.getFlag(MODULE_ID, 'syncedIds') as string[] | undefined) ?? []).filter((id) => !ids.has(id));
    await source.setFlag(MODULE_ID, 'syncedIds', synced);
    const doomed = source.items.contents.filter((i) => ids.has(String(i.system.ID))).map((i) => i.id);
    if (doomed.length) await (source as MovableActor).deleteEmbeddedDocuments('Item', doomed);
  });
  return name;
}
