/**
 * Character view-model -> HDC, by patching the original document.
 *
 * The Character model is a *view* of an HDC file: display names are composed from several
 * attributes, costs are derived, and most attributes are never read at all. So instead of
 * regenerating XML from the model, the writer diffs the edited model against the model
 * parsed from the same source and applies only the resulting attribute/element changes.
 * Everything the user didn't touch stays byte-for-byte as it was, which is what Hero
 * Designer and the hero6e Foundry system (which re-imports `_hdcXml`) both need.
 *
 * Usage:
 *   const { xml, report } = updateHdc(originalXml, editedCharacter);
 */

import type {
  Adder,
  BasicConfiguration,
  Character,
  CharacterInfo,
  CharacteristicType,
  Characteristic,
  Rules,
  Disadvantage,
  Equipment,
  MartialManeuver,
  Modifier,
  Perk,
  Power,
  Skill,
  Talent,
} from '../types.js';
import { getPowerDefinition } from '../powerDefinitions.js';
import { FRAMEWORK_NAMES, isFramework } from '../frameworks.js';
import { characteristicRulesFor, formatRulesName, parseRulesName } from '../characteristics.js';
import { getModifierByXmlId } from '../modifierDefinitions.js';
import {
  SKILL_CATALOG_6E,
  SKILL_ENHANCER_CATALOG_6E,
  type SkillCatalogEntry,
} from '../generated/skillCatalog6e.js';
import {
  DISADVANTAGE_CATALOG_6E,
  PERK_CATALOG_6E,
  TALENT_CATALOG_6E,
  type CatalogAdder,
  type CatalogOption,
  type CatalogEntry,
} from '../generated/catalog6e.js';
import { HdcDocument, type HdcItemSection, setIcon } from './document.js';
import { XmlElement, createElement, escapeAttr } from './xml.js';
import {
  ATTACK_DEFENSE_DEFAULTS,
  isCharacteristicTag,
  itemLabel,
  normalizeForFoundry,
  rebindRequiresARoll,
  skillIdentities,
  validateForFoundry,
  type FoundryValidationIssue, LABELLED_SKILL_XMLIDS } from './foundry.js';
import { parseHdcDocument } from './parse.js';

export interface HdcWriteReport {
  /** One line per XML change, for previews and logs */
  changes: string[];
  /** Edits that could not be represented in HDC (or were approximated) */
  warnings: string[];
  /** Model id -> HDC ID for objects the writer created */
  idMap: Record<string, string>;
  /** Foundry compatibility problems anywhere in the resulting document */
  foundryIssues: FoundryValidationIssue[];
}

export interface HdcWriteOptions {
  /** Repair Foundry compatibility problems on edited/created items (default true) */
  foundryCompatible?: boolean;
}

/** Applies an edited Character to the HDC it was parsed from */
export function updateHdc(
  originalXml: string,
  after: Character,
  options: HdcWriteOptions = {},
): { xml: string; report: HdcWriteReport } {
  const doc = HdcDocument.parse(originalXml);
  doc.ensureIds();
  const before = parseHdcDocument(doc);
  const report = applyCharacterChanges(doc, before, after, options);
  return { xml: doc.toString(), report };
}

/** Builds a new HDC for a Character that has no source file */
export function createHdc(
  character: Character,
  options: HdcWriteOptions & { template?: string } = {},
): { xml: string; report: HdcWriteReport } {
  return updateHdc(blankHdc(character, options.template), character, options);
}

/** Hero Designer 6e templates Hero Workshop can start a character from */
export const CHARACTER_TEMPLATES = {
  heroic: { template: 'builtIn.Heroic6E.hdt', label: 'Heroic', basePoints: 175, disadPoints: 50, actorType: undefined },
  superheroic: { template: 'builtIn.Superheroic6E.hdt', label: 'Superheroic', basePoints: 400, disadPoints: 75, actorType: undefined },
  vehicle: { template: 'builtIn.Vehicle6E.hdt', label: 'Vehicle', basePoints: 0, disadPoints: 0, actorType: 'vehicle' },
  base: { template: 'builtIn.Base6E.hdt', label: 'Base', basePoints: 0, disadPoints: 0, actorType: 'base2' },
  computer: { template: 'builtIn.Computer6E.hdt', label: 'Computer', basePoints: 0, disadPoints: 0, actorType: 'computer' },
  automaton: { template: 'builtIn.Automaton6E.hdt', label: 'Automaton', basePoints: 0, disadPoints: 0, actorType: 'automaton' },
  ai: { template: 'builtIn.AI6E.hdt', label: 'AI', basePoints: 0, disadPoints: 0, actorType: 'ai' },
} as const satisfies Record<string, {
  template: string;
  label: string;
  basePoints: number;
  disadPoints: number;
  /** hero6e actor type the template maps to; undefined for people (pc or npc) */
  actorType: string | undefined;
}>;

export type CharacterTemplateId = keyof typeof CHARACTER_TEMPLATES;

/** A minimal, valid Hero Designer 6e character */
export function blankHdc(character?: Partial<Character>, template = 'builtIn.Heroic6E.hdt'): string {
  const config = character?.basicConfiguration;
  const preset = Object.values(CHARACTER_TEMPLATES).find((t) => t.template === template);
  const attr = (value: string) => escapeAttr(value);
  const lines = [
    '<?xml version="1.0" encoding="UTF-16"?>',
    `<CHARACTER version="6.0" TEMPLATE="${attr(template)}">`,
    `  <BASIC_CONFIGURATION BASE_POINTS="${config?.basePoints ?? preset?.basePoints ?? 175}" DISAD_POINTS="${config?.disadPoints ?? preset?.disadPoints ?? 50}" EXPERIENCE="${config?.experience ?? 0}" />`,
    `  <CHARACTER_INFO CHARACTER_NAME="${attr(character?.characterInfo?.characterName ?? '')}" ALTERNATE_IDENTITIES="" PLAYER_NAME="" HEIGHT="78.74015748031496" WEIGHT="220.46224760379584" HAIR_COLOR="" EYE_COLOR="" CAMPAIGN_NAME="" GENRE="" GM="">`,
    ...['BACKGROUND', 'PERSONALITY', 'QUOTE', 'TACTICS', 'CAMPAIGN_USE', 'APPEARANCE', 'NOTES1', 'NOTES2', 'NOTES3', 'NOTES4', 'NOTES5']
      .map((tag) => `    <${tag} />`),
    '  </CHARACTER_INFO>',
    '  <CHARACTERISTICS>',
    ...Object.keys(characteristicRulesFor(template)).map(
      (type, i) =>
        `    <${type} XMLID="${type}" ID="${i + 1}" BASECOST="0.0" LEVELS="0" ALIAS="${type}" POSITION="${i + 1}" ${GENERIC_ATTR_TEXT} NAME="" AFFECTS_PRIMARY="Yes" AFFECTS_TOTAL="Yes" />`,
    ),
    '  </CHARACTERISTICS>',
    '  <SKILLS />',
    '  <PERKS />',
    '  <TALENTS />',
    '  <MARTIALARTS />',
    '  <POWERS />',
    '  <DISADVANTAGES />',
    '  <EQUIPMENT />',
    '</CHARACTER>',
    '',
  ];
  return lines.join('\n');
}

// =============================================================================
// Driver
// =============================================================================

export function applyCharacterChanges(
  doc: HdcDocument,
  before: Character,
  after: Character,
  options: HdcWriteOptions = {},
): HdcWriteReport {
  const ctx = new WriteContext(doc);

  writeBasicConfiguration(ctx, before.basicConfiguration, after.basicConfiguration);
  writeCharacterInfo(ctx, before.characterInfo, after.characterInfo);
  writeCharacteristics(ctx, before.characteristics, after.characteristics);
  reconcileItems(ctx, 'SKILLS', before.skills, after.skills, SKILL_SPEC);
  reconcileItems(ctx, 'PERKS', before.perks, after.perks, PERK_SPEC);
  reconcileItems(ctx, 'TALENTS', before.talents, after.talents, TALENT_SPEC);
  reconcileItems(ctx, 'MARTIALARTS', before.martialArts, after.martialArts, MANEUVER_SPEC);
  reconcileItems(ctx, 'POWERS', before.powers, after.powers, POWER_SPEC);
  reconcileItems(ctx, 'DISADVANTAGES', before.disadvantages, after.disadvantages, DISAD_SPEC);
  reconcileItems(ctx, 'EQUIPMENT', before.equipment ?? [], after.equipment ?? [], EQUIPMENT_SPEC);
  writeImage(ctx, before, after);
  writeRules(ctx, before.rules, after.rules);
  allowMultipliers(ctx, after);

  if (options.foundryCompatible !== false) {
    for (const [el, section] of ctx.touched) {
      if (!ctx.isAttached(el)) continue;
      const notes = normalizeForFoundry(doc, el, { section, created: ctx.created.has(el) });
      ctx.report.changes.push(...notes.map((n) => `Foundry: ${n}`));
    }
  }

  ctx.report.foundryIssues = validateForFoundry(doc);
  return ctx.report;
}

class WriteContext {
  readonly report: HdcWriteReport = { changes: [], warnings: [], idMap: {}, foundryIssues: [] };
  /** Top-level item elements edited or created, with their section */
  readonly touched = new Map<XmlElement, HdcItemSection>();
  readonly created = new Set<XmlElement>();
  /** An item's cost multiplier (free or not) changed in this save */
  multipliersChanged = false;

  constructor(readonly doc: HdcDocument) {}

  change(message: string): void {
    this.report.changes.push(message);
  }

  warn(message: string): void {
    this.report.warnings.push(message);
  }

  /** Maps a model id to its HDC ID (differs only for objects created in this pass) */
  resolveId(id: string | undefined): string | undefined {
    return id === undefined ? undefined : (this.report.idMap[id] ?? id);
  }

  touch(el: XmlElement, section: HdcItemSection): void {
    this.touched.set(el, section);
  }

  isAttached(el: XmlElement): boolean {
    let node: XmlElement | null = el;
    while (node.parent) node = node.parent;
    return node === this.doc.root;
  }
}

// =============================================================================
// Value helpers
// =============================================================================

const GENERIC_ATTRS = {
  MULTIPLIER: '1.0',
  GRAPHIC: 'Burst',
  COLOR: '255 255 255',
  SFX: 'Default',
  SHOW_ACTIVE_COST: 'Yes',
  INCLUDE_NOTES_IN_PRINTOUT: 'Yes',
} as const;

