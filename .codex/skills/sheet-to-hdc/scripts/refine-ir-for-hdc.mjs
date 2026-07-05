#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';

const [, , inputPath, outputPath, gridPath] = process.argv;

if (!inputPath || !outputPath) {
  console.error('Usage: node refine-ir-for-hdc.mjs <input-ir.json> <output-ir.json> [sheet-grid.json]');
  process.exit(2);
}

const ir = readJson(inputPath);
const grid = gridPath ? readJson(gridPath) : undefined;
const gridIndex = grid ? buildGridIndex(grid) : new Map();

const refined = structuredClone(ir);
refined.perks = Array.isArray(refined.perks) ? refined.perks : [];
refined.talents = Array.isArray(refined.talents) ? refined.talents : [];
refined.warnings = Array.isArray(refined.warnings) ? refined.warnings : [];

const remainingSkills = [];
for (const item of asArray(refined.skills)) {
  const kind = classifyItem(item);
  if (kind === 'perk') {
    refined.perks.push(toPerk(item));
  } else if (kind === 'talent') {
    refined.talents.push(toTalent(item));
  } else {
    remainingSkills.push(refineSkill(item));
  }
}
refined.skills = normalizeSkillHierarchy(remainingSkills);
refined.skills = applyCampaignFreeAdjustments(refined.skills);

const remainingPowers = [];
for (const item of asArray(refined.powers)) {
  const kind = classifyItem(item);
  const withCost = normalizePowerForHeroDesigner(refinePowerCost(item, gridIndex));

  if (kind === 'perk') {
    refined.perks.push(toPerk(withCost));
  } else if (kind === 'talent') {
    refined.talents.push(toTalent(withCost));
  } else {
    remainingPowers.push(withCost);
  }
}
refined.powers = applyPowerGroupAdjustments(applyCampaignFreeAdjustments(groupPowersForDisplay(remainingPowers)));
refined.equipment = applyCampaignFreeAdjustments(refineEquipmentItems(asArray(refined.equipment)));
refined.perks = applyCampaignFreeAdjustments(refined.perks);
refined.talents = applyCampaignFreeAdjustments(refined.talents);
refined.perks = renumberPositions(refined.perks);
refined.talents = renumberPositions(refined.talents);
refined.skills = renumberPositions(refined.skills);
refined.powers = renumberPositions(refined.powers);
refined.equipment = renumberPositions(refined.equipment);
refined.refinement = {
  ...(refined.refinement ?? {}),
  hdcCategoryAndCostPass: true,
  notes: [
    'Sheet-derived custom powers use visible/real sheet costs as Hero Designer CUSTOMPOWER BASECOST.',
    'Known contacts, favors, reputations, bases, and Danger Sense are moved to their Hero Designer sections.',
    'High-confidence skill enhancers are emitted as enhancer tags so Hero Designer can display them separately from generic skills.',
    'Power entries are grouped into Hero Designer lists by source sheet to preserve visual divisions such as racial powers and spells.',
    'Equipment is promoted to compound powers where parseable sub-effects can be resolved into characteristic or power children.',
    'Explicit campaign freebies such as "[1pt free]" are preserved as negative generic adders so Hero Designer can keep the underlying item while reflecting the discount.',
  ],
};

