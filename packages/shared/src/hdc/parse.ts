/**
 * HDC -> Character view-model parsing.
 *
 * Ported from the backend parser. The parse functions below still consume the
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
import { generateId, heroRoundCost } from '../utils.js';
import { getPowerDefinition } from '../powerDefinitions.js';
import { getModifierByXmlId } from '../modifierDefinitions.js';
import {
  CHARACTERISTIC_RULES_6E,
  characteristicCost,
  characteristicRulesFor,
  parseRulesName,
  type CharacteristicRule,
} from '../characteristics.js';
import { HdcDocument } from './document.js';
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
    return (element as Record<string, unknown>)['#text'] as string ?? String(element);
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
  
  // Parse all POWER elements
  const powerElements = containerObj['POWER'];
  if (powerElements) {
    const arr = Array.isArray(powerElements) ? powerElements : [powerElements];
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
          
          // Parse SKILL elements inside compound powers (skill enhancers, etc.)
          const nestedSkills = powerObj['SKILL'];
          if (nestedSkills) {
            const skillArr = Array.isArray(nestedSkills) ? nestedSkills : [nestedSkills];
            for (const skillItem of skillArr) {
              if (typeof skillItem === 'object' && skillItem !== null) {
                // Parse skill as power with minimal info for cost calculation
                const childPower = parsePower(skillItem as Record<string, unknown>);
                childPower.parentId = power.id;
                powers.push(childPower);
              }
            }
          }
        }
      }
    }
  }
  
  // Calculate container costs (sum of child real costs) for LIST and COMPOUNDPOWER
  for (const power of powers) {
    if (power.type === 'LIST' || power.type === 'COMPOUNDPOWER' || power.isContainer) {
      const childPowers = powers.filter(p => p.parentId === power.id);
      power.realCost = childPowers.reduce((sum, child) => sum + (child.realCost ?? 0), 0);
      power.activeCost = childPowers.reduce((sum, child) => sum + (child.activeCost ?? 0), 0);
      power.baseCost = power.activeCost;
    }
  }
  
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
  if (input) {
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
  if (nameAttr && nameAttr !== alias) {
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
  
  let totalCost = Math.ceil(baseCost + levels + adderCost);
  
  // Combat Skill Levels have costs based on broadness (option)
  // SINGLE = 2 CP/level, TIGHT = 3 CP/level, BROAD/HTH/RANGED = 5 CP/level, ALL = 8 CP/level
  if (xmlid === 'COMBAT_LEVELS') {
    const cslCostPerLevel: Record<string, number> = {
      'SINGLE': 2,     // Single Attack
      'TIGHT': 3,      // Three Maneuvers or Tight Group  
      'SMALL': 3,      // Small Group (alias for tight)
      'HTH': 5,        // All HTH Combat
      'RANGED': 5,     // All Ranged Combat
      'BROAD': 5,      // All HTH or All Ranged
      'ALL': 8,        // All Combat
      'DCV': 8,        // Overall DCV (like ALL)
      'OCV': 8,        // Overall OCV (like ALL)
    };
    const costPerLevel = cslCostPerLevel[option] ?? 2; // Default to SINGLE if unknown
    totalCost = levels * costPerLevel;
  }
  
  // Regular Skill Levels have costs based on broadness (option)
  // SINGLE/CHARACTERISTIC = 2 CP/level, THREE = 3 CP/level, GROUP = 4 CP/level, ALL = 6 CP/level
  if (xmlid === 'SKILL_LEVELS') {
    const slCostPerLevel: Record<string, number> = {
      'SINGLE': 2,          // Single Skill
      'CHARACTERISTIC': 2,  // Single Skill or Characteristic Roll
      'THREE': 3,           // Three Related Skills
      'TIGHT': 3,           // Tight Group of Skills
      'GROUP': 4,           // Broad Group of Skills
      'BROAD': 4,           // Broad Group of Skills
      'OVERALL': 6,         // All Skills based on a Characteristic
      'ALL': 6,             // All Skills based on a Characteristic
    };
    const costPerLevel = slCostPerLevel[option] ?? 2; // Default to SINGLE if unknown
    totalCost = levels * costPerLevel;
  }
  
  // Apply modifiers (limitations reduce cost, advantages would increase active cost)
  // For skills, we only care about limitations which reduce the real cost
  const limitations = modifiers
    .filter(m => (m.value ?? 0) < 0)
    .reduce((sum, m) => sum + Math.abs(m.value ?? 0), 0);
  
  let realCost = totalCost;
  if (limitations > 0) {
    // Real Cost = Active Cost / (1 + Total Limitations)
    realCost = heroRoundCost(totalCost / (1 + limitations));
  }
  
  // Everyman skills are always free (0 cost)
  if (everyman) {
    totalCost = 0;
    realCost = 0;
  }
  // Familiarity costs 1 point minimum (unless it's native tongue or everyman)
  else if (familiarity && totalCost === 0) {
    totalCost = 1;
    realCost = 1;
  }
  
  // Native tongue languages are free (0 cost) - native literacy is also free per campaign rules
  if (nativeTongue) {
    totalCost = 0; // Native tongue and native literacy are free
    realCost = 0;
  }
  
  // Store PARENTID for list discount application
  const parentId = getAttr(obj, 'PARENTID', '');
  
  return {
    id: getAttr(obj, 'ID') || generateId(),
    name: displayName || xmlid || 'Unknown Skill',
    alias: alias || undefined,
    position: getAttrNum(obj, 'POSITION', 0),
    levels: levels,
    baseCost: totalCost,
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
    // Contact: Name Roll- (roll = 8 + (levels - 1) = 7 + levels)
    const contactRoll = 7 + levels;
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
  
  if (xmlid === 'VEHICLE_BASE') {
    // Vehicles & Bases: cost = BASEPOINTS / 5 (1 CP per 5 points in the base)
    const basePoints = getAttrNum(obj, 'BASEPOINTS', 0);
    totalCost = Math.ceil(basePoints / 5);
    activeCost = totalCost;
  } else if (xmlid === 'CONTACT') {
    // Contact: LEVELS is the cost (1 per level typically)
    totalCost = levels > 0 ? levels : 1;
    activeCost = totalCost;
  } else if (xmlid === 'REPUTATION' || xmlid === 'POSITIVE_REPUTATION') {
    // Reputation: cost is from adders only (LEVELS is effect magnitude, not cost)
    // The LEVELS attribute describes the reaction roll bonus (+X/+Xd6), not cost
    // Adders with INCLUDEINBASE="Yes" contribute to the base cost
    activeCost = Math.ceil(Math.abs(baseCost) + adderCost);
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

function parseTalent(obj: Record<string, unknown>): Talent {
  // HDC files use XMLID for the talent type
  const xmlid = getAttr(obj, 'XMLID', '');
  const alias = getAttr(obj, 'ALIAS', '');
  const name = alias || getAttr(obj, 'NAME', '') || xmlid || 'Unknown Talent';
  const levels = getAttrNum(obj, 'LEVELS', 0);
  const baseCost = getAttrNum(obj, 'BASECOST', 0);
  
  // For custom talents, LEVELS is the cost; otherwise baseCost + adders
  const adders = parseAdders(obj);
  const adderCost = calculateAdderCost(adders);
  const totalCost = xmlid === 'CUSTOMTALENT' ? levels : Math.ceil(baseCost + levels + adderCost);
  
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
  
  // If LVLCOST not specified in HDC file (or is default 1), look up from power definition
  if (lvlCost < 0) {
    if (powerDef) {
      lvlCost = powerDef.lvlCost;
      // Check for option-specific lvlCost (e.g., Darkness Hearing Group = 3, Sight Group = 5)
      if (optionId && powerDef.options) {
        const selectedOption = powerDef.options.find(o => o.xmlId === optionId);
        if (selectedOption && selectedOption.lvlCost !== undefined) {
          lvlCost = selectedOption.lvlCost;
        }
      }
    } else {
      lvlCost = 1; // Default fallback
    }
  }
  
  const adderCost = calculateAdderCost(adders);
  
  // True base cost = BASECOST + (levels * lvlCost) + adderCosts (before advantages)
  let trueBaseCost = hdcBaseCost + (levels * lvlCost) + adderCost;
  
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
  const activeCost = heroRoundCost(trueBaseCost * (1 + advantageTotal));
  
  // Real Cost = Active Points / (1 + limitation total)
  let realCost = activeCost;
  if (limitationTotal > 0) {
    realCost = heroRoundCost(activeCost / (1 + limitationTotal));
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
  
  // Build description from alias and modifiers
  const description = alias || '';
  
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
    notes: description || getAttr(obj, 'NOTES') || undefined,
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
  
  // Equipment section contains POWER elements (and LIST elements for grouping)
  const powerElements = containerObj['POWER'];
  if (powerElements) {
    const arr = Array.isArray(powerElements) ? powerElements : [powerElements];
    for (const item of arr) {
      if (typeof item === 'object' && item !== null) {
        equipment.push(parseEquipmentItem(item as Record<string, unknown>));
      }
    }
  }
  
  return equipment;
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
  
  // Get level cost from HDC file first, then look up from power definition
  let lvlCost = getAttrNum(obj, 'LVLCOST', -1);
  if (lvlCost < 0) {
    const powerDef = getPowerDefinition(xmlid);
    lvlCost = powerDef?.lvlCost ?? 1;
  }
  
  const adderCost = calculateAdderCost(adders);
  
  // For compound powers, we need to sum up child power costs
  let totalActiveCost = baseCost + (levels * lvlCost) + adderCost;
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
    // Skip DCV if already handled above (DCV has special handling for shields)
    if (charType === 'DCV') continue;
    
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
  
  // Also check for DCV elements (shields, etc.)
  const dcvElements = obj['DCV'];
  if (dcvElements) {
    const dcvArr = Array.isArray(dcvElements) ? dcvElements : [dcvElements];
    for (const dcv of dcvArr) {
      if (typeof dcv === 'object' && dcv !== null) {
        const dcvObj = dcv as Record<string, unknown>;
        const dcvMods = parseModifiers(dcvObj);
        const dcvBase = getAttrNum(dcvObj, 'BASECOST', 0);
        const dcvLevels = getAttrNum(dcvObj, 'LEVELS', 0);
        const dcvLvlCost = 5; // DCV costs 5 per level
        
        const dcvLimTotal = dcvMods
          .filter((m) => (m.value ?? 0) < 0)
          .reduce((sum, m) => sum + Math.abs(m.value ?? 0), 0);
        
        const dcvActive = dcvBase + (dcvLevels * dcvLvlCost);
        const dcvReal = dcvLimTotal > 0 ? heroRoundCost(dcvActive / (1 + dcvLimTotal)) : dcvActive;
        
        totalActiveCost += dcvActive;
        totalRealCost += dcvReal;
        
        const dcvModDesc = dcvMods.map(m => m.name).join(', ');
        childPowerDescriptions.push(`+${dcvLevels} DCV${dcvModDesc ? ` (${dcvModDesc})` : ''} (Real Cost: ${dcvReal})`);
      }
    }
  }
  
  // Calculate advantage/limitation totals for the main power
  const advantageTotal = modifiers
    .filter((m) => (m.value ?? 0) > 0)
    .reduce((sum, m) => sum + (m.value ?? 0), 0);
  const limitationTotal = modifiers
    .filter((m) => (m.value ?? 0) < 0)
    .reduce((sum, m) => sum + Math.abs(m.value ?? 0), 0);
  
  // If no nested powers, calculate from main power
  if (totalRealCost === 0) {
    totalActiveCost = heroRoundCost((baseCost + (levels * lvlCost) + adderCost) * (1 + advantageTotal));
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
    endCost: endCost > 0 ? endCost : undefined,
    subPowers: subPowers.length > 0 ? subPowers : undefined,
    modifiers: modifiers,
    adders: adders,
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
      
      // For AOE (Area of Effect), calculate value based on area size and shape
      // Different shapes have multipliers - LINE gets 4x distance for same cost as RADIUS
      // Formula: +1/4 per 4m of effective radius, round up
      if (xmlid === 'AOE' && levels > 0) {
        const shapeMultipliers: Record<string, number> = {
          'RADIUS': 1,
          'CONE': 2,
          'LINE': 4,
          'SURFACE': 0.5,
        };
        const shapeMultiplier = shapeMultipliers[optionId] || 1;
        const effectiveRadius = levels / shapeMultiplier;
        const costLevels = Math.ceil(effectiveRadius / 4);
        modValue = costLevels * 0.25;
      }
      
      // Add adder costs to the modifier value
      modValue += adderCost;
      
      const alias = getAttr(mod, 'ALIAS', '');
      const optionAlias = getAttr(mod, 'OPTION_ALIAS', '');
      
      // Build display name from alias and option
      let displayName = alias;
      if (optionAlias) {
        displayName = `${alias} (${optionAlias})`;
      }
      
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
