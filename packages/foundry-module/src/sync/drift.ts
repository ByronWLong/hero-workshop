/**
 * Drift: edits made in Foundry (on the hero6e system's own sheets) that aren't in the
 * actor's stored HDC.
 *
 * hero6e imports each HDC element as an item whose `system` mirrors the element's
 * attributes (Yes/No -> booleans, numbers coerced, values trimmed, ADDER/MODIFIER children
 * as arrays). Its item models are strict, so only schema fields survive the import; any
 * difference between such a field and the element's attribute is an edit made in Foundry.
 *
 * `detectDrift` lists those differences as individually-applicable changes so the user can
 * pull them into the HDC before editing it in Hero Workshop.
 */

import { HdcDocument, XmlElement, createElement, parseXml } from '@hero-workshop/shared';

/** The subset of a Foundry item's source data drift detection reads */
export interface DriftItemSource {
  /** Foundry document id */
  id: string;
  name: string;
  type: string;
  system: Record<string, unknown>;
  /** hero6e's system-generated items (maneuvers, Perception, ...) have no HDC element */
  isFreeStuff?: boolean;
}

export interface DriftChange {
  key: string;
  kind: 'modified' | 'added' | 'removed';
  itemName: string;
  summary: string;
  /** Whether the change should be applied unless the user opts out */
  recommended: boolean;
  apply(doc: HdcDocument): void;
}

export interface DriftInput {
  items: DriftItemSource[];
  /** actor._source.system: characteristic data lives at system.STR, system.DEX, ... */
  actorSystem: Record<string, unknown>;
  /**
   * HDC IDs that existed as Foundry items after Hero Workshop last synced this actor.
   * Elements missing from Foundry are only treated as deletions if they were once imported;
   * otherwise hero6e probably skipped them (unsupported power) and they're left alone.
   */
  syncedIds?: string[];
}