writeFileSync(outputPath, `${JSON.stringify(refined, null, 2)}\n`, 'utf8');
console.log(`Wrote ${outputPath}`);

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function lower(value) {
  return String(value ?? '').trim().toLowerCase();
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function classifyItem(item) {
  const name = lower(item.name);
  const text = lower(`${item.name ?? ''} ${item.alias ?? ''} ${item.input ?? ''} ${item.notes ?? ''}`);
  if (/^contact\b/.test(name) || /^\s*contact\b/.test(lower(item.input)) || /\[\s*\d+\s*pt\s+contact\b/.test(text)) {
    return 'perk';
  }
  if (/\bfavou?r\b/.test(text)) {
    return 'perk';
  }
  if (/\brep(?:utation)?\b/.test(text) || /\bsaviors? of the empire\b/.test(text)) {
    return 'perk';
  }
  if (/\bbase contribution\b/.test(text)) {
    return 'perk';
  }
  if (/\bdanger sense\b/.test(text)) {
    return 'talent';
  }
  return 'power';
}

function toPerk(item) {
  const name = lower(item.name);
  const text = lower(`${item.name ?? ''} ${item.alias ?? ''} ${item.input ?? ''} ${item.notes ?? ''}`);
  let xmlId = 'GENERIC';
  let alias = item.alias ?? item.name;
  const pointCost = numberValue(item.realCost ?? item.sheetCost ?? item.points ?? item.baseCost) ?? embeddedPointCost(item) ?? 0;
  if (/^contact\b/.test(name) || /^\s*contact\b/.test(lower(item.input)) || /\[\s*\d+\s*pt\s+contact\b/.test(text)) {
    xmlId = 'CONTACT';
    alias = 'Contact';
  } else if (/\bfavou?r\b/.test(text)) {
    xmlId = 'FAVOR';
    alias = 'Favor';
  } else if (/\brep(?:utation)?\b/.test(text) || /\bsaviors? of the empire\b/.test(text)) {
    xmlId = 'REPUTATION';
    alias = 'Positive Reputation';
  } else if (/\bbase contribution\b/.test(text)) {
    xmlId = 'VEHICLE_BASE';
    alias = 'Vehicles & Bases';
  }

  const perk = {
    ...item,
    xmlId,
    alias,
    input: item.input ?? item.description ?? item.notes,
    baseCost: pointCost,
    levels: 0,
  };
  if (xmlId === 'CONTACT') {
    perk.baseCost = 0;
    perk.levels = pointCost || 1;
  } else if (xmlId === 'VEHICLE_BASE') {
    perk.baseCost = 0;
    perk.levels = 0;
    perk.number = item.number ?? 1;
    perk.basePoints = item.basePoints ?? pointCost * 5;
    perk.disadPoints = item.disadPoints ?? 0;
  }
  return perk;
}

function toTalent(item) {
  return {
    ...item,
    xmlId: 'DANGER_SENSE',
    alias: item.alias ?? 'Danger Sense',
    input: item.input ?? item.description ?? item.notes,
    baseCost: numberValue(item.realCost ?? item.sheetCost ?? item.points ?? item.baseCost) ?? 0,
    levels: 0,
  };
}

function refineSkill(item) {
  const name = lower(item.name);
  if (name === 'scientist') {
    return normalizeSkillMetadata({
      ...item,
      tag: 'SCIENTIST',
      xmlId: 'SCIENTIST',
      alias: item.alias ?? 'Scientist',
    });
  }
  if (name === 'linguist') {
    return normalizeSkillMetadata({
      ...item,
      tag: 'LINGUIST',
      xmlId: 'LINGUIST',
      alias: item.alias ?? 'Linguist',
    });
  }
  const canonical = canonicalSkillShape(item);
  if (canonical) {
    return normalizeSkillMetadata({
      ...item,
      ...canonical,
    });
  }
  return normalizeSkillMetadata(item);
}

function canonicalSkillShape(item) {
  const rawName = String(item.name ?? '').trim();
  if (!rawName) {
    return undefined;
  }

  const prefixPatterns = [
    { pattern: /^KS:\s*(.+)$/i, xmlId: 'KNOWLEDGE_SKILL', alias: 'KS' },
    { pattern: /^AK:\s*(.+)$/i, xmlId: 'KNOWLEDGE_SKILL', alias: 'AK', type: 'Area' },
    { pattern: /^CK:\s*(.+)$/i, xmlId: 'KNOWLEDGE_SKILL', alias: 'CK', type: 'City' },
    { pattern: /^CuK:\s*(.+)$/i, xmlId: 'KNOWLEDGE_SKILL', alias: 'CuK', type: 'Cultural' },
    { pattern: /^PS:\s*(.+)$/i, xmlId: 'PROFESSIONAL_SKILL', alias: 'PS' },
    { pattern: /^SS:\s*(.+)$/i, xmlId: 'SCIENCE_SKILL', alias: 'SS' },
  ];

  for (const entry of prefixPatterns) {
    const match = rawName.match(entry.pattern);
    if (match) {
      return {
        xmlId: entry.xmlId,
        alias: entry.alias,
        type: entry.type,
        input: match[1].trim(),
        name: '',
      };
    }
  }

  const inventorMatch = rawName.match(/^Inventor:\s*(.+)$/i);
  if (inventorMatch) {
    return {
      xmlId: 'INVENTOR',
      alias: 'Inventor',
      input: inventorMatch[1].trim(),
      name: '',
    };
  }

  const systemsOperationMatch = rawName.match(/^Systems Operation\s*(?:[:-]\s*|\s+)\s*(.+)$/i);
  if (systemsOperationMatch) {
    return {
      xmlId: 'SYSTEMS_OPERATION',
      alias: 'Systems Operation',
      input: systemsOperationMatch[1].trim(),
      name: '',
    };
  }

  if (/^Systems Operation$/i.test(rawName)) {
    return {
      xmlId: 'SYSTEMS_OPERATION',
      alias: 'Systems Operation',
      name: '',
    };
  }

  return undefined;
}

function normalizeSkillMetadata(item) {
  const xmlId = String(item.xmlId ?? '').trim().toUpperCase();
  const normalized = {
    ...item,
    familiarity: item.familiarity ?? false,
    proficiency: item.proficiency ?? false,
  };

  if (xmlId && xmlId !== 'LANGUAGES' && !normalized.characteristic) {
    normalized.characteristic = 'GENERAL';
  }

  if (xmlId === 'LANGUAGES') {
    normalized.option = normalized.option ?? 'BASIC';
    normalized.optionId = normalized.optionId ?? 'BASIC';
    normalized.optionAlias = normalized.optionAlias ?? 'basic conversation';
    normalized.nativeTongue = normalized.nativeTongue ?? false;
  }

  if (xmlId === 'KNOWLEDGE_SKILL') {
    if (!normalized.type) {
      if (normalized.alias === 'AK') {
        normalized.type = 'Area';
      } else if (normalized.alias === 'CK') {
        normalized.type = 'City';
      } else if (normalized.alias === 'CuK') {
        normalized.type = 'Cultural';
      } else {
        normalized.type = 'Groups';
      }
    }
  }

  if (xmlId === 'AREA_KNOWLEDGE') {
    normalized.xmlId = 'KNOWLEDGE_SKILL';
    normalized.alias = normalized.alias || 'AK';
    normalized.type = normalized.type ?? 'Area';
  }

  if (xmlId === 'CITY_KNOWLEDGE') {
    normalized.xmlId = 'KNOWLEDGE_SKILL';
    normalized.alias = normalized.alias || 'CK';
    normalized.type = normalized.type ?? 'City';
  }

  if (xmlId === 'COMBAT_LEVELS') {
    normalized.option = normalized.option ?? 'SINGLE';
    normalized.optionId = normalized.optionId ?? 'SINGLE';
    normalized.optionAlias = normalized.optionAlias ?? 'with any single attack';
    normalized.levels = numberValue(normalized.levels) ?? 1;
  }

  return normalized;
}

function normalizeSkillHierarchy(items) {
  const skills = items.map((item, index) => ({
    ...item,
    position: numberValue(item.position) ?? index,
  }));

  const scientist = skills.find((item) => item.tag === 'SCIENTIST');
  if (scientist) {
    scientist.id = scientist.id ?? 'skill-enhancer-scientist';
    const nextEnhancerPosition = nextEnhancerBoundary(skills, scientist.position);
    for (const skill of skills) {
      if (!skill.parentId && skill.position > scientist.position && skill.position < nextEnhancerPosition && isScienceSkill(skill)) {
        skill.parentId = scientist.id;
        skill.xmlId = 'SCIENCE_SKILL';
        skill.input = normalizedSkillInput(skill);
        Object.assign(skill, normalizeSkillMetadata(skill));
      }
    }
  }

  const linguist = skills.find((item) => item.tag === 'LINGUIST');
  if (linguist) {
    linguist.id = linguist.id ?? 'skill-enhancer-linguist';
    const nextEnhancerPosition = nextEnhancerBoundary(skills, linguist.position);
    for (const skill of skills) {
      if (!skill.parentId && skill.position > linguist.position && skill.position < nextEnhancerPosition && isLanguageSkill(skill)) {
        skill.parentId = linguist.id;
        Object.assign(skill, normalizeSkillMetadata(skill));
      }
    }
  }

  return skills.sort((left, right) => left.position - right.position);
}

function nextEnhancerBoundary(items, position) {
  return items
    .filter((item) => item.position > position && (item.tag === 'SCIENTIST' || item.tag === 'LINGUIST' || item.tag === 'LIST'))
    .reduce((lowest, item) => Math.min(lowest, item.position), Number.POSITIVE_INFINITY);
}

function isScienceSkill(item) {
  const name = lower(item.name);
  if (lower(item.xmlId) === 'science_skill') {
    return true;
  }
  return [
    'geology',
    'powerstones',
    'subterranean engineering',
    'planar theory',
    'bearmen engineering',
  ].includes(name);
}

function isLanguageSkill(item) {
  return lower(item.xmlId) === 'languages' || /\[[fb]\\l\]/i.test(String(item.name ?? '')) || /^native language:/i.test(String(item.name ?? ''));
}

function normalizedSkillInput(item) {
  const name = String(item.name ?? '').trim();
  if (name.startsWith('SS:')) {
    return name.slice(3).trim();
  }
  return name;
}

function groupPowersForDisplay(items) {
  const powers = items
    .map((item, index) => ({ ...item, position: numberValue(item.position) ?? index }))
    .sort((left, right) => left.position - right.position);
  const grouped = [];
  let currentGroupId;
  let currentGroupAlias;
  const aliasCounts = new Map();

  for (const power of powers) {
    const groupAlias = inferPowerGroupAlias(power);
    if (groupAlias && groupAlias !== currentGroupAlias) {
      const occurrence = (aliasCounts.get(groupAlias) ?? 0) + 1;
      aliasCounts.set(groupAlias, occurrence);
      currentGroupId = `power-group-${slug(groupAlias)}-${occurrence}`;
      currentGroupAlias = groupAlias;
      grouped.push({
        id: currentGroupId,
        tag: 'LIST',
        xmlId: 'LIST',
        alias: groupAlias,
        text: groupAlias,
        name: '',
        notes: `Grouped from ${groupAlias}`,
      });
    }
    if (groupAlias && !power.parentId) {
      power.parentId = currentGroupId;
    }
    grouped.push(power);
  }

  return grouped;
}

function applyPowerGroupAdjustments(items) {
  return items.map((item) => {
    if (item?.tag !== 'LIST' || item.alias !== 'Tribunal Powers') {
      return item;
    }

    const childNotes = items
      .filter((candidate) => candidate.parentId === item.id)
      .map((candidate) => `${candidate.name ?? ''} ${candidate.alias ?? ''} ${candidate.input ?? ''} ${candidate.notes ?? ''}`)
      .join(' ');

    if (!/\bannual upkeep requirements\b/i.test(childNotes)) {
      return item;
    }

    return {
      ...item,
      notes: `${item.notes ?? 'Grouped from Tribunal Powers'}; annual upkeep requirements apply to this campaign-granted set`,
    };
  });
}

function inferPowerGroupAlias(item) {
  const ref = firstSourceRef(item);
  if (/^Racial Abilities!/i.test(ref)) {
    return 'Racial Powers';
  }
  if (/^Earth Magic Grimoire!/i.test(ref)) {
    return 'Earth Magic Spells';
  }
  if (/^TribunalEveryman!/i.test(ref)) {
    return 'Tribunal Powers';
  }
  if (/^Skills, Perks, Talents!/i.test(ref)) {
    return 'Acquired Powers';
  }
  return undefined;
}

function refineEquipmentItems(items) {
  if (items.length === 0) {
    return items;
  }

  const listId = 'equipment-group-main';
  const refinedItems = [{
    id: listId,
    tag: 'LIST',
    xmlId: 'LIST',
    alias: 'Equipment',
    text: 'Equipment',
    name: '',
    carried: true,
    price: 0,
    weight: 0,
  }];

  for (const [index, item] of items.entries()) {
    refinedItems.push(refineEquipmentItem(item, index, listId));
  }
  return refinedItems;
}

function refineEquipmentItem(item, index, parentId) {
  const noteText = gearEffectText(item);
  const children = [];

  for (const child of parseCharacteristicChildren(noteText)) {
    children.push(child);
  }
  for (const child of parseDefenseChildren(noteText)) {
    children.push(child);
  }
  for (const child of parseReserveChildren(item, noteText)) {
    children.push(child);
  }
  for (const child of parseDefensePowerChildren(noteText)) {
    children.push(child);
  }
  for (const child of parseWeaponChildren(item, noteText)) {
    children.push(child);
  }

  if (children.length === 0 || hasComplexResidualEffect(item.name, noteText)) {
    children.push({
      id: `${slug(item.name)}-detail`,
      xmlId: 'CUSTOMPOWER',
      name: '',
      alias: noteText || item.alias || item.name,
      baseCost: 0,
      levels: 0,
      notes: item.notes,
      preserveAsCustom: true,
    });
  }

  return {
    ...item,
    id: item.id ?? `equipment-${index + 1}`,
    parentId,
    xmlId: 'COMPOUNDPOWER',
    isContainer: true,
    baseCost: 0,
    levels: 0,
    subPowers: children.map((child, childIndex) => ({
      position: child.position ?? childIndex,
      ...child,
    })),
  };
}

function gearEffectText(item) {
  return String(item.notes ?? '')
    .replace(/^Imported gear:\s*/i, '')
    .replace(/\|\s*Source:.*$/i, '')
    .trim();
}

function parseCharacteristicChildren(text) {
  const statMap = {
    str: 'STR',
    dex: 'DEX',
    con: 'CON',
    int: 'INT',
    ego: 'EGO',
    pre: 'PRE',
    ocv: 'OCV',
    dcv: 'DCV',
    omcv: 'OMCV',
    dmcv: 'DMCV',
    pd: 'PD',
    ed: 'ED',
    rec: 'REC',
    end: 'END',
    body: 'BODY',
    stun: 'STUN',
  };
  const children = [];
  for (const match of text.matchAll(/([+-]\d+)\s*(str|dex|con|int|ego|pre|ocv|dcv|omcv|dmcv|pd|ed|rec|end|body|stun)\b/ig)) {
    const value = Number(match[1]);
    const type = statMap[match[2].toLowerCase()];
    const context = text.slice(Math.max(0, match.index - 3), match.index + match[0].length + 3);
    if ((type === 'END' || type === 'REC') && context.includes('/')) {
      continue;
    }
    children.push({
      id: `${slug(type)}-${children.length + 1}`,
      type,
      xmlId: type,
      alias: type,
      levels: value,
      baseCost: 0,
      affectsPrimary: !['DCV', 'OCV', 'OMCV', 'DMCV', 'PD', 'ED'].includes(type),
      affectsTotal: true,
      addModifiersToBase: false,
    });
  }
  return dedupeChildren(children, (child) => `${child.type}:${child.levels}`);
}

function parseDefenseChildren(text) {
  const match = text.match(/\bDEF\s*(\d+)\b/i);
  if (!match) {
    return [];
  }
  const total = Number(match[1]);
  return [{
    id: `forcefield-${total}`,
    xmlId: 'FORCEFIELD',
    alias: 'Resistant Protection',
    levels: total,
    baseCost: 0,
    pdLevels: Math.ceil(total / 2),
    edLevels: Math.floor(total / 2),
    mdLevels: 0,
    powdLevels: 0,
    affectsPrimary: false,
    affectsTotal: false,
  }];
}

function parseReserveChildren(item, text) {
  const match = text.match(/(\d+)\s*END\s*\/\s*(\d+)\s*REC/i);
  if (!match) {
    return [];
  }
  const end = Number(match[1]);
  const rec = Number(match[2]);
  return [{
    id: `${slug(item.name)}-reserve`,
    xmlId: 'ENDURANCERESERVE',
    name: item.name,
    alias: 'Endurance Reserve',
    levels: end,
    baseCost: 0,
    subPowers: [{
      id: `${slug(item.name)}-reserve-rec`,
      xmlId: 'ENDURANCERESERVEREC',
      alias: 'Recovery',
      levels: rec,
      baseCost: 0,
    }],
    affectsPrimary: false,
    affectsTotal: true,
  }];
}

function parseDefensePowerChildren(text) {
  const children = [];
  const mental = text.match(/(\d+)\s*Mental Defense/i);
  if (mental) {
    children.push({
      id: `mental-defense-${mental[1]}`,
      xmlId: 'MENTALDEFENSE',
      alias: 'Mental Defense',
      levels: Number(mental[1]),
      baseCost: 0,
      affectsPrimary: false,
      affectsTotal: true,
    });
  }
  const power = text.match(/(\d+)\s*Power Defen[cs]e/i);
  if (power) {
    children.push({
      id: `power-defense-${power[1]}`,
      xmlId: 'POWERDEFENSE',
      alias: 'Power Defense',
      levels: Number(power[1]),
      baseCost: 0,
      affectsPrimary: false,
      affectsTotal: true,
    });
  }
  return children;
}

function parseWeaponChildren(item, text) {
  const children = [];
  const javelin = text.match(/(\d+)d6(?:\+(\d+))?\s*AP\b/i);
  if (javelin) {
    children.push({
      id: `${slug(item.name)}-rka`,
      xmlId: 'RKA',
      alias: 'Ranged Killing Attack',
      input: 'PD',
      levels: Number(javelin[1]),
      baseCost: 0,
      useStandardEffect: false,
      affectsPrimary: false,
      affectsTotal: true,
      modifiers: [{
        id: `${slug(item.name)}-armor-piercing`,
        xmlId: 'ARMORPIERCING',
        alias: 'Armor Piercing',
        value: 0.25,
      }],
      adders: javelin[2] ? [{
        id: `${slug(item.name)}-plus-one-pip`,
        xmlId: 'PLUSONEPIP',
        alias: '+1 pip',
        baseCost: Number(javelin[2]) * 5,
      }] : undefined,
    });
  }
  return children;
}

function hasComplexResidualEffect(name, text) {
  const lowerText = lower(text);
  if (!lowerText) {
    return false;
  }
  if (/(when |only |trigger|transform|variable power pool|drain|re-roll|control it|side effect|independent|fragile|slot:|curse|gate)/i.test(text)) {
    return true;
  }
  return /identity pallet|portal shields|magecharm|blood band|ring of displacement|amulet of mental entropy|robe of the arcane cannibal/i.test(String(name));
}

function dedupeChildren(items, keyFn) {
  const seen = new Set();
  const unique = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }
  return unique;
}

function firstSourceRef(item) {
  return asArray(item.sourceRefs)[0] ?? '';
}

function slug(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'item';
}

function renumberPositions(items) {
  return items.map((item, index) => ({
    ...item,
    position: index,
  }));
}

function applyCampaignFreeAdjustments(items) {
  return items.map((item) => {
    if (!item || item.tag === 'LIST') {
      return item;
    }

    const freePoints = extractCampaignFreePoints(item);
    if (!freePoints) {
      return item;
    }

    const adders = [...asArray(item.adders)];
    const existing = adders.some((adder) =>
      String(adder.xmlId ?? '').toUpperCase() === 'GENERIC_OBJECT'
      && lower(adder.alias ?? adder.name) === 'common adder'
      && numberValue(adder.baseCost) === -freePoints,
    );

    if (!existing) {
      adders.push({
        id: `${slug(item.name ?? item.alias ?? item.input ?? 'item')}-campaign-free`,
        xmlId: 'GENERIC_OBJECT',
        alias: 'Common Adder',
        baseCost: -freePoints,
        selected: true,
        includeInBase: false,
        notes: `Campaign free adjustment inferred from source text (${freePoints} point${freePoints === 1 ? '' : 's'} free).`,
      });
    }

    return {
      ...item,
      campaignFreePoints: freePoints,
      adders,
    };
  });
}

function refinePowerCost(item, gridIndex) {
  if (item.preserveAsCustom === false) {
    return item;
  }

  const campaignGrantedFree = inferCampaignGrantedFreePower(item.sourceRefs, gridIndex);

  const sheetCost = costFromGridRefs(item.sourceRefs, gridIndex)
    ?? embeddedRealCost(item)
    ?? numberValue(item.realCost)
    ?? numberValue(item.sheetCost)
    ?? numberValue(item.points);

  if (sheetCost === undefined) {
    return {
      ...item,
      campaignGrantedFree,
      preserveAsCustom: item.preserveAsCustom ?? true,
    };
  }

  return {
    ...item,
    campaignGrantedFree,
    preserveAsCustom: item.preserveAsCustom ?? true,
    sheetCost,
    realCost: numberValue(item.realCost) ?? sheetCost,
    baseCost: sheetCost,
    levels: item.preserveCustomLevels ? item.levels : 0,
  };
}

function buildGridIndex(grid) {
  const index = new Map();
  for (const sheet of asArray(grid.sheets)) {
    for (const cell of asArray(sheet.cells)) {
      index.set(`${sheet.name}!${cell.address}`.toLowerCase(), cell.value);
    }
  }
  return index;
}

function costFromGridRefs(sourceRefs, gridIndex) {
  for (const ref of asArray(sourceRefs)) {
    const match = String(ref).match(/^(.+?)!([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/i);
    if (!match) {
      continue;
    }
    const [, sheetName, startCol, rowText] = match;
    const row = Number(rowText);
    const refStartsInPowerBlock = /^[J-T]$/i.test(startCol);
    const candidateCols = /^earth magic grimoire$/i.test(sheetName)
      ? ['A', 'AA']
      : refStartsInPowerBlock
        ? ['J']
        : ['B', 'A', 'J'];
    for (const col of candidateCols) {
      const value = numberValue(gridIndex.get(`${sheetName}!${col}${row}`.toLowerCase()));
      if (value !== undefined) {
        return value;
      }
    }
    const startValue = numberValue(gridIndex.get(`${sheetName}!${startCol}${row}`.toLowerCase()));
    if (startValue !== undefined) {
      return startValue;
    }
  }
  return undefined;
}

function inferCampaignGrantedFreePower(sourceRefs, gridIndex) {
  for (const ref of asArray(sourceRefs)) {
    const match = String(ref).match(/^(.+?)!([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/i);
    if (!match) {
      continue;
    }
    const [, sheetName, startCol, rowText] = match;
    if (!/^TribunalEveryman$/i.test(sheetName)) {
      continue;
    }
    if (!/^[J-T]$/i.test(startCol)) {
      continue;
    }
    const key = `${sheetName}!J${Number(rowText)}`.toLowerCase();
    if (!gridIndex.has(key)) {
      return true;
    }
    const rawValue = gridIndex.get(key);
    if (rawValue === '' || rawValue === null || rawValue === undefined) {
      return true;
    }
    const numeric = numberValue(rawValue);
    if (numeric === 0) {
      return true;
    }
    return false;
  }
  return false;
}

function embeddedPointCost(item) {
  const text = `${item.name ?? ''} ${item.alias ?? ''} ${item.input ?? ''} ${item.notes ?? ''}`;
  const bracketMatch = text.match(/\[(\d+(?:\.\d+)?)\s*pts?\]/i);
  if (bracketMatch) {
    return numberValue(bracketMatch[1]);
  }
  const bracketContactMatch = text.match(/\[(\d+(?:\.\d+)?)\s*pts?\s+contact\b/i);
  if (bracketContactMatch) {
    return numberValue(bracketContactMatch[1]);
  }
  const valueMatch = text.match(/\b(\d+(?:\.\d+)?)\s*pt\s+value\b/i);
  if (valueMatch) {
    return numberValue(valueMatch[1]);
  }
  return undefined;
}

function embeddedRealCost(item) {
  const text = `${item.name ?? ''} ${item.alias ?? ''} ${item.input ?? ''} ${item.notes ?? ''}`;
  const realMatch = text.match(/\breal\s+(\d+(?:\.\d+)?)/i);
  if (realMatch) {
    return numberValue(realMatch[1]);
  }
  return embeddedPointCost(item);
}

function extractCampaignFreePoints(item) {
  const text = `${item.name ?? ''} ${item.alias ?? ''} ${item.input ?? ''} ${item.notes ?? ''}`;
  const match = text.match(/\[?\s*(\d+(?:\.\d+)?)\s*pts?\s+free\s*\]?/i);
  if (match) {
    return numberValue(match[1]);
  }
  return undefined;
}

function normalizePowerForHeroDesigner(item) {
  if (!item || item.tag === 'LIST') {
    return item;
  }

  const text = `${item.name ?? ''} ${item.alias ?? ''} ${item.input ?? ''} ${item.notes ?? ''}`;

  let match = text.match(/Telekinesis\s+(\d+)\s*STR/i);
  if (match) {
    return promotePower(item, {
      hdcXmlId: 'TELEKINESIS',
      levels: Number(match[1]),
      baseCost: 0,
      lvlCost: 3,
      range: 'YES',
      duration: 'CONSTANT',
      target: 'DCV',
      defense: 'NORMAL',
      doesDamage: true,
      doesKnockback: true,
      doesBody: true,
    });
  }

  match = text.match(/\b(\d+)m\s+flight\b/i);
  if (match) {
    return promotePower(item, {
      hdcXmlId: 'FLIGHT',
      levels: Number(match[1]),
      baseCost: 0,
      lvlCost: 1,
      range: 'SELF',
      duration: 'CONSTANT',
      target: 'SELFONLY',
    });
  }

  match = text.match(/\b(\d+)\s*Power Defense\b/i);
  if (match) {
    return promotePower(item, {
      hdcXmlId: 'POWERDEFENSE',
      levels: Number(match[1]),
      baseCost: 0,
      lvlCost: 1,
      range: 'NO',
      duration: 'PERSISTENT',
      target: 'SELFONLY',
    });
  }

  match = text.match(/\b(-?\d+)m\s+Knockback Resistance\b/i);
  if (match) {
    return promotePower(item, {
      hdcXmlId: 'KBRESISTANCE',
      levels: Math.abs(Number(match[1])),
      baseCost: 0,
      lvlCost: 1,
      range: 'NO',
      duration: 'PERSISTENT',
      target: 'SELFONLY',
    });
  }

  match = text.match(/\bExtra Limbs\s*\((\d+)\)/i);
  if (match) {
    return promotePower(item, {
      hdcXmlId: 'EXTRALIMBS',
      levels: Number(match[1]),
      baseCost: 5,
      lvlCost: 0,
      range: 'SELF',
      duration: 'PERSISTENT',
      target: 'SELFONLY',
    });
  }

  match = text.match(/\bEND Reserve:\s*(\d+)\s*END\s*(\d+)\s*REC/i);
  if (match) {
    const end = Number(match[1]);
    const rec = Number(match[2]);
    return promotePower(item, {
      hdcXmlId: 'ENDURANCERESERVE',
      levels: end,
      baseCost: 0,
      lvlCost: 1,
      range: 'SELF',
      duration: 'PERSISTENT',
      target: 'SELFONLY',
      subPowers: [{
        id: `${slug(item.name ?? item.alias ?? 'reserve')}-rec`,
        xmlId: 'ENDURANCERESERVEREC',
        alias: 'Recovery',
        levels: rec,
        baseCost: 0,
      }],
    });
  }

  match = text.match(/\bRegeneration\s+(\d+)\s*BODY\/minute\b/i);
  if (match) {
    return promotePower(item, {
      hdcXmlId: 'REGENERATION',
      levels: Number(match[1]),
      baseCost: 0,
      lvlCost: 14,
      option: '1MINUTE',
      optionId: '1MINUTE',
      optionAlias: 'Minute',
      range: 'SELF',
      duration: 'PERSISTENT',
      target: 'SELFONLY',
    });
  }

  match = text.match(/\bMental Defense\s*(?:\[(\d+)pts?\]|(\d+))/i);
  if (match) {
    const levels = Number(match[1] ?? match[2]);
    return promotePower(item, {
      hdcXmlId: 'MENTALDEFENSE',
      levels,
      baseCost: 0,
      lvlCost: 1,
      range: 'SELF',
      duration: 'PERSISTENT',
      target: 'SELFONLY',
    });
  }

  match = text.match(/\bTunneling\s+(\d+)m(?:\s+(\d+)DEF)?/i);
  if (match) {
    return promotePower(item, {
      hdcXmlId: 'TUNNELING',
      levels: Number(match[1]),
      baseCost: 2,
      lvlCost: 1,
      range: 'SELF',
      duration: 'CONSTANT',
      target: 'SELFONLY',
    });
  }

  match = text.match(/\b(\d+)D6\s+RKA\b/i);
  if (match) {
    return promotePower(item, {
      hdcXmlId: 'RKA',
      levels: Number(match[1]),
      baseCost: 0,
      lvlCost: 15,
      range: 'YES',
      duration: 'INSTANT',
      target: 'DCV',
      defense: 'NORMAL',
      doesDamage: true,
      doesKnockback: true,
      doesBody: true,
      killing: true,
    });
  }

  match = text.match(/\bDarkness\s*\[(\d+)m\b/i);
  if (match) {
    return promotePower(item, {
      hdcXmlId: 'DARKNESS',
      levels: Number(match[1]),
      baseCost: 0,
      lvlCost: 5,
      option: 'SIGHTGROUP',
      optionId: 'SIGHTGROUP',
      optionAlias: 'Sight Group',
      range: 'YES',
      duration: 'CONSTANT',
      target: 'HEX',
    });
  }

  match = text.match(/\b(Minor|Major|Severe)\s+Transform\s+(\d+)D6\b/i);
  if (match) {
    const grade = match[1].toUpperCase();
    const levels = Number(match[2]);
    const lvlCost = grade === 'SEVERE' ? 15 : (grade === 'MAJOR' ? 10 : 5);
    return promotePower(item, {
      hdcXmlId: 'TRANSFORM',
      levels,
      baseCost: 0,
      lvlCost,
      option: grade,
      optionId: grade,
      range: 'YES',
      duration: 'INSTANT',
      target: 'DCV',
      defense: 'POWER',
      doesDamage: true,
      optionAlias: `${match[1]} Transform`,
    });
  }

  const lifeSupportPatch = inferLifeSupportPower(item, text);
  if (lifeSupportPatch) {
    return promotePower(item, lifeSupportPatch);
  }

  const detectPatch = inferDetectPower(item, text);
  if (detectPatch) {
    return promotePower(item, detectPatch);
  }

  match = text.match(/\bPartially\s+Pen[a-z]*\s*\[(\d+)pts?\]\s+on\s+Vision\b/i);
  if (match) {
    return {
      ...item,
      preserveAsCustom: true,
      custom: true,
    };
  }

  match = text.match(/\+(\d+)\s*PER\s+vs\s+range\b/i);
  if (match) {
    return {
      ...item,
      preserveAsCustom: true,
      custom: true,
    };
  }

  match = text.match(/\bResistant Protection\s*\((\d+)\s*PD\/(\d+)\s*ED\)/i);
  if (match) {
    const pd = Number(match[1]);
    const ed = Number(match[2]);
    return promotePower(item, {
      hdcXmlId: 'FORCEFIELD',
      levels: pd + ed,
      baseCost: 0,
      lvlCost: 3,
      pdLevels: pd,
      edLevels: ed,
      range: 'NO',
      duration: 'PERSISTENT',
      target: 'SELFONLY',
    });
  }

  return item;
}

function promotePower(item, patch) {
  return applyCampaignGrantedFreeResolvedOffset(decoratePromotedPower({
    ...item,
    ...patch,
    preserveAsCustom: false,
    custom: false,
    keepDisplayAlias: false,
    affectsPrimary: patch.affectsPrimary ?? false,
    affectsTotal: patch.affectsTotal ?? true,
  }));
}

function decoratePromotedPower(item) {
  const text = `${item.name ?? ''} ${item.alias ?? ''} ${item.input ?? ''} ${item.notes ?? ''}`;
  const modifiers = [...asArray(item.modifiers)];
  const adders = [...asArray(item.adders)];

  if (/\bNO\s*END\b/i.test(text)) {
    modifiers.push({
      id: `${slug(item.name ?? item.alias ?? 'power')}-no-end`,
      xmlId: 'REDUCEDEND',
      alias: 'Reduced Endurance',
      baseCost: 0.5,
      option: 'ZERO',
      optionId: 'ZERO',
      optionAlias: '0 END',
    });
  }

  if ((/\bArmor\s+Piercing\b/i.test(text) || /\bAP\b/i.test(text)) && supportsArmorPiercing(item.hdcXmlId)) {
    modifiers.push({
      id: `${slug(item.name ?? item.alias ?? 'power')}-armor-piercing`,
      xmlId: 'ARMORPIERCING',
      alias: 'Armor Piercing',
      baseCost: 0.25,
      levels: 1,
    });
  }

  if (/\bHardened\b/i.test(text)) {
    modifiers.push({
      id: `${slug(item.name ?? item.alias ?? 'power')}-hardened`,
      xmlId: 'HARDENED',
      alias: 'Hardened',
      baseCost: 0.25,
      levels: 1,
    });
  }

  if (/\bGestures\b/i.test(text)) {
    modifiers.push({
      id: `${slug(item.name ?? item.alias ?? 'power')}-gestures`,
      xmlId: 'GESTURES',
      alias: 'Gestures',
      baseCost: -0.25,
      isLimitation: true,
    });
  }

  if (/\bIncantations\b/i.test(text)) {
    modifiers.push({
      id: `${slug(item.name ?? item.alias ?? 'power')}-incantations`,
      xmlId: 'INCANTATIONS',
      alias: 'Incantations',
      baseCost: -0.25,
      isLimitation: true,
    });
  }

  if (/\bFull Phase\b/i.test(text)) {
    modifiers.push({
      id: `${slug(item.name ?? item.alias ?? 'power')}-full-phase`,
      xmlId: 'EXTRATIME',
      alias: 'Extra Time',
      baseCost: -0.5,
      option: 'FULL',
      optionId: 'FULL',
      optionAlias: 'Full Phase',
      isLimitation: true,
    });
  }

  if (/Skill Roll:Earth Magic Casting/i.test(text)) {
    modifiers.push({
      id: `${slug(item.name ?? item.alias ?? 'power')}-skill-roll`,
      xmlId: 'REQUIRESASKILLROLL',
      alias: 'Requires A Skill Roll',
      baseCost: -0.5,
      option: 'SKILL',
      optionId: 'SKILL',
      optionAlias: 'Skill roll',
      input: 'Earth Magic Casting',
      isLimitation: true,
    });
  }

  if (/\bCosts\s+END\b/i.test(text) && supportsCostsEndLimitation(item.hdcXmlId)) {
    modifiers.push({
      id: `${slug(item.name ?? item.alias ?? 'power')}-costs-end`,
      xmlId: 'COSTSEND',
      alias: 'Costs Endurance',
      baseCost: -0.5,
      isLimitation: true,
    });
  }

  if (/\bOAF\b/i.test(text)) {
    modifiers.push({
      id: `${slug(item.name ?? item.alias ?? 'power')}-oaf`,
      xmlId: 'FOCUS',
      alias: 'Obvious Accessible Focus',
      baseCost: -1,
      option: 'OAF',
      optionId: 'OAF',
      optionAlias: 'Obvious Accessible Focus (OAF)',
      isLimitation: true,
    });
  }

  if (item.hdcXmlId === 'TUNNELING') {
    const defMatch = text.match(/\b(\d+)DEF\b/i);
    if (defMatch) {
      adders.push({
        id: `${slug(item.name ?? item.alias ?? 'power')}-def-bonus`,
        xmlId: 'DEFBONUS',
        alias: '+PD',
        baseCost: 0,
        levels: Number(defMatch[1]),
        lvlCost: 2,
        lvlVal: 1,
      });
    }
    if (/Fill-?in/i.test(text)) {
      adders.push({
        id: `${slug(item.name ?? item.alias ?? 'power')}-fill-in`,
        xmlId: 'FILLIN',
        alias: 'Fill In',
        baseCost: 10,
      });
    }
  }

  for (const modifier of inferCustomNoteModifiers(item, text, modifiers)) {
    modifiers.push(modifier);
  }

  return {
    ...item,
    modifiers: dedupeChildren(modifiers, (modifier) => [
      modifier.xmlId,
      modifier.optionId ?? '',
      modifier.levels ?? '',
      lower(String(modifier.alias ?? modifier.name ?? '')),
      lower(String(modifier.comments ?? '')),
    ].join(':')),
    adders: dedupeChildren(adders, (adder) => `${adder.xmlId}:${adder.optionId ?? ''}:${adder.levels ?? ''}`),
  };
}

function applyCampaignGrantedFreeResolvedOffset(item) {
  if (!item?.campaignGrantedFree || item.preserveAsCustom || item.custom) {
    return item;
  }

  const offset = estimatedResolvedPowerCost(item);
  if (!(offset > 0)) {
    return item;
  }

  const adders = [...asArray(item.adders)];
  const alreadyPresent = adders.some((adder) =>
    String(adder.xmlId ?? '').toUpperCase() === 'GENERIC_OBJECT'
    && numberValue(adder.baseCost) === -offset
    && lower(adder.notes ?? '').includes('campaign granted free power'),
  );

  if (!alreadyPresent) {
    adders.push({
      id: `${slug(item.name ?? item.alias ?? 'power')}-campaign-grant-offset`,
      xmlId: 'GENERIC_OBJECT',
      baseCost: -offset,
      selected: true,
      includeInBase: false,
      notes: 'Campaign granted free power; offsets resolved Hero Designer cost while preserving power details.',
    });
  }

  return {
    ...item,
    campaignFreePoints: offset,
    adders: dedupeChildren(adders, (adder) => `${adder.xmlId}:${adder.optionId ?? ''}:${adder.levels ?? ''}:${adder.baseCost ?? ''}:${lower(adder.notes ?? '')}`),
  };
}

function estimatedResolvedPowerCost(item) {
  const baseCost = numberValue(item.baseCost, 0);
  const levelCost = numberValue(item.lvlCost ?? item.levelCost, 0);
  const levels = numberValue(item.levels, 0);
  const addersCost = asArray(item.adders)
    .reduce((sum, adder) => (
      sum
      + numberValue(adder.baseCost, 0)
      + (numberValue(adder.levels, 0) * numberValue(adder.lvlCost ?? adder.levelCost, 0))
    ), 0);
  return baseCost + (levels * levelCost) + addersCost;
}

function supportsArmorPiercing(xmlId) {
  return new Set([
    'BLAST',
    'DRAIN',
    'EGOATTACK',
    'ENTANGLE',
    'FLASH',
    'HKA',
    'RKA',
    'TELEKINESIS',
  ]).has(String(xmlId ?? '').toUpperCase());
}

function supportsCostsEndLimitation(xmlId) {
  return new Set([
    'DETECT',
    'ENHANCEDSENSES',
    'FORCEFIELD',
    'KBRESISTANCE',
    'LIFESUPPORT',
    'MENTALDEFENSE',
    'POWERDEFENSE',
    'REGENERATION',
  ]).has(String(xmlId ?? '').toUpperCase());
}

function inferCustomNoteModifiers(item, text, existingModifiers) {
  const customPatterns = [
    {
      pattern: /\bTuned\s+for\s+Powerstone\s*\[\+1\/4\]/i,
      xmlId: 'MODIFIER',
      alias: 'Tuned for Powerstone',
      baseCost: 0.25,
    },
    {
      pattern: /\bSpellcaster\s+Signature\s*\[-1\/4\]/i,
      xmlId: 'MODIFIER',
      alias: 'Spellcaster Signature',
      baseCost: -0.25,
      isLimitation: true,
    },
    {
      pattern: /\bOnly\s+when\s+in\s+contact\s+with\s+ground\s*\[-1\/2\]/i,
      xmlId: 'MODIFIER',
      alias: 'Only when in contact with ground',
      baseCost: -0.5,
      isLimitation: true,
    },
    {
      pattern: /\bOnly\s+through\s+rock\s+and\s+earth\s*\[-1\/2\]/i,
      xmlId: 'MODIFIER',
      alias: 'Only through rock and earth',
      baseCost: -0.5,
      isLimitation: true,
    },
  ];

  const existingKeys = new Set(asArray(existingModifiers).map((modifier) => {
    const xmlId = String(modifier.xmlId ?? modifier.xmlID ?? modifier.xmlid ?? '').toUpperCase();
    const alias = lower(String(modifier.alias ?? modifier.name ?? ''));
    return `${xmlId}:${alias}`;
  }));

  const inferred = [];
  for (const pattern of customPatterns) {
    if (!pattern.pattern.test(text)) {
      continue;
    }
    const key = `${pattern.xmlId}:${lower(pattern.alias)}`;
    if (existingKeys.has(key)) {
      continue;
    }
    inferred.push({
      id: `${slug(item.name ?? item.alias ?? 'power')}-${slug(pattern.alias)}`,
      xmlId: pattern.xmlId,
      alias: pattern.alias,
      baseCost: pattern.baseCost,
      isLimitation: pattern.isLimitation ?? false,
    });
  }
  return inferred;
}

function inferDetectPower(item, text) {
  const directDetect = text.match(/\bDetect\s+(Single(?:\s+Thing)?|Class|Large\s+Class)\b/i);
  const vibrationsDetect = text.match(/\bDetect\s+Physical\s+Vibrations\b/i);
  if (!directDetect && !vibrationsDetect) {
    return null;
  }

  const option = vibrationsDetect
    ? { id: 'SINGLE', alias: 'A Single Thing', baseCost: 3 }
    : normalizeDetectOption(directDetect[1]);

  const adders = [];
  if (/\bD\w*criminatory\b/i.test(text)) {
    adders.push({
      id: `${slug(item.name ?? item.alias ?? 'detect')}-discriminatory`,
      xmlId: 'DISCRIMINATORY',
      alias: 'Discriminatory',
      baseCost: 5,
    });
  }
  if (/\bAnalyze\b/i.test(text)) {
    adders.push({
      id: `${slug(item.name ?? item.alias ?? 'detect')}-analyze`,
      xmlId: 'ANALYZESENSE',
      alias: 'Analyze',
      baseCost: 5,
    });
  }

  return {
    hdcXmlId: 'DETECT',
    levels: 0,
    baseCost: option.baseCost,
    lvlCost: 1,
    option: option.id,
    optionId: option.id,
    optionAlias: option.alias,
    input: inferDetectSubject(item, text),
    range: 'SELF',
    duration: 'PERSISTENT',
    target: 'SELFONLY',
    adders,
  };
}

function normalizeDetectOption(rawOption) {
  const value = String(rawOption ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (value.startsWith('LARGE')) {
    return { id: 'LARGECLASS', alias: 'A Large Class Of Things', baseCost: 8 };
  }
  if (value.startsWith('CLASS')) {
    return { id: 'CLASS', alias: 'A Class Of Things', baseCost: 5 };
  }
  return { id: 'SINGLE', alias: 'A Single Thing', baseCost: 3 };
}

function inferDetectSubject(item, text) {
  const explicit = text.match(/\bDetect\s+Physical\s+Vibrations\b/i);
  if (explicit) {
    return 'Physical Vibrations';
  }
  const nameMatch = String(item.name ?? '').match(/^Detect\s+(.+)$/i);
  if (nameMatch) {
    return nameMatch[1].trim();
  }
  return item.input ?? item.name ?? '';
}

function inferLifeSupportPower(item, text) {
  const normalizedXmlId = String(item.hdcXmlId ?? item.xmlId ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, '');
  if (normalizedXmlId !== 'LIFESUPPORT' && !/\bLife\s*Support\b|\bLS\b/i.test(text)) {
    return null;
  }

  const adders = [];

  if (/\bLongevity\b|\bdoes\s+not\s+age\b/i.test(text)) {
    adders.push({
      id: `${slug(item.name ?? item.alias ?? 'life-support')}-immune-to-aging`,
      xmlId: 'LONGEVITY',
      alias: 'Longevity:',
      baseCost: 5,
      option: 'IMMORTAL',
      optionId: 'IMMORTAL',
      optionAlias: 'Immortal',
      includeInBase: true,
      selected: true,
    });
  }

  if (/\bSelf[- ]?Contained\s+Breathing\b/i.test(text)) {
    adders.push({
      id: `${slug(item.name ?? item.alias ?? 'life-support')}-self-contained`,
      xmlId: 'SELFCONTAINEDBREATHING',
      alias: 'Self-Contained Breathing',
      baseCost: 10,
      includeInBase: true,
      selected: true,
    });
  }

  if (/\bpoison\b/i.test(text) || /\bpoison\b/i.test(item.name ?? '')) {
    const explicitPoisonCost = text.match(/\b(?:AP|Active Points?)\s*(\d+)\b/i)?.[1]
      ?? text.match(/\((\d+)\)\s*1pt\s*Immunity/i)?.[1]
      ?? text.match(/\b(\d+)pt\b/i)?.[1];
    adders.push({
      id: `${slug(item.name ?? item.alias ?? 'life-support')}-poison-immunity`,
      xmlId: 'IMMUNITY',
      alias: 'Immunity:',
      baseCost: explicitPoisonCost ? Number(explicitPoisonCost) : 5,
      option: 'ALLPOISON',
      optionId: 'ALLPOISON',
      optionAlias: 'All terrestrial poisons',
      includeInBase: true,
      selected: true,
    });
  }

  if (adders.length === 0) {
    return null;
  }

  return {
    hdcXmlId: 'LIFESUPPORT',
    baseCost: 0,
    levels: 0,
    range: 'NO',
    duration: 'PERSISTENT',
    target: 'SELFONLY',
    adders,
  };
}
