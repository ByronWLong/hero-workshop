#!/usr/bin/env node
/**
 * Generates the Hero Designer 6e catalogs in src/generated/ from Main6E.hdt:
 *   skillCatalog6e.ts - skills and skill enhancers
 *   catalog6e.ts      - powers, modifiers, perks, talents and complications
 *
 * The template is the canonical source for XMLIDs, display names, costs, options and
 * adders. The editor merges these under its hand-written definitions (which win), and the
 * HDC writer uses them to emit Hero Designer/Foundry-compatible new items.
 *
 * Usage: node scripts/generate-catalogs.mjs [path/to/Main6E.hdt]
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';

const here = dirname(fileURLToPath(import.meta.url));
const templatePath =
  process.argv[2] ?? resolve(here, '../../../java/Hero Designer Source Code/template/Main6E.hdt');
const outDir = resolve(here, '../src/generated');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  preserveOrder: true,
  parseAttributeValue: false,
});
const tree = parser.parse(readFileSync(templatePath, 'utf8'));

// -----------------------------------------------------------------------------
// preserveOrder tree helpers
// -----------------------------------------------------------------------------

const tagOf = (node) => Object.keys(node).find((k) => k !== ':@');
const children = (node) => {
  const key = tagOf(node);
  return key && Array.isArray(node[key]) ? node[key] : [];
};
const elements = (node, tag) => children(node).filter((n) => tagOf(n) !== '#text' && (!tag || tagOf(n) === tag));
const attrsOf = (node) => node[':@'] ?? {};
const textOf = (node) =>
  children(node)
    .map((c) => c['#text'] ?? '')
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
const num = (value) => {
  if (value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};
const bool = (value) => (value === undefined ? undefined : /^yes$/i.test(value));
/** Drops undefined/empty values so the generated source stays compact */
const compact = (obj) =>
  Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)),
  );

const template = tree.find((n) => tagOf(n) === 'TEMPLATE');
const sectionOf = (name) => elements(template, name)[0];

// -----------------------------------------------------------------------------
// Entry extraction
// -----------------------------------------------------------------------------

function option(node) {
  const a = attrsOf(node);
  const xmlId = a.XMLID ?? tagOf(node);
  return compact({
    xmlId,
    display: a.DISPLAY || xmlId,
    alias: a.ALIAS,
    baseCost: num(a.BASECOST),
    lvlCost: num(a.LVLCOST),
    lvlVal: num(a.LVLVAL),
    levelStart: num(a.LEVELSTART),
    // Adders only this option offers (Area Of Effect's Accurate is for a Radius only)
    adders: elements(node, 'ADDER').map(adder),
  });
}

function adder(node) {
  const a = attrsOf(node);
  const xmlId = a.XMLID ?? tagOf(node);
  return compact({
    xmlId,
    display: a.DISPLAY || xmlId,
    baseCost: num(a.BASECOST) ?? 0,
    lvlCost: num(a.LVLCOST),
    lvlVal: num(a.LVLVAL),
    lvlPower: num(a.LVLPOWER),
    minVal: num(a.MINVAL),
    maxVal: num(a.MAXVAL),
    levelStart: num(a.LEVELSTART),
    exclusive: bool(a.EXCLUSIVE),
    required: bool(a.REQUIRED),
    includeInBase: bool(a.INCLUDEINBASE),
    options: elements(node, 'OPTION').map(option),
    excludes: elements(node, 'EXCLUDES').map(textOf),
    requires: elements(node, 'REQUIRES').map(textOf),
  });
}

/** Sense modifiers are priced by what they apply to: all senses, a sense group or one sense */
function scopeCosts(a) {
  const costs = compact({ all: num(a.ALLCOST), group: num(a.GROUPCOST), sense: num(a.SENSECOST) });
  return Object.keys(costs).length ? costs : undefined;
}

