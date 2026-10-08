import { LABELLED_SKILL_XMLIDS, skillItemName } from './foundry.js';
/**
 * HDC -> Character view-model parsing.
 *
 * Ported from the old web app's backend parser. The parse functions below still consume the
 * fast-xml-parser object shape ("@_ATTR" keys, repeated children as arrays); `toParserObject`
 * produces that shape from the lossless XML tree so the parsing rules are unchanged, but
 * attribute values now stay as their exact source strings and every model `id` is the
 * element's real HDC ID (see HdcDocument.ensureIds).
 */

import type {
  Character,
  BasicConfiguration,
  CharacterInfo,
  Characteristic,
  Skill,
  Perk,
  Talent,
  MartialManeuver,
  Power,
  Disadvantage,
  Equipment,
  Modifier,
  Adder,
  Rules,
  CharacteristicType,
} from '../types.js';
import { calculateActiveCost, calculateRealCost, generateId, heroRoundCost } from '../utils.js';
import { TALENT_CATALOG_6E } from '../generated/catalog6e.js';
import { SKILL_CATALOG_6E } from '../generated/skillCatalog6e.js';
import { skillLevelCost } from '../skillLevels.js';

const SKILL_CATALOG_BY_ID = new Map(SKILL_CATALOG_6E.map((s) => [s.xmlId, s]));
import { getPowerDefinition } from '../powerDefinitions.js';
import { NND, aoeValue, clampModifierValue, getModifierByXmlId, isNnd } from '../modifierDefinitions.js';
import {
  CHARACTERISTIC_RULES_6E,
  characteristicCost,
  characteristicRulesFor,
  parseRulesName,
  type CharacteristicRule,
} from '../characteristics.js';
import { HdcDocument, getIcon } from './document.js';
import { FRAMEWORK_NAMES, FRAMEWORK_TYPES, frameworkOwnCost, inheritedSlotLimitations, isFramework, slotCost } from '../frameworks.js';
import type { XmlElement } from './xml.js';

type ParserObject = Record<string, unknown>;

/** Converts an element to the object shape the parse functions expect */
function toParserObject(el: XmlElement): ParserObject | string {
  const children = el.elements();
  if (el.attrs.length === 0 && children.length === 0) return el.text;

  const obj: ParserObject = {};
  for (const attr of el.attrs) obj[`@_${attr.name}`] = attr.value;
  for (const child of children) {
    const value = toParserObject(child);
    const existing = obj[child.name];
    if (existing === undefined) obj[child.name] = value;
    else if (Array.isArray(existing)) existing.push(value);
    else obj[child.name] = [existing, value];
  }
  if (children.length === 0) {
    const text = el.text.trim();
    if (text) obj['#text'] = text;
  }
  return obj;
}

/** Parses HDC XML text into the Character view model */
export function parseHdcFile(xmlContent: string): Character {
  const doc = HdcDocument.parse(xmlContent);
  doc.ensureIds();
  return parseHdcDocument(doc);
}

/**
 * Parses an HdcDocument into the Character view model. Call `doc.ensureIds()` first so
 * every model object can be traced back to its element.
 */
export function parseHdcDocument(doc: HdcDocument): Character {
  return withIcons(parseDocument(doc), doc);
}

/** Custom icons (FOUNDRY_ICON) and cost multipliers (MULTIPLIER), read from each item element */
function withIcons(character: Character, doc: HdcDocument): Character {
  const icon = <T extends { id: string; icon?: string; multiplier?: number; subPowers?: T[] }>(item: T): T => {
    const el = doc.findById(item.id);
    const value = el ? getIcon(el) : undefined;
    const multiplier = Number(el?.getAttr('MULTIPLIER') ?? '1');
    const subPowers = item.subPowers?.map(icon);
    const hasMultiplier = Number.isFinite(multiplier) && multiplier !== 1;
    return value || subPowers || hasMultiplier
      ? { ...item, ...(value ? { icon: value } : {}), ...(hasMultiplier ? { multiplier } : {}), ...(subPowers ? { subPowers } : {}) }
      : item;
  };
  return {
    ...character,
    skills: character.skills.map(icon),
    perks: character.perks.map(icon),
    talents: character.talents.map(icon),
    martialArts: character.martialArts.map(icon),
    powers: character.powers.map(icon),
    disadvantages: character.disadvantages.map(icon),
    equipment: character.equipment?.map(icon),
  };
}

function parseDocument(doc: HdcDocument): Character {
  const rootEl = doc.root;
  const root = toParserObject(rootEl) as ParserObject;
  const section = (name: string) => root[name] as ParserObject | undefined;

  const characterInfo = parseCharacterInfo(section('CHARACTER_INFO') ?? {});
  const imageObj = root.IMAGE as ParserObject | string | undefined;
  const image = imageObj && typeof imageObj === 'object' ? imageObj : undefined;

  const rules = parseRules(section('RULES') ?? root);
  const hdcTemplate = getAttr(root, 'TEMPLATE') || undefined;

  return {
    version: getAttr(root, 'version', '6.0'),
    basicConfiguration: parseBasicConfiguration(section('BASIC_CONFIGURATION') ?? section('RULES') ?? {}),
    characterInfo,
    characteristics: parseCharacteristics(section('CHARACTERISTICS') ?? {}, rules?.characteristicMaxima, hdcTemplate),
    skills: parseSkillsList(root.SKILLS),
    perks: parsePerksList(root.PERKS),
    talents: parseTalentsList(root.TALENTS),
    martialArts: parseMartialArtsList(root.MARTIALARTS),
    powers: parsePowersList(root.POWERS),
    disadvantages: parseDisadvantagesList(root.DISADVANTAGES),
    equipment: parseEquipmentList(root.EQUIPMENT),
    image: image
      ? {
          data: String(image['#text'] ?? ''),
          fileName: getAttr(image, 'FileName'),
          filePath: getAttr(image, 'FilePath'),
        }
      : undefined,
    rules,
    hdcTemplate,
  };
}

// ============================================================================
// Parsing Helpers
// ============================================================================

function getAttr(obj: Record<string, unknown>, name: string, defaultValue: string = ''): string {
  const value = obj[`@_${name}`] ?? obj[name];
  return value !== undefined ? String(value) : defaultValue;
}

function getAttrNum(obj: Record<string, unknown>, name: string, defaultValue: number = 0): number {
  const value = obj[`@_${name}`] ?? obj[name];
  if (value === undefined) return defaultValue;
  const num = Number(value);
  return isNaN(num) ? defaultValue : num;
}

function getAttrBool(obj: Record<string, unknown>, name: string, defaultValue: boolean = false): boolean {
  const value = obj[`@_${name}`] ?? obj[name];
  if (value === undefined) return defaultValue;
  if (typeof value === 'boolean') return value;
  return String(value).toLowerCase().startsWith('y') || value === 'true' || value === '1';
}

function parseBasicConfiguration(obj: Record<string, unknown>): BasicConfiguration {
  return {
    basePoints: getAttrNum(obj, 'BASE_POINTS') || getAttrNum(obj, 'BASEPOINTS', 175),
    disadPoints: getAttrNum(obj, 'DISAD_POINTS') || getAttrNum(obj, 'DISADPOINTS', 100),
    experience: getAttrNum(obj, 'EXPERIENCE', 0),
    exportTemplate: getAttr(obj, 'EXPORT_TEMPLATE') || undefined,
  };
}

function parseCharacterInfo(obj: Record<string, unknown>): CharacterInfo {
  // HDC files store height in inches and weight in lbs - convert to metric for display
  const heightInches = getAttrNum(obj, 'HEIGHT');
  const weightLbs = getAttrNum(obj, 'WEIGHT');
  
  return {
    characterName: getAttr(obj, 'CHARACTER_NAME') || getAttr(obj, 'CHARACTERNAME', 'New Character'),
    alternateIdentities: getAttr(obj, 'ALTERNATE_IDENTITIES') || getAttr(obj, 'ALTERNATEIDS') || undefined,
    playerName: getAttr(obj, 'PLAYER_NAME') || getAttr(obj, 'PLAYERNAME') || undefined,
    height: heightInches ? Math.round(heightInches * 2.54) : undefined, // inches to cm
    weight: weightLbs ? Math.round(weightLbs * 0.453592) : undefined, // lbs to kg
    hairColor: getAttr(obj, 'HAIR_COLOR') || getAttr(obj, 'HAIRCOLOR') || undefined,
    eyeColor: getAttr(obj, 'EYE_COLOR') || getAttr(obj, 'EYECOLOR') || undefined,
    campaignName: getAttr(obj, 'CAMPAIGN_NAME') || getAttr(obj, 'CAMPAIGNNAME') || undefined,
    genre: getAttr(obj, 'GENRE') || undefined,
    gm: getAttr(obj, 'GM') || getAttr(obj, 'GAMEMASTER') || undefined,
    background: extractTextContent(obj, 'BACKGROUND'),
    personality: extractTextContent(obj, 'PERSONALITY'),
    quote: extractTextContent(obj, 'QUOTE'),
    tactics: extractTextContent(obj, 'TACTICS'),
    campaignUse: extractTextContent(obj, 'CAMPAIGN_USE') || extractTextContent(obj, 'CAMPAIGNUSE'),
    appearance: extractTextContent(obj, 'APPEARANCE'),
    notes1: extractTextContent(obj, 'NOTES1'),
    notes2: extractTextContent(obj, 'NOTES2'),
    notes3: extractTextContent(obj, 'NOTES3'),
    notes4: extractTextContent(obj, 'NOTES4'),
    notes5: extractTextContent(obj, 'NOTES5'),
  };
}

function extractTextContent(obj: Record<string, unknown>, key: string): string | undefined {
  const element = obj[key];
  if (!element) return undefined;
  if (typeof element === 'string') return element;
  if (typeof element === 'object' && element !== null) {
    const text = (element as Record<string, unknown>)['#text'];
    return text === undefined ? undefined : String(text);
  }
  return undefined;
}

function parseCharacteristics(
  obj: Record<string, unknown>,
  maxima: Rules['characteristicMaxima'] = {},
  template?: string,
): Characteristic[] {
  const templateRules = characteristicRulesFor(template);
  // The template's characteristics in its order, then any others the file has
  const types = [
    ...(Object.keys(templateRules) as CharacteristicType[]),
    ...(Object.keys(CHARACTERISTIC_RULES_6E) as CharacteristicType[]).filter((t) => !(t in templateRules)),
  ];
  const characteristics: Characteristic[] = [];
  for (const type of types) {
    const charData = obj[type];
    if (charData && typeof charData === 'object') {
      const rule = templateRules[type] ?? CHARACTERISTIC_RULES_6E[type];
      characteristics.push(parseCharacteristic(charData as Record<string, unknown>, type, rule, maxima[type]));
    }
  }
  return characteristics;
}

