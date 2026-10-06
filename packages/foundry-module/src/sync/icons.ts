/**
 * Custom item icons. Foundry keeps an item's icon in `img`; Hero Workshop records custom ones
 * in the item's HDC element (FOUNDRY_ICON) so they travel with the item: through the editor,
 * world items, drags and downloaded HDC files. hero6e's import doesn't know the attribute, so
 * icons are put back on the Foundry items after each import.
 */

import { HdcDocument, ICON_ATTR, parseXml } from '@hero-workshop/shared';

/** Placeholder for items without an icon of their own (e.g. ones not yet in Foundry) */
export const DEFAULT_ICON = 'icons/svg/item-bag.svg';

/** hero6e's defaults come from core's icons/svg and the system's own folder; anything else was chosen */
export function isCustomIcon(img: unknown): img is string {
  return typeof img === 'string' && img !== '' && !img.startsWith('icons/svg/') && !img.startsWith('systems/');
}

/** The icon recorded on an item's XML fragment */
export function iconOfFragment(xml: unknown): string | undefined {
  if (typeof xml !== 'string' || !xml.trim()) return undefined;
  try {
    return parseXml(xml.trim()).root.getAttr(ICON_ATTR) || undefined;
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
    const icon = doc.findById(String(id))?.getAttr(ICON_ATTR);
    if (icon && item.img !== icon) updates.push({ _id: item.id, img: icon });
  }
  if (updates.length) await target.updateEmbeddedDocuments('Item', updates);
}