const GENERIC_ATTR_TEXT = Object.entries(GENERIC_ATTRS)
  .map(([k, v]) => `${k}="${v}"`)
  .join(' ');

const yesNo = (value: boolean | undefined): string => (value ? 'Yes' : 'No');

/** Hero Designer writes costs as decimals ("3.0") and counts as integers */
const hdCost = (value: number | undefined): string => {
  const n = value ?? 0;
  return Number.isInteger(n) ? n.toFixed(1) : String(n);
};

const hdInt = (value: number | undefined): string => String(value ?? 0);

/** Empty-ish values (undefined, null, '', false, 0, []) compare equal */
function normalize(value: unknown): unknown {
  if (value === undefined || value === null || value === '' || value === false || value === 0) return undefined;
  if (Array.isArray(value)) {
    const items = value.map(normalize);
    return items.length ? items : undefined;
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as object).sort()) {
      const raw = (value as Record<string, unknown>)[key];
      // A cost multiplier of 0 (a free item) is a value, not an absent one
      const v = key === 'multiplier' && raw === 0 ? 0 : normalize(raw);
      if (v !== undefined) out[key] = v;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return value;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

function changedKeys<T extends object>(b: T, a: T): string[] {
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  return [...keys].filter((k) => !same((b as Record<string, unknown>)[k], (a as Record<string, unknown>)[k]));
}

/** Sets NOTES, respecting whether this element stores it as an attribute or a child */
function setNotes(el: XmlElement, value: string | undefined): void {
  const text = value ?? '';
  if (el.hasAttr('NOTES')) {
    el.setAttr('NOTES', text);
    return;
  }
  let notes = el.firstElement('NOTES');
  if (!notes) {
    if (!text) return;
    notes = insertChild(el, createElement('NOTES'));
  }
  notes.text = text;
}

function setChildText(el: XmlElement, tag: string, value: string | undefined): void {
  const text = value ?? '';
  let child = el.firstElement(tag);
  if (!child) {
    if (!text) return;
    child = el.appendElement(createElement(tag));
  }
  child.text = text;
}

/** Child order Hero Designer uses inside an item: NOTES, ADDERs, MODIFIERs, nested items */
const CHILD_RANK: Record<string, number> = { NOTES: 0, ADDER: 1, MODIFIER: 2 };
const rankOf = (el: XmlElement) => CHILD_RANK[el.name] ?? 3;

function insertChild(parent: XmlElement, child: XmlElement): XmlElement {
  const rank = rankOf(child);
  const before = parent.elements().find((el) => rankOf(el) > rank);
  return parent.appendElement(child, before);
}

function nextPosition(container: XmlElement): number {
  let max = -1;
  for (const el of container.elements()) {
    const p = Number(el.getAttr('POSITION'));
    if (Number.isFinite(p) && p > max) max = p;
  }
  return max + 1;
}

/** Items whose children are nested elements rather than PARENTID references */
/** Compound powers (and equipment items' parts) nest inside their item; lists and frameworks link members by PARENTID */
function nestsChildren(el: XmlElement): boolean {
  if (el.name === 'LIST' || isFramework(el.name)) return false;
  return el.getAttr('XMLID') === 'COMPOUNDPOWER' || el.parent?.name === 'EQUIPMENT';
}

// =============================================================================
// Header sections
// =============================================================================

function writeBasicConfiguration(ctx: WriteContext, b: BasicConfiguration, a: BasicConfiguration): void {
  if (same(b, a)) return;
  const el = ctx.doc.section('BASIC_CONFIGURATION');
  if (!el) {
    ctx.warn('This file has no BASIC_CONFIGURATION section; point totals were not saved.');
    return;
  }
  if (!same(b.basePoints, a.basePoints)) el.setAttr('BASE_POINTS', hdInt(a.basePoints));
  if (!same(b.disadPoints, a.disadPoints)) el.setAttr('DISAD_POINTS', hdInt(a.disadPoints));
  if (!same(b.experience, a.experience)) el.setAttr('EXPERIENCE', hdInt(a.experience));
  if (!same(b.exportTemplate, a.exportTemplate)) el.setAttr('EXPORT_TEMPLATE', a.exportTemplate ?? '');
  ctx.change('Updated point totals');
}

const INFO_ATTRS: [keyof CharacterInfo, string][] = [
  ['characterName', 'CHARACTER_NAME'],
  ['alternateIdentities', 'ALTERNATE_IDENTITIES'],
  ['playerName', 'PLAYER_NAME'],
  ['hairColor', 'HAIR_COLOR'],
  ['eyeColor', 'EYE_COLOR'],
  ['campaignName', 'CAMPAIGN_NAME'],
  ['genre', 'GENRE'],
  ['gm', 'GM'],
];

const INFO_TEXT: [keyof CharacterInfo, string][] = [
  ['background', 'BACKGROUND'],
  ['personality', 'PERSONALITY'],
  ['quote', 'QUOTE'],
  ['tactics', 'TACTICS'],
  ['campaignUse', 'CAMPAIGN_USE'],
  ['appearance', 'APPEARANCE'],
  ['notes1', 'NOTES1'],
  ['notes2', 'NOTES2'],
  ['notes3', 'NOTES3'],
  ['notes4', 'NOTES4'],
  ['notes5', 'NOTES5'],
];

function writeCharacterInfo(ctx: WriteContext, b: CharacterInfo, a: CharacterInfo): void {
  if (same(b, a)) return;
  const el = ctx.doc.section('CHARACTER_INFO') ?? ctx.doc.ensureSection('CHARACTER_INFO');
  for (const [field, attr] of INFO_ATTRS) {
    if (!same(b[field], a[field])) el.setAttr(attr, String(a[field] ?? ''));
  }
  // The model holds metric units; HDC stores inches and pounds
  if (!same(b.height, a.height)) el.setAttr('HEIGHT', a.height ? String(a.height / 2.54) : '0');
  if (!same(b.weight, a.weight)) el.setAttr('WEIGHT', a.weight ? String(a.weight / 0.453592) : '0');
  for (const [field, tag] of INFO_TEXT) {
    if (!same(b[field], a[field])) setChildText(el, tag, a[field] as string | undefined);
  }
  ctx.change('Updated character info');
}

function writeCharacteristics(ctx: WriteContext, before: Characteristic[], after: Characteristic[]): void {
  const beforeByType = new Map(before.map((c) => [c.type, c]));
  for (const a of after) {
    const b = beforeByType.get(a.type);
    if (b && same(b.levels, a.levels)) continue;
    const section = ctx.doc.ensureSection('CHARACTERISTICS');
    let el = section.firstElement(a.type);
    if (!el && !(a.type in characteristicRulesFor(ctx.doc.root.getAttr('TEMPLATE')))) {
      ctx.warn(`${a.type} isn't a characteristic of this template; it was not added.`);
      continue;
    }
    if (!el) {
      el = section.appendElement(
        createElement(a.type, {
          XMLID: a.type,
          ID: ctx.doc.nextId(),
          BASECOST: '0.0',
          LEVELS: '0',
          ALIAS: a.type,
          POSITION: nextPosition(section),
          ...GENERIC_ATTRS,
          NAME: '',
          AFFECTS_PRIMARY: 'Yes',
          AFFECTS_TOTAL: 'Yes',
        }),
      );
    }
    el.setAttr('LEVELS', hdInt(a.levels));
    ctx.change(`${a.type}: ${b?.levels ?? 0} -> ${a.levels} levels`);
  }
}

/**
 * The character's embedded campaign rules. Maxima and the races they derive from are
 * per-character in this campaign; other rules come from the campaign file and aren't edited.
 */
function writeRules(ctx: WriteContext, b: Rules | undefined, a: Rules | undefined): void {
  if (same(b, a) || !a) return;
  let el = ctx.doc.root.name === 'RULES' ? ctx.doc.root : ctx.doc.root.firstElement('RULES');

  const maximaChanged = !same(b?.characteristicMaxima, a.characteristicMaxima);
  const racesChanged = !same(b?.races, a.races);
  if ((maximaChanged || racesChanged) && !el) {
    const beforeImage = ctx.doc.root.firstElement('IMAGE');
    el = ctx.doc.root.appendElement(createElement('RULES', { name: a.name || 'Campaign' }), beforeImage);
  }

  if (el && maximaChanged) {
    const types = new Set([
      ...Object.keys(b?.characteristicMaxima ?? {}),
      ...Object.keys(a.characteristicMaxima ?? {}),
    ]) as Set<CharacteristicType>;
    for (const type of types) {
      const next = a.characteristicMaxima?.[type];
      if (same(b?.characteristicMaxima?.[type], next)) continue;
      if (next === undefined) el.removeAttr(`${type}_MAX`);
      else el.setAttr(`${type}_MAX`, String(next));
    }
    ctx.change('Updated characteristic maxima');
  }
  if (el && racesChanged) {
    const campaign = parseRulesName(el.getAttr('name') ?? a.name).campaign;
    el.setAttr('name', formatRulesName(campaign, a.races ?? []));
    ctx.change(`Races: ${(a.races ?? []).join(', ') || 'none'}`);
  }

  const otherRules = (rules: Rules) => ({ ...rules, characteristicMaxima: undefined, races: undefined });
  if (b && !same(otherRules(b), otherRules(a))) {
    ctx.warn('Campaign rules changes other than characteristic maxima are not saved to the character file.');
  }
}

function writeImage(ctx: WriteContext, before: Character, after: Character): void {
  if (same(before.image, after.image)) return;
  const root = ctx.doc.root;
  const existing = root.firstElement('IMAGE');
  if (!after.image?.data) {
    if (existing) root.removeElement(existing);
    ctx.change('Removed portrait');
    return;
  }
  const el = existing ?? root.appendElement(createElement('IMAGE'));
  el.setAttr('FileName', after.image.fileName ?? 'portrait.png');
  el.setAttr('FilePath', after.image.filePath ?? '');
  el.text = after.image.data;
  ctx.change('Updated portrait');
}

// =============================================================================
// Item sections
// =============================================================================

interface ItemSpec<T> {
  /** Writes the changed fields of an existing item; returns the fields it handled */
  update(ctx: WriteContext, el: XmlElement, b: T, a: T): void;
  /** Builds a detached element for a new item (ID and POSITION are set by the caller) */
  create(ctx: WriteContext, a: T, section: HdcItemSection): XmlElement;
  /** Fields the writer understands (written by `update`) */
  handled: ReadonlySet<string>;
  /** Derived/display fields that never map back to the file */
  derived: ReadonlySet<string>;
  /** Items nested inside this one in the model (equipment sub-powers) */
  nested?: (item: T) => Power[] | undefined;
}

type ItemModel = { id: string; name: string; parentId?: string; position?: number };

function reconcileItems<T extends ItemModel>(
  ctx: WriteContext,
  sectionName: HdcItemSection,
  before: T[],
  after: T[],
  spec: ItemSpec<T>,
): void {
  const { doc } = ctx;
  const beforeById = new Map(before.map((b) => [b.id, b]));
  const afterIds = new Set(after.map((a) => a.id));

  // Deletions
  for (const b of before) {
    if (afterIds.has(b.id)) continue;
    const el = doc.findById(b.id);
    if (el?.parent) {
      el.parent.removeElement(el);
      doc.invalidateIndex();
      ctx.change(`Removed ${b.name}`);
    }
  }

  // Updates
  for (const a of after) {
    const b = beforeById.get(a.id);
    if (!b || same(b, a)) continue;
    const el = doc.findById(a.id);
    if (!el) {
      ctx.warn(`Could not find ${a.name} (ID ${a.id}) in the file; its changes were not saved.`);
      continue;
    }
    const oldIdentities = sectionName === 'SKILLS' ? skillIdentities(el) : [];
    const beforeXml = el.toString();
    spec.update(ctx, el, b, a);
    writeCommonFields(ctx, el, b, a);
    // Editors also recompute derived values (costs, display names); only real XML edits count
    if (el.toString() !== beforeXml) {
      ctx.touch(topLevelItem(el, sectionName), sectionName);
      ctx.change(`Updated ${a.name}`);
    }

    const unhandled = changedKeys(b, a).filter(
      (k) => !spec.handled.has(k) && !spec.derived.has(k) && !COMMON_FIELDS.has(k),
    );
    for (const field of unhandled) {
      ctx.warn(`${a.name}: changes to "${field}" are not saved to the HDC file.`);
    }
    if (sectionName === 'SKILLS') {
      for (const note of rebindRequiresARoll(doc, oldIdentities, el)) ctx.change(note);
    }
    const nestedBefore = spec.nested?.(b);
    const nestedAfter = spec.nested?.(a);
    if (nestedBefore || nestedAfter) {
      const withParent = (items: Power[] | undefined, parentId: string) =>
        (items ?? []).map((p) => ({ ...p, parentId: p.parentId ?? parentId }));
      reconcileItems(ctx, sectionName, withParent(nestedBefore, b.id), withParent(nestedAfter, a.id), POWER_SPEC);
    }
  }

  // Creations, parents before children so PARENTIDs resolve
  const createdItems = orderParentsFirst(after.filter((a) => !beforeById.has(a.id)));
  for (const a of createdItems) {
    const section = doc.ensureSection(sectionName);
    const el = spec.create(ctx, a, sectionName);
    if ((a as { icon?: string }).icon) setIcon(el, (a as { icon?: string }).icon);
    const multiplier = (a as { multiplier?: number }).multiplier;
    if (multiplier !== undefined && multiplier !== 1) {
      el.setAttr('MULTIPLIER', hdMultiplier(multiplier));
      ctx.multipliersChanged = true;
    }
    const id = doc.nextId();
    el.setAttr('ID', id);
    if (a.id !== id) ctx.report.idMap[a.id] = id;

    const parentId = ctx.resolveId(a.parentId);
    const parentEl = parentId ? doc.findById(parentId) : undefined;
    if (parentEl && nestsChildren(parentEl)) {
      el.removeAttr('PARENTID');
      el.setAttr('POSITION', nextPosition(parentEl));
      parentEl.appendElement(el);
    } else {
      if (parentEl) el.setAttr('PARENTID', parentId!);
      else el.removeAttr('PARENTID');
      if (parentEl?.name === 'MULTIPOWER') el.setAttr('ULTRA_SLOT', yesNo((a as { slotFixed?: boolean }).slotFixed ?? true));
      el.setAttr('POSITION', nextPosition(section));
      section.appendElement(el);
    }
    doc.invalidateIndex();
    ctx.created.add(el);
    ctx.touch(topLevelItem(el, sectionName), sectionName);
    ctx.change(`Added ${a.name}`);

    const nested = spec.nested?.(a);
    if (nested?.length) {
      reconcileItems(ctx, sectionName, [], nested.map((p) => ({ ...p, parentId: a.id })), POWER_SPEC);
    }
  }
}

/** The section-level element that owns `el` (itself, unless nested in a compound) */
function topLevelItem(el: XmlElement, sectionName: string): XmlElement {
  let node = el;
  while (node.parent && node.parent.name !== sectionName) node = node.parent;
  return node.parent ? node : el;
}

function orderParentsFirst<T extends ItemModel>(items: T[]): T[] {
  const ids = new Set(items.map((i) => i.id));
  const placed = new Set<string>();
  const out: T[] = [];
  const visit = (item: T, depth = 0) => {
    if (placed.has(item.id) || depth > items.length) return;
    if (item.parentId && ids.has(item.parentId) && !placed.has(item.parentId)) {
      const parent = items.find((i) => i.id === item.parentId);
      if (parent) visit(parent, depth + 1);
    }
    placed.add(item.id);
    out.push(item);
  };
  items.forEach((i) => visit(i));
  return out;
}

const COMMON_FIELDS = new Set(['parentId', 'position', 'modifiers', 'adders', 'id', 'icon', 'multiplier']);

/** Grouping, ordering, modifiers and adders work the same way for every item type */
function writeCommonFields<T extends ItemModel & { modifiers?: Modifier[]; adders?: Adder[]; icon?: string; multiplier?: number }>(
  ctx: WriteContext,
  el: XmlElement,
  b: T,
  a: T,
): void {
  if (!same(b.position, a.position) && a.position !== undefined) {
    el.setAttr('POSITION', hdInt(a.position));
  }
  if (!same(b.parentId, a.parentId)) {
    const nestedIn = el.parent && el.parent.getAttr('XMLID') !== undefined ? el.parent : undefined;
    const parentId = ctx.resolveId(a.parentId);
    const target = parentId ? ctx.doc.findById(parentId) : undefined;
    if (nestedIn || (target && nestsChildren(target))) {
      ctx.warn(`${a.name}: moving items into or out of compound powers isn't supported yet.`);
    } else if (target) {
      el.setAttr('PARENTID', parentId!);
    } else {
      el.removeAttr('PARENTID');
    }
  }
  if (!same(b.modifiers, a.modifiers)) reconcileModifiers(ctx, el, b.modifiers ?? [], a.modifiers ?? []);
  if (!same(b.adders, a.adders)) reconcileAdders(ctx, el, b.adders ?? [], a.adders ?? []);
  if (!same(b.icon, a.icon)) {
    setIcon(el, a.icon || undefined);
  }
  if (!same(b.multiplier ?? 1, a.multiplier ?? 1)) {
    el.setAttr('MULTIPLIER', hdMultiplier(a.multiplier ?? 1));
    ctx.multipliersChanged = true;
  }
}

/** Hero Designer writes the multiplier as a Java double: "1.0", "0.0", "0.5" */
function hdMultiplier(m: number): string {
  return Number.isInteger(m) ? m.toFixed(1) : String(m);
}

/**
 * Hero Designer only applies cost multipliers when the campaign rules allow them; turn that
 * on in the character's own rules when it has free (or otherwise multiplied) items.
 */
function allowMultipliers(ctx: WriteContext, after: Character): void {
  const all = [...after.skills, ...after.perks, ...after.talents, ...after.martialArts, ...after.powers, ...(after.equipment ?? []),
    ...(after.equipment ?? []).flatMap((e) => e.subPowers ?? [])] as { multiplier?: number }[];
  if (!all.some((i) => (i.multiplier ?? 1) !== 1)) return;
  const rules = ctx.doc.root.firstElement('RULES');
  if (!rules) {
    // No campaign rules in the file: Hero Designer uses its own, which must allow multipliers
    if (ctx.multipliersChanged) {
      ctx.change('Note: in desktop Hero Designer, turn on cost multipliers in the campaign rules so free items count as free');
    }
    return;
  }
  if (rules.getAttr('MULTIPLIERALLOWED') === 'Yes') return;
  rules.setAttr('MULTIPLIERALLOWED', 'Yes');
  ctx.change('Campaign rules: allow cost multipliers (so Hero Designer counts free items as free)');
}

// =============================================================================
// Modifiers and adders
// =============================================================================

function reconcileModifiers(ctx: WriteContext, owner: XmlElement, before: Modifier[], after: Modifier[]): void {
  const direct = owner.elements('MODIFIER');
  const byId = (id: string) => direct.find((m) => m.getAttr('ID') === id);
  const beforeIds = new Set(before.map((m) => m.id));

  // Pair new-looking modifiers with same-XMLID ones that vanished, so an editor that
  // regenerates modifier ids still updates in place instead of dropping unknown attributes
  const unmatchedBefore = before.filter((m) => !after.some((x) => x.id === m.id));
  const pairs = new Map<string, Modifier>();
  for (const a of after) {
    if (beforeIds.has(a.id) || !a.xmlId) continue;
    const index = unmatchedBefore.findIndex(
      (m) => m.xmlId === a.xmlId && (!m.optionId || !a.optionId || m.optionId === a.optionId),
    );
    if (index >= 0) pairs.set(a.id, unmatchedBefore.splice(index, 1)[0]!);
  }

  for (const b of unmatchedBefore) {
    const el = byId(b.id);
    if (el) {
      owner.removeElement(el);
      ctx.change(`Removed modifier ${b.name}`);
    }
  }

  for (const a of after) {
    const b = before.find((m) => m.id === a.id) ?? pairs.get(a.id);
    if (b) {
      if (same(b, { ...a, id: b.id })) continue;
      const el = byId(b.id);
      if (el) updateModifier(ctx, el, b, a);
    } else {
      insertChild(owner, createModifier(ctx, a));
      ctx.change(`Added modifier ${a.name}`);
    }
  }
}

function updateModifier(ctx: WriteContext, el: XmlElement, b: Modifier, a: Modifier): void {
  if (!same(b.xmlId, a.xmlId) && a.xmlId) el.setAttr('XMLID', hdcModifierXmlId(a.xmlId));
  if (!same(b.alias, a.alias)) el.setAttr('ALIAS', a.alias ?? a.name);
  else if (!same(b.name, a.name) && !b.alias) el.setAttr('ALIAS', a.name);
  if (!same(b.levels, a.levels)) el.setAttr('LEVELS', hdInt(a.levels));
  if (!same(b.optionId, a.optionId)) {
    el.setAttr('OPTION', a.optionId ?? '');
    el.setAttr('OPTIONID', a.optionId ?? '');
  }
  if (!same(b.optionAlias, a.optionAlias)) el.setAttr('OPTION_ALIAS', a.optionAlias ?? '');
  if (!same(b.input, a.input)) {
    if (a.input) el.setAttr('INPUT', a.input);
    else el.removeAttr('INPUT');
  }
  if (!same(b.comments, a.comments)) el.setAttr('COMMENTS', a.comments ?? '');
  else if (!same(b.notes, a.notes)) {
    // Modifier "notes" were read from NOTES, falling back to COMMENTS (the Requires A Roll binding)
    if (el.hasAttr('COMMENTS') && !el.firstElement('NOTES')?.text.trim()) el.setAttr('COMMENTS', a.notes ?? '');
    else setNotes(el, a.notes);
  }
  if (!same(b.value, a.value) && same(b.levels, a.levels) && same(b.adders, a.adders)) {
    const def = a.xmlId ? getModifierByXmlId(a.xmlId) : undefined;
    if (def?.hasLevels) {
      ctx.warn(`${a.name}: change the modifier's levels rather than its value.`);
    } else {
      el.setAttr('BASECOST', hdModifierCost(a.value - adderCost(a.adders)));
    }
  }
  if (!same(b.adders, a.adders)) reconcileAdders(ctx, el, b.adders ?? [], a.adders ?? []);
}

function createModifier(ctx: WriteContext, m: Modifier): XmlElement {
  const xmlId = hdcModifierXmlId(m.xmlId);
  const def = m.xmlId ? getModifierByXmlId(m.xmlId) : undefined;
  const base = def?.hasLevels ? (def.baseCost ?? 0) : m.value - adderCost(m.adders);
  const el = createElement('MODIFIER', {
    XMLID: xmlId,
    ID: ctx.doc.nextId(),
    BASECOST: hdModifierCost(base),
    LEVELS: hdInt(m.levels),
    ALIAS: m.alias || m.name,
    POSITION: '-1',
    ...GENERIC_ATTRS,
    OPTION: m.optionId,
    OPTIONID: m.optionId,
    OPTION_ALIAS: m.optionAlias,
    NAME: '',
    INPUT: m.input,
    COMMENTS: m.comments ?? m.notes ?? '',
    PRIVATE: 'No',
    FORCEALLOW: 'No',
  });
  insertChild(el, createElement('NOTES'));
  for (const adder of m.adders ?? []) insertChild(el, createAdder(ctx, adder));
  return el;
}

/** Custom modifiers from the editor use placeholder ids; Hero Designer's is GENERIC_OBJECT */
function hdcModifierXmlId(xmlId: string | undefined): string {
  return !xmlId || xmlId.startsWith('CUSTOM') ? 'GENERIC_OBJECT' : xmlId;
}

function hdModifierCost(value: number): string {
  return Number.isInteger(value) ? value.toFixed(1) : String(value);
}

function adderCost(adders: Adder[] | undefined): number {
  return (adders ?? []).reduce((sum, a) => sum + (a.baseCost ?? 0) + (a.levels ?? 0) * (a.lvlCost ?? 0), 0);
}

/**
 * Adders in the model are flattened (nested ADDERs listed alongside their parents) and
 * unselected ones are omitted, so they're located by ID anywhere in the owner's ADDER tree.
 */
function findAdder(owner: XmlElement, id: string): XmlElement | undefined {
  for (const el of owner.elements('ADDER')) {
    if (el.getAttr('ID') === id) return el;
    const nested = findAdder(el, id);
    if (nested) return nested;
  }
  return undefined;
}

function reconcileAdders(ctx: WriteContext, owner: XmlElement, before: Adder[], after: Adder[]): void {
  const flatBefore = flattenAdders(before);
  const flatAfter = flattenAdders(after);
  const afterIds = new Set(flatAfter.map((a) => a.id));
  const beforeById = new Map(flatBefore.map((a) => [a.id, a]));

  for (const b of flatBefore) {
    if (afterIds.has(b.id)) continue;
    const el = findAdder(owner, b.id);
    if (el?.parent) {
      el.parent.removeElement(el);
      ctx.change(`Removed adder ${b.name}`);
    }
  }

  for (const a of after) {
    reconcileAdder(ctx, owner, beforeById, a);
  }
}

function reconcileAdder(ctx: WriteContext, owner: XmlElement, beforeById: Map<string, Adder>, a: Adder): void {
  const b = beforeById.get(a.id);
  if (!b) {
    insertChild(owner, createAdder(ctx, a));
    ctx.change(`Added adder ${a.name}`);
    return;
  }
  const el = findAdder(owner, a.id);
  if (!el) return;
  if (!same({ ...b, adders: undefined }, { ...a, adders: undefined })) {
    if (!same(b.xmlId, a.xmlId) && a.xmlId) el.setAttr('XMLID', a.xmlId);
    if (!same(b.alias, a.alias)) el.setAttr('ALIAS', a.alias || a.name);
    else if (!same(b.name, a.name)) el.setAttr('ALIAS', a.name);
    if (!same(b.baseCost, a.baseCost)) el.setAttr('BASECOST', hdCost(a.baseCost));
    if (!same(b.levels, a.levels) || !same(b.lvlVal, a.lvlVal)) {
      // The model holds effective levels; the file holds raw LEVELS (effective x LVLVAL)
      el.setAttr('LEVELS', hdInt((a.levels ?? 0) * (a.lvlVal ?? 1)));
      if (a.lvlVal !== undefined) el.setAttr('LVLVAL', String(a.lvlVal));
    }
    if (!same(b.lvlCost, a.lvlCost)) el.setAttr('LVLCOST', String(a.lvlCost ?? 0));
    if (!same(b.optionId, a.optionId)) {
      el.setAttr('OPTION', a.optionId ?? '');
      el.setAttr('OPTIONID', a.optionId ?? '');
    }
    if (!same(b.optionAlias, a.optionAlias)) el.setAttr('OPTION_ALIAS', a.optionAlias ?? '');
    if (!same(b.selected, a.selected)) el.setAttr('SELECTED', a.selected === false ? 'NO' : 'YES');
    if (!same(b.includeInBase, a.includeInBase)) el.setAttr('INCLUDEINBASE', yesNo(a.includeInBase));
    if (!same(b.notes, a.notes)) setNotes(el, a.notes);
  }
  // Hierarchical adders (weapon elements) keep their children in the model
  if (a.adders || b.adders) {
    for (const child of a.adders ?? []) reconcileAdder(ctx, el, beforeById, child);
  }
}

function flattenAdders(adders: Adder[]): Adder[] {
  return adders.flatMap((a) => [a, ...flattenAdders(a.adders ?? [])]);
}

function createAdder(ctx: WriteContext, a: Adder): XmlElement {
  const el = createElement('ADDER', {
    XMLID: !a.xmlId || a.xmlId.startsWith('CUSTOM') ? 'ADDER' : a.xmlId,
    ID: ctx.doc.nextId(),
    BASECOST: hdCost(a.baseCost),
    LEVELS: hdInt((a.levels ?? 0) * (a.lvlVal ?? 1)),
    ALIAS: a.alias || a.name || 'Custom Adder',
    POSITION: '-1',
    ...GENERIC_ATTRS,
    NAME: '',
    LVLCOST: a.lvlCost !== undefined ? String(a.lvlCost) : undefined,
    LVLVAL: a.lvlVal !== undefined ? String(a.lvlVal) : undefined,
    OPTION: a.optionId,
    OPTIONID: a.optionId,
    OPTION_ALIAS: a.optionAlias,
    SHOWALIAS: 'Yes',
    PRIVATE: 'No',
    REQUIRED: 'No',
    INCLUDEINBASE: yesNo(a.includeInBase),
    DISPLAYINSTRING: 'Yes',
    GROUP: 'No',
    SELECTED: a.selected === false ? 'NO' : 'YES',
  });
  insertChild(el, createElement('NOTES'));
  if (a.notes) setNotes(el, a.notes);
  for (const child of a.adders ?? []) insertChild(el, createAdder(ctx, child));
  return el;
}

function appendChildren(ctx: WriteContext, el: XmlElement, item: { modifiers?: Modifier[]; adders?: Adder[]; notes?: string }): void {
  insertChild(el, createElement('NOTES'));
  if (item.notes) setNotes(el, item.notes);
  for (const adder of item.adders ?? []) insertChild(el, createAdder(ctx, adder));
  for (const modifier of item.modifiers ?? []) insertChild(el, createModifier(ctx, modifier));
}

// =============================================================================
// Skills
// =============================================================================

const SKILL_CATALOG_BY_ID = new Map(SKILL_CATALOG_6E.map((s) => [s.xmlId, s]));
const SKILL_CATALOG_BY_DISPLAY = new Map(SKILL_CATALOG_6E.map((s) => [s.display.toLowerCase(), s]));

/** Background-skill prefixes Hero Designer shows as "KS: Arcana" */
const BACKGROUND_PREFIXES: Record<string, string> = {
  KS: 'KNOWLEDGE_SKILL',
  PS: 'PROFESSIONAL_SKILL',
  SS: 'SCIENCE_SKILL',
  AK: 'AREA_KNOWLEDGE',
  CK: 'CITY_KNOWLEDGE',
  TF: 'TRANSPORT_FAMILIARITY',
  WF: 'WEAPON_FAMILIARITY',
};

/** Hero Designer's 6E language fluencies (Main6E.hdt): BASECOST is the option's price */
const LANGUAGE_FLUENCY: Record<string, { cost: number; alias: string }> = {
  BASIC: { cost: 1, alias: 'basic conversation' },
  FLUENT: { cost: 2, alias: 'fluent conversation' },
  ACCENT: { cost: 3, alias: 'completely fluent' },
  IDIOMATIC: { cost: 4, alias: 'idiomatic' },
  DIALECTS: { cost: 5, alias: 'imitate dialects' },
};

export function lookupSkillCatalog(nameOrXmlId: string): SkillCatalogEntry | undefined {
  return SKILL_CATALOG_BY_ID.get(nameOrXmlId) ?? SKILL_CATALOG_BY_DISPLAY.get(nameOrXmlId.trim().toLowerCase());
}

/** Reverses the skill display-name composition in parseSkill */
function writeSkillName(el: XmlElement, name: string): void {
  const alias = el.getAttr('ALIAS') ?? '';
  const nameAttr = el.getAttr('NAME') ?? '';
  const input = el.getAttr('INPUT') ?? '';

  if (nameAttr && nameAttr !== alias) {
    const suffix = `: ${alias}`;
    el.setAttr('NAME', name.endsWith(suffix) ? name.slice(0, -suffix.length) : name);
    return;
  }
  if (input) {
    if (alias in BACKGROUND_PREFIXES) {
      el.setAttr('INPUT', name.replace(new RegExp(`^${alias}:\\s*`), '').trim());
      return;
    }
    if (alias === 'Language') {
      let value = name.replace(/^Language:\s*/, '').replace(/\s*\[Native\]$/, '');
      const optionAlias = el.getAttr('OPTION_ALIAS');
      if (optionAlias && value.endsWith(` (${optionAlias})`)) value = value.slice(0, -(optionAlias.length + 3));
      el.setAttr('INPUT', value.trim());
      return;
    }
    if (input !== alias) {
      el.setAttr('INPUT', name);
      return;
    }
  }
  // Displayed by its rules label: a different name becomes a custom NAME ("Sneaking: Stealth")
  if (name !== alias) el.setAttr('NAME', name);
}

const SKILL_SPEC: ItemSpec<Skill> = {
  handled: new Set([
    'name', 'alias', 'levels', 'characteristic', 'proficiency', 'familiarity', 'everyman',
    'nativeTongue', 'option', 'optionAlias', 'notes', 'xmlid', 'roll', 'input', 'customName',
  ]),
  derived: new Set(['baseCost', 'realCost', 'activeCost', 'type', 'categories', 'display', 'textOutput', 'isGroup', 'isEnhancer', 'enhancerType', 'isEverymanGroup', 'levelCost', 'abbreviation', 'bindingName']),

  update(_ctx, el, b, a) {
    if (a.isGroup || a.isEnhancer) {
      if (!same(b.name, a.name)) el.setAttr(el.getAttr('ALIAS') || a.isEnhancer ? 'ALIAS' : 'NAME', a.name);
      else if (!same(b.alias, a.alias)) el.setAttr('ALIAS', a.alias ?? '');
      if (!same(b.notes, a.notes)) setNotes(el, a.notes);
      return;
    }
    const xmlId = a.xmlid ?? el.getAttr('XMLID') ?? '';
    if (!same(b.xmlid, a.xmlid) && a.xmlid) {
      el.setAttr('XMLID', a.xmlid);
      const choices = lookupSkillCatalog(a.xmlid)?.characteristicChoices ?? [];
      const choice = choices.find((c) => c.characteristic === (a.characteristic ?? el.getAttr('CHARACTERISTIC'))) ?? choices[0];
      if (choice) el.setAttr('BASECOST', hdCost(choice.baseCost));
    }
    if (!same(b.alias, a.alias) && a.alias) el.setAttr('ALIAS', a.alias);
    if (LABELLED_SKILL_XMLIDS.includes(xmlId)) {
      // Labelled skills (PS, KS, SS, Power, ...) carry their custom NAME explicitly; the display name is derived
      if (!same(b.customName, a.customName)) el.setAttr('NAME', a.customName ?? '');
      else if (!same(b.name, a.name) && !same(b.alias, a.alias)) {
        // Relabelled: the derived name follows; nothing else to write
      } else if (!same(b.name, a.name) && (el.getAttr('ALIAS') ?? '') in BACKGROUND_PREFIXES) writeSkillName(el, a.name);
    } else if (!same(b.name, a.name)) writeSkillName(el, a.name);
    // Editors that don't carry `input` leave it undefined; only an explicit value is an edit
    if (!same(b.input, a.input) && a.input) el.setAttr('INPUT', a.input);
    if (!same(b.levels, a.levels)) el.setAttr('LEVELS', hdInt(a.levels));
    // The editor defaults characteristic to INT; only write it for characteristic-based skills
    if (!same(b.characteristic, a.characteristic) && a.characteristic
      && (el.hasAttr('CHARACTERISTIC') || lookupSkillCatalog(xmlId)?.characteristicChoices)) {
      el.setAttr('CHARACTERISTIC', a.characteristic);
    }
    if (!same(b.proficiency, a.proficiency)) el.setAttr('PROFICIENCY', yesNo(a.proficiency));
    if (!same(b.familiarity, a.familiarity)) {
      el.setAttr('FAMILIARITY', yesNo(a.familiarity));
      // Hero Designer writes a familiarity's BASECOST as 0, and the skill's own base otherwise
      const choices = lookupSkillCatalog(xmlId)?.characteristicChoices ?? [];
      const base = choices.find((c) => c.characteristic === el.getAttr('CHARACTERISTIC'))?.baseCost ?? choices[0]?.baseCost;
      if (a.familiarity && !a.proficiency) el.setAttr('BASECOST', '0.0');
      else if (base !== undefined) el.setAttr('BASECOST', hdCost(base));
    }
    if (!same(b.everyman, a.everyman)) el.setAttr('EVERYMAN', yesNo(a.everyman));
    if (!same(b.nativeTongue, a.nativeTongue)) el.setAttr('NATIVE_TONGUE', yesNo(a.nativeTongue));
    if (!same(b.option, a.option)) {
      el.setAttr('OPTION', a.option ?? '');
      el.setAttr('OPTIONID', a.option ?? '');
      const fluency = xmlId === 'LANGUAGES' ? LANGUAGE_FLUENCY[a.option ?? ''] : undefined;
      if (fluency) {
        el.setAttr('BASECOST', hdCost(fluency.cost));
        el.setAttr('OPTION_ALIAS', fluency.alias);
      }
    }
    if (!same(b.optionAlias, a.optionAlias) && !(xmlId === 'LANGUAGES' && LANGUAGE_FLUENCY[a.option ?? ''])) el.setAttr('OPTION_ALIAS', a.optionAlias ?? '');
    if (!same(b.notes, a.notes)) setNotes(el, a.notes);
    // ROLL is stored only for custom skills; elsewhere it is derived
    if (!same(b.roll, a.roll) && el.hasAttr('ROLL') && a.roll !== undefined) el.setAttr('ROLL', hdInt(a.roll));
  },

  create(ctx, s) {
    if (s.isGroup) {
      const el = createElement('LIST', {
        XMLID: 'GENERIC_OBJECT', ID: '', BASECOST: '0.0', LEVELS: '0', ALIAS: s.name, POSITION: '0',
        ...GENERIC_ATTRS, NAME: '',
      });
      appendChildren(ctx, el, s);
      return el;
    }
    if (s.isEnhancer && s.enhancerType) {
      const cat = SKILL_ENHANCER_CATALOG_6E.find((e) => e.xmlId === s.enhancerType);
      const el = createElement(s.enhancerType, {
        XMLID: s.enhancerType, ID: '', BASECOST: hdCost(cat?.baseCost ?? 3), LEVELS: '0',
        ALIAS: cat?.display ?? s.name, POSITION: '0', ...GENERIC_ATTRS, NAME: '',
      });
      appendChildren(ctx, el, s);
      return el;
    }

    const parsed = parseNewSkillName(s.name);
    if (s.input) parsed.input = s.input;
    const xmlId = s.xmlid || parsed.xmlId || lookupSkillCatalog(s.name)?.xmlId || 'CUSTOMSKILL';
    const cat = lookupSkillCatalog(xmlId);
    const choices = cat?.characteristicChoices ?? [];
    const choice =
      choices.find((c) => c.characteristic === s.characteristic) ??
      (parsed.input ? choices.find((c) => c.characteristic === 'GENERAL') : undefined) ??
      choices[0];
    const isCustom = xmlId === 'CUSTOMSKILL';
    const fluency = xmlId === 'LANGUAGES' ? LANGUAGE_FLUENCY[s.option ?? 'FLUENT'] : undefined;
    const alias = isCustom ? s.alias || s.name : parsed.alias ?? s.alias ?? cat?.display ?? s.name;
    // A custom name displays as "Name: ALIAS" (see parseSkill); strip that back to NAME
    const bareName = s.name.endsWith(`: ${alias}`) ? s.name.slice(0, -(alias.length + 2)) : s.name;
    const composed = parsed.input !== undefined && bareName === s.name;
    const customName = LABELLED_SKILL_XMLIDS.includes(xmlId)
      ? (s.customName ?? (!composed && bareName !== alias ? bareName : ''))
      : !isCustom && !composed && bareName !== alias && bareName !== cat?.display ? bareName : '';

    const el = createElement('SKILL', {
      XMLID: xmlId,
      ID: '',
      // A familiarity has no base cost of its own (Hero Designer writes 0; hero6e prices from it)
      BASECOST: hdCost(isCustom ? s.baseCost : s.familiarity && !s.proficiency ? 0 : (fluency?.cost ?? choice?.baseCost ?? cat?.baseCost ?? 0)),
      LEVELS: hdInt(s.levels),
      ALIAS: alias,
      POSITION: '0',
      ...GENERIC_ATTRS,
      NAME: customName,
      INPUT: parsed.input,
      CHARACTERISTIC: choice?.characteristic ?? (isCustom ? s.characteristic ?? 'GENERAL' : undefined),
      FAMILIARITY: yesNo(s.familiarity),
      PROFICIENCY: yesNo(s.proficiency),
      LEVELSONLY: 'No',
      EVERYMAN: s.everyman ? 'Yes' : undefined,
      OPTION: s.option ?? (fluency ? 'FLUENT' : undefined),
      OPTIONID: s.option ?? (fluency ? 'FLUENT' : undefined),
      OPTION_ALIAS: fluency?.alias ?? s.optionAlias,
      NATIVE_TONGUE: s.nativeTongue ? 'Yes' : undefined,
      ROLL: isCustom && s.roll ? hdInt(s.roll) : undefined,
    });
    appendChildren(ctx, el, s);
    if (!cat && !isCustom) ctx.warn(`${s.name}: unknown skill XMLID ${xmlId}; Hero Designer may drop it.`);
    return el;
  },
};

function parseNewSkillName(name: string): { xmlId?: string; alias?: string; input?: string } {
  // Returned object is mutated by the caller
  const bg = /^(KS|PS|SS|AK|CK|TF|WF):\s*(.+)$/.exec(name.trim());
  if (bg) return { xmlId: BACKGROUND_PREFIXES[bg[1]!], alias: bg[1], input: bg[2]!.trim() };
  const lang = /^Language:\s*(.+?)(\s*\(.*\))?(\s*\[Native\])?$/.exec(name.trim());
  if (lang) return { xmlId: 'LANGUAGES', alias: 'Language', input: lang[1]!.trim() };
  return {};
}

// =============================================================================
// Powers
// =============================================================================

const POWER_DERIVED = new Set([
  'baseCost', 'activeCost', 'realCost', 'endCost', 'effectDice', 'levelCost', 'range', 'duration',
  'target', 'defense', 'doesDamage', 'doesKnockback', 'killing', 'standardEffect', 'isContainer',
  'display', 'textOutput', 'framework', 'type', 'abbreviation', 'isPower', 'isEquipment', 'inputLabel',
  'ownCost',
]);

function isCustomPowerElement(el: XmlElement): boolean {
  const xmlId = el.getAttr('XMLID') ?? '';
  return xmlId === 'CUSTOMPOWER' || !getPowerDefinition(xmlId);
}

function updatePowerFields(ctx: WriteContext, el: XmlElement, b: Power, a: Power): void {
  const isList = el.name === 'LIST' || isFramework(el.name);
  if (!same(b.name, a.name)) {
    if (isFramework(el.name)) {
      // A framework's ALIAS is its kind ("Multipower"); its name is NAME
      el.setAttr('NAME', a.name === FRAMEWORK_NAMES[el.name] ? '' : a.name);
    } else if (isList) {
      el.setAttr(el.getAttr('NAME') ? 'NAME' : 'ALIAS', a.name);
    } else {
      // Unnamed powers display their ALIAS/XMLID; keep NAME empty unless the name is custom
      const alias = el.getAttr('ALIAS') ?? '';
      const def = getPowerDefinition(el.getAttr('XMLID') ?? '');
      const isDefault = !el.getAttr('NAME') && (a.name === alias || a.name === def?.display);
      if (!isDefault) el.setAttr('NAME', a.name);
    }
  }
  if (!same(b.alias, a.alias) && !isList) el.setAttr('ALIAS', a.alias ?? '');
  if (!same(b.type, a.type) && a.type !== 'GENERIC' && a.type !== 'LIST') {
    el.setAttr('XMLID', a.type);
    if (isCharacteristicTag(a.type) || isCharacteristicTag(el.name)) {
      el.name = isCharacteristicTag(a.type) ? a.type : 'POWER';
    }
    ctx.warn(`${a.name}: power type changed from ${b.type} to ${a.type}; review it in Hero Designer.`);
  }
  if (!same(b.levels, a.levels) && el.getAttr('XMLID') !== 'CUSTOMPOWER') el.setAttr('LEVELS', hdInt(a.levels));
  // A Multipower's reserve
  if (el.name === 'MULTIPOWER' && !same(b.baseCost, a.baseCost)) el.setAttr('BASECOST', hdCost(a.baseCost ?? 0));
  writeSlotType(el, b, a);
  // Editors that don't carry `input` leave it undefined; only an explicit value is an edit
  if (!same(b.input, a.input) && a.input) el.setAttr('INPUT', a.input);
  if (!same(b.option, a.option)) {
    el.setAttr('OPTION', a.option ?? '');
    el.setAttr('OPTIONID', a.option ?? '');
    // Options with their own price (a sense modifier's scope) set the base cost Hero Designer stores
    const optionCost = a.type ? getPowerDefinition(a.type)?.options?.find((o) => o.xmlId === a.option)?.baseCost : undefined;
    if (optionCost !== undefined) el.setAttr('BASECOST', hdCost(optionCost));
  }
  if (!same(b.optionAlias, a.optionAlias)) el.setAttr('OPTION_ALIAS', a.optionAlias ?? '');
  if (!same(b.affectsPrimary, a.affectsPrimary)) el.setAttr('AFFECTS_PRIMARY', yesNo(a.affectsPrimary ?? true));
  if (!same(b.affectsTotal, a.affectsTotal)) el.setAttr('AFFECTS_TOTAL', yesNo(a.affectsTotal ?? true));
  // Parsed notes fall back to ALIAS; only a note distinct from the alias is a real NOTES edit
  if (!same(b.notes, a.notes) && a.notes !== a.alias) setNotes(el, a.notes);
  if (!same(b.baseCost, a.baseCost) && isCustomPowerElement(el) && !isList && el.getAttr('XMLID') !== 'COMPOUNDPOWER') {
    const cost = a.baseCost - adderCost(a.adders);
    el.setAttr('BASECOST', hdCost(cost));
    // Hero Designer's custom power: LEVELS is its cost rounded up (CustomPower.getLevels)
    if (el.getAttr('XMLID') === 'CUSTOMPOWER') el.setAttr('LEVELS', hdInt(Math.ceil(cost)));
  }
  writeBarrierFields(el, b, a);
}

function writeBarrierFields(el: XmlElement, b: Partial<Power>, a: Partial<Power>): void {
  // The model holds total dimensions; HDC holds levels above the 1m x 1m x 0.5m base
  const fields: [keyof Power, string, number][] = [
    ['pdLevels', 'PDLEVELS', 0],
    ['edLevels', 'EDLEVELS', 0],
    ['mdLevels', 'MDLEVELS', 0],
    ['powdLevels', 'POWDLEVELS', 0],
    ['bodyLevels', 'BODYLEVELS', 0],
    ['lengthLevels', 'LENGTHLEVELS', 1],
    ['heightLevels', 'HEIGHTLEVELS', 1],
    ['widthLevels', 'WIDTHLEVELS', 0.5],
  ];
  for (const [field, attr, base] of fields) {
    if (!same(b[field], a[field]) && a[field] !== undefined) {
      el.setAttr(attr, String(Math.max(0, (a[field] as number) - base)));
    }
  }
}

/** A Multipower slot's type: fixed (ULTRA_SLOT="Yes") or variable */
function writeSlotType(el: XmlElement, b: { slotFixed?: boolean }, a: { slotFixed?: boolean }): void {
  if (!same(!!b.slotFixed, !!a.slotFixed)) el.setAttr('ULTRA_SLOT', yesNo(!!a.slotFixed));
}

function createPower(ctx: WriteContext, p: Power, section: HdcItemSection): XmlElement {
  if (isFramework(p.type)) {
    const el = createElement(p.type, {
      XMLID: 'GENERIC_OBJECT', ID: '',
      // A Multipower's reserve, a Variable Power Pool's pool
      BASECOST: hdCost(p.type === 'MULTIPOWER' ? (p.baseCost ?? 0) : 0),
      LEVELS: hdInt(p.type === 'VPP' ? (p.levels ?? 0) : 0),
      ALIAS: FRAMEWORK_NAMES[p.type], POSITION: '0',
      ...GENERIC_ATTRS, NAME: p.name === FRAMEWORK_NAMES[p.type] ? '' : p.name,
    });
    appendChildren(ctx, el, p);
    return el;
  }
  if (p.type === 'LIST') {
    const el = createElement('LIST', {
      XMLID: 'GENERIC_OBJECT', ID: '', BASECOST: '0.0', LEVELS: '0', ALIAS: p.name, POSITION: '0',
      ...GENERIC_ATTRS, NAME: '',
    });
    appendChildren(ctx, el, p);
    return el;
  }

  const knownDef = getPowerDefinition(p.type);
  const xmlId = p.type === 'COMPOUNDPOWER' ? 'COMPOUNDPOWER' : knownDef ? p.type : 'CUSTOMPOWER';
  const def = knownDef ?? getPowerDefinition(xmlId);
  const isCustom = xmlId === 'CUSTOMPOWER';
  const alias = xmlId === 'COMPOUNDPOWER' ? 'Compound Power' : isCustom ? (p.alias ?? p.name) : (p.alias || def?.display || xmlId);
  const name = isCustom || p.name === alias || p.name === def?.display ? (isCustom ? p.name : '') : p.name;
  const option = def?.options?.find((o) => o.xmlId === p.option);

  const el = createElement(isCharacteristicTag(xmlId) ? xmlId : 'POWER', {
    XMLID: xmlId,
    ID: '',
    BASECOST: hdCost(isCustom ? p.baseCost - adderCost(p.adders) : (option?.baseCost ?? def?.baseCost ?? 0)),
    // Hero Designer's custom power: LEVELS is its cost rounded up (CustomPower.getLevels)
    LEVELS: hdInt(isCustom ? Math.ceil(p.baseCost - adderCost(p.adders)) : p.levels),
    ALIAS: alias,
    POSITION: '0',
    ...GENERIC_ATTRS,
    NAME: name,
    INPUT: p.input || ATTACK_DEFENSE_DEFAULTS[xmlId],
    OPTION: p.option,
    OPTIONID: p.option,
    OPTION_ALIAS: p.optionAlias ?? option?.display,
    USESTANDARDEFFECT: 'No',
    QUANTITY: '1',
    AFFECTS_PRIMARY: yesNo(p.affectsPrimary ?? true),
    AFFECTS_TOTAL: yesNo(p.affectsTotal ?? true),
    // Explicit damage flags keep Foundry from inferring undefined model fields
    DOESBODY: yesNo(def?.doesBody ?? p.doesDamage ?? false),
    DOESDAMAGE: yesNo(def?.doesDamage ?? p.doesDamage ?? false),
    DOESKNOCKBACK: yesNo(def?.doesKnockback ?? p.doesKnockback ?? false),
    KILLING: yesNo(def?.isKilling ?? p.killing ?? false),
    ...(section === 'EQUIPMENT' ? { PRICE: '0.0', WEIGHT: '0.0', CARRIED: 'Yes' } : {}),
    ...(isCustom
      ? {
          DEFENSE: 'NORMAL', END: 'No', VISIBLE: 'Yes', RANGE: 'YES', DURATION: 'INHERENT',
          TARGET: 'DCV', ENDCOLUMNOUTPUT: '', USECUSTOMENDCOLUMN: 'No',
        }
      : {}),
  });
  if (xmlId === 'FORCEWALL') writeBarrierFields(el, {}, p);
  appendChildren(ctx, el, p);
  return el;
}

const POWER_SPEC: ItemSpec<Power> = {
  handled: new Set([
    'name', 'alias', 'levels', 'input', 'option', 'optionAlias', 'affectsPrimary', 'affectsTotal', 'notes', 'slotFixed',
    'pdLevels','edLevels', 'mdLevels', 'powdLevels', 'bodyLevels', 'lengthLevels', 'heightLevels', 'widthLevels',
  ]),
  derived: POWER_DERIVED,
  update: updatePowerFields,
  create: createPower,
};

// =============================================================================
// Equipment
// =============================================================================

const EQUIPMENT_SPEC: ItemSpec<Equipment> = {
  handled: new Set([
    'name', 'levels', 'notes', 'price', 'weight', 'carried', 'subPowers',
    'input', 'option', 'optionAlias', 'affectsPrimary', 'affectsTotal', 'slotFixed',
  ]),
  derived: new Set([...POWER_DERIVED, 'alias', 'xmlId']),
  nested: (e) => e.subPowers,

  update(_ctx, el, b, a) {
    if (!same(b.name, a.name)) el.setAttr('NAME', a.name);
    if (!same(b.levels, a.levels)) el.setAttr('LEVELS', hdInt(a.levels));
    if (el.name === 'MULTIPOWER' && !same(b.baseCost, a.baseCost)) el.setAttr('BASECOST', hdCost(a.baseCost ?? 0));
    writeSlotType(el, b, a);
    if (!same(b.notes, a.notes)) setNotes(el, a.notes);
    if (!same(b.price, a.price)) el.setAttr('PRICE', hdCost(a.price));
    // Weight: kilograms in the model, pounds in the file
    if (!same(b.weight, a.weight)) el.setAttr('WEIGHT', String((a.weight ?? 0) / 0.453592));
    if (!same(b.carried, a.carried)) el.setAttr('CARRIED', yesNo(a.carried ?? true));
    const bp = b as Equipment & Partial<Power>;
    const ap = a as Equipment & Partial<Power>;
    if (!same(bp.input, ap.input) && ap.input) el.setAttr('INPUT', ap.input);
    if (!same(bp.option, ap.option)) {
      el.setAttr('OPTION', ap.option ?? '');
      el.setAttr('OPTIONID', ap.option ?? '');
    }
    if (!same(bp.optionAlias, ap.optionAlias)) el.setAttr('OPTION_ALIAS', ap.optionAlias ?? '');
    if (!same(bp.affectsPrimary, ap.affectsPrimary)) el.setAttr('AFFECTS_PRIMARY', yesNo(ap.affectsPrimary ?? true));
    if (!same(bp.affectsTotal, ap.affectsTotal)) el.setAttr('AFFECTS_TOTAL', yesNo(ap.affectsTotal ?? true));
  },

  create(ctx, e, section) {
    const el = createPower(
      ctx,
      { ...e, type: (e.xmlId || (e.subPowers?.length ? 'COMPOUNDPOWER' : 'CUSTOMPOWER')) as Power['type'], alias: undefined },
      section,
    );
    el.setAttr('NAME', e.name);
    el.setAttr('PRICE', hdCost(e.price));
    el.setAttr('WEIGHT', String((e.weight ?? 0) / 0.453592));
    el.setAttr('CARRIED', yesNo(e.carried ?? true));
    return el;
  },
};

// =============================================================================
// Perks, talents, complications, martial arts
// =============================================================================

/** Editor type names that differ from Hero Designer's XMLIDs */
const PERK_XMLIDS: Record<string, string> = {
  BASE: 'VEHICLE_BASE',
  VEHICLE: 'VEHICLE_BASE',
  POSITIVE_REPUTATION: 'REPUTATION',
  GENERIC: 'CUSTOMPERK',
};

const TALENT_XMLIDS: Record<string, string> = {
  LIGHTNING_REFLEXES: 'LIGHTNING_REFLEXES_ALL',
  OFF_HAND_DEFENSE: 'OFFHANDDEFENSE',
  GENERIC: 'CUSTOMTALENT',
};

const DISAD_XMLIDS: Record<string, string> = {
  ACCIDENTAL_CHANGE: 'ACCIDENTALCHANGE',
  DEPENDENT_NPC: 'DEPENDENTNPC',
  DISTINCTIVE_FEATURES: 'DISTINCTIVEFEATURES',
  NEGATIVE_REPUTATION: 'REPUTATION',
  PHYSICAL_COMPLICATION: 'PHYSICALLIMITATION',
  PSYCHOLOGICAL_COMPLICATION: 'PSYCHOLOGICALLIMITATION',
  SOCIAL_COMPLICATION: 'SOCIALLIMITATION',
  GENERIC: 'GENERICDISADVANTAGE',
};

const catalogIndex = (entries: CatalogEntry[]) => new Map(entries.map((e) => [e.xmlId, e]));
const PERK_CATALOG = catalogIndex(PERK_CATALOG_6E);
const TALENT_CATALOG = catalogIndex(TALENT_CATALOG_6E);
const DISAD_CATALOG = catalogIndex(DISADVANTAGE_CATALOG_6E);

function adderElement(ctx: WriteContext, adder: CatalogAdder, optionIndex = 0): XmlElement {
  const option = adder.options?.[optionIndex];
  const el = createElement('ADDER', {
    XMLID: adder.xmlId,
    ID: ctx.doc.nextId(),
    BASECOST: hdCost(option?.baseCost ?? adder.baseCost),
    LEVELS: '0',
    ALIAS: adder.display,
    POSITION: '-1',
    ...GENERIC_ATTRS,
    NAME: '',
    OPTION: option?.xmlId,
    OPTIONID: option?.xmlId,
    OPTION_ALIAS: option?.display,
    SHOWALIAS: 'Yes',
    PRIVATE: 'No',
    REQUIRED: 'Yes',
    INCLUDEINBASE: yesNo(adder.includeInBase),
    DISPLAYINSTRING: 'Yes',
    GROUP: 'No',
    SELECTED: 'YES',
  });
  insertChild(el, createElement('NOTES'));
  return el;
}

const adderElementCost = (el: XmlElement) => Number(el.getAttr('BASECOST')) || 0;

/**
 * Adds the template's required adders that a new item lacks (Foundry needs e.g. OCCUR on a
 * Social Complication to build its roll). With `targetPoints`, the first priced required
 * adder is set to the option that brings the item closest to that total.
 */
function addRequiredAdders(
  ctx: WriteContext,
  el: XmlElement,
  entry: CatalogEntry | undefined,
  label: string,
  targetPoints?: number,
): number {
  const present = new Set(el.elements('ADDER').map((a) => a.getAttr('XMLID')));
  const added: { adder: CatalogAdder; el: XmlElement }[] = [];
  for (const adder of entry?.adders ?? []) {
    if (!adder.required || present.has(adder.xmlId)) continue;
    const adderEl = insertChild(el, adderElement(ctx, adder));
    added.push({ adder, el: adderEl });
  }
  if (!added.length) return 0;

  const choosing = added.filter(({ adder }) => (adder.options?.length ?? 0) > 1);
  if (targetPoints !== undefined && choosing.length) {
    // The options (across all the required adders) that add up closest to the points, preferring
    // ones the text names ("Uncommon", "1 1/2x BODY") and then the template's first choices
    const others = el.elements('ADDER').reduce((sum, a) => sum + adderElementCost(a), 0) - choosing.reduce((s, c) => s + adderElementCost(c.el), 0);
    const text = label.toLowerCase();
    const named = (o: CatalogOption) => [o.display, o.alias].some((d) => d && text.includes(d.replace(/^\(/, '').toLowerCase()));
    let best: { picks: CatalogOption[]; miss: number; score: number } | undefined;
    const search = (i: number, picks: CatalogOption[], sum: number, score: number, budget: { left: number }) => {
      if (budget.left-- <= 0) return;
      if (i === choosing.length) {
        const miss = Math.abs(targetPoints - others - sum);
        if (!best || miss < best.miss || (miss === best.miss && score < best.score)) best = { picks: [...picks], miss, score };
        return;
      }
      choosing[i]!.adder.options!.forEach((o, rank) => {
        search(i + 1, [...picks, o], sum + (o.baseCost ?? 0), score + (named(o) ? 0 : 100) + rank, budget);
      });
    };
    search(0, [], 0, 0, { left: 20000 });
    best?.picks.forEach((option, i) => {
      const fit = choosing[i]!;
      fit.el.setAttr('BASECOST', hdCost(option.baseCost ?? fit.adder.baseCost));
      fit.el.setAttr('OPTION', option.xmlId);
      fit.el.setAttr('OPTIONID', option.xmlId);
      fit.el.setAttr('OPTION_ALIAS', option.alias ?? option.display);
    });
  }
  ctx.change(`${label}: added required ${added.map((a) => a.adder.display).join(', ')}`);
  return el.elements('ADDER').reduce((sum, a) => sum + adderElementCost(a), 0);
}

function genericItem(tag: string, xmlId: string, item: { name: string; alias?: string; levels?: number; baseCost?: number }, extra: Record<string, string | undefined> = {}): XmlElement {
  return createElement(tag, {
    XMLID: xmlId,
    ID: '',
    BASECOST: hdCost(item.baseCost),
    LEVELS: hdInt(item.levels),
    ALIAS: item.alias || item.name,
    POSITION: '0',
    ...GENERIC_ATTRS,
    NAME: '',
    ...extra,
  });
}

function listElement(ctx: WriteContext, item: { name: string; notes?: string; adders?: Adder[]; modifiers?: Modifier[] }): XmlElement {
  const el = createElement('LIST', {
    XMLID: 'GENERIC_OBJECT', ID: '', BASECOST: '0.0', LEVELS: '0', ALIAS: item.name, POSITION: '0',
    ...GENERIC_ATTRS, NAME: '',
  });
  appendChildren(ctx, el, item);
  return el;
}

function writeGroupName(el: XmlElement, name: string): void {
  el.setAttr(el.getAttr('NAME') ? 'NAME' : 'ALIAS', name);
}

const PERK_SPEC: ItemSpec<Perk> = {
  handled: new Set(['name', 'alias', 'levels', 'notes']),
  derived: new Set(['baseCost', 'realCost', 'activeCost', 'type', 'isGroup']),
  update(ctx, el, b, a) {
    if (!same(b.name, a.name)) {
      const xmlId = el.getAttr('XMLID');
      if (a.isGroup) writeGroupName(el, a.name);
      else if (xmlId === 'CONTACT') {
        const m = /Contact:\s+(.*?)\s+\d+-$/.exec(a.name.trim());
        el.setAttr(el.getAttr('INPUT') ? 'INPUT' : 'NAME', (m ? m[1]! : a.name).trim());
      } else if (xmlId === 'REPUTATION' || xmlId === 'VEHICLE_BASE') {
        ctx.warn(`${a.name}: rename this perk in Hero Designer; its name is composed from several fields.`);
      } else el.setAttr('NAME', a.name);
    }
    if (!same(b.alias, a.alias) && a.alias) el.setAttr('ALIAS', a.alias);
    if (!same(b.levels, a.levels)) el.setAttr('LEVELS', hdInt(a.levels));
    if (!same(b.notes, a.notes)) setNotes(el, a.notes);
  },
  create(ctx, p) {
    if (p.isGroup) return listElement(ctx, p);
    const xmlId = PERK_XMLIDS[p.type] ?? p.type;
    const entry = PERK_CATALOG.get(xmlId);
    // ALIAS is the perk's label ("Contact"); the name is the contact (INPUT) or the perk's own NAME
    const label = entry?.display ?? p.alias ?? p.name;
    const named = p.name && p.name !== label && p.name !== p.alias ? p.name : '';
    const el = genericItem('PERK', xmlId, { ...p, alias: xmlId === 'CUSTOMPERK' ? p.alias || p.name : label });
    if (xmlId === 'CUSTOMPERK') el.setAttr('NAME', p.name);
    else if (xmlId === 'CONTACT') {
      el.setAttr('INPUT', named);
      // A Contact costs its levels (its roll) plus its adders; a bare cost becomes levels
      el.setAttr('BASECOST', '0.0');
      if (!p.levels) el.setAttr('LEVELS', hdInt(Math.max(1, (p.baseCost ?? 1) - adderCost(p.adders))));
    }
    else if (named) el.setAttr('NAME', named);
    // A Base, Vehicle or Follower costs 1 per 5 of its points (Hero Designer reads BASEPOINTS)
    if (xmlId === 'VEHICLE_BASE' || xmlId === 'FOLLOWER') {
      el.setAttr('BASECOST', '0.0');
      el.setAttr('NAME', p.name === label ? '' : p.name);
      el.setAttr('NUMBER', '1');
      el.setAttr('BASEPOINTS', String(Math.round((p.baseCost ?? 0) * 5)));
      el.setAttr('DISADPOINTS', '0');
    }
    appendChildren(ctx, el, p);
    addRequiredAdders(ctx, el, PERK_CATALOG.get(xmlId), p.name);
    if (!PERK_CATALOG.has(xmlId)) ctx.warn(`${p.name}: unknown perk type ${xmlId}; Hero Designer may drop it.`);
    return el;
  },
};

const TALENT_SPEC: ItemSpec<Talent> = {
  handled: new Set(['name', 'alias', 'levels', 'notes', 'characteristic']),
  derived: new Set(['baseCost', 'realCost', 'activeCost', 'type', 'isGroup']),
  update(_ctx, el, b, a) {
    if (!same(b.name, a.name)) {
      if (a.isGroup) writeGroupName(el, a.name);
      else el.setAttr('ALIAS', a.name);
    }
    if (!same(b.levels, a.levels)) el.setAttr('LEVELS', hdInt(a.levels));
    if (!same(b.notes, a.notes)) setNotes(el, a.notes);
    if (!same(b.characteristic, a.characteristic) && a.characteristic) el.setAttr('CHARACTERISTIC', a.characteristic);
  },
  create(ctx, t) {
    if (t.isGroup) return listElement(ctx, t);
    const xmlId = TALENT_XMLIDS[t.type] ?? t.type;
    // A custom talent's cost is its LEVELS (as Hero Designer writes them)
    const custom = xmlId === 'CUSTOMTALENT';
    const el = genericItem('TALENT', xmlId, custom ? { ...t, baseCost: 0, levels: t.baseCost } : t, { CHARACTERISTIC: t.characteristic, ...(custom ? { ROLL: '0' } : {}) });
    appendChildren(ctx, el, t);
    addRequiredAdders(ctx, el, TALENT_CATALOG.get(xmlId), t.name);
    if (!TALENT_CATALOG.has(xmlId)) ctx.warn(`${t.name}: unknown talent type ${xmlId}; Hero Designer may drop it.`);
    return el;
  },
};

/**
 * The complication's detail text (Hero Designer's INPUT). The web editor keeps it in
 * `alias` for new complications and `name` for parsed ones, with a type label in the other.
 */
function complicationDetail(d: Disadvantage, entry: CatalogEntry | undefined): string {
  const typeWords = (d.type ?? '').replace(/_/g, ' ').toLowerCase();
  const isLabel = (value: string | undefined) => {
    const v = value?.trim().toLowerCase() ?? '';
    return !v || v === entry?.display.toLowerCase() || v === typeWords || v === 'complication';
  };
  if (!isLabel(d.alias)) return d.alias!.trim();
  if (!isLabel(d.name)) return d.name.trim();
  return '';
}

const DISAD_SPEC: ItemSpec<Disadvantage> = {
  handled: new Set(['name', 'alias', 'notes', 'input']),
  // The editor has no levels field but stamps levels: 1 on save; LEVELS is Unluck's dice
  derived: new Set(['baseCost', 'realCost', 'activeCost', 'points', 'type', 'category', 'levels']),
  update(ctx, el, b, a) {
    const entry = DISAD_CATALOG.get(el.getAttr('XMLID') ?? '');
    if (!same(b.alias, a.alias) && complicationDetail({ ...a, name: '' }, entry)) {
      el.setAttr('INPUT', complicationDetail({ ...a, name: '' }, entry));
    } else if (!same(b.name, a.name)) {
      // Display name is "INPUT (adder options)"; strip the options back off
      const options = el.elements('ADDER').map((x) => x.getAttr('OPTION_ALIAS')).filter(Boolean).join('; ').replace(/[()]/g, '');
      let input = a.name;
      if (options && input.endsWith(` (${options})`)) input = input.slice(0, -(options.length + 3));
      else if (options && input === options) input = '';
      el.setAttr(el.getAttr('INPUT') || !el.getAttr('NAME') ? 'INPUT' : 'NAME', input);
    }
    if (!same(b.notes, a.notes)) setNotes(el, a.notes);
    if (!same(b.points, a.points) && same(b.adders, a.adders)) {
      ctx.warn(`${a.name}: complication points come from its option adders; change those instead.`);
    }
  },
  create(ctx, d) {
    const xmlId = (d.category && DISAD_CATALOG.has(d.category) ? d.category : undefined) ?? DISAD_XMLIDS[d.type] ?? d.type;
    const entry = DISAD_CATALOG.get(xmlId);
    const detail = complicationDetail(d, entry);
    const el = genericItem('DISAD', xmlId, { name: detail || d.name, alias: entry?.display ?? d.name, baseCost: 0, levels: 0 }, { INPUT: detail });
    appendChildren(ctx, el, d);
    // Complication points live in the option adders; make them add up to what the user chose
    const target = d.points || d.baseCost || 0;
    const adderPoints = addRequiredAdders(ctx, el, entry, detail || d.name, target);
    const remainder = target - adderPoints;
    if (remainder > 0) el.setAttr('BASECOST', hdCost(remainder));
    else if (remainder < 0) ctx.warn(`${detail || d.name}: its required options total ${adderPoints} points, more than the ${target} chosen; adjust them in Hero Designer.`);
    if (!entry) ctx.warn(`${d.name}: unknown complication type ${xmlId}; Hero Designer may drop it.`);
    return el;
  },
};

/**
 * A custom maneuver's effect as Hero Designer's template writes it, with the damage tokens
 * hero6e rolls: "[NORMALDC] Strike", "[KILLINGDC]", "Grab Two Limbs, [STRDC] for holding on"
 */
export function maneuverEffect(text: string | undefined): string {
  const effect = (text ?? '').trim();
  if (!effect || effect.includes('[')) return effect;
  const killing = /^(HKA|killing(\s+(strike|attack))?)\b\s*(\+?\d+\s*DCs?\b)?\s*[;,]?\s*/i.exec(effect);
  if (killing) {
    const rest = effect.slice(killing[0].length);
    return rest ? `[KILLINGDC], ${rest}` : '[KILLINGDC]';
  }
  if (/^(\+?v\/\d+\s+)?strike\b/i.test(effect)) return `[NORMALDC] ${effect}`;
  if (/^grab\b/i.test(effect)) return `${effect}, [STRDC] for holding on`;
  return effect;
}

const MANEUVER_SPEC: ItemSpec<MartialManeuver> = {
  handled: new Set(['name', 'alias', 'ocv', 'dcv', 'phase', 'dc', 'notes', 'levels', 'effectText']),
  derived: new Set(['baseCost', 'realCost', 'activeCost', 'effect', 'damage', 'isGroup', 'isWeaponElement', 'weaponElements']),
  update(ctx, el, b, a) {
    if (!same(b.name, a.name)) {
      if (a.isGroup) writeGroupName(el, a.name);
      else if (a.isWeaponElement) ctx.warn(`${a.name}: weapon element names come from their selected weapons.`);
      else el.setAttr('ALIAS', a.name);
    }
    const signed = (n: number) => (n >= 0 ? `+${n}` : String(n));
    if (!same(b.ocv, a.ocv)) el.setAttr('OCV', signed(a.ocv));
    if (!same(b.dcv, a.dcv)) el.setAttr('DCV', signed(a.dcv));
    if (!same(b.phase, a.phase) && a.phase) el.setAttr('PHASE', a.phase);
    if (!same(b.dc, a.dc)) el.setAttr('DC', hdInt(a.dc));
    if (!same(b.levels, a.levels)) el.setAttr('LEVELS', hdInt(a.levels));
    if (!same(b.notes, a.notes)) setNotes(el, a.notes);
    if (!same(b.effectText, a.effectText)) {
      const effect = maneuverEffect(a.effectText);
      el.setAttr('EFFECT', effect);
      if (el.hasAttr('WEAPONEFFECT') || el.getAttr('CUSTOM') === 'Yes') el.setAttr('WEAPONEFFECT', effect);
    }
  },
  create(ctx, m) {
    if (m.isGroup) return listElement(ctx, m);
    const signed = (n: number) => (n >= 0 ? `+${n}` : String(n));
    const effect = maneuverEffect(m.effectText);
    // Hero Designer's custom maneuver; hero6e can't draw a maneuver without its CATEGORY
    const el = genericItem('MANEUVER', 'MANEUVER', m, {
      CUSTOM: 'Yes',
      CATEGORY: 'Hand to Hand',
      DISPLAY: 'Custom Maneuver',
      OCV: signed(m.ocv),
      DCV: signed(m.dcv),
      DC: hdInt(m.dc),
      PHASE: m.phase ?? '1/2',
      EFFECT: effect,
      ADDSTR: 'Yes',
      ACTIVECOST: '0',
      DAMAGETYPE: '0',
      MAXSTR: '0',
      STRMULT: '1',
      USEWEAPON: 'No',
      WEAPONEFFECT: effect,
    });
    appendChildren(ctx, el, m);
    return el;
  },
};

// Exported for tests
export const __testing = { same, normalize, writeSkillName, parseNewSkillName, itemLabel };
