/**
 * Copying items between HDC documents (drag and drop between characters and item libraries).
 *
 * An item travels as XML fragments: the element itself (compound sub-powers are nested inside
 * it) followed by everything that hangs off it through PARENTID (a list's or framework's
 * members), in document order.
 */

import { HdcDocument, HDC_ITEM_SECTIONS, getIcon, setIcon, type HdcItemSection } from './document.js';
import { createElement, parseXml, type XmlElement } from './xml.js';
import { isFramework } from '../frameworks.js';

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

// -----------------------------------------------------------------------------
// Compound parts
// -----------------------------------------------------------------------------

/** An item element's own items (a compound's parts), as opposed to its adders, modifiers and notes */
const isItemChild = (el: XmlElement) => el.hasAttr('XMLID') && el.name !== 'ADDER' && el.name !== 'MODIFIER';

const isContainerElement = (el: XmlElement) => {
  const xmlId = el.getAttr('XMLID') ?? '';
  return el.name === 'LIST' || xmlId === 'LIST' || isFramework(el.name) || isFramework(xmlId);
};

const isCompoundElement = (el: XmlElement) => el.getAttr('XMLID') === 'COMPOUNDPOWER' || el.elements().some(isItemChild);

/** The item a nested element (a compound's part) belongs to; the element itself otherwise */
function itemOf(el: XmlElement): XmlElement {
  return el.parent && el.parent.hasAttr('XMLID') ? el.parent : el;
}

export interface PartsTarget {
  /** HDC ID of the compound the parts go in (or of the item that becomes one) */
  id: string;
  /** The item is a single power, which becomes a compound holding it and the new parts */
  wrap: boolean;
}

/**
 * Where parts dropped on an item go: into its compound (a part stands for its compound), or
 * into a single power, which becomes a compound. Lists, frameworks and non-powers take none.
 */
export function partsTarget(xml: string, id: string): PartsTarget | undefined {
  const doc = HdcDocument.parse(xml);
  const found = doc.findById(id);
  if (!found) return undefined;
  const el = itemOf(found);
  const section = sectionOf(doc, el);
  if (section !== 'POWERS' && section !== 'EQUIPMENT') return undefined;
  if (isContainerElement(el)) return undefined;
  return { id: el.getAttr('ID')!, wrap: !isCompoundElement(el) };
}

/** Attributes only a top-level piece of equipment has; a compound's parts don't */
const EQUIPMENT_ONLY = ['PRICE', 'WEIGHT', 'CARRIED'];

/** A copied item's parts: a compound's own parts, or the item itself */
function partsOf(transfer: ItemTransfer): XmlElement[] {
  const elements = transfer.fragments.map((fragment) => parseXml(fragment.trim()).root);
  const top = elements[0];
  if (!top) return [];
  const name = top.getAttr('NAME') || top.getAttr('ALIAS') || top.name;
  if (elements.length > 1 || isContainerElement(top)) throw new Error(`${name} is a list or framework, which can't be part of a compound power.`);
  const parts = isCompoundElement(top) ? top.elements().filter(isItemChild) : [top];
  for (const part of parts) {
    if (part.parent) part.parent.removeElement(part);
    part.parent = null;
  }
  return parts;
}

/**
 * Adds copied items to a compound power as parts (a copied compound adds its parts). A single
 * power or piece of equipment first becomes a compound holding itself: the compound keeps its
 * ID, name, price and icon, and the power moves inside it.
 */
export function insertParts(
  xml: string,
  transfer: ItemTransfer,
  targetId: string,
  options: { minId?: number } = {},
): { xml: string; id: string; ids: string[] } {
  const target = partsTarget(xml, targetId);
  if (!target) throw new Error('Only a power, a piece of equipment or a compound power can take parts.');
  const doc = HdcDocument.parse(xml);
  if (options.minId) doc.reserveIdsAbove(options.minId);
  const parts = partsOf(transfer);
  let compound = doc.findById(target.id)!;

  if (target.wrap) compound = wrapInCompound(doc, compound);

  let position = 0;
  for (const el of compound.elements().filter(isItemChild)) position = Math.max(position, Number(el.getAttr('POSITION')) + 1 || 0);
  for (const part of parts) {
    for (const node of [part, ...part.descendants()]) if (node.hasAttr('ID')) node.setAttr('ID', doc.nextId());
    part.removeAttr('PARENTID');
    for (const attr of EQUIPMENT_ONLY) part.removeAttr(attr);
    part.setAttr('POSITION', String(position++));
    compound.appendElement(part);
  }
  doc.invalidateIndex();
  doc.ensureIds();
  return { xml: doc.toString(), id: compound.getAttr('ID')!, ids: parts.map((p) => p.getAttr('ID')!) };
}

function wrapInCompound(doc: HdcDocument, item: XmlElement): XmlElement {
  const section = item.parent!;
  const attr = (name: string) => item.getAttr(name);
  const wrapper = createElement('POWER', {
    XMLID: 'COMPOUNDPOWER',
    BASECOST: '0.0',
    LEVELS: '0',
    ALIAS: 'Compound Power',
    POSITION: attr('POSITION'),
    MULTIPLIER: attr('MULTIPLIER') ?? '1.0',
    GRAPHIC: 'Burst',
    COLOR: '255 255 255',
    SFX: 'Default',
    SHOW_ACTIVE_COST: 'Yes',
    INCLUDE_NOTES_IN_PRINTOUT: 'Yes',
    PRICE: attr('PRICE'),
    WEIGHT: attr('WEIGHT'),
    CARRIED: attr('CARRIED'),
    NAME: attr('NAME') || attr('ALIAS') || '',
    QUANTITY: attr('QUANTITY') ?? '1',
    AFFECTS_PRIMARY: 'No',
    AFFECTS_TOTAL: 'Yes',
    ID: attr('ID'),
    PARENTID: attr('PARENTID'),
  });
  section.appendElement(wrapper, item);
  section.removeElement(item);
  // The icon stays on the item as it shows in lists (now the compound)
  const icon = getIcon(item);
  setIcon(item, undefined);
  if (icon) setIcon(wrapper, icon);
  item.setAttr('ID', doc.nextId());
  item.setAttr('POSITION', '0');
  item.removeAttr('PARENTID');
  for (const name of EQUIPMENT_ONLY) item.removeAttr(name);
  wrapper.appendElement(item);
  doc.invalidateIndex();
  return wrapper;
}