const SECTION_BY_ITEM_TYPE: Record<string, string> = {
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

const ITEM_SECTIONS = ['SKILLS', 'PERKS', 'TALENTS', 'MARTIALARTS', 'POWERS', 'DISADVANTAGES', 'EQUIPMENT'];

/** Attributes not compared: identity, bookkeeping, or rewritten by hero6e during import */
const SKIP_ATTRS = new Set(['ID', 'xmlTag', 'xmlid', 'POSITION']);

/** Attributes worth adding when Foundry has a value but the element lacks the attribute */
const ADDABLE_ATTRS = ['NAME', 'ALIAS', 'INPUT', 'LEVELS', 'OPTION', 'OPTIONID', 'OPTION_ALIAS', 'COMMENTS'];

export function detectDrift(doc: HdcDocument, input: DriftInput): DriftChange[] {
  const changes: DriftChange[] = [];
  const hdcItems = input.items.filter((i) => !i.isFreeStuff && hasHdcId(i.system));
  const foundryIds = new Set(hdcItems.map((i) => String(i.system.ID)));

  detectCharacteristicDrift(doc, input.actorSystem, changes);

  for (const item of hdcItems) {
    const id = String(item.system.ID);
    const el = doc.findById(id);
    if (el) {
      diffElement(el, item.system, item.name, `item:${id}`, changes, isNested(el));
    } else {
      changes.push(addedItemChange(item));
    }
  }

  const synced = input.syncedIds ? new Set(input.syncedIds) : undefined;
  for (const el of hdcItemElements(doc)) {
    const id = el.getAttr('ID');
    if (!id || foundryIds.has(id)) continue;
    const wasImported = synced ? synced.has(id) : true;
    const name = labelOf(el);
    changes.push({
      key: `removed:${id}`,
      kind: 'removed',
      itemName: name,
      summary: !synced
        ? 'Missing in Foundry (deleted there, or never imported by hero6e); kept unless selected'
        : wasImported
          ? 'Deleted in Foundry'
          : 'Never imported by hero6e (possibly unsupported); kept unless selected',
      recommended: wasImported && synced !== undefined,
      apply: () => el.parent?.removeElement(el),
    });
  }
  return changes;
}

/** Applies the chosen changes to the document they were detected on */
export function applyDrift(doc: HdcDocument, changes: DriftChange[]): void {
  for (const change of changes) change.apply(doc);
  doc.invalidateIndex();
}

/** HDC IDs of every item element, for recording which items Foundry has imported */
export function hdcItemIds(doc: HdcDocument): string[] {
  return [...hdcItemElements(doc)].map((el) => el.getAttr('ID')).filter((id): id is string => !!id);
}

// -----------------------------------------------------------------------------

function hasHdcId(system: Record<string, unknown>): boolean {
  const id = system.ID;
  return id !== undefined && id !== null && id !== '' && id !== 0;
}

function isNested(el: XmlElement): boolean {
  return !!el.parent && !ITEM_SECTIONS.includes(el.parent.name);
}

/** Section-level items plus items nested in compound powers (hero6e imports both) */
function* hdcItemElements(doc: HdcDocument): Generator<XmlElement> {
  for (const sectionName of ITEM_SECTIONS) {
    const section = doc.root.firstElement(sectionName);
    if (!section) continue;
    for (const el of section.elements()) {
      yield el;
      if (el.getAttr('XMLID') === 'COMPOUNDPOWER') {
        for (const child of el.elements()) {
          if (child.name !== 'ADDER' && child.name !== 'MODIFIER' && child.name !== 'NOTES') yield child;
        }
      }
    }
  }
}

function labelOf(el: XmlElement): string {
  return el.getAttr('NAME')?.trim() || el.getAttr('ALIAS')?.trim() || el.getAttr('XMLID') || el.name;
}

function detectCharacteristicDrift(doc: HdcDocument, actorSystem: Record<string, unknown>, changes: DriftChange[]): void {
  const section = doc.root.firstElement('CHARACTERISTICS');
  if (!section) return;
  for (const el of section.elements()) {
    const data = actorSystem[el.name] as Record<string, unknown> | undefined;
    const levels = data?.LEVELS;
    if (typeof levels !== 'number') continue;
    const xmlValue = el.getAttr('LEVELS') ?? '0';
    if (!differs(xmlValue, levels)) continue;
    changes.push({
      key: `char:${el.name}`,
      kind: 'modified',
      itemName: el.name,
      summary: `LEVELS ${xmlValue} → ${levels}`,
      recommended: true,
      apply: () => el.setAttr('LEVELS', toXmlValue(xmlValue, levels)),
    });
  }
}

/** Compares an element with Foundry's view of it, recursing into ADDER/MODIFIER children */
function diffElement(
  el: XmlElement,
  system: Record<string, unknown>,
  itemName: string,
  keyPrefix: string,
  changes: DriftChange[],
  nested: boolean,
): void {
  const isGenericObject = el.getAttr('XMLID') === 'GENERIC_OBJECT';

  for (const attr of [...el.attrs]) {
    if (SKIP_ATTRS.has(attr.name)) continue;
    if (attr.name === 'XMLID' && isGenericObject) continue;
    // hero6e adds PARENTID to compound-power children, which the file expresses by nesting
    if (attr.name === 'PARENTID' && nested) continue;
    const sysValue = system[attr.name];
    if (!differs(attr.value, sysValue)) continue;
    const next = toXmlValue(attr.value, sysValue);
    changes.push({
      key: `${keyPrefix}:${attr.name}`,
      kind: 'modified',
      itemName,
      summary: `${attr.name} ${show(attr.value)} → ${show(next)}`,
      recommended: true,
      apply: () => el.setAttr(attr.name, next),
    });
  }

  for (const name of ADDABLE_ATTRS) {
    const sysValue = system[name];
    if (el.hasAttr(name) || sysValue === undefined || sysValue === null || sysValue === '') continue;
    changes.push({
      key: `${keyPrefix}:${name}`,
      kind: 'modified',
      itemName,
      summary: `${name} set to ${show(String(sysValue))}`,
      recommended: true,
      apply: () => el.setAttr(name, String(sysValue)),
    });
  }

  if (typeof system.NOTES === 'string') {
    const notesEl = el.firstElement('NOTES');
    const current = notesEl ? notesEl.text : (el.getAttr('NOTES') ?? '');
    if (current.trim() !== system.NOTES.trim()) {
      const text = system.NOTES;
      changes.push({
        key: `${keyPrefix}:NOTES`,
        kind: 'modified',
        itemName,
        summary: 'Notes changed',
        recommended: true,
        apply: () => {
          if (notesEl) notesEl.text = text;
          else if (el.hasAttr('NOTES')) el.setAttr('NOTES', text);
          else el.appendElement(createElement('NOTES')).text = text;
        },
      });
    }
  }

  // hero6e strips a compound power's own modifiers/adders on import; don't read that as deletion
  if (el.getAttr('XMLID') === 'COMPOUNDPOWER') return;
  for (const tag of ['ADDER', 'MODIFIER'] as const) {
    diffChildren(el, tag, system[tag], itemName, keyPrefix, changes);
  }
}

function diffChildren(
  el: XmlElement,
  tag: 'ADDER' | 'MODIFIER',
  sysChildren: unknown,
  itemName: string,
  keyPrefix: string,
  changes: DriftChange[],
): void {
  if (!Array.isArray(sysChildren)) return;
  const children = sysChildren.filter((c): c is Record<string, unknown> => !!c && typeof c === 'object');
  const xmlChildren = el.elements(tag);
  const sysIds = new Set(children.map((c) => String(c.ID ?? '')));
  const label = tag === 'ADDER' ? 'adder' : 'modifier';

  for (const child of xmlChildren) {
    const id = child.getAttr('ID') ?? '';
    const match = children.find((c) => String(c.ID ?? '') === id);
    if (match) {
      diffElement(child, match, itemName, `${keyPrefix}:${tag}:${id}`, changes, false);
    } else if (id) {
      changes.push({
        key: `${keyPrefix}:${tag}:${id}:removed`,
        kind: 'removed',
        itemName,
        summary: `Removed ${label} ${labelOf(child)}`,
        recommended: true,
        apply: () => el.removeElement(child),
      });
    }
  }

  const xmlIds = new Set(xmlChildren.map((c) => c.getAttr('ID') ?? ''));
  for (const child of children) {
    const id = String(child.ID ?? '');
    if (id && xmlIds.has(id)) continue;
    if (!id && sysIds.size === 0) continue;
    const name = String(child.ALIAS ?? child.NAME ?? child.XMLID ?? label);
    changes.push({
      key: `${keyPrefix}:${tag}:${id || name}:added`,
      kind: 'added',
      itemName,
      summary: `Added ${label} ${name}`,
      recommended: true,
      apply: (doc) => {
        const created = elementFromSystem(doc, tag, child);
        const firstLater = el.elements().find((e) => (tag === 'ADDER' ? e.name === 'MODIFIER' : false) || isItemChild(e));
        el.appendElement(created, firstLater);
      },
    });
  }
}

function isItemChild(el: XmlElement): boolean {
  return el.name !== 'NOTES' && el.name !== 'ADDER' && el.name !== 'MODIFIER';
}

/** A Foundry-created item: rebuilt from its stored XML fragment where possible */
function addedItemChange(item: DriftItemSource): DriftChange {
  const sectionName = SECTION_BY_ITEM_TYPE[item.type];
  return {
    key: `added:${item.id}`,
    kind: 'added',
    itemName: item.name,
    summary: sectionName ? 'Added in Foundry' : `Added in Foundry (type "${item.type}" has no HDC section; skipped)`,
    recommended: !!sectionName,
    apply: (target) => {
      if (!sectionName) return;
      const tag = String(item.system.xmlTag || (sectionName === 'DISADVANTAGES' ? 'DISAD' : item.type.toUpperCase()));
      const el = elementFromSystem(target, tag, item.system);
      // Keep Foundry's ID so the next import matches this element to the existing item
      const wanted = String(item.system.ID);
      el.setAttr('ID', target.findById(wanted) ? target.nextId() : wanted);

      const parentId = item.system.PARENTID ? String(item.system.PARENTID) : undefined;
      const parent = parentId ? target.findById(parentId) : undefined;
      if (parent && parent.getAttr('XMLID') === 'COMPOUNDPOWER') {
        el.removeAttr('PARENTID');
        parent.appendElement(el);
      } else {
        target.ensureSection(sectionName as Parameters<HdcDocument['ensureSection']>[0]).appendElement(el);
      }
      target.invalidateIndex();
    },
  };
}

/**
 * Builds an element from hero6e item/adder/modifier data. When the data carries the
 * original XML (`_hdcXml`), that fragment is the starting point so attributes outside
 * Foundry's schema survive; scalar fields from Foundry then override it.
 */
function elementFromSystem(doc: HdcDocument, tag: string, system: Record<string, unknown>): XmlElement {
  let el: XmlElement | undefined;
  if (typeof system._hdcXml === 'string' && system._hdcXml.trim()) {
    try {
      el = parseXml(system._hdcXml.trim()).root;
      el.parent = null;
    } catch {
      el = undefined;
    }
  }
  el ??= createElement(tag);

  for (const [key, value] of Object.entries(system)) {
    if (key.startsWith('_') || SKIP_ATTRS.has(key) || key === 'NOTES' || key === 'is5e' || key === 'errors') continue;
    if (value === null || value === undefined || typeof value === 'object') continue;
    if (key === 'XMLID' && typeof system.xmlid === 'string') {
      el.setAttr('XMLID', system.xmlid); // hero6e rewrote GENERIC_OBJECT to the tag name
      continue;
    }
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) continue; // HDC attributes are upper-case; the rest is Foundry state
    const original = el.getAttr(key);
    el.setAttr(key, original !== undefined ? toXmlValue(original, value) : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value));
  }
  if (!el.getAttr('ID')) el.setAttr('ID', doc.nextId());
  if (typeof system.NOTES === 'string' && system.NOTES && !el.firstElement('NOTES')) {
    el.appendElement(createElement('NOTES')).text = system.NOTES;
  }
  for (const childTag of ['ADDER', 'MODIFIER'] as const) {
    const kids = system[childTag];
    if (!Array.isArray(kids) || el.elements(childTag).length) continue;
    for (const kid of kids) {
      if (kid && typeof kid === 'object') el.appendElement(elementFromSystem(doc, childTag, kid as Record<string, unknown>));
    }
  }
  return el;
}