function entry(node) {
  const a = attrsOf(node);
  const tag = tagOf(node);
  return compact({
    xmlId: a.XMLID ?? tag,
    display: a.DISPLAY || tag,
    abbreviation: a.ABBREVIATION,
    description: elements(node, 'DEFINITION').map(textOf).join(' ') || undefined,
    baseCost: num(a.BASECOST),
    lvlCost: num(a.LVLCOST),
    lvlVal: num(a.LVLVAL),
    lvlPower: num(a.LVLPOWER),
    minVal: num(a.MINVAL),
    maxVal: num(a.MAXVAL),
    levelStart: num(a.LEVELSTART),
    minCost: num(a.MINCOST),
    maxCost: num(a.MAXCOST),
    scopeCosts: scopeCosts(a),
    exclusive: bool(a.EXCLUSIVE ?? a.EXLUSIVE),
    isLimitation: bool(a.ISLIMITATION),
    inputLabel: a.INPUTLABEL,
    // Suggested values for the input (Hero Designer's drop-down), and whether others may be typed
    inputExamples: elements(node, 'EXAMPLE').map(textOf),
    otherInput: bool(a.OTHERINPUT),
    optionLabel: a.OPTIONLABEL,
    duration: a.DURATION,
    range: a.RANGE,
    target: a.TARGET,
    defense: a.DEFENSE,
    usesEnd: bool(a.USESEND),
    visible: bool(a.VISIBLE),
    standardEffectAllowed: bool(a.STANDARDEFFECTALLOWED),
    continuingEffect: bool(a.CONTINUINGEFFECT),
    doesDamage: bool(a.DOESDAMAGE),
    doesKnockback: bool(a.DOESKNOCKBACK),
    doesBody: bool(a.DOESBODY),
    killing: bool(a.KILLING),
    warningSign: bool(a.WARNSIGN),
    types: elements(node, 'TYPE').map(textOf),
    excludes: elements(node, 'EXCLUDES').map(textOf),
    requires: elements(node, 'REQUIRES').map(textOf),
    // Senses and sense groups: the sense modifiers they have built in, the group a sense is in,
    // whether it may be in another, and whether it's Active (and may be made Passive)
    provides: elements(node, 'PROVIDES').map(textOf),
    isSenseGroup: tag === 'SENSEGROUP' || undefined,
    senseGroup: a.SENSEGROUP,
    allowAnyGroup: bool(a.ALLOWANYGROUP),
    active: bool(a.ACTIVE),
    activeSelect: bool(a.ACTIVESELECT),
    options: elements(node, 'OPTION').map(option),
    adders: elements(node, 'ADDER').map(adder),
    // Modifiers only this power can take (e.g. Hand-To-Hand Attack's mandatory limitation)
    modifiers: elements(node, 'MODIFIER').map(entry),
  });
}

const entries = (sectionName) =>
  elements(sectionOf(sectionName)).map(entry).filter((e) => e.xmlId);

// -----------------------------------------------------------------------------
// Skills (kept in their own file; the writer's skill creation reads it)
// -----------------------------------------------------------------------------

/** A skill's subjects (Weapon Familiarity's weapon groups, Survival's environments), with any they group */
function skillAdder(node) {
  const a = attrsOf(node);
  return compact({
    xmlId: a.XMLID ?? tagOf(node),
    display: a.DISPLAY || a.XMLID,
    baseCost: num(a.BASECOST) ?? 0,
    maxCost: num(a.MAXCOST),
    adders: elements(node, 'ADDER').map(skillAdder),
  });
}

const skills = elements(sectionOf('SKILLS')).map((node) => {
  const a = attrsOf(node);
  const choices = elements(node, 'CHARACTERISTIC_CHOICE')
    .flatMap((n) => elements(n, 'ITEM'))
    .map((i) => {
      const c = attrsOf(i);
      return {
        characteristic: c.CHARACTERISTIC,
        baseCost: num(c.BASECOST) ?? 0,
        lvlCost: num(c.LVLCOST) ?? 0,
        lvlVal: num(c.LVLVAL) ?? 1,
      };
    });
  return compact({
    xmlId: a.XMLID ?? tagOf(node),
    display: a.DISPLAY ?? tagOf(node),
    inputLabel: a.INPUTLABEL,
    familiarityCost: num(a.FAMILIARITYCOST),
    baseCost: num(a.BASECOST),
    lvlCost: num(a.LVLCOST),
    characteristicChoices: choices.length ? choices : undefined,
    // Breadth options priced per level (Combat/Skill Levels: single attack, HTH, all...)
    options: elements(node, 'OPTION').length ? elements(node, 'OPTION').map(option) : undefined,
    // Languages' one adder (literacy) has its own field
    adders: tagOf(node) === 'LANGUAGES' ? undefined : elements(node, 'ADDER').map(skillAdder),
  });
});

const enhancers = elements(sectionOf('SKILL_ENHANCERS'), 'ENHANCER').map((n) => {
  const a = attrsOf(n);
  return { xmlId: a.XMLID, display: a.DISPLAY, baseCost: num(a.BASECOST) ?? 3 };
});

