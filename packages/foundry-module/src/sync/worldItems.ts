/**
 * Moving items between HDC and Foundry's Items directory.
 *
 * Items travel as HDC fragments (see shared `extractItems`/`insertItems`). World items are
 * built by hero6e's own parser, the same one its compendium import uses, so they come out
 * exactly as an upload would make them. Lists and frameworks become a folder holding the
 * parent item and its members, as in hero6e's compendiums.
 */

import {
  HdcDocument,
  blankHdc,
  extractItems,
  insertItems,
  parseXml,
  type HdcItemSection,
  type ItemTransfer,
} from '@hero-workshop/shared';
import { applyDrift, detectDrift } from './drift';
import { MODULE_ID, itemSource } from './session';

/** Drag data for items dragged out of a Hero Workshop editor */
export const DRAG_TYPE = 'HeroWorkshopItem';

export interface HeroWorkshopDragData {
  type: typeof DRAG_TYPE;
  name: string;
  transfer: ItemTransfer;
  /** Window the drag started in (dropping back onto it does nothing) */
  sourceWindow: string;
}

export const SECTION_FOR_ITEM_TYPE: Record<string, HdcItemSection> = {
  skill: 'SKILLS',
  perk: 'PERKS',
  talent: 'TALENTS',
  martialart: 'MARTIALARTS',
  maneuver: 'MARTIALARTS',
  power: 'POWERS',
  disadvantage: 'DISADVANTAGES',
  complication: 'DISADVANTAGES',
  equipment: 'EQUIPMENT',
};

interface HeroItemData {
  name: string;
  type: string;
  system: Record<string, unknown> & { ID?: number; PARENTID?: number };
  folder?: string;
  sort?: number;
  flags?: Record<string, unknown>;
}

interface HeroItemClass {
  parseItemsFromHeroJsonToItemDataArray(heroJson: Record<string, unknown>): HeroItemData[];
  createDocuments(data: HeroItemData[]): Promise<FoundryItem[]>;
}

interface FolderClass {
  create(data: Record<string, unknown>): Promise<{ id: string } | undefined>;
}

/** hero6e's XML → JSON converter (same module instance the system uses) */
async function heroJsonFromXml(xml: string): Promise<Record<string, unknown>> {
  const path = `/systems/${game.system.id}/module/utility/xml-to-json.mjs`;
  const { xmlToJsonNode } = (await import(/* @vite-ignore */ path)) as {
    xmlToJsonNode(json: Record<string, unknown>, children: HTMLCollection): void;
  };
  const dom = new DOMParser().parseFromString(xml, 'text/xml');
  const json: Record<string, unknown> = {};
  xmlToJsonNode(json, dom.children);
  return json;
}

/** Above every world item's HDC ID (and Hero Designer's timestamp IDs), so PARENTID links stay unambiguous */
function worldIdFloor(): number {
  let max = Date.now();
  for (const item of game.items.contents) {
    const id = Number(item.system.ID);
    if (Number.isSafeInteger(id) && id > max) max = id;
  }
  return max;
}

/** Creates world items (in `folderId`, if given) from copied HDC items */
export async function createWorldItems(transfer: ItemTransfer, folderId?: string): Promise<FoundryItem[]> {
  const { xml } = insertItems(blankHdc(), transfer, { minId: worldIdFloor() });
  const ItemClass = CONFIG.Item.documentClass as unknown as HeroItemClass;
  const items = ItemClass.parseItemsFromHeroJsonToItemDataArray(await heroJsonFromXml(xml));
  if (!items.length) throw new Error('hero6e could not make an item from this.');

  const FolderDoc = foundry.documents.Folder as unknown as FolderClass;
  const folderOf = new Map<number, string | undefined>();
  const hasChildren = (data: HeroItemData) => items.some((i) => i.system.PARENTID === data.system.ID);
  for (const data of items) {
    const parentFolder = data.system.PARENTID ? folderOf.get(data.system.PARENTID) : folderId;
    if (hasChildren(data)) {
      const folder = await FolderDoc.create({ type: 'Item', name: data.name, folder: parentFolder ?? null, sorting: 'm' });
      data.folder = folder?.id;
    } else {
      data.folder = parentFolder;
    }
    if (data.system.ID) folderOf.set(data.system.ID, data.folder);
    data.flags = { [MODULE_ID]: { syncedName: data.name } };
  }
  return ItemClass.createDocuments(items);
}

interface HeroItem extends FoundryItem {
  childItems: HeroItem[];
  pack?: string | null;
  childItemsFromPack?(): Promise<HeroItem[]>;
}

/**
 * A Foundry item (world, compendium or owned) as HDC fragments: the item and its list or
 * framework members, with any edits made on hero6e's item sheets folded in.
 */
export async function transferFromItem(item: FoundryItem): Promise<ItemTransfer | undefined> {
  const section = SECTION_FOR_ITEM_TYPE[item.type];
  if (!section || typeof item.system._hdcXml !== 'string' || !item.system._hdcXml.trim()) return undefined;

  const hero = item as HeroItem;
  const members: HeroItem[] = [hero];
  // Compound powers hold their parts inside their own XML
  if (item.system.XMLID !== 'COMPOUNDPOWER') {
    if (hero.pack && hero.childItemsFromPack) {
      members.push(...(await hero.childItemsFromPack()));
    } else {
      const walk = (parent: HeroItem) => {
        for (const child of parent.childItems ?? []) {
          members.push(child);
          if (child.system.XMLID !== 'COMPOUNDPOWER') walk(child);
        }
      };
      walk(hero);
    }
  }

  // Rebuild the family in a scratch document so sheet-side edits can be pulled in
  const doc = HdcDocument.parse(blankHdc());
  const container = doc.ensureSection(section);
  const sources = [];
  for (const member of members) {
    const fragment = member.system._hdcXml;
    if (typeof fragment !== 'string' || !fragment.trim()) continue;
    const el = parseXml(fragment.trim()).root;
    el.parent = null;
    container.appendElement(el);
    const source = itemSource(member);
    source.system = { ...source.system, ID: el.getAttr('ID') };
    sources.push(source);
  }
  doc.invalidateIndex();
  const top = container.elements()[0]?.getAttr('ID');
  if (!top) return undefined;
  // Only the items' own changes (the scratch document's blank characteristics don't count)
  const edits = detectDrift(doc, { items: sources, actorSystem: {} }).filter((c) => c.key.startsWith('item:') && c.recommended);
  applyDrift(doc, edits);
  return extractItems(doc.toString(), top);
}

/** Reads drag data from a drop event */
export function dragData(event: DragEvent): Record<string, unknown> | undefined {
  try {
    const data = JSON.parse(event.dataTransfer?.getData('text/plain') ?? '') as unknown;
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}