function parseCharacteristic(
  obj: Record<string, unknown>,
  type: CharacteristicType,
  rule: CharacteristicRule,
  maximum?: number,
): Characteristic {
  const levels = getAttrNum(obj, 'LEVELS', 0);
  const baseValue = rule.base;
  const cost = characteristicCost(type, levels, maximum, rule);

  return {
    id: getAttr(obj, 'ID') || generateId(),
    name: getAttr(obj, 'ALIAS') || getAttr(obj, 'NAME', type),
    alias: getAttr(obj, 'ALIAS') || undefined,
    abbreviation: type,
    type,
    position: getAttrNum(obj, 'POSITION', 0),
    levels: levels,
    baseCost: cost,
    realCost: cost,
    baseValue: baseValue,
    totalValue: baseValue + levels,
    affectsPrimary: getAttrBool(obj, 'AFFECTS_PRIMARY', true),
    affectsTotal: getAttrBool(obj, 'AFFECTS_TOTAL', true),
    modifiers: parseModifiers(obj),
    adders: parseAdders(obj),
  };
}

/**
 * Parse SKILLS section - handles SKILL, LIST, and Skill Enhancer elements
 * LIST elements group skills together visually
 * Skill Enhancers (JACK_OF_ALL_TRADES, SCHOLAR, etc.) provide cost discounts to child skills
 */
function parseSkillsList(container: unknown): Skill[] {
  if (!container || typeof container !== 'object') return [];
  const containerObj = container as Record<string, unknown>;
  const allSkillEntries: Skill[] = [];
  
  // Map of parent IDs to their discount values (from LIST adders or skill enhancers)
  const parentDiscounts: Map<string, number> = new Map();
  
  // Skill enhancer types that provide discounts
  const SKILL_ENHANCER_TYPES = [
    'JACK_OF_ALL_TRADES',
    'SCHOLAR', 
    'SCIENTIST',
    'LINGUIST',
    'TRAVELER',
    'WELL_CONNECTED',
  ];
  
  // Parse LIST elements as group headers
  const listElements = containerObj['LIST'];
  if (listElements) {
    const lists = Array.isArray(listElements) ? listElements : [listElements];
    for (const listItem of lists) {
      if (typeof listItem === 'object' && listItem !== null) {
        const list = listItem as Record<string, unknown>;
        const listId = getAttr(list, 'ID', '');
        const listAdders = parseAdders(list);
        const listDiscount = calculateAdderCost(listAdders);
        
        // Store discount for child skills
        if (listId && listDiscount !== 0) {
          parentDiscounts.set(listId, listDiscount);
        }
        
        // Add LIST as a group entry in the skills array
        const groupSkill: Skill = {
          id: listId || generateId(),
          name: getAttr(list, 'ALIAS') || getAttr(list, 'NAME') || 'Skill Group',
          alias: getAttr(list, 'ALIAS') || undefined,
          position: getAttrNum(list, 'POSITION', 0),
          levels: 0,
          baseCost: 0,
          realCost: 0,
          notes: getAttr(list, 'NOTES') || undefined,
          type: 'GENERAL',
          isGroup: true,
          adders: listAdders.length > 0 ? listAdders : undefined,
        };
        allSkillEntries.push(groupSkill);
      }
    }
  }
  
  // Parse Skill Enhancer elements
  for (const enhancerType of SKILL_ENHANCER_TYPES) {
    const enhancerElements = containerObj[enhancerType];
    if (enhancerElements) {
      const enhancers = Array.isArray(enhancerElements) ? enhancerElements : [enhancerElements];
      for (const enhancerItem of enhancers) {
        if (typeof enhancerItem === 'object' && enhancerItem !== null) {
          const enhancer = enhancerItem as Record<string, unknown>;
          const enhancerId = getAttr(enhancer, 'ID', '');
          const baseCost = getAttrNum(enhancer, 'BASECOST', 3);
          
          // Skill enhancers typically give -1 cost discount to child skills
          // The discount is implicit in the enhancer, not stored as an adder
          if (enhancerId) {
            parentDiscounts.set(enhancerId, -1);
          }
          
          // Add as an enhancer entry
          const enhancerSkill: Skill = {
            id: enhancerId || generateId(),
            name: getAttr(enhancer, 'ALIAS') || enhancerType.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase()),
            alias: getAttr(enhancer, 'ALIAS') || undefined,
            position: getAttrNum(enhancer, 'POSITION', 0),
            levels: 0,
            baseCost: baseCost,
            realCost: baseCost,
            notes: getAttr(enhancer, 'NOTES') || undefined,
            type: 'GENERAL',
            isEnhancer: true,
            enhancerType: enhancerType as Skill['enhancerType'],
          };
          allSkillEntries.push(enhancerSkill);
        }
      }
    }
  }
  
  // Parse regular SKILL elements
  const skillElements = containerObj['SKILL'];
  if (skillElements) {
    const arr = Array.isArray(skillElements) ? skillElements : [skillElements];
    for (const item of arr) {
      if (typeof item === 'object' && item !== null) {
        const skill = parseSkill(item as Record<string, unknown>);
        
        // Apply parent discount if this skill belongs to a list or enhancer
        if (skill.parentId && parentDiscounts.has(skill.parentId)) {
          const discount = parentDiscounts.get(skill.parentId)!;
          skill.realCost = Math.max(0, skill.baseCost + discount);
        }
        
        allSkillEntries.push(skill);
      }
    }
  }
  
  // Sort by position to maintain proper display order
  allSkillEntries.sort((a, b) => a.position - b.position);
  
  return allSkillEntries;
}

/**
 * Parse PERKS section - handles PERK and LIST elements
 * LIST elements can contain adders that apply discounts to child perks
 */
function parsePerksList(container: unknown): Perk[] {
  if (!container || typeof container !== 'object') return [];
  const containerObj = container as Record<string, unknown>;
  const perks: Perk[] = [];
  
  // First, collect all LIST elements to get their discounts AND add them as group entries
  const listDiscounts: Map<string, number> = new Map();
  const listElements = containerObj['LIST'];
  if (listElements) {
    const lists = Array.isArray(listElements) ? listElements : [listElements];
    for (const listItem of lists) {
      if (typeof listItem === 'object' && listItem !== null) {
        const list = listItem as Record<string, unknown>;
        const listId = getAttr(list, 'ID', '');
        const listAdders = parseAdders(list);
        const listDiscount = calculateAdderCost(listAdders);
        if (listId && listDiscount !== 0) {
          listDiscounts.set(listId, listDiscount);
        }
        
        // Add LIST as a group entry in the perks array
        const listName = getAttr(list, 'NAME', '') || getAttr(list, 'ALIAS', '') || 'Perk Group';
        perks.push({
          id: listId || generateId(),
          name: listName,
          alias: getAttr(list, 'ALIAS', '') || undefined,
          position: getAttrNum(list, 'POSITION', 0),
          levels: 0,
          baseCost: 0,
          realCost: 0,
          type: 'GENERIC',
          isGroup: true,
          notes: getAttr(list, 'NOTES') || undefined,
          adders: listAdders,
        });
      }
    }
  }
  
  // Now parse all PERKs and apply list discounts if they have a PARENTID
  const perkElements = containerObj['PERK'];
  if (perkElements) {
    const arr = Array.isArray(perkElements) ? perkElements : [perkElements];
    for (const item of arr) {
      if (typeof item === 'object' && item !== null) {
        const perk = parsePerk(item as Record<string, unknown>);
        
        // Apply list discount if this perk belongs to a list
        if (perk.parentId && listDiscounts.has(perk.parentId)) {
          const discount = listDiscounts.get(perk.parentId)!;
          // realCost = activeCost + discount (discount is negative)
          perk.realCost = Math.max(0, perk.baseCost + discount);
        }
        
        perks.push(perk);
      }
    }
  }
  
  return perks;
}

/**
 * Parse TALENTS section
 */
function parseTalentsList(container: unknown): Talent[] {
  if (!container || typeof container !== 'object') return [];
  const containerObj = container as Record<string, unknown>;
  const talents: Talent[] = [];
  
  // First, parse LIST elements as group entries
  const listElements = containerObj['LIST'];
  if (listElements) {
    const lists = Array.isArray(listElements) ? listElements : [listElements];
    for (const listItem of lists) {
      if (typeof listItem === 'object' && listItem !== null) {
        const list = listItem as Record<string, unknown>;
        const listId = getAttr(list, 'ID', '');
        const listName = getAttr(list, 'NAME', '') || getAttr(list, 'ALIAS', '') || 'Talent Group';
        
        talents.push({
          id: listId || generateId(),
          name: listName,
          alias: getAttr(list, 'ALIAS', '') || undefined,
          position: getAttrNum(list, 'POSITION', 0),
          levels: 0,
          baseCost: 0,
          realCost: 0,
          type: 'GENERIC',
          isGroup: true,
          notes: getAttr(list, 'NOTES') || undefined,
        });
      }
    }
  }
  
  const talentElements = containerObj['TALENT'];
  if (talentElements) {
    const arr = Array.isArray(talentElements) ? talentElements : [talentElements];
    for (const item of arr) {
      if (typeof item === 'object' && item !== null) {
        talents.push(parseTalent(item as Record<string, unknown>));
      }
    }
  }
  
  return talents;
}

/**
 * Parse MARTIALARTS section - handles LIST, MANEUVER and WEAPON_ELEMENT elements
 */
function parseMartialArtsList(container: unknown): MartialManeuver[] {
  if (!container || typeof container !== 'object') return [];
  const containerObj = container as Record<string, unknown>;
  const maneuvers: MartialManeuver[] = [];
  
  // First, parse LIST elements (martial arts styles) as group entries
  const listElements = containerObj['LIST'];
  if (listElements) {
    const lists = Array.isArray(listElements) ? listElements : [listElements];
    for (const listItem of lists) {
      if (typeof listItem === 'object' && listItem !== null) {
        const list = listItem as Record<string, unknown>;
        const listId = getAttr(list, 'ID', '');
        const listName = getAttr(list, 'NAME', '') || getAttr(list, 'ALIAS', '') || 'Martial Arts Style';
        
        maneuvers.push({
          id: listId || generateId(),
          name: listName,
          alias: getAttr(list, 'ALIAS', '') || undefined,
          position: getAttrNum(list, 'POSITION', 0),
          levels: 0,
          baseCost: 0,
          realCost: 0,
          ocv: 0,
          dcv: 0,
          isGroup: true,
          notes: getAttr(list, 'NOTES') || undefined,
        });
      }
    }
  }
  
  // Parse MANEUVER elements
  const maneuverElements = containerObj['MANEUVER'];
  if (maneuverElements) {
    const arr = Array.isArray(maneuverElements) ? maneuverElements : [maneuverElements];
    for (const item of arr) {
      if (typeof item === 'object' && item !== null) {
        maneuvers.push(parseMartialManeuver(item as Record<string, unknown>));
      }
    }
  }
  
  // Parse WEAPON_ELEMENT entries (these have costs too)
  const weaponElements = containerObj['WEAPON_ELEMENT'];
  if (weaponElements) {
    const arr = Array.isArray(weaponElements) ? weaponElements : [weaponElements];
    for (const item of arr) {
      if (typeof item === 'object' && item !== null) {
        maneuvers.push(parseWeaponElement(item as Record<string, unknown>));
      }
    }
  }
  
  return maneuvers;
}

/**
 * Parse WEAPON_ELEMENT as a martial maneuver entry (for cost tracking)
 */
