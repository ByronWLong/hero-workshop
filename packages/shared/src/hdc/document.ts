/**
 * HdcDocument: a lossless, editable view of a Hero Designer character file.
 */

import { XmlDocument, XmlElement, createElement, parseXml } from './xml.js';

/** Top-level sections in the order Hero Designer writes them */
export const HDC_SECTIONS = [
  'BASIC_CONFIGURATION',
  'CHARACTER_INFO',
  'CHARACTERISTICS',
  'SKILLS',
  'PERKS',
  'TALENTS',
  'MARTIALARTS',
  'POWERS',
  'DISADVANTAGES',
  'EQUIPMENT',
] as const;

export type HdcSection = (typeof HDC_SECTIONS)[number];

/** Sections whose children are purchasable objects (skills, powers, ...) */
export const HDC_ITEM_SECTIONS = [
  'SKILLS',
  'PERKS',
  'TALENTS',
  'MARTIALARTS',
  'POWERS',
  'DISADVANTAGES',
  'EQUIPMENT',
] as const satisfies readonly HdcSection[];

export type HdcItemSection = (typeof HDC_ITEM_SECTIONS)[number];

/**
 * Attribute holding an item's custom icon (a Foundry image path). Not part of Hero Designer's
 * format: desktop Hero Designer opens files that have it but drops it when it saves.
 */
export const ICON_ATTR = 'FOUNDRY_ICON';

/** Elements that are purchasable objects and must carry an ID */
function isObjectElement(el: XmlElement): boolean {
  return el.hasAttr('XMLID') || el.name === 'LIST';
}

export class HdcDocument {
  private idIndex: Map<string, XmlElement> | null = null;
  private lastId = 0;

  constructor(readonly xml: XmlDocument) {}

  static parse(text: string): HdcDocument {
    return new HdcDocument(parseXml(text));
  }

  /** CHARACTER (or legacy HERO / PREFAB) root */
  get root(): XmlElement {
    return this.xml.root;
  }

  section(name: HdcSection): XmlElement | undefined {
    return this.root.firstElement(name);
  }

  /** Returns the section, creating it in Hero Designer's canonical position if absent */
  ensureSection(name: HdcSection): XmlElement {
    const existing = this.section(name);
    if (existing) return existing;
    const order = HDC_SECTIONS.indexOf(name);
    const following = this.root
      .elements()
      .find((el) => HDC_SECTIONS.indexOf(el.name as HdcSection) > order || el.name === 'IMAGE');
    return this.root.appendElement(createElement(name), following);
  }

  /**
   * Assigns an ID to every object element that lacks one. Assignment is deterministic
   * (max existing numeric ID + 1, in document order) so re-parsing the same source text
   * always yields the same IDs, which the diff-based writer relies on.
   */
  ensureIds(): number {
    let assigned = 0;
    for (const el of this.root.descendants()) {
      if (isObjectElement(el) && !el.getAttr('ID')) {
        el.setAttr('ID', this.nextId());
        assigned++;
      }
    }
    if (assigned) this.idIndex = null;
    return assigned;
  }

  /** A fresh ID in Hero Designer's style (numeric, above every existing ID) */
  nextId(): string {
    if (this.lastId === 0) {
      let max = 0;
      for (const el of this.root.descendants()) {
        const id = Number(el.getAttr('ID'));
        if (Number.isSafeInteger(id) && id > max) max = id;
      }
      this.lastId = max;
    }
    this.lastId += 1;
    return String(this.lastId);
  }

  /** Makes nextId() hand out IDs above `floor` */
  reserveIdsAbove(floor: number): void {
    if (this.lastId === 0) {
      this.nextId();
      this.lastId -= 1;
    }
    this.lastId = Math.max(this.lastId, Math.floor(floor));
  }

  /** First element (document order) carrying the given ID, optionally within a subtree */
  findById(id: string, scope?: XmlElement): XmlElement | undefined {
    if (scope) {
      for (const el of scope.descendants()) if (el.getAttr('ID') === id) return el;
      return undefined;
    }
    if (!this.idIndex) {
      this.idIndex = new Map();
      for (const el of this.root.descendants()) {
        const elId = el.getAttr('ID');
        if (elId && !this.idIndex.has(elId)) this.idIndex.set(elId, el);
      }
    }
    const hit = this.idIndex.get(id);
    // Guard against stale entries for elements removed since indexing
    if (hit && this.isAttached(hit)) return hit;
    this.idIndex = null;
    for (const el of this.root.descendants()) if (el.getAttr('ID') === id) return el;
    return undefined;
  }

  /** Call after inserting elements so ID lookups see them */
  invalidateIndex(): void {
    this.idIndex = null;
  }

  private isAttached(el: XmlElement): boolean {
    let node: XmlElement | null = el;
    while (node.parent) node = node.parent;
    return node === this.root;
  }

  /** Extracts and removes the embedded portrait, as hero6e does before storing _hdcXml */
  extractImage(): { fileName?: string; data: string } | undefined {
    const image = this.root.firstElement('IMAGE');
    if (!image) return undefined;
    const result = { fileName: image.getAttr('FileName'), data: image.text.trim() };
    this.root.removeElement(image);
    return result;
  }

  toString(): string {
    return this.xml.toString();
  }
}
