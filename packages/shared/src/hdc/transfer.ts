/**
 * Copying items between HDC documents (drag and drop between characters and item libraries).
 *
 * An item travels as XML fragments: the element itself (compound sub-powers are nested inside
 * it) followed by everything that hangs off it through PARENTID (a list's or framework's
 * members), in document order.
 */

import { HdcDocument, HDC_ITEM_SECTIONS, type HdcItemSection } from './document.js';
import { parseXml, type XmlElement } from './xml.js';

export interface ItemTransfer {
  section: HdcItemSection;
  /** The item's element first, then its PARENTID descendants */
  fragments: string[];
}

/** The section (SKILLS, POWERS, ...) an element sits in */
function sectionOf(doc: HdcDocument, el: XmlElement): HdcItemSection | undefined {
  let node: XmlElement | null = el;
  while (node && node.parent && node.parent !== doc.root) node = node.parent;
  const name = node?.name as HdcItemSection | undefined;
  return name && HDC_ITEM_SECTIONS.includes(name) ? name : undefined;
}

/** Top-level members of an item's family (the item plus its PARENTID descendants) */
function family(section: XmlElement, top: XmlElement): XmlElement[] {
  const ids = new Set([top.getAttr('ID')]);
  const members = new Set<XmlElement>([top]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const el of section.elements()) {
      const parentId = el.getAttr('PARENTID');
      if (!members.has(el) && parentId && ids.has(parentId)) {
        members.add(el);
        ids.add(el.getAttr('ID'));
        grew = true;
      }
    }
  }
  return [top, ...section.elements().filter((el) => el !== top && members.has(el))];
}

/** The item with the given HDC ID, ready to copy into another document */
export function extractItems(xml: string, id: string): ItemTransfer | undefined {
  const doc = HdcDocument.parse(xml);
  const el = doc.findById(id);
  if (!el) return undefined;
  const section = sectionOf(doc, el);
  if (!section) return undefined;
  const container = doc.section(section)!;
  // Nested elements (compound sub-powers) travel alone; their parent holds them by nesting
  const members = el.parent === container ? family(container, el) : [el];
  return { section, fragments: members.map((m) => m.toString()) };
}

export interface InsertOptions {
  /** HDC ID of a list/framework in the target to put the top item in */
  parentId?: string;
  /** New IDs start above this (e.g. Date.now(), to stay unique among world items) */
  minId?: number;
}

/**
 * Inserts copied items into a document. Every ID in the copy is replaced with a fresh one,
 * and PARENTID links inside the copy follow; links to anything outside it are dropped (or
 * point at `parentId`). Returns the new document text and the top item's new ID.
 */
export function insertItems(
  xml: string,
  transfer: ItemTransfer,
  options: InsertOptions = {},
): { xml: string; id: string | undefined; ids: string[] } {
  const doc = HdcDocument.parse(xml);
  if (options.minId) doc.reserveIdsAbove(options.minId);
  const elements = transfer.fragments.map((fragment) => {
    const el = parseXml(fragment.trim()).root;
    el.parent = null;
    return el;
  });

  const idMap = new Map<string, string>();
  for (const el of elements) {
    for (const node of [el, ...el.descendants()]) {
      const old = node.getAttr('ID');
      if (old !== undefined) {
        const fresh = doc.nextId();
        if (!idMap.has(old)) idMap.set(old, fresh);
        node.setAttr('ID', fresh);
      }
    }
  }
  for (const el of elements) {
    for (const node of [el, ...el.descendants()]) {
      const parent = node.getAttr('PARENTID');
      if (parent === undefined) continue;
      const mapped = idMap.get(parent);
      if (mapped) node.setAttr('PARENTID', mapped);
      else if (node === el && options.parentId) node.setAttr('PARENTID', options.parentId);
      else node.removeAttr('PARENTID');
    }
  }
  const top = elements[0];
  if (top && options.parentId && !top.hasAttr('PARENTID')) top.setAttr('PARENTID', options.parentId);

  const section = doc.ensureSection(transfer.section);
  for (const el of elements) section.appendElement(el);
  doc.invalidateIndex();
  doc.ensureIds();
  return { xml: doc.toString(), id: top?.getAttr('ID'), ids: elements.map((el) => el.getAttr('ID')!).filter(Boolean) };
}