function parseWeaponElement(obj: Record<string, unknown>): MartialManeuver {
  const alias = getAttr(obj, 'ALIAS', '');
  // Use hierarchy-preserving mode for weapon elements so we can edit them
  const hierarchicalAdders = parseAdders(obj, true);
  // Also get flattened adders for cost calculation
  const flatAdders = parseAdders(obj, false);
  const adderCost = calculateAdderCost(flatAdders);
  
  // Build weapon description from selected adders
  const weaponNames: string[] = [];
  for (const adder of flatAdders) {
    if (adder.name && adder.name !== 'Common Adder' && adder.name !== 'Unknown Adder') {
      weaponNames.push(adder.name);
    }
  }
  
  return {
    id: getAttr(obj, 'ID') || generateId(),
    name: `${alias}: ${weaponNames.join(', ') || 'Weapons'}`,
    alias: alias || undefined,
    position: getAttrNum(obj, 'POSITION', 0),
    levels: 0,
    baseCost: adderCost,
    realCost: adderCost,
    notes: getAttr(obj, 'NOTES') || undefined,
    ocv: 0,
    dcv: 0,
    effect: 'Weapon Element',
    modifiers: [],
    adders: hierarchicalAdders,
    isWeaponElement: true,
    parentId: getAttr(obj, 'PARENTID', '') || undefined,
  };
}

/**
 * What a power's levels cost, as Hero Designer prices them: levels / LVLVAL x LVLCOST, from the
 * file's LVLCOST if it has one, else the power's (or its option's) definition. Most powers
 * price per level; some per step (Resistant Protection 3 per 2 points, Multiform and Summon
 * 1 per 5 points, Leaping and Swimming 1 per 2m, Telescopic per +2).
 */
function levelCost(
  def: ReturnType<typeof getPowerDefinition>,
  optionId: string,
  levels: number,
  fileLvlCost: number,
): { perLevel: number; cost: number } {
  // A custom power costs its BASECOST; Hero Designer writes LEVELS as that cost rounded up
  if (def?.xmlId === 'CUSTOMPOWER') return { perLevel: 0, cost: 0 };
  const option = optionId ? def?.options?.find((o) => o.xmlId === optionId) : undefined;
  const perLevel = fileLvlCost >= 0 ? fileLvlCost : (option?.lvlCost ?? def?.lvlCost ?? 1);
  const step = option?.lvlVal || def?.lvlVal || 1;
  return { perLevel, cost: (levels / step) * perLevel };
}

/** A Multipower or Variable Power Pool element: a container with its own reserve/pool cost */
function parseFramework(obj: Record<string, unknown>, tag: (typeof FRAMEWORK_TYPES)[number]): Power {
  const modifiers = parseModifiers(obj);
  const adders = parseAdders(obj);
  const baseCost = getAttrNum(obj, 'BASECOST', 0);
  const levels = getAttrNum(obj, 'LEVELS', 0);
  const own = frameworkOwnCost({ type: tag, baseCost, levels, adders, modifiers });
  return {
    id: getAttr(obj, 'ID') || generateId(),
    name: getAttr(obj, 'NAME') || FRAMEWORK_NAMES[tag],
    alias: getAttr(obj, 'ALIAS') || undefined,
    position: getAttrNum(obj, 'POSITION', 0),
    type: tag,
    isContainer: true,
    levels,
    baseCost,
    ownCost: { active: own.active, real: own.real },
    activeCost: own.active,
    realCost: own.real,
    modifiers,
    adders,
    notes: getAttr(obj, 'NOTES') || undefined,
    parentId: getAttr(obj, 'PARENTID', '') || undefined,
  } as Power;
}

/**
 * A framework's slots cost a fraction of their own cost (none, in a Variable Power Pool), with
 * a Multipower's limitations applied to them as well
 */
function priceSlots(
  items: { id: string; parentId?: string; activeCost?: number; realCost?: number; slotFixed?: boolean; type?: string; xmlId?: string; modifiers?: Modifier[]; isContainer?: boolean }[],
): void {
  const byId = new Map(items.map((i) => [i.id, i]));
  for (const item of items) {
    const parent = item.parentId ? byId.get(item.parentId) : undefined;
    const parentType = parent?.xmlId ?? parent?.type;
    if (!parent || !isFramework(parentType)) continue;
    let real = item.realCost ?? 0;
    const inherited = inheritedSlotLimitations(parentType, parent.modifiers, item.modifiers);
    if (inherited.length && !item.isContainer && item.activeCost) {
      const limits = [...(item.modifiers ?? []).filter((m) => (m.value ?? 0) < 0), ...inherited].reduce((sum, m) => sum + Math.abs(m.value ?? 0), 0);
      real = heroRoundCost(item.activeCost / (1 + limits));
    }
    item.realCost = slotCost(parentType, real, item.slotFixed ?? false);
  }
}

/** Characteristics, which Hero Designer can also list as powers or equipment (e.g. "Clever": INT +2) */
const CHARACTERISTIC_POWER_TAGS = [
  'STR', 'DEX', 'CON', 'INT', 'EGO', 'PRE',
  'OCV', 'DCV', 'OMCV', 'DMCV',
  'SPD', 'PD', 'ED', 'REC', 'END', 'BODY', 'STUN',
  'RUNNING', 'SWIMMING', 'LEAPING',
];

/**
 * A POWERS or EQUIPMENT section's items: its POWER elements plus characteristics bought as
 * powers, in Hero Designer's order (POSITION)
 */
function powerLikeElements(containerObj: Record<string, unknown>): unknown[] {
  const found = ['POWER', ...CHARACTERISTIC_POWER_TAGS].flatMap((tag) => {
    const value = containerObj[tag];
    return value === undefined ? [] : Array.isArray(value) ? value : [value];
  });
  const position = (item: unknown) =>
    typeof item === 'object' && item !== null ? getAttrNum(item as Record<string, unknown>, 'POSITION', 0) : 0;
  return found.sort((a, b) => position(a) - position(b));
}

/**
 * Parse POWERS section - handles POWER and LIST elements
 * LIST elements can have MODIFIER elements that apply to all child powers
 */
function parsePowersList(container: unknown): Power[] {
  if (!container || typeof container !== 'object') return [];
  const containerObj = container as Record<string, unknown>;
  const powers: Power[] = [];
  
  // First, collect all LIST elements to get their shared modifiers (limitations)
  // These are expressed as modifier values (e.g., -0.25 for a -1/4 limitation)
  // Also add LIST elements as container powers so they appear in the UI
  const listModifiers: Map<string, Modifier[]> = new Map();
  // Store discount adders for lists (like Cantrip's -1 discount per child power)
  const listDiscounts: Map<string, number> = new Map();
  const listElements = containerObj['LIST'];
  if (listElements) {
    const lists = Array.isArray(listElements) ? listElements : [listElements];
    for (const listItem of lists) {
      if (typeof listItem === 'object' && listItem !== null) {
        const list = listItem as Record<string, unknown>;
        const listId = getAttr(list, 'ID', '');
        const mods = parseModifiers(list);
        const adders = parseAdders(list);
        
        // Store list modifiers for applying to children
        if (listId && mods.length > 0) {
          listModifiers.set(listId, mods);
        }
        
        // Check for discount adders (negative baseCost adders like "Common Adder" with -1)
        // These reduce the real cost of each child power
        const discountAdder = adders.find(a => a.baseCost < 0);
        if (listId && discountAdder) {
          listDiscounts.set(listId, discountAdder.baseCost); // e.g., -1
        }
        
        // Create a power entry for the LIST container itself
        const listName = getAttr(list, 'NAME', '') || getAttr(list, 'ALIAS', '') || 'Power List';
        powers.push({
          id: listId || generateId(),
          name: listName,
          alias: getAttr(list, 'ALIAS', '') || undefined,
          position: getAttrNum(list, 'POSITION', 0),
          levels: 0,
          baseCost: 0,
          activeCost: 0,
          realCost: 0, // List container cost is sum of children (calculated later)
          type: 'LIST' as Power['type'],
          modifiers: mods,
          adders: adders,
          isContainer: true,
        });
      }
    }
  }
  
  // Frameworks (Multipower, Variable Power Pool): containers with a cost of their own
  for (const tag of FRAMEWORK_TYPES) {
    const found = containerObj[tag];
    for (const fw of found === undefined ? [] : Array.isArray(found) ? found : [found]) {
      if (typeof fw === 'object' && fw !== null) powers.push(parseFramework(fw as Record<string, unknown>, tag));
    }
  }

  // Parse all POWER elements, and characteristics bought as powers (<STR>, <INT>, ...)
  const powerElements = powerLikeElements(containerObj);
  if (powerElements.length) {
    const arr = powerElements;
    for (const item of arr) {
      if (typeof item === 'object' && item !== null) {
        const powerObj = item as Record<string, unknown>;
        const power = parsePower(powerObj);
        
        // Apply list modifiers if this power belongs to a list
        if (power.parentId && listModifiers.has(power.parentId)) {
          const listMods = listModifiers.get(power.parentId)!;
          
          // Separate list advantages (positive) from list limitations (negative)
          const listAdvantages = listMods
            .filter((m: Modifier) => (m.value ?? 0) > 0)
            .reduce((sum: number, m: Modifier) => sum + (m.value ?? 0), 0);
          const listLimitations = listMods
            .filter((m: Modifier) => (m.value ?? 0) < 0)
            .reduce((sum: number, m: Modifier) => sum + Math.abs(m.value ?? 0), 0);
          
          // Power's own modifiers
          const powerMods = power.modifiers ?? [];
          const powerAdvantages = powerMods
            .filter((m: Modifier) => (m.value ?? 0) > 0)
            .reduce((sum: number, m: Modifier) => sum + (m.value ?? 0), 0);
          const powerLimitations = powerMods
            .filter((m: Modifier) => (m.value ?? 0) < 0)
            .reduce((sum: number, m: Modifier) => sum + Math.abs(m.value ?? 0), 0);
          
          // Use the true base cost (now correctly stored in baseCost)
          const trueBase = power.baseCost ?? 0;
          
          // Recalculate active cost with combined advantages (power + list)
          const totalAdvantages = powerAdvantages + listAdvantages;
          power.activeCost = heroRoundCost(trueBase * (1 + totalAdvantages));
          
          // Recalculate real cost with combined limitations (power + list)
          const totalLimitations = powerLimitations + listLimitations;
          power.realCost = totalLimitations > 0
            ? heroRoundCost(power.activeCost / (1 + totalLimitations))
            : power.activeCost;
        }
        
        // Apply list discount adders (like Cantrip's -1 per child power)
        if (power.parentId && listDiscounts.has(power.parentId)) {
          const discount = listDiscounts.get(power.parentId)!; // e.g., -1
          power.realCost = Math.max(0, (power.realCost ?? 0) + discount);
        }
        
        powers.push(power);
        
        // Handle COMPOUNDPOWER - parse nested POWER elements and characteristic elements as children
        if (power.type === 'COMPOUNDPOWER') {
          power.isContainer = true;
          
          // Parse nested POWER elements
          const nestedPowers = powerObj['POWER'];
          if (nestedPowers) {
            const nestedArr = Array.isArray(nestedPowers) ? nestedPowers : [nestedPowers];
            for (const nestedItem of nestedArr) {
              if (typeof nestedItem === 'object' && nestedItem !== null) {
                const childPower = parsePower(nestedItem as Record<string, unknown>);
                // Set the parent ID to the compound power's ID
                childPower.parentId = power.id;
                powers.push(childPower);
              }
            }
          }
          
          // Parse characteristic elements (STR, DEX, CON, etc.) inside compound powers
          // These are characteristic boosts that can be part of equipment/items
          const characteristicTypes = [
            'STR', 'DEX', 'CON', 'INT', 'EGO', 'PRE',
            'OCV', 'DCV', 'OMCV', 'DMCV',
            'SPD', 'PD', 'ED', 'REC', 'END', 'BODY', 'STUN',
            'RUNNING', 'SWIMMING', 'LEAPING'
          ];
          
          for (const charType of characteristicTypes) {
            const charElement = powerObj[charType];
            if (charElement) {
              const charArr = Array.isArray(charElement) ? charElement : [charElement];
              for (const charItem of charArr) {
                if (typeof charItem === 'object' && charItem !== null) {
                  const childPower = parsePower(charItem as Record<string, unknown>);
                  childPower.parentId = power.id;
                  powers.push(childPower);
                }
              }
            }
          }
          
          // Skills, perks and talents in the compound, priced as such
          powers.push(...parseCompoundNonPowerParts(powerObj, power.id));
        }
      }
    }
  }
  
  priceSlots(powers);

  // Calculate container costs (sum of child real costs) for LIST and COMPOUNDPOWER.
  // Innermost first, so a list holding a compound adds up the compound's own total.
  const totalled = new Set<string>();
  const total = (power: Power): void => {
    if (totalled.has(power.id)) return;
    totalled.add(power.id);
    if (!(power.type === 'LIST' || power.type === 'COMPOUNDPOWER' || power.isContainer)) return;
    const childPowers = powers.filter(p => p.parentId === power.id);
    childPowers.forEach(total);
    // A framework adds its reserve/pool to its slots
    const own = power.ownCost ?? { real: 0, active: 0 };
    power.realCost = own.real + childPowers.reduce((sum, child) => sum + (child.realCost ?? 0), 0);
    // A framework's Active Points are its reserve's or pool's, as Hero Designer shows them
    power.activeCost = isFramework(power.type) ? own.active : own.active + childPowers.reduce((sum, child) => sum + (child.activeCost ?? 0), 0);
    if (!isFramework(power.type)) power.baseCost = power.activeCost;
  };
  powers.forEach(total);
  
  return powers;
}