// -----------------------------------------------------------------------------
// Output
// -----------------------------------------------------------------------------

const banner = `/**
 * GENERATED by scripts/generate-catalogs.mjs from Hero Designer's Main6E.hdt.
 * Do not edit by hand; re-run the generator instead.
 */
`;
const json = (value) => JSON.stringify(value, null, 2);

mkdirSync(outDir, { recursive: true });

writeFileSync(
  resolve(outDir, 'skillCatalog6e.ts'),
  `${banner}
export interface SkillCatalogChoice {
  characteristic: string;
  baseCost: number;
  lvlCost: number;
  lvlVal: number;
}

export interface SkillCatalogEntry {
  xmlId: string;
  display: string;
  inputLabel?: string;
  familiarityCost?: number;
  baseCost?: number;
  lvlCost?: number;
  characteristicChoices?: SkillCatalogChoice[];
  options?: SkillCatalogOption[];
  /** Subjects bought with the skill (weapon groups, environments, animals) */
  adders?: SkillCatalogAdder[];
}

export interface SkillCatalogAdder {
  xmlId: string;
  display: string;
  baseCost: number;
  /** A group's members together cost no more than the group */
  maxCost?: number;
  /** The group's members, bought one by one instead of the whole group */
  adders?: SkillCatalogAdder[];
}

export interface SkillCatalogOption {
  xmlId: string;
  display: string;
  alias?: string;
  baseCost?: number;
  lvlCost?: number;
  lvlVal?: number;
}

export interface SkillEnhancerCatalogEntry {
  xmlId: string;
  display: string;
  baseCost: number;
}

export const SKILL_CATALOG_6E: SkillCatalogEntry[] = ${json(skills)};

export const SKILL_ENHANCER_CATALOG_6E: SkillEnhancerCatalogEntry[] = ${json(enhancers)};
`,
);

// -----------------------------------------------------------------------------
// Characteristics per template: Main6E's list with each template's REMOVEs and overrides
// -----------------------------------------------------------------------------

const templateDir = dirname(templatePath);
const readTemplate = (file) => {
  const doc = parser.parse(readFileSync(resolve(templateDir, file), 'utf8'));
  return doc.find((n) => tagOf(n) === 'TEMPLATE');
};

function characteristicEntry(node, fallback = {}) {
  const a = attrsOf(node);
  return {
    xmlId: tagOf(node),
    display: a.DISPLAY ?? fallback.display ?? tagOf(node),
    base: num(a.BASE) ?? fallback.base ?? 0,
    lvlCost: num(a.LVLCOST) ?? fallback.lvlCost ?? 1,
    lvlVal: num(a.LVLVAL) ?? fallback.lvlVal ?? 1,
  };
}

const mainCharacteristics = elements(elements(template, 'CHARACTERISTICS')[0])
  .filter((n) => tagOf(n) !== 'REMOVE')
  .map((n) => characteristicEntry(n));

const templateCharacteristics = {};
for (const file of ['Main6E.hdt', 'Heroic6E.hdt', 'Superheroic6E.hdt', 'Vehicle6E.hdt', 'Base6E.hdt', 'Computer6E.hdt', 'Automaton6E.hdt', 'AI6E.hdt']) {
  const t = file === 'Main6E.hdt' ? template : readTemplate(file);
  const section = elements(t, 'CHARACTERISTICS')[0];
  let list = mainCharacteristics.map((c) => ({ ...c }));
  for (const node of section ? elements(section) : []) {
    if (tagOf(node) === 'REMOVE') {
      const id = textOf(node);
      list = list.filter((c) => c.xmlId !== id);
      continue;
    }
    const index = list.findIndex((c) => c.xmlId === tagOf(node));
    if (index >= 0) list[index] = characteristicEntry(node, list[index]);
    else list.push(characteristicEntry(node));
  }
  templateCharacteristics[`builtIn.${file}`] = list;
}

function withHeroicModifiers(main) {
  const known = new Set(main.map((e) => e.xmlId));
  const heroic = elements(elements(readTemplate('Heroic6E.hdt'), 'MODIFIERS')[0]).map(entry).filter((e) => e.xmlId && !known.has(e.xmlId));
  return [...main, ...heroic];
}

