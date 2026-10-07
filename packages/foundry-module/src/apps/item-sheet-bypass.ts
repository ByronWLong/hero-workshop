/**
 * World and compendium items open in Hero Workshop rather than hero6e's item sheet, which adds
 * little for an item that isn't on a character. Items on actors, items the user can't edit
 * (including ones in a locked compendium) and items without Hero Designer data still open
 * hero6e's sheet. "Open hero6e sheet" in the item context menu reaches it on demand, and a
 * client setting turns the behaviour off.
 */

import { MODULE_ID } from '../sync/session';
import { tabForItem } from '../sync/itemSession';
import { openItemEditor } from './index';

const SETTING = 'openItemsInWorkshop';

/** Items whose next render should show hero6e's own sheet */
const showSheet = new Set<string>();

export function registerItemSheetBypass(): void {
  game.settings.register(MODULE_ID, SETTING, {
    name: 'HERO_WORKSHOP.OpenItemsInWorkshop',
    hint: 'HERO_WORKSHOP.OpenItemsInWorkshopHint',
    scope: 'client',
    config: true,
    type: Boolean,
    default: true,
  });
}

/** Opens hero6e's sheet for an item, even where Hero Workshop would open instead */
export function openHeroSheet(item: FoundryItem): void {
  showSheet.add(item.uuid);
  void (item as unknown as { sheet: { render(force: boolean): unknown } }).sheet.render(true);
}

function opensInWorkshop(item: FoundryItem & { parent?: unknown }): boolean {
  if (item.parent || item.actor) return false;
  if (!item.isOwner || typeof item.system._hdcXml !== 'string' || !item.system._hdcXml.trim() || !tabForItem(item)) return false;
  const pack = item.pack ? game.packs.get(item.pack) : undefined;
  if (pack?.locked) return false;
  try {
    return game.settings.get(MODULE_ID, SETTING) !== false;
  } catch {
    return true;
  }
}

type Render = (this: { document?: unknown; rendered?: boolean }, ...args: unknown[]) => Promise<unknown>;

/** Wraps hero6e's item sheet (call once the sheet classes exist) */
export function wrapItemSheets(): void {
  const sheetClass = (foundry.applications as unknown as { sheets?: { ItemSheetV2?: { prototype: { render: Render } } } }).sheets
    ?.ItemSheetV2;
  const proto = sheetClass?.prototype;
  if (!proto) {
    console.warn(`${MODULE_ID} | ItemSheetV2 wasn't found; items open in hero6e's sheet.`);
    return;
  }
  const render = proto.render;
  proto.render = function (this: { document?: unknown; rendered?: boolean }, ...args: unknown[]) {
    const item = this.document as (FoundryItem & { parent?: unknown }) | undefined;
    if (item && !this.rendered && item instanceof foundry.documents.Item) {
      if (showSheet.delete(item.uuid)) return render.apply(this, args);
      if (opensInWorkshop(item)) {
        openItemEditor(item);
        return Promise.resolve(this);
      }
    }
    return render.apply(this, args);
  };
}