/**
 * Parse DISADVANTAGES section - handles DISAD elements (not DISADVANTAGE!)
 */
function parseDisadvantagesList(container: unknown): Disadvantage[] {
  if (!container || typeof container !== 'object') return [];
  const containerObj = container as Record<string, unknown>;
  const disadvantages: Disadvantage[] = [];
  
  // HDC uses DISAD, not DISADVANTAGE!
  const disadElements = containerObj['DISAD'];
  if (disadElements) {
    const arr = Array.isArray(disadElements) ? disadElements : [disadElements];
    for (const item of arr) {
      if (typeof item === 'object' && item !== null) {
        disadvantages.push(parseDisadvantage(item as Record<string, unknown>));
      }
    }
  }
  
  return disadvantages;
}

function parseSkill(obj: Record<string, unknown>): Skill {
  // HDC files use XMLID for the skill type and ALIAS/NAME for the display name
  const xmlid = getAttr(obj, 'XMLID', '');
  const alias = getAttr(obj, 'ALIAS', '');
  const input = getAttr(obj, 'INPUT', '');
  const nameAttr = getAttr(obj, 'NAME', '');
  const optionAlias = getAttr(obj, 'OPTION_ALIAS', '');
  const nativeTongue = getAttrBool(obj, 'NATIVE_TONGUE');
  
  // Build display name - PS: Jeweler, KS: Arcana, Language: Common, etc.
  let displayName = alias;
  const isBackground = LABELLED_SKILL_XMLIDS.includes(xmlid);
  if (isBackground) {
    // A custom NAME replaces the label; the label itself may be relabelled (e.g. "Magic Skill Roll")
    displayName = nameAttr || (input ? `${alias}: ${input}` : alias);
  } else if (input) {
    // For skills like PS, KS, AK - show as "PS: Jeweler"
    if (['PS', 'KS', 'AK', 'SS', 'TF', 'WF'].includes(alias)) {
      displayName = `${alias}: ${input}`;
    } else if (alias === 'Language') {
      // Language: Common (imitate dialects; literate)
      displayName = `Language:  ${input}`;
      if (optionAlias) {
        displayName += ` (${optionAlias})`;
      }
      // Mark native tongue in the display name
      if (nativeTongue) {
        displayName += ' [Native]';
      }
    } else if (input !== alias) {
      displayName = input;
    }
  }
  if (!isBackground && nameAttr && nameAttr !== alias) {
    // NAME is like "Demonic Claw Focus:" prefix
    displayName = nameAttr ? `${nameAttr}: ${alias}` : displayName;
  }
  
  // Calculate cost: BASECOST + LEVELS + Adder costs  
  const adders = parseAdders(obj);
  const modifiers = parseModifiers(obj);
  const baseCost = getAttrNum(obj, 'BASECOST', 0);
  const levels = getAttrNum(obj, 'LEVELS', 0);
  const adderCost = calculateAdderCost(adders);
  const familiarity = getAttrBool(obj, 'FAMILIARITY');
  const everyman = getAttrBool(obj, 'EVERYMAN');
  const option = getAttr(obj, 'OPTION', '');

  // Hero Designer (Skill.getTotalCost): base + levels at the template's cost per level for the
  // skill's characteristic + adders; a familiarity has no base or levels and costs at least its
  // familiarity cost
  const entry = SKILL_CATALOG_BY_ID.get(xmlid);
  const choices = entry?.characteristicChoices ?? [];
  const choice = choices.find((c) => c.characteristic === getAttr(obj, 'CHARACTERISTIC', '')) ?? choices[0];
  const lvlCost = choice?.lvlCost ?? entry?.lvlCost;
  const lvlVal = choice?.lvlVal ?? 1;
  const proficiency = getAttrBool(obj, 'PROFICIENCY');
  let totalCost: number;
  if (!entry || xmlid === 'CUSTOMSKILL' || lvlCost === undefined) {
    totalCost = Math.ceil(baseCost + levels + adderCost);
  } else if (familiarity && !proficiency) {
    totalCost = Math.max(entry.familiarityCost ?? 1, adderCost);
  } else {
    let levelCost = (levels / lvlVal) * lvlCost;
    if (lvlCost < lvlVal) levelCost = levelCost > 0 && levelCost < 1 ? 1 : Math.round(levelCost - 1e-9);
    totalCost = Math.ceil(baseCost + levelCost + adderCost);
  }
  
  // Combat, Skill, Mental Combat and Penalty Skill Levels: the template's cost per level for
  // their breadth (CSLs with HTH Combat are 8/level, with all attacks 10)
  const breadthCost = skillLevelCost(xmlid, option, levels);
  if (breadthCost !== undefined) totalCost = Math.ceil(breadthCost + adderCost);
  
  // Advantages raise the Active Points (Combat Skill Levels Usable By Others, say), and
  // limitations lower the Real Cost from there, as for powers
  const advantages = modifiers
    .filter(m => (m.value ?? 0) > 0)
    .reduce((sum, m) => sum + (m.value ?? 0), 0);
  const limitations = modifiers
    .filter(m => (m.value ?? 0) < 0)
    .reduce((sum, m) => sum + Math.abs(m.value ?? 0), 0);

  let activeCost = advantages > 0 ? heroRoundCost(totalCost * (1 + advantages)) : totalCost;
  let realCost = activeCost;
  if (limitations > 0) {
    // Real Cost = Active Cost / (1 + Total Limitations)
    realCost = heroRoundCost(activeCost / (1 + limitations));
  }
  
  // Everyman skills are always free (0 cost)
  if (everyman) {
    totalCost = activeCost = 0;
    realCost = 0;
  }
  // Familiarity costs 1 point minimum (unless it's native tongue or everyman)
  else if (familiarity && totalCost === 0) {
    totalCost = activeCost = 1;
    realCost = 1;
  }
  
  // Native tongue languages are free (0 cost) - native literacy is also free per campaign rules
  if (nativeTongue) {
    totalCost = activeCost = 0; // Native tongue and native literacy are free
    realCost = 0;
  }
  
  // Store PARENTID for list discount application
  const parentId = getAttr(obj, 'PARENTID', '');
  
  return {
    bindingName: skillItemName(nameAttr, alias, input) || undefined,
    customName: isBackground ? nameAttr || undefined : undefined,
    id: getAttr(obj, 'ID') || generateId(),
    name: displayName || xmlid || 'Unknown Skill',
    alias: alias || undefined,
    position: getAttrNum(obj, 'POSITION', 0),
    levels: levels,
    baseCost: totalCost,
    activeCost: activeCost,
    realCost: realCost,
    notes: getAttr(obj, 'NOTES') || undefined,
    type: 'GENERAL',
    characteristic: getAttr(obj, 'CHARACTERISTIC') as CharacteristicType || undefined,
    roll: getAttrNum(obj, 'ROLL') || undefined,
    proficiency: getAttrBool(obj, 'PROFICIENCY'),
    familiarity: familiarity,
    everyman: everyman,
    nativeTongue: nativeTongue || undefined,
    xmlid: xmlid || undefined,
    input: input || undefined,
    option: getAttr(obj, 'OPTION') || undefined,
    optionAlias: optionAlias || undefined,
    modifiers: modifiers,
    adders: adders,
    parentId: parentId || undefined,
  };
}