const catalogs = {
  POWER_CATALOG_6E: entries('POWERS'),
  // Main6E's modifiers plus the Heroic template's weapon and armor ones (Real Weapon, STR Minimum, ...)
  MODIFIER_CATALOG_6E: withHeroicModifiers(entries('MODIFIERS')),
  PERK_CATALOG_6E: entries('PERKS'),
  TALENT_CATALOG_6E: entries('TALENTS'),
  DISADVANTAGE_CATALOG_6E: entries('DISADVANTAGES'),
};

writeFileSync(
  resolve(outDir, 'catalog6e.ts'),
  `${banner}
export interface CatalogOption {
  xmlId: string;
  display: string;
  alias?: string;
  baseCost?: number;
  lvlCost?: number;
  lvlVal?: number;
  levelStart?: number;
  /** Adders only this option offers (Area Of Effect's Accurate is for a Radius only) */
  adders?: CatalogAdder[];
}

export interface CatalogAdder {
  xmlId: string;
  display: string;
  baseCost: number;
  lvlCost?: number;
  lvlVal?: number;
  /** The level multiplies rather than adds ("x[LVL] Shots": 2 to the levels) */
  lvlPower?: number;
  minVal?: number;
  maxVal?: number;
  levelStart?: number;
  exclusive?: boolean;
  required?: boolean;
  includeInBase?: boolean;
  options?: CatalogOption[];
  excludes?: string[];
  /** Adders that must be taken with this one (Usable On Others' Grantor controls needs Grantor pays END) */
  requires?: string[];
}

/** A power, modifier, perk, talent or complication as defined by the Hero Designer template */
export interface CatalogEntry {
  xmlId: string;
  display: string;
  abbreviation?: string;
  description?: string;
  baseCost?: number;
  lvlCost?: number;
  lvlVal?: number;
  lvlPower?: number;
  minVal?: number;
  maxVal?: number;
  levelStart?: number;
  minCost?: number;
  maxCost?: number;
  /** Sense modifiers: the cost (per level, if leveled) for all senses, a sense group or a single sense */
  scopeCosts?: { all?: number; group?: number; sense?: number };
  exclusive?: boolean;
  /** Powers: modifiers only this power can take */
  modifiers?: CatalogEntry[];
  /** Explicit on the few modifiers whose sign doesn't tell */
  isLimitation?: boolean;
  inputLabel?: string;
  /** Hero Designer's suggested values for the input ("PD", "ED" for an attack's "Vs.") */
  inputExamples?: string[];
  /** Whether values other than the examples may be typed */
  otherInput?: boolean;
  optionLabel?: string;
  duration?: string;
  range?: string;
  target?: string;
  defense?: string;
  usesEnd?: boolean;
  visible?: boolean;
  standardEffectAllowed?: boolean;
  continuingEffect?: boolean;
  doesDamage?: boolean;
  doesKnockback?: boolean;
  doesBody?: boolean;
  killing?: boolean;
  warningSign?: boolean;
  types?: string[];
  excludes?: string[];
  requires?: string[];
  /** Senses and sense groups: the sense modifiers built in (RANGE, MAKEASENSE, TARGETINGSENSE...) */
  provides?: string[];
  /** A sense group (Sight Group...), rather than a power */
  isSenseGroup?: boolean;
  /** A sense's group (SIGHTGROUP, UNUSUALGROUP...), and whether it may be bought in another */
  senseGroup?: string;
  allowAnyGroup?: boolean;
  /** Whether a sense is Active (Radar, Detect), and whether that can be changed */
  active?: boolean;
  activeSelect?: boolean;
  options?: CatalogOption[];
  adders?: CatalogAdder[];
}

${Object.entries(catalogs)
  .map(([name, list]) => `export const ${name}: CatalogEntry[] = ${json(list)};\n`)
  .join('\n')}
export interface TemplateCharacteristic {
  xmlId: string;
  display: string;
  base: number;
  lvlCost: number;
  lvlVal: number;
}

/** Characteristics each built-in 6e template provides, in Hero Designer's order */
export const TEMPLATE_CHARACTERISTICS_6E: Record<string, TemplateCharacteristic[]> = ${json(templateCharacteristics)};
`,
);

console.log(
  `Wrote ${skills.length} skills, ${enhancers.length} enhancers, ` +
    Object.entries(catalogs)
      .map(([name, list]) => `${list.length} ${name.replace('_CATALOG_6E', '').toLowerCase()}s`)
      .join(', '),
);
