/**
 * Custom item icons. Foundry keeps an item's icon in `img`; Hero Workshop records custom ones
 * in the item's HDC element (FOUNDRY_ICON) so they travel with the item: through the editor,
 * world items, drags and downloaded HDC files. hero6e's import doesn't know the attribute, so
 * icons are put back on the Foundry items after each import.
 */

import { HdcDocument, getIcon, parseXml, type XmlElement } from '@hero-workshop/shared';

/** Placeholder for items without an icon of their own (e.g. ones not yet in Foundry) */
export const DEFAULT_ICON = 'icons/svg/item-bag.svg';

/** hero6e's defaults come from core's icons/svg and the system's own folder; anything else was chosen */
export function isCustomIcon(img: unknown): img is string {
  return typeof img === 'string' && img !== '' && !img.startsWith('icons/svg/') && !img.startsWith('systems/');
}

/**
 * The icon an item's element records, or for a compound's part without one, the compound's
 * (in a world or compendium item the parts aren't items of their own, so they show it)
 */
export function iconOfElement(el: XmlElement): string | undefined {
  return getIcon(el) ?? (el.parent?.hasAttr('XMLID') ? getIcon(el.parent) : undefined);
}

/** The icon recorded on an item's XML fragment */
export function iconOfFragment(xml: unknown): string | undefined {
  if (typeof xml !== 'string' || !xml.trim()) return undefined;
  try {
    return getIcon(parseXml(xml.trim()).root);
  } catch {
    return undefined;
  }
}

interface ActorWithItemUpdates {
  system: { _hdcXml?: string };
  items: { contents: FoundryItem[] };
  updateEmbeddedDocuments(type: string, updates: Record<string, unknown>[]): Promise<unknown>;
}

/** Gives an actor's items the icons its HDC records */
export async function applyIcons(actor: FoundryActor): Promise<void> {
  const target = actor as unknown as ActorWithItemUpdates;
  const xml = target.system._hdcXml;
  if (!xml) return;
  const doc = HdcDocument.parse(xml);
  const updates: Record<string, unknown>[] = [];
  for (const item of target.items.contents) {
    const id = item.system.ID;
    if (id === undefined || id === null || id === '') continue;
    const found = doc.findById(String(id));
    const icon = found ? iconOfElement(found) : undefined;
    if (icon && item.img !== icon) updates.push({ _id: item.id, img: icon });
  }
  if (updates.length) await target.updateEmbeddedDocuments('Item', updates);
}