function parsePerk(obj: Record<string, unknown>): Perk {
  // HDC files use XMLID for the perk type and ALIAS/NAME for the display name
  const xmlid = getAttr(obj, 'XMLID', '');
  const alias = getAttr(obj, 'ALIAS', '');
  const input = getAttr(obj, 'INPUT', '');
  const nameAttr = getAttr(obj, 'NAME', '');
  const levels = getAttrNum(obj, 'LEVELS', 0);
  
  // Parse adders early to use in display name building
  const adders = parseAdders(obj);
  
  // Build display name based on perk type
  let displayName = '';
  if (xmlid === 'CONTACT') {
    // Contact: "Name Roll-"; Hero Designer's roll is 8- at 1 level, 11- at 2, +1 per level after
    const contactRoll = contactRollFor(levels);
    displayName = ` Contact:  ${input || nameAttr || 'Unknown'} ${contactRoll}-`;
  } else if (xmlid === 'VEHICLE_BASE') {
    // "Starbase: Vehicles & Bases"
    displayName = nameAttr ? `${nameAttr}:` : '';
    displayName += ` ${alias}`;
  } else if (xmlid === 'REPUTATION' || xmlid === 'POSITIVE_REPUTATION') {
    // Format: "Name: Positive Reputation (How Wide) Roll, +X/+Xd6 (Y Active Points)"
    displayName = nameAttr ? `${nameAttr}:` : '';
    displayName += ` ${alias}`;
    
    // Add adder details (OPTION_ALIAS) like "(Star and Region)" and "11-"
    const howWide = adders.find(a => a.name === 'How Widely Known');
    const howWell = adders.find(a => a.name === 'How Well Known');
    
    if (howWide?.optionAlias) {
      displayName += ` (${howWide.optionAlias})`;
    }
    if (howWell?.optionAlias) {
      displayName += ` ${howWell.optionAlias}`;
    }
    if (levels > 0) {
      displayName += `, +${levels}/+${levels}d6`;
    }
  } else {
    displayName = nameAttr || input || alias || xmlid || 'Unknown Perk';
  }
  
  // Map XMLID to PerkType
  const perkTypeMap: Record<string, string> = {
    'ANONYMITY': 'ANONYMITY',
    'BASE': 'BASE',
    'COMPUTERLINK': 'COMPUTER_LINK',
    'COMPUTER_LINK': 'COMPUTER_LINK',
    'CONTACT': 'CONTACT',
    'DEEPCOVER': 'DEEP_COVER',
    'DEEP_COVER': 'DEEP_COVER',
    'FAVOR': 'FAVOR',
    'FOLLOWER': 'FOLLOWER',
    'FRINGE_BENEFIT': 'FRINGE_BENEFIT',
    'FRINGEBENEFIT': 'FRINGE_BENEFIT',
    'MONEY': 'MONEY',
    'POSITIVE_REPUTATION': 'POSITIVE_REPUTATION',
    'REPUTATION': 'REPUTATION',
    'VEHICLE': 'VEHICLE',
    'VEHICLE_BASE': 'VEHICLE_BASE',
  };
  const perkType = perkTypeMap[xmlid] || 'GENERIC';
  
  // Calculate total cost based on perk type (adders already parsed above)
  const baseCost = getAttrNum(obj, 'BASECOST', 0);
  const adderCost = calculateAdderCost(adders);
  
  let totalCost = 0;
  let activeCost = 0; // Track active cost before list discounts
  
  if (xmlid === 'VEHICLE_BASE' || xmlid === 'FOLLOWER') {
    // Vehicles & Bases, Followers: 1 CP per 5 points built on, +5 per doubling of their number
    const basePoints = getAttrNum(obj, 'BASEPOINTS', 0);
    const number = Math.max(1, getAttrNum(obj, 'NUMBER', 1));
    totalCost = Math.ceil(basePoints / 5) + 5 * Math.ceil(Math.log2(number));
    activeCost = totalCost;
  } else if (xmlid === 'CONTACT') {
    // Contact: 1 point per level (at least 1) plus its adders (useful skills, loyalty...), then modifiers
    const modifiers = parseModifiers(obj);
    activeCost = calculateActiveCost(Math.max(1, levels) + adderCost, modifiers);
    totalCost = Math.max(1, calculateRealCost(activeCost, modifiers));
  } else if (xmlid === 'REPUTATION' || xmlid === 'POSITIVE_REPUTATION') {
    // Hero Designer (Reputation.java): each level (+1/+1d6) costs how widely plus how well it's
    // known (at least 1); other adders add to that
    const scope = adders.filter((a) => a.xmlId === 'HOWWIDE' || a.xmlId === 'HOWWELL');
    const perLevel = Math.max(1, calculateAdderCost(scope));
    const others = calculateAdderCost(adders.filter((a) => !scope.includes(a)));
    activeCost = Math.max(1, Math.ceil(Math.abs(baseCost) + Math.max(1, levels) * perLevel + others));
    totalCost = activeCost; // Real cost will be adjusted by list discount later
  } else {
    totalCost = Math.ceil(Math.abs(baseCost + adderCost + levels));
    activeCost = totalCost;
  }
  
  // Store PARENTID for list discount application
  const parentId = getAttr(obj, 'PARENTID', '');
  
  return {
    id: getAttr(obj, 'ID') || generateId(),
    name: displayName.trim(),
    alias: alias || undefined,
    position: getAttrNum(obj, 'POSITION', 0),
    levels: levels,
    baseCost: activeCost, // Store active cost before discounts
    realCost: totalCost,
    notes: getAttr(obj, 'NOTES') || undefined,
    type: perkType as Perk['type'],
    modifiers: parseModifiers(obj),
    adders: adders,
    parentId: parentId || undefined,
  };
}

/** Hero Designer's Contact roll (Contact.getRoll): 8- at 1 level, 11- at 2, +1 per level after */
export function contactRollFor(levels: number): number {
  if (levels <= 1) return 8;
  return 11 + levels - 2;
}

const TALENT_CATALOG = new Map(TALENT_CATALOG_6E.map((t) => [t.xmlId, t]));

function parseTalent(obj: Record<string, unknown>): Talent {
  // HDC files use XMLID for the talent type
  const xmlid = getAttr(obj, 'XMLID', '');
  const alias = getAttr(obj, 'ALIAS', '');
  const name = alias || getAttr(obj, 'NAME', '') || xmlid || 'Unknown Talent';
  const levels = getAttrNum(obj, 'LEVELS', 0);
  const baseCost = getAttrNum(obj, 'BASECOST', 0);
  
  // For custom talents, LEVELS is the cost; otherwise baseCost + levels at the template's cost per level + adders
  const adders = parseAdders(obj);
  const adderCost = calculateAdderCost(adders);
  const entry = TALENT_CATALOG.get(xmlid);
  // An option can price its levels differently (Deadly Blow's circumstances)
  const option = entry?.options?.find((o) => o.xmlId === getAttr(obj, 'OPTIONID', ''));
  const lvlCost = option?.lvlCost ?? entry?.lvlCost;
  const perLevel = lvlCost !== undefined ? lvlCost / ((option?.lvlCost !== undefined ? option.lvlVal : entry?.lvlVal) || 1) : 1;
  const totalCost = xmlid === 'CUSTOMTALENT' ? levels : Math.ceil(baseCost + levels * perLevel + adderCost);
  
  return {
    id: getAttr(obj, 'ID') || generateId(),
    name: name,
    alias: alias || undefined,
    position: getAttrNum(obj, 'POSITION', 0),
    levels: levels,
    baseCost: totalCost,
    realCost: totalCost,
    notes: getAttr(obj, 'NOTES') || undefined,
    type: (xmlid || 'GENERIC') as Talent['type'],
    characteristic: getAttr(obj, 'CHARACTERISTIC') as CharacteristicType || undefined,
    modifiers: parseModifiers(obj),
    adders: adders,
    parentId: getAttr(obj, 'PARENTID', '') || undefined,
  };
}

function parseMartialManeuver(obj: Record<string, unknown>): MartialManeuver {
  // Parse OCV/DCV which are stored as strings like "+2", "+0", "--"
  const ocvStr = getAttr(obj, 'OCV', '+0');
  const dcvStr = getAttr(obj, 'DCV', '+0');
  const phase = getAttr(obj, 'PHASE', '1');
  const dc = getAttrNum(obj, 'DC', 0);
  const useWeapon = getAttrBool(obj, 'USEWEAPON');
  
  // Convert string like "+2" or "--" to number
  const parseOcvDcv = (str: string): number => {
    if (str === '--') return 0;
    return parseInt(str.replace('+', ''), 10) || 0;
  };
  
  // Name can come from ALIAS (display name) or DISPLAY (standard maneuver name)
  const alias = getAttr(obj, 'ALIAS', '');
  const display = getAttr(obj, 'DISPLAY', '');
  const nameAttr = getAttr(obj, 'NAME', '');
  const name = alias || display || nameAttr || 'Maneuver';
  
  // Build effect string in HTML format: "1/2 Phase, +2 OCV, +0 DCV, Weapon +2 DC Strike"
  const effectParts: string[] = [];
  if (phase) effectParts.push(`${phase} Phase`);
  effectParts.push(`${ocvStr} OCV`);
  effectParts.push(`${dcvStr} DCV`);
  
  // Get effect template and replace DC markers
  let effectDesc = getAttr(obj, 'EFFECT', '');
  if (useWeapon && getAttr(obj, 'WEAPONEFFECT', '')) {
    effectDesc = getAttr(obj, 'WEAPONEFFECT', '');
  }
  effectDesc = effectDesc.replace('[NORMALDC]', `${dc} DC`);
  effectDesc = effectDesc.replace('[WEAPONDC]', `+${dc} DC`);
  if (effectDesc) effectParts.push(effectDesc);
  
  const effectString = effectParts.join(', ');
  
  return {
    id: getAttr(obj, 'ID') || generateId(),
    name: name,
    alias: alias || undefined,
    position: getAttrNum(obj, 'POSITION', 0),
    levels: getAttrNum(obj, 'LEVELS', 0),
    baseCost: getAttrNum(obj, 'BASECOST', 0),
    realCost: getAttrNum(obj, 'BASECOST', 0), // For martial arts, real cost = base cost
    notes: getAttr(obj, 'NOTES') || undefined,
    ocv: parseOcvDcv(ocvStr),
    dcv: parseOcvDcv(dcvStr),
    phase: phase || '1/2',
    dc: dc,
    damage: getAttr(obj, 'DC') || undefined, // Damage class as string
    effect: effectString || undefined,
    effectText: getAttr(obj, 'EFFECT', '') || undefined,
    modifiers: parseModifiers(obj),
    adders: parseAdders(obj),
    parentId: getAttr(obj, 'PARENTID', '') || undefined,
  };
}