// -----------------------------------------------------------------------------
// Value comparison mirroring hero6e's import coercions
// -----------------------------------------------------------------------------

function differs(xmlValue: string, sysValue: unknown): boolean {
  if (sysValue === undefined || sysValue === null) return false; // not tracked by Foundry's schema
  const x = xmlValue.trim();
  if (typeof sysValue === 'boolean') {
    if (/^(yes|true)$/i.test(x)) return sysValue !== true;
    if (/^(no|false)$/i.test(x)) return sysValue !== false;
    return x !== '' || sysValue;
  }
  if (typeof sysValue === 'number') {
    if (x === '') return sysValue !== 0;
    const n = Number(x);
    return Number.isFinite(n) ? Math.abs(n - sysValue) > 1e-9 : false;
  }
  if (typeof sysValue === 'string') {
    // hero6e turns Yes/No into booleans, which string-typed schema fields then store as "true"/"false"
    const s = sysValue.trim();
    if (/^(true|false)$/.test(s) && /^(yes|no|true|false)$/i.test(x)) {
      return /^(yes|true)$/i.test(x) !== (s === 'true');
    }
    return x !== s;
  }
  return false;
}

/** Converts a Foundry value back to HDC text in the style of the value it replaces */
function toXmlValue(original: string, value: unknown): string {
  if (typeof value === 'string' && /^(true|false)$/.test(value) && /^(yes|no)$/i.test(original.trim())) {
    value = value === 'true';
  }
  if (typeof value === 'boolean') {
    const upper = /^(YES|NO)$/.test(original.trim());
    return value ? (upper ? 'YES' : 'Yes') : upper ? 'NO' : 'No';
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) && /^-?\d+\.\d+$/.test(original.trim()) ? value.toFixed(1) : String(value);
  }
  return String(value);
}

function show(value: string): string {
  return value.length > 40 ? `"${value.slice(0, 37)}..."` : `"${value}"`;
}
