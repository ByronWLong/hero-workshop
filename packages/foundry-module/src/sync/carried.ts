/**
 * Carrying and putting down equipment on hero6e's sheet. hero6e goes by each item's own
 * Carried, so putting down a list ("Saddlebags") left what's in it carried. Here a list's
 * Carried goes to its contents, and the change goes into the actor's stored HDC, so the
 * editor doesn't report it as a change made in Foundry.
 */

import { HdcDocument } from '@hero-workshop/shared';
import { runQueued } from './actorItems';

/** Marks the updates made here, so they aren't handled again */
export const CARRIED_CASCADE = 'heroWorkshopCarried';

interface HeroItem extends FoundryItem {
  isList?: boolean;
  childItems?: HeroItem[];
}

/** What's in a list: its members, and the members of lists in it */
function contents(list: HeroItem): HeroItem[] {
  const found: HeroItem[] = [];
  for (const child of list.childItems ?? []) {
    found.push(child);
    if (child.isList) found.push(...contents(child));
  }
  return found;
}

/** Handles an equipment item's Carried changing on an actor (call from updateItem) */
export function carriedChanged(item: FoundryItem, changes: Record<string, unknown>, options: Record<string, unknown> | undefined): void {
  const carried = (changes.system as { CARRIED?: unknown } | undefined)?.CARRIED;
  const actor = item.actor;
  if (carried === undefined || item.type !== 'equipment' || !actor || options?.[CARRIED_CASCADE]) return;
  const hero = item as HeroItem;
  const inside = hero.isList ? contents(hero) : [];
  const changed = inside.filter((i) => !!i.system.CARRIED !== !!carried);
  void runQueued(actor.id, async () => {
    if (changed.length) {
      await actor.updateEmbeddedDocuments(
        'Item',
        changed.map((i) => ({ _id: i.id, 'system.CARRIED': !!carried })),
        { [CARRIED_CASCADE]: true },
      );
    }
    const xml = actor.system._hdcXml;
    if (!xml) return;
    const doc = HdcDocument.parse(xml);
    let edited = false;
    for (const each of [item, ...inside]) {
      const el = doc.findById(String(each.system.ID ?? ''));
      const value = carried ? 'Yes' : 'No';
      if (el && el.getAttr('CARRIED') !== value) {
        el.setAttr('CARRIED', value);
        edited = true;
      }
    }
    if (edited) await actor.update({ 'system._hdcXml': doc.toString() });
  }).catch((e: unknown) => console.error('hero-workshop | carrying', e));
}