function parsePower(obj: Record<string, unknown>): Power {
  // HDC files use XMLID for the power type and NAME for display name
  const xmlid = getAttr(obj, 'XMLID', '');
  const nameAttr = getAttr(obj, 'NAME', '');
  const alias = getAttr(obj, 'ALIAS', '');
  
  // Display name: NAME is primary (like "Nightvision"), ALIAS is the description
  const displayName = nameAttr || alias || xmlid || 'Unknown Power';
  
  // Parse adders and modifiers
  const adders = parseAdders(obj);
  const modifiers = parseModifiers(obj);
  
  // Calculate costs
  const hdcBaseCost = getAttrNum(obj, 'BASECOST', 0);
  const levels = getAttrNum(obj, 'LEVELS', 0);
  
  // Get OPTION for powers like Darkness with sense group selection
  const optionId = getAttr(obj, 'OPTION', '');
  
  // Get level cost from HDC file first
  let lvlCost = getAttrNum(obj, 'LVLCOST', -1); // Use -1 as sentinel for "not specified"
  
  const powerDef = getPowerDefinition(xmlid);
  const leveled = levelCost(powerDef, optionId, levels, lvlCost);
  lvlCost = leveled.perLevel;

  const adderCost = calculateAdderCost(adders);
  
  // True base cost = BASECOST + (levels * lvlCost) + adderCosts (before advantages)
  let trueBaseCost = hdcBaseCost + leveled.cost + adderCost;
  
  // Negative levels on characteristics are penalties with 0 cost, not refunds
  // Check if this is a characteristic power type
  const characteristicTypes = new Set([
    'STR', 'DEX', 'CON', 'INT', 'EGO', 'PRE',
    'OCV', 'DCV', 'OMCV', 'DMCV',
    'SPD', 'PD', 'ED', 'REC', 'END', 'BODY', 'STUN',
    'RUNNING', 'SWIMMING', 'LEAPING'
  ]);
  if (characteristicTypes.has(xmlid) && levels < 0) {
    trueBaseCost = 0; // Negative stats are penalties, not refunds
  }
  
  // Barrier-specific fields (extracted for storage)
  let barrierFields: {
    pdLevels?: number;
    edLevels?: number;
    mdLevels?: number;
    powdLevels?: number;
    bodyLevels?: number;
    lengthLevels?: number;
    heightLevels?: number;
    widthLevels?: number;
  } = {};
  
  // Special handling for FORCEWALL (Barrier) cost calculation
  // Per rulebook: 3 CP for base (1m x 1m x 0.5m, 0 BODY, 0 DEF)
  // +1 CP per +1m length or +1m height or +0.5m thickness
  // +1 CP per +1 BODY
  // +3 CP per +2 resistant DEF (PD, ED, MD, PowD)
  if (xmlid === 'FORCEWALL') {
    const pdLevels = getAttrNum(obj, 'PDLEVELS', 0);
    const edLevels = getAttrNum(obj, 'EDLEVELS', 0);
    const mdLevels = getAttrNum(obj, 'MDLEVELS', 0);
    const powdLevels = getAttrNum(obj, 'POWDLEVELS', 0);
    // HDC stores levels above base - convert to actual dimensions
    const lengthLevelsRaw = getAttrNum(obj, 'LENGTHLEVELS', 0);
    const heightLevelsRaw = getAttrNum(obj, 'HEIGHTLEVELS', 0);
    const bodyLevels = getAttrNum(obj, 'BODYLEVELS', 0);
    const widthLevelsRaw = parseFloat(getAttr(obj, 'WIDTHLEVELS', '0')) || 0;
    
    // Convert to actual dimensions (base + levels)
    const lengthLevels = lengthLevelsRaw + 1;  // Base 1m + levels
    const heightLevels = heightLevelsRaw + 1;  // Base 1m + levels
    const widthLevels = widthLevelsRaw + 0.5;  // Base 0.5m + levels
    
    // Store actual dimensions for return value
    barrierFields = { pdLevels, edLevels, mdLevels, powdLevels, bodyLevels, lengthLevels, heightLevels, widthLevels };
    
    // Calculate cost:
    // Defense cost: 3 CP per 2 points of resistant defense (round up)
    // So each point of defense costs 1.5 CP
    const totalDefense = pdLevels + edLevels + mdLevels + powdLevels;
    const defenseCost = Math.ceil(totalDefense * 1.5);
    
    // Dimension cost: 1 CP per meter above base (using raw levels)
    const dimensionCost = lengthLevelsRaw + heightLevelsRaw + (widthLevelsRaw * 2);
    
    // Body cost: 1 CP per BODY
    const bodyCost = bodyLevels;
    
    // Base cost of 3 CP is in hdcBaseCost
    trueBaseCost = hdcBaseCost + defenseCost + dimensionCost + bodyCost + adderCost;
  }
  
  // Calculate advantage total (positive modifiers)
  const advantageTotal = modifiers
    .filter((m) => (m.value ?? 0) > 0)
    .reduce((sum, m) => sum + (m.value ?? 0), 0);
  
  // Calculate limitation total (negative modifiers - use absolute value)
  const limitationTotal = modifiers
    .filter((m) => (m.value ?? 0) < 0)
    .reduce((sum, m) => sum + Math.abs(m.value ?? 0), 0);
  
  // Active Points = base * (1 + advantage total)
  let activeCost = heroRoundCost(trueBaseCost * (1 + advantageTotal));

  // Real Cost = Active Points / (1 + limitation total)
  let realCost = activeCost;
  if (limitationTotal > 0) {
    realCost = heroRoundCost(activeCost / (1 + limitationTotal));
  }

  // An Endurance Reserve's Recovery is a power nested in it, with its own cost and modifiers
  if (xmlid === 'ENDURANCERESERVE') {
    const nested = obj['POWER'];
    for (const rec of Array.isArray(nested) ? nested : nested ? [nested] : []) {
      if (typeof rec !== 'object' || rec === null || getAttr(rec as Record<string, unknown>, 'XMLID') !== 'ENDURANCERESERVEREC') continue;
      const recovery = parsePower(rec as Record<string, unknown>);
      activeCost += recovery.activeCost ?? 0;
      realCost += recovery.realCost ?? 0;
    }
  }

  // Calculate END Cost if not specified in XML
  // Use -1 sentinel to distinguish between "0 END" and "not specified"
  const xmlEndCost = getAttrNum(obj, 'END_COST', -1);
  const xmlEndCost2 = getAttrNum(obj, 'ENDCOST', -1);
  
  let endCost: number | undefined;
  
  if (xmlEndCost !== -1) endCost = xmlEndCost;
  else if (xmlEndCost2 !== -1) endCost = xmlEndCost2;
  else if (powerDef && powerDef.usesEnd !== false) {
    // Standard END cost is 1 per 10 Active Points
    endCost = Math.ceil(activeCost / 10);
  }
  
  // Store PARENTID for list modifier application
  const parentId = getAttr(obj, 'PARENTID', '');
  
  // Get OPTION_ALIAS for powers like Darkness with sense group selection
  const optionAlias = getAttr(obj, 'OPTION_ALIAS', '');
  
  // Parse AFFECTS_PRIMARY and AFFECTS_TOTAL flags
  // These determine if the power contributes to primary/total character stats
  // Default to true (most powers do affect stats)
  const affectsPrimary = getAttrBool(obj, 'AFFECTS_PRIMARY', true);
  const affectsTotal = getAttrBool(obj, 'AFFECTS_TOTAL', true);
  
  return {
    id: getAttr(obj, 'ID') || generateId(),
    name: displayName,
    alias: alias || undefined,
    position: getAttrNum(obj, 'POSITION', 0),
    levels: levels,
    baseCost: trueBaseCost,
    levelCost: lvlCost,
    activeCost: activeCost,
    realCost: realCost,
    // The power's own notes (Hero Designer's NOTES text), not its display name
    notes: extractTextContent(obj, 'NOTES')?.trim() || getAttr(obj, 'NOTES').trim() || undefined,
    type: (xmlid || 'GENERIC') as Power['type'],
    effectDice: getAttr(obj, 'EFFECT_DICE') || getAttr(obj, 'EFFECTDICE') || undefined,
    endCost: endCost,
    doesDamage: getAttrBool(obj, 'DOES_DAMAGE') || getAttrBool(obj, 'DOESDAMAGE'),
    doesKnockback: getAttrBool(obj, 'DOES_KNOCKBACK') || getAttrBool(obj, 'DOESKB'),
    killing: getAttrBool(obj, 'KILLING'),
    standardEffect: getAttrBool(obj, 'STANDARD_EFFECT') || getAttrBool(obj, 'USESTANDARDEFFECT'),
    modifiers: modifiers,
    adders: adders,
    parentId: parentId || undefined,
    slotFixed: getAttr(obj, 'ULTRA_SLOT') === 'Yes' || undefined,
    input: getAttr(obj, 'INPUT') || undefined,
    option: optionId || undefined,
    optionAlias: optionAlias || undefined,
    affectsPrimary: affectsPrimary,
    affectsTotal: affectsTotal,
    // Barrier-specific fields
    ...barrierFields,
  };
}

function parseDisadvantage(obj: Record<string, unknown>): Disadvantage {
  // HDC uses XMLID for type (HUNTED, PSYCHOLOGICALLIMITATION, etc.), ALIAS for display, INPUT for details
  const xmlid = getAttr(obj, 'XMLID', '');
  const alias = getAttr(obj, 'ALIAS', '');
  const input = getAttr(obj, 'INPUT', '');
  const nameAttr = getAttr(obj, 'NAME', '');
  
  // Map XMLID to display type
  const typeNames: Record<string, string> = {
    'HUNTED': 'Hunted',
    'PSYCHOLOGICALLIMITATION': 'Psychological Complication',
    'PHYSICALLIMITATION': 'Physical Complication', 
    'SOCIALLIMITATION': 'Social Complication',
    'SUSCEPTIBILITY': 'Susceptibility',
    'VULNERABILITY': 'Vulnerability',
    'DEPENDENCE': 'Dependence',
    'DISTINCTIVE': 'Distinctive Features',
    'ENRAGED': 'Enraged',
    'DNPC': 'DNPC',
    'RIVALORNEMESIS': 'Rivalry',
    'REPUTATION': 'Negative Reputation',
    'UNLUCK': 'Unluck',
    'ACCIDENTALCHANGE': 'Accidental Change',
  };
  
  const typeName = typeNames[xmlid] || alias || xmlid || 'Complication';
  
  // Build display name - get details from adders
  const adders = parseAdders(obj);
  const details = input || nameAttr || '';
  
  // Build modifier text from OPTION_ALIAS in adders
  const adderDescriptions: string[] = [];
  const adderContainer = obj['ADDER'];
  if (adderContainer) {
    const items = Array.isArray(adderContainer) ? adderContainer : [adderContainer];
    for (const item of items) {
      if (typeof item === 'object' && item !== null) {
        const add = item as Record<string, unknown>;
        const optionAlias = getAttr(add, 'OPTION_ALIAS', '');
        if (optionAlias) {
          adderDescriptions.push(optionAlias);
        }
      }
    }
  }
  
  // Combine details and adder descriptions
  let name = details;
  if (adderDescriptions.length > 0) {
    const modifierText = adderDescriptions.join('; ').replace(/\(/g, '').replace(/\)/g, '');
    if (name) {
      name = `${name} (${modifierText})`;
    } else {
      name = modifierText;
    }
  }
  
  // Calculate points from adders (baseCost is usually 0, adders have the points)
  const adderPoints = calculateAdderCost(adders);
  const baseCost = getAttrNum(obj, 'BASECOST', 0);
  const totalPoints = Math.abs(baseCost + adderPoints);
  
  return {
    id: getAttr(obj, 'ID') || generateId(),
    name: name || alias || 'Unknown',
    alias: typeName,
    position: getAttrNum(obj, 'POSITION', 0),
    levels: getAttrNum(obj, 'LEVELS', 0),
    baseCost: baseCost,
    notes: getAttr(obj, 'NOTES') || undefined,
    type: (xmlid || 'GENERIC') as Disadvantage['type'],
    input: input || undefined,
    points: totalPoints,
    category: xmlid || undefined,
    modifiers: parseModifiers(obj),
    adders: adders,
  };
}

/**
 * Parse EQUIPMENT section - equipment items are essentially powers with Focus/OAF/etc limitations
 */
function parseEquipmentList(container: unknown): Equipment[] {
  if (!container || typeof container !== 'object') return [];
  const containerObj = container as Record<string, unknown>;
  const equipment: Equipment[] = [];
  
  // Lists and frameworks group gear (a Multipower shield's DCV and attack slots)
  for (const tag of ['LIST', ...FRAMEWORK_TYPES] as const) {
    const found = containerObj[tag];
    for (const el of found === undefined ? [] : Array.isArray(found) ? found : [found]) {
      if (typeof el !== 'object' || el === null) continue;
      const obj = el as Record<string, unknown>;
      const weightLbs = getAttrNum(obj, 'WEIGHT');
      const container = tag === 'LIST'
        ? ({
            id: getAttr(obj, 'ID') || generateId(),
            name: getAttr(obj, 'NAME') || getAttr(obj, 'ALIAS') || 'Equipment List',
            alias: getAttr(obj, 'ALIAS') || undefined,
            position: getAttrNum(obj, 'POSITION', 0),
            levels: 0,
            baseCost: 0,
            activeCost: 0,
            realCost: 0,
            isContainer: true,
            modifiers: parseModifiers(obj),
            adders: parseAdders(obj),
            notes: getAttr(obj, 'NOTES') || undefined,
            parentId: getAttr(obj, 'PARENTID', '') || undefined,
          } as Equipment)
        : (parseFramework(obj, tag) as unknown as Equipment);
      equipment.push({
        ...container,
        xmlId: tag,
        price: getAttrNum(obj, 'PRICE') || undefined,
        weight: weightLbs ? Math.round(weightLbs * 0.453592 * 10) / 10 : undefined,
        carried: getAttrBool(obj, 'CARRIED', true),
      });
    }
  }

  // Equipment section contains POWER elements; gear can also be a characteristic bought on
  // its own (<STR>, <DEX>, ...)
  const powerElements = powerLikeElements(containerObj);
  if (powerElements.length) {
    const arr = powerElements;
    for (const item of arr) {
      if (typeof item === 'object' && item !== null) {
        equipment.push(parseEquipmentItem(item as Record<string, unknown>));
      }
    }
  }

  // Slots cost their framework's fraction; lists and frameworks add up what's in them
  priceSlots(equipment);
  const totalled = new Set<string>();
  const total = (item: Equipment): void => {
    if (totalled.has(item.id)) return;
    totalled.add(item.id);
    if (!item.isContainer) return;
    const children = equipment.filter((e) => e.parentId === item.id);
    children.forEach(total);
    const own = item.ownCost ?? { real: 0, active: 0 };
    item.realCost = own.real + children.reduce((sum, c) => sum + (c.realCost ?? 0), 0);
    item.activeCost = isFramework(item.xmlId) ? own.active : own.active + children.reduce((sum, c) => sum + (c.activeCost ?? 0), 0);
  };
  equipment.forEach(total);
  return equipment.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

/**
 * A Compound Power's skill, perk and talent parts (Hero Designer allows them, e.g. a magic
 * sword's Combat Skill Levels; hero6e makes each a part of the compound, and CSLs there apply to
 * its attacks). Each is read as a power-shaped part, priced as a skill, perk or talent.
 */
function parseCompoundNonPowerParts(obj: Record<string, unknown>, parentId: string): Power[] {
  const parts: Power[] = [];
  for (const tag of ['SKILL', 'PERK', 'TALENT'] as const) {
    const found = obj[tag];
    for (const el of Array.isArray(found) ? found : found ? [found] : []) {
      if (typeof el !== 'object' || el === null) continue;
      const rec = el as Record<string, unknown>;
      const priced = tag === 'SKILL' ? parseSkill(rec) : tag === 'PERK' ? parsePerk(rec) : parseTalent(rec);
      parts.push({
        ...parsePower(rec),
        name: priced.name,
        parentId,
        baseCost: priced.baseCost,
        activeCost: priced.activeCost ?? priced.baseCost,
        realCost: priced.realCost,
      });
    }
  }
  return parts;
}

/**
 * Parse a single equipment item (which is stored as a POWER in HDC)
 */
function parseEquipmentItem(obj: Record<string, unknown>): Equipment {
  const xmlid = getAttr(obj, 'XMLID', '');
  const nameAttr = getAttr(obj, 'NAME', '');
  const alias = getAttr(obj, 'ALIAS', '');
  
  // Parse adders and modifiers
  const adders = parseAdders(obj);
  const modifiers = parseModifiers(obj);
  
  // Calculate costs similar to powers
  const baseCost = getAttrNum(obj, 'BASECOST', 0);
  const levels = getAttrNum(obj, 'LEVELS', 0);
  
  // Levels' cost: the file's LVLCOST, else the power's (or its option's), per level step
  const leveled = levelCost(getPowerDefinition(xmlid), getAttr(obj, 'OPTION', ''), levels, getAttrNum(obj, 'LVLCOST', -1));

  const adderCost = calculateAdderCost(adders);

  // For compound powers, we need to sum up child power costs
  let totalActiveCost = baseCost + leveled.cost + adderCost;
  let totalRealCost = 0;
  const childPowerDescriptions: string[] = [];
  const subPowers: Power[] = [];
  
  // Check for nested POWER elements (compound powers)
  const nestedPowers = obj['POWER'];
  if (nestedPowers) {
    const nestedArr = Array.isArray(nestedPowers) ? nestedPowers : [nestedPowers];
    for (const nested of nestedArr) {
      if (typeof nested === 'object' && nested !== null) {
        const nestedObj = nested as Record<string, unknown>;
        // An Endurance Reserve's Recovery is part of the reserve's own cost, not an item part
        if (getAttr(nestedObj, 'XMLID') === 'ENDURANCERESERVEREC') continue;

        // Parse fully as a Power object
        const childPower = parsePower(nestedObj);
        childPower.parentId = getAttr(obj, 'ID'); // Link to parent
        subPowers.push(childPower);
        
        // Add to totals (using values calculated by parsePower)
        // Ensure to handle undefined costs safely
        const childActive = childPower.activeCost ?? 0;
        const childReal = childPower.realCost ?? 0;
        
        totalActiveCost += childActive;
        totalRealCost += childReal;
        
        // Build description for this sub-power (legacy description building)
        const nestedAlias = childPower.alias || childPower.name;
        
        const nestedMods = childPower.modifiers || [];
        const nestedModDesc = nestedMods.map(m => m.name).join(', ');
        childPowerDescriptions.push(`${nestedAlias}${nestedModDesc ? ` (${nestedModDesc})` : ''} (Real Cost: ${childReal})`);
      }
    }
  }
  
  // Check for characteristic elements (STR, DEX, CON, etc.) inside compound equipment
  // These are characteristic boosts that can be part of equipment/items
  const characteristicTypes = [
    'STR', 'DEX', 'CON', 'INT', 'EGO', 'PRE',
    'OCV', 'DCV', 'OMCV', 'DMCV',
    'SPD', 'PD', 'ED', 'REC', 'END', 'BODY', 'STUN',
    'RUNNING', 'SWIMMING', 'LEAPING'
  ];
  
  for (const charType of characteristicTypes) {
    const charElement = obj[charType];
    if (charElement) {
      const charArr = Array.isArray(charElement) ? charElement : [charElement];
      for (const charItem of charArr) {
        if (typeof charItem === 'object' && charItem !== null) {
          const childPower = parsePower(charItem as Record<string, unknown>);
          childPower.parentId = getAttr(obj, 'ID'); // Link to parent
          subPowers.push(childPower);
          
          const childActive = childPower.activeCost ?? 0;
          const childReal = childPower.realCost ?? 0;
          
          totalActiveCost += childActive;
          totalRealCost += childReal;
          
          const powerDef = getPowerDefinition(charType);
          const displayName = powerDef?.display || `+${childPower.levels} ${charType}`;
          childPowerDescriptions.push(`${displayName} (Real Cost: ${childReal})`);
        }
      }
    }
  }

  for (const part of parseCompoundNonPowerParts(obj, getAttr(obj, 'ID'))) {
    subPowers.push(part);
    totalActiveCost += part.activeCost ?? 0;
    totalRealCost += part.realCost ?? 0;
    childPowerDescriptions.push(`${part.name} (Real Cost: ${part.realCost ?? 0})`);
  }
  // Parts in the order Hero Designer lists them
  subPowers.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  // Calculate advantage/limitation totals for the main power
  const advantageTotal = modifiers
    .filter((m) => (m.value ?? 0) > 0)
    .reduce((sum, m) => sum + (m.value ?? 0), 0);
  const limitationTotal = modifiers
    .filter((m) => (m.value ?? 0) < 0)
    .reduce((sum, m) => sum + Math.abs(m.value ?? 0), 0);
  
  // An item that is one power is priced as the powers section prices it (a Barrier's size and
  // defenses, an Endurance Reserve's Recovery, a negative characteristic's lack of refund)
  if (subPowers.length === 0 && xmlid !== 'COMPOUNDPOWER') {
    const single = parsePower(obj);
    totalActiveCost = single.activeCost ?? 0;
    totalRealCost = single.realCost ?? 0;
  } else if (totalRealCost === 0) {
    totalActiveCost = heroRoundCost((baseCost + leveled.cost + adderCost) * (1 + advantageTotal));
    totalRealCost = limitationTotal > 0 ? heroRoundCost(totalActiveCost / (1 + limitationTotal)) : totalActiveCost;
  }
  
  // Build description - include modifier details and child power details
  let description = alias;
  if (xmlid === 'COMPOUNDPOWER' && childPowerDescriptions.length > 0) {
    description = `(Total: ${totalActiveCost} Active Cost, ${totalRealCost} Real Cost) ${childPowerDescriptions.join(' plus ')}`;
  } else {
    const modDesc = modifiers.map(m => m.name).join(', ');
    if (modDesc) {
      description = `${alias} (${totalActiveCost} Active Points); ${modDesc}`;
    }
  }
  
  // Calculate END cost
  const endCost = Math.ceil(totalActiveCost / 10);
  
  // Convert weight from lbs (HDC file) to kg (UI)
  const weightLbs = getAttrNum(obj, 'WEIGHT');
  const weightKg = weightLbs ? Math.round(weightLbs * 0.453592 * 10) / 10 : undefined;
  
  return {
    id: getAttr(obj, 'ID') || generateId(),
    xmlId: xmlid,
    name: nameAttr || alias || 'Unknown Equipment',
    alias: description || alias || undefined,
    position: getAttrNum(obj, 'POSITION', 0),
    levels: levels,
    baseCost: totalActiveCost,
    activeCost: totalActiveCost,
    realCost: totalRealCost,
    notes: getAttr(obj, 'NOTES') || undefined,
    price: getAttrNum(obj, 'PRICE') || undefined,
    weight: weightKg,
    carried: getAttrBool(obj, 'CARRIED', true),
    input: getAttr(obj, 'INPUT') || undefined,
    option: getAttr(obj, 'OPTION') || undefined,
    optionAlias: getAttr(obj, 'OPTION_ALIAS') || undefined,
    affectsPrimary: getAttrBool(obj, 'AFFECTS_PRIMARY', true),
    affectsTotal: getAttrBool(obj, 'AFFECTS_TOTAL', true),
    endCost: endCost > 0 ? endCost : undefined,
    subPowers: subPowers.length > 0 ? subPowers : undefined,
    modifiers: modifiers,
    adders: adders,
    parentId: getAttr(obj, 'PARENTID', '') || undefined,
    slotFixed: getAttr(obj, 'ULTRA_SLOT') === 'Yes' || undefined,
  };
}

function parseModifiers(obj: Record<string, unknown>): Modifier[] {
  const modifiers: Modifier[] = [];
  const modContainer = obj['MODIFIERS'] ?? obj['MODIFIER'];
  
  if (!modContainer) return modifiers;
  
  const items = Array.isArray(modContainer) ? modContainer : [modContainer];
  for (const item of items) {
    if (typeof item === 'object' && item !== null) {
      const mod = item as Record<string, unknown>;
      const xmlid = getAttr(mod, 'XMLID', '');
      
      // BASECOST in modifiers is the modifier value (+0.5 for advantage, -0.25 for limitation)
      let modValue = getAttrNum(mod, 'BASECOST', 0);
      const levels = getAttrNum(mod, 'LEVELS', 0);
      const optionId = getAttr(mod, 'OPTIONID', '');
      const input = getAttr(mod, 'INPUT', ''); // Defense name for AVAD, etc.
      
      // Parse adders (like "All Or Nothing" for AVAD)
      const adders = parseAdders(mod);
      
      // Calculate adder cost contribution to the modifier value
      const adderCost = adders.reduce((sum, a) => sum + (a.baseCost || 0), 0);
      
      // Look up modifier definition to calculate leveled modifier values
      const modDef = getModifierByXmlId(xmlid);
      
      // For leveled modifiers (like Armor Piercing), calculate value from levels
      if (modDef && modDef.hasLevels && levels > 0) {
        // Use definition's baseCost + (levels * lvlCost)
        modValue = (modDef.baseCost || 0) + (levels * (modDef.lvlCost || 0));
      }
      
      // Area of Effect: +1/4 per doubling of its size, as Hero Designer prices it
      if (xmlid === 'AOE' && levels > 0) modValue = aoeValue(optionId || 'RADIUS', levels);
      
      // Add adder costs to the modifier value
      modValue += adderCost;

      // Hero Designer holds a modifier within its template MINCOST/MAXCOST (Requires A Roll is
      // at most -1/4, so a 14- roll is -1/4, not +1/4)
      modValue = clampModifierValue(modDef, modValue);

      const alias = getAttr(mod, 'ALIAS', '');
      const optionAlias = getAttr(mod, 'OPTION_ALIAS', '');
      
      // Build display name from alias and option
      let displayName = alias;
      if (optionAlias) {
        displayName = `${alias} (${optionAlias})`;
      }
      if (isNnd({ xmlId: xmlid, optionId, adders })) displayName = NND.display;
      
      // Check for explicit ISLIMITATION attribute (handles cases like Expanded Effect
      // where BASECOST is negative but it's actually an advantage due to level costs)
      const explicitIsLimitation = getAttr(mod, 'ISLIMITATION', '');
      let isAdvantage: boolean;
      let isLimitation: boolean;
      
      if (explicitIsLimitation !== '') {
        // Use explicit flag from XML
        isLimitation = explicitIsLimitation.toUpperCase() === 'YES';
        isAdvantage = !isLimitation;
      } else {
        // Fall back to value-based determination
        isAdvantage = modValue > 0;
        isLimitation = modValue < 0;
      }
      
      modifiers.push({
        id: getAttr(mod, 'ID') || generateId(),
        xmlId: xmlid || undefined,
        name: displayName || getAttr(mod, 'NAME', 'Unknown Modifier'),
        alias: alias || undefined,
        value: modValue,  // Use calculated modifier value
        isAdvantage,
        isLimitation,
        notes: getAttr(mod, 'NOTES') || getAttr(mod, 'COMMENTS') || undefined,
        comments: getAttr(mod, 'COMMENTS') || undefined,
        levels: levels || undefined,
        adders: adders,  // Use already-parsed adders
        input: input || undefined,
        optionId: optionId || undefined,
        optionAlias: optionAlias || undefined,
      });
    }
  }
  
  return modifiers;
}

function parseAdders(obj: Record<string, unknown>, preserveHierarchy: boolean = false): Adder[] {
  const adders: Adder[] = [];
  const adderContainer = obj['ADDERS'] ?? obj['ADDER'];
  
  if (!adderContainer) return adders;
  
  const items = Array.isArray(adderContainer) ? adderContainer : [adderContainer];
  for (const item of items) {
    if (typeof item === 'object' && item !== null) {
      const add = item as Record<string, unknown>;
      // Check if this adder is selected
      const selected = getAttr(add, 'SELECTED', 'YES');
      const isSelected = selected !== 'NO';
      
      // Recursively parse nested adders
      const nestedAdders = parseAdders(add, preserveHierarchy);
      
      // Only add this adder if it's selected (SELECTED="YES" or no SELECTED attribute)
      // Or if we're preserving hierarchy for weapon element editing
      if (isSelected || preserveHierarchy) {
        const includeInBase = getAttr(add, 'INCLUDEINBASE', 'No').toUpperCase() === 'YES';
        const optionAlias = getAttr(add, 'OPTION_ALIAS', '');
        const rawLevels = getAttrNum(add, 'LEVELS', 0);
        const lvlCost = getAttrNum(add, 'LVLCOST', 0);
        const lvlVal = getAttrNum(add, 'LVLVAL', 1);
        const xmlId = getAttr(add, 'XMLID', '');
        
        // For adders with lvlVal > 1 (like TELESCOPIC), the stored LEVELS is actually
        // the raw value. The effective levels for cost/display = LEVELS / LVLVAL
        // e.g., TELESCOPIC with LEVELS=6, LVLVAL=2 => effective 3 levels (+3 range, 3 pts)
        const effectiveLevels = lvlVal > 1 ? Math.floor(rawLevels / lvlVal) : rawLevels;
        
        const adder: Adder = {
          id: getAttr(add, 'ID') || generateId(),
          xmlId: xmlId || undefined,
          name: getAttr(add, 'ALIAS') || getAttr(add, 'NAME', 'Unknown Adder'),
          alias: getAttr(add, 'ALIAS') || undefined,
          baseCost: getAttrNum(add, 'BASECOST', 0),
          levels: effectiveLevels || undefined,
          lvlCost: lvlCost || undefined,
          lvlVal: lvlVal !== 1 ? lvlVal : undefined,
          notes: getAttr(add, 'NOTES') || undefined,
          optionId: getAttr(add, 'OPTIONID') || undefined,
          optionAlias: optionAlias || undefined,
          includeInBase: includeInBase,
          selected: isSelected,
        };
        
        // If preserving hierarchy, attach nested adders directly
        if (preserveHierarchy && nestedAdders.length > 0) {
          adder.adders = nestedAdders;
        }
        
        adders.push(adder);
      }
      
      // If not preserving hierarchy, flatten nested adders into the list
      if (!preserveHierarchy) {
        adders.push(...nestedAdders);
      }
    }
  }
  
  return adders;
}

/**
 * Calculate total cost from adders recursively
 * For leveled adders: cost = baseCost + (levels * lvlCost)
 */
function calculateAdderCost(adders: Adder[]): number {
  return adders.reduce((sum, adder) => {
    const baseCost = adder.baseCost ?? 0;
    const levels = adder.levels ?? 0;
    const lvlCost = adder.lvlCost ?? 0;
    // For leveled adders, add baseCost + (levels * lvlCost)
    // e.g., TELESCOPIC: baseCost=0, levels=6, lvlCost=1 => 0 + 6*1 = 6
    return sum + baseCost + (levels * lvlCost);
  }, 0);
}

/** Only maxima the file sets: Hero Designer treats a missing <CHAR>_MAX as no limit */
function parseCharacteristicMaxima(obj: Record<string, unknown>): Rules['characteristicMaxima'] {
  const maxima: Rules['characteristicMaxima'] = {};
  for (const type of Object.keys(CHARACTERISTIC_RULES_6E) as CharacteristicType[]) {
    const raw = getAttr(obj, `${type}_MAX`);
    const value = Number(raw);
    if (raw !== '' && Number.isFinite(value)) maxima[type] = value;
  }
  return maxima;
}

function parseRules(obj: Record<string, unknown>): Rules | undefined {
  if (!obj || Object.keys(obj).length === 0) return undefined;
  
  return {
    name: getAttr(obj, 'name', 'Default'),
    basePoints: getAttrNum(obj, 'BASEPOINTS', 200),
    disadPoints: getAttrNum(obj, 'DISADPOINTS', 150),
    apPerEnd: getAttrNum(obj, 'APPEREND', 10),
    strApPerEnd: getAttrNum(obj, 'STRAPPEREND', 10),
    attackApMaxValue: getAttrNum(obj, 'ATTACKAPMAXVALUE', 70),
    attackApMaxResponse: getAttrNum(obj, 'ATTACKAPMAXRESPONSE', 0),
    defenseApMaxValue: getAttrNum(obj, 'DEFENSEAPMAXVALUE', 90),
    defenseApMaxResponse: getAttrNum(obj, 'DEFENSEAPMAXRESPONSE', 0),
    disadCategoryMaxValue: getAttrNum(obj, 'DISADCATEGORYMAXVALUE', 75),
    disadCategoryMaxResponse: getAttrNum(obj, 'DISADCATEGORYMAXRESPONSE', 0),
    characteristicMaxima: parseCharacteristicMaxima(obj),
    races: parseRulesName(getAttr(obj, 'name')).races,
    standardEffectAllowed: getAttrBool(obj, 'STANDARDEFFECTALLOWED', true),
    multiplierAllowed: getAttrBool(obj, 'MULTIPLIERALLOWED', false),
    literacyFree: getAttrBool(obj, 'LITERACYFREE', false),
    nativeLiteracyFree: getAttrBool(obj, 'NATIVELITERACYFREE', true),
    equipmentAllowed: getAttrBool(obj, 'EQUIPMENTALLOWED', true),
    useSkillMaxima: getAttrBool(obj, 'USESKILLMAXIMA', false),
    skillMaximaLimit: getAttrNum(obj, 'SKILLMAXIMALIMIT', 13),
    skillRollBase: getAttrNum(obj, 'SKILLROLLBASE', 9),
    skillRollDenominator: getAttrNum(obj, 'SKILLROLLDENOMINATOR', 5),
    charRollBase: getAttrNum(obj, 'CHARROLLBASE', 9),
    charRollDenominator: getAttrNum(obj, 'CHARROLLDENOMINATOR', 5),
    notes1Label: getAttr(obj, 'NOTES1LABEL') || undefined,
    notes2Label: getAttr(obj, 'NOTES2LABEL') || undefined,
    notes3Label: getAttr(obj, 'NOTES3LABEL') || undefined,
    notes4Label: getAttr(obj, 'NOTES4LABEL') || undefined,
    notes5Label: getAttr(obj, 'NOTES5LABEL') || undefined,
    useNotes1: getAttrBool(obj, 'USENOTES1'),
    useNotes2: getAttrBool(obj, 'USENOTES2'),
    useNotes3: getAttrBool(obj, 'USENOTES3'),
    useNotes4: getAttrBool(obj, 'USENOTES4'),
    useNotes5: getAttrBool(obj, 'USENOTES5'),
  };
}
