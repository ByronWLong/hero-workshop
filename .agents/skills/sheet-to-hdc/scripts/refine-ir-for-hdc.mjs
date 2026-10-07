#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';

const [, , inputPath, outputPath, gridPath] = process.argv;

const COMBAT_FOCUS_GROUPS = new Map([
  ['sword', ['sword', 'swords', 'greatsword', 'broadsword', 'longsword', 'shortsword', 'blade', 'blades', 'saber', 'sabre', 'rapier', 'katana']],
  ['knife', ['knife', 'knives', 'dagger', 'daggers', 'dirk', 'dirks', 'stiletto', 'stilettos']],
  ['axe', ['axe', 'axes', 'ax', 'hatchet', 'hatchets']],
  ['spear', ['spear', 'spears', 'pike', 'pikes', 'lance', 'lances', 'javelin', 'javelins']],
  ['staff', ['staff', 'staves', 'quarterstaff']],
  ['club', ['club', 'clubs', 'mace', 'maces', 'hammer', 'hammers', 'maul', 'mauls', 'flail', 'flails']],
  ['bow', ['bow', 'bows', 'longbow', 'shortbow']],
  ['crossbow', ['crossbow', 'crossbows']],
  ['whip', ['whip', 'whips']],
  ['shield', ['shield', 'shields', 'buckler', 'bucklers']],
  ['claw', ['claw', 'claws', 'talon', 'talons']],
  ['bite', ['bite', 'bites', 'fang', 'fangs']],
  ['grab', ['grab', 'grabs', 'grapple', 'grapples', 'hold', 'holds']],
  ['tendril', ['tendril', 'tendrils', 'tentacle', 'tentacles']],
  ['strike', ['strike', 'strikes', 'punch', 'punches', 'kick', 'kicks']],
]);

const NO_END_POWER_XML_IDS = new Set([
  'DEX',
  'CON',
  'INT',
  'EGO',
  'PRE',
  'OCV',
  'DCV',
  'OMCV',
  'DMCV',
  'SPD',
  'PD',
  'ED',
  'REC',
  'END',
  'BODY',
  'STUN',
  'DETECT',
  'ENHANCEDSENSES',
  'FORCEFIELD',
  'KBRESISTANCE',
  'LIFESUPPORT',
  'MENTALDEFENSE',
  'POWERDEFENSE',
  'REGENERATION',
]);

if (!inputPath || !outputPath) {
  console.error('Usage: node refine-ir-for-hdc.mjs <input-ir.json> <output-ir.json> [sheet-grid.json]');
  process.exit(2);
}

const ir = readJson(inputPath);
const grid = gridPath ? readJson(gridPath) : undefined;
const gridIndex = grid ? buildGridIndex(grid) : new Map();
let preferredMagicSkillRollName = null;

const refined = structuredClone(ir);
refined.skills = Array.isArray(refined.skills) ? refined.skills : [];
refined.perks = Array.isArray(refined.perks) ? refined.perks : [];
refined.talents = Array.isArray(refined.talents) ? refined.talents : [];
refined.powers = Array.isArray(refined.powers) ? refined.powers : [];
refined.warnings = Array.isArray(refined.warnings) ? refined.warnings : [];

if (grid) {
  augmentStructuredSectionsFromGrid(refined, grid);
}

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
preferredMagicSkillRollName = resolvePreferredMagicSkillRollName(refined.skills);

const remainingPowers = [];
for (const item of asArray(refined.powers)) {
  const kind = classifyItem(item);
  const withCost = decoratePowerFromNotes(normalizePowerForHeroDesigner(refinePowerCost(item, gridIndex)));

  if (kind === 'perk') {
    refined.perks.push(toPerk(withCost));
  } else if (kind === 'talent') {
    refined.talents.push(toTalent(withCost));
  } else {
    remainingPowers.push(withCost);
  }
}
refined.powers = applyPowerGroupAdjustments(applyCampaignFreeAdjustments(groupPowersForDisplay(remainingPowers)));
refined.equipment = applyCampaignFreeAdjustments(refineEquipmentItems(recoverEquipmentFromGrid(asArray(refined.equipment), grid)));
refined.perks = applyCampaignFreeAdjustments(refined.perks);
refined.perks = normalizePerkEnhancerHierarchy(refined.perks);
refined.talents = applyCampaignFreeAdjustments(refined.talents);
refined.skills = bindCombatSkillLevels(refined.skills, refined.powers, refined.equipment, refined.martialArts);
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

function parseWorkbookNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  const text = String(value ?? '').trim();
  if (!text) {
    return undefined;
  }
  const numeric = text
    .replace(/^\(\s*/, '')
    .replace(/\s*\)$/, '')
    .replace(/,/g, '')
    .trim();
  const number = Number(numeric);
  return Number.isFinite(number) ? number : undefined;
}

function inferTalentXmlId(item) {
  const text = lower(`${item.name ?? ''} ${item.alias ?? ''} ${item.input ?? ''} ${item.notes ?? ''}`);
  if (text.includes('danger sense')) {
    return 'DANGER_SENSE';
  }
  if (text.includes('lightsleep')) {
    return 'LIGHTSLEEP';
  }
  if (text.includes('eidetic memory')) {
    return 'EIDETIC_MEMORY';
  }
  if (text.includes('combat luck')) {
    return 'COMBAT_LUCK';
  }
  if (text.includes('speed reading')) {
    return 'SPEED_READING';
  }
  if (text.includes('universal translator')) {
    return 'UNIVERSAL_TRANSLATOR';
  }
  return 'CUSTOMTALENT';
}

function augmentStructuredSectionsFromGrid(ir, grid) {
  const existingSkillKeys = new Set(asArray(ir.skills).map((item) => itemIdentityKey(item)));
  const existingPerkKeys = new Set(asArray(ir.perks).map((item) => itemIdentityKey(item)));
  const existingTalentKeys = new Set(asArray(ir.talents).map((item) => itemIdentityKey(item)));
  const existingPowerKeys = new Set([
    ...asArray(ir.powers).map((item) => itemIdentityKey(item)),
    ...asArray(ir.equipment).map((item) => itemIdentityKey(item)),
  ]);

  for (const sheet of asArray(grid.sheets)) {
    const rows = gridRowsByNumber(sheet);
    const headerRow = [...rows.keys()].find((row) => {
      const cells = rows.get(row) ?? {};
      return lower(cells.D) === 'skill' && lower(cells.L) === 'ability';
    });
    if (headerRow !== undefined) {
      augmentFromStructuredSkillPowerSheet(ir, sheet.name, rows, headerRow, existingSkillKeys, existingPerkKeys, existingTalentKeys, existingPowerKeys);
    }

    const contactsHeaderRow = [...rows.keys()].find((row) => {
      const cells = rows.get(row) ?? {};
      return lower(cells.L) === 'name' && lower(cells.N) === 'power/notes' && lower(cells.J) === 'cost';
    });
    if (contactsHeaderRow !== undefined && /contacts/i.test(sheet.name)) {
      augmentFromStructuredContactsSheet(ir, sheet.name, rows, contactsHeaderRow, existingPerkKeys);
    }
  }
}

function gridRowsByNumber(sheet) {
  const rows = new Map();
  for (const cell of asArray(sheet?.cells)) {
    const row = rows.get(cell.row) ?? {};
    row[cell.columnName] = String(cell.value ?? '').trim();
    rows.set(cell.row, row);
  }
  return rows;
}

function augmentFromStructuredSkillPowerSheet(ir, sheetName, rows, headerRow, existingSkillKeys, existingPerkKeys, existingTalentKeys, existingPowerKeys) {
  const orderedRows = [...rows.keys()].filter((row) => row > headerRow).sort((left, right) => left - right);

  for (const rowNumber of orderedRows) {
    const row = rows.get(rowNumber) ?? {};
    const skillName = String(row.D ?? '').trim();
    const powerName = String(row.L ?? '').trim();

    if (skillName) {
      const skillItem = itemFromStructuredSkillRow(sheetName, rowNumber, row);
      if (skillItem) {
        const key = itemIdentityKey(skillItem);
        if (skillItem.section === 'perk') {
          if (!existingPerkKeys.has(key)) {
            const { section, ...perk } = skillItem;
            ir.perks.push(perk);
            existingPerkKeys.add(key);
          }
        } else if (skillItem.section === 'talent') {
          if (!existingTalentKeys.has(key)) {
            const { section, ...talent } = skillItem;
            ir.talents.push(talent);
            existingTalentKeys.add(key);
          }
        } else if (!existingSkillKeys.has(key)) {
          const { section, ...skill } = skillItem;
          ir.skills.push(skill);
          existingSkillKeys.add(key);
        }
      }
    }

    if (powerName) {
      const powerItem = itemFromStructuredPowerRow(sheetName, rowNumber, row);
      if (powerItem) {
        const key = itemIdentityKey(powerItem);
        if (!existingPowerKeys.has(key)) {
          ir.powers.push(powerItem);
          existingPowerKeys.add(key);
        }
      }
    }
  }
}

function itemFromStructuredSkillRow(sheetName, rowNumber, row) {
  const rawName = String(row.D ?? '').trim();
  if (!rawName || /^total\b|^cost\b/i.test(rawName)) {
    return null;
  }
  if (/points owing/i.test(rawName)) {
    return null;
  }
  if (!row.B && /^[+-]?\d/.test(rawName)) {
    return null;
  }
  if (looksLikeGearEntry(rawName)) {
    return null;
  }

  const sourceRefs = [`${sheetName}!B${rowNumber}:F${rowNumber}`];
  const points = parseWorkbookNumber(row.B);
  const roll = parseStructuredSkillRoll(rawName, row.F);
  const base = {
    name: rawName,
    points,
    baseCost: points,
    roll,
    sourceRefs,
    everyman: /\beveryman\b/i.test(rawName),
  };

  const talentMatch = rawName.match(/^(.*?)\s*\(Talent\)\s*$/i);
  if (talentMatch) {
    return {
      section: 'talent',
      name: talentMatch[1].trim(),
      alias: talentMatch[1].trim(),
      xmlId: inferTalentXmlId({ name: talentMatch[1].trim() }),
      baseCost: points ?? 0,
      points,
      sourceRefs,
    };
  }

  if (/^reputation\b/i.test(rawName)) {
    return {
      section: 'perk',
      name: rawName,
      alias: 'Positive Reputation',
      xmlId: 'REPUTATION',
      input: rawName.replace(/^reputation\s*(?:in\s*)?/i, '').trim(),
      baseCost: points ?? 0,
      points,
      sourceRefs,
    };
  }

  if (/\bbase points?\b/i.test(rawName)) {
    return {
      section: 'perk',
      name: rawName,
      alias: 'Vehicles & Bases',
      xmlId: 'VEHICLE_BASE',
      baseCost: 0,
      levels: 0,
      number: 1,
      basePoints: (points ?? 0) * 5,
      disadPoints: 0,
      sourceRefs,
    };
  }

  const cslMatch = rawName.match(/^\+(\d+)\s+OCV\b(?:.*?\bwith\b\s+(.+))?$/i);
  if (cslMatch) {
    const focus = cslMatch[2]?.trim();
    return {
      section: 'skill',
      name: 'Combat Skill Levels',
      alias: rawName,
      xmlId: 'COMBAT_LEVELS',
      levels: Number(cslMatch[1]),
      baseCost: points ?? 0,
      points,
      input: focus,
      option: 'SINGLE',
      optionId: 'SINGLE',
      optionAlias: focus ? `with ${focus}` : 'with any single attack',
      sourceRefs,
    };
  }

  if (/^linguist\b/i.test(rawName)) {
    return {
      section: 'skill',
      ...base,
      name: 'Linguist',
    };
  }

  if (/^scholar\b/i.test(rawName)) {
    return {
      section: 'skill',
      ...base,
      name: 'Scholar',
    };
  }

  if (/^scientist\b/i.test(rawName)) {
    return {
      section: 'skill',
      ...base,
      name: 'Scientist',
    };
  }

  return {
    section: 'skill',
    ...base,
  };
}

function itemFromStructuredPowerRow(sheetName, rowNumber, row) {
  const rawName = String(row.L ?? '').trim();
  if (!rawName || /^total\b|^cost\b/i.test(rawName)) {
    return null;
  }

  const notes = String(row.N ?? '').trim();
  return {
    name: rawName,
    notes,
    sourceRefs: [`${sheetName}!J${rowNumber}:T${rowNumber}`],
  };
}

function augmentFromStructuredContactsSheet(ir, sheetName, rows, headerRow, existingPerkKeys) {
  const orderedRows = [...rows.keys()].filter((row) => row > headerRow).sort((left, right) => left - right);
  for (const rowNumber of orderedRows) {
    const row = rows.get(rowNumber) ?? {};
    const rawName = String(row.L ?? '').trim();
    if (!rawName) {
      continue;
    }
    if (/^total\b|^cost\b/i.test(rawName)) {
      continue;
    }

    const cost = parseWorkbookNumber(row.J);
    const notes = String(row.N ?? '').trim();
    const sourceRefs = [`${sheetName}!J${rowNumber}:N${rowNumber}`];

    let perk;
    const followerMatch = rawName.match(/^Follower:\s*(.+)$/i);
    if (followerMatch) {
      perk = {
        name: rawName,
        alias: 'Follower',
        xmlId: 'FOLLOWER',
        input: followerMatch[1].trim(),
        baseCost: cost ?? 0,
        points: cost,
        sourceRefs,
        notes,
      };
    } else {
      perk = {
        name: rawName,
        alias: 'Contact',
        xmlId: 'CONTACT',
        input: rawName,
        baseCost: 0,
        levels: cost ?? 1,
        sourceRefs,
        notes,
      };
    }

    const key = itemIdentityKey(perk);
    if (!existingPerkKeys.has(key)) {
      ir.perks.push(perk);
      existingPerkKeys.add(key);
    }
  }
}

function parseStructuredSkillRoll(rawName, rawRoll) {
  const explicitRoll = parseWorkbookNumber(rawRoll);
  if (explicitRoll !== undefined && explicitRoll <= 18) {
    return explicitRoll;
  }
  const embeddedRoll = String(rawName ?? '').match(/\b(\d+)\)\s*(?:\([^)]*\))?\s*$/);
  if (embeddedRoll) {
    return Number(embeddedRoll[1]);
  }
  const skillRoll = String(rawName ?? '').match(/\b(\d+)-\b/);
  if (skillRoll) {
    return Number(skillRoll[1]);
  }
  return undefined;
}

function looksLikeGearEntry(value) {
  return /\b(bracer|bracelet|ring|amulet|staff|sword|dagger|wand|bag|goggles|shield|hat|belt|armor|armour|key|stone|chest)\b/i.test(value);
}

function itemIdentityKey(item) {
  return normalizeIdentityText(item.input ?? item.alias ?? item.name);
}

function normalizeIdentityText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/visitors/g, 'visitor')
    .replace(/[^a-z0-9]+/g, '');
}

function classifyItem(item) {
  const name = lower(item.name);
  const text = lower(`${item.name ?? ''} ${item.alias ?? ''} ${item.input ?? ''} ${item.notes ?? ''}`);
  if (isWellConnected(item)) {
    return 'perk';
  }
  if (/^contact\b/.test(name) || /^\s*contact\b/.test(lower(item.input)) || /\[\s*\d+\s*pt\s+contact\b/.test(text)) {
    return 'perk';
  }
  if (/^follower\b/.test(name)) {
    return 'perk';
  }
  if (/\bfavou?r\b/.test(text)) {
    return 'perk';
  }
  if (/\brep(?:utation)?\b/.test(text) || /\bsaviors? of the empire\b/.test(text)) {
    return 'perk';
  }
  if (/\bbase contribution\b|\bbase points?\b/.test(text)) {
    return 'perk';
  }
  if (/\bdanger sense\b/.test(text)) {
    return 'talent';
  }
  if (/\btalent\b/.test(text)) {
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
  if (isWellConnected(item)) {
    xmlId = 'WELL_CONNECTED';
    alias = 'Well Connected';
  } else if (/^contact\b/.test(name) || /^\s*contact\b/.test(lower(item.input)) || /\[\s*\d+\s*pt\s+contact\b/.test(text)) {
    xmlId = 'CONTACT';
    alias = 'Contact';
  } else if (/^follower\b/.test(name)) {
    xmlId = 'FOLLOWER';
    alias = 'Follower';
  } else if (/\bfavou?r\b/.test(text)) {
    xmlId = 'FAVOR';
    alias = 'Favor';
  } else if (/\brep(?:utation)?\b/.test(text) || /\bsaviors? of the empire\b/.test(text)) {
    xmlId = 'REPUTATION';
    alias = 'Positive Reputation';
  } else if (/\bbase contribution\b|\bbase points?\b/.test(text)) {
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
  const xmlId = inferTalentXmlId(item);
  return {
    ...item,
    xmlId,
    alias: item.alias ?? item.name ?? 'Talent',
    input: item.input ?? item.description ?? item.notes,
    baseCost: numberValue(item.realCost ?? item.sheetCost ?? item.points ?? item.baseCost) ?? 0,
    levels: 0,
  };
}

function refineSkill(item) {
  const name = lower(item.name);
  if (/^scientist\b/.test(name)) {
    return normalizeSkillMetadata({
      ...item,
      tag: 'SCIENTIST',
      xmlId: 'SCIENTIST',
      alias: item.alias ?? 'Scientist',
      name: 'Scientist',
    });
  }
  if (/^linguist\b/.test(name)) {
    return normalizeSkillMetadata({
      ...item,
      tag: 'LINGUIST',
      xmlId: 'LINGUIST',
      alias: item.alias ?? 'Linguist',
      name: 'Linguist',
    });
  }
  if (/^scholar\b/.test(name)) {
    return normalizeSkillMetadata({
      ...item,
      tag: 'SCHOLAR',
      xmlId: 'SCHOLAR',
      alias: item.alias ?? 'Scholar',
      name: 'Scholar',
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

function isWellConnected(item) {
  const xmlId = String(item?.hdcXmlId ?? item?.xmlId ?? item?.xmlID ?? item?.xmlid ?? '').trim().toUpperCase();
  return xmlId === 'WELL_CONNECTED' || /^well[-\s]?connected\b/i.test(String(item?.name ?? ''));
}

function normalizePerkEnhancerHierarchy(items) {
  const perks = asArray(items).map((item, index) => ({
    ...item,
    position: numberValue(item.position) ?? index,
  }));
  const wellConnected = perks.find(isWellConnected);
  if (!wellConnected) {
    return perks;
  }

  wellConnected.id = wellConnected.id ?? 'perk-enhancer-well-connected';
  wellConnected.xmlId = 'WELL_CONNECTED';
  wellConnected.name = '';
  wellConnected.alias = 'Well-Connected';
  wellConnected.baseCost = numberValue(wellConnected.baseCost ?? wellConnected.points) ?? 3;
  wellConnected.levels = 0;
  wellConnected.intBased = false;

  for (const perk of perks) {
    if (!perk.parentId && isWellConnectedEligiblePerk(perk)) {
      perk.parentId = wellConnected.id;
    }
  }

  return perks;
}

function isWellConnectedEligiblePerk(item) {
  if (isWellConnected(item)) {
    return false;
  }
  const xmlId = String(item?.hdcXmlId ?? item?.xmlId ?? item?.xmlID ?? item?.xmlid ?? '').trim().toUpperCase();
  const name = lower(item?.name);
  return xmlId === 'CONTACT' || xmlId === 'FAVOR' || /^contact\b/.test(name) || /^favo(?:u)?r\b/.test(name);
}

function canonicalSkillShape(item) {
  const rawName = String(item.name ?? '').trim();
  if (!rawName) {
    return undefined;
  }

  const languageMatch = rawName.match(/^LS:\s*(.+?)(?:\s*\[\s*([A-Z]+)\s*\\\s*L\s*\])?(?:\s*\((Everyman)\))?\s*$/i);
  if (languageMatch) {
    const fluencyCode = String(languageMatch[2] ?? '').trim().toUpperCase();
    return {
      xmlId: 'LANGUAGES',
      alias: 'LS',
      input: languageMatch[1].trim(),
      name: '',
      everyman: Boolean(languageMatch[3]),
      ...languageMetadataFromCode(fluencyCode),
    };
  }

  const bareLanguageMatch = rawName.match(/^(.+?)\s*\[\s*([A-Z]+)\s*\\\s*L\s*\]\s*$/i);
  if (bareLanguageMatch) {
    const fluencyCode = String(bareLanguageMatch[2] ?? '').trim().toUpperCase();
    return {
      xmlId: 'LANGUAGES',
      alias: rawName,
      name: rawName,
      input: bareLanguageMatch[1].trim(),
      ...languageMetadataFromCode(fluencyCode),
    };
  }

  const nativeLanguageMatch = rawName.match(/^Native Language:\s*(.+)$/i);
  if (nativeLanguageMatch) {
    return {
      xmlId: 'LANGUAGES',
      alias: rawName,
      name: rawName,
      input: nativeLanguageMatch[1].trim(),
      ...languageMetadataFromCode('N'),
    };
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

  const weaponFamiliarityMatch = rawName.match(/^W\.?P\.?\s*(.+)$/i);
  if (weaponFamiliarityMatch) {
    return {
      xmlId: 'WEAPON_FAMILIARITY',
      alias: rawName,
      input: weaponFamiliarityMatch[1].trim(),
      name: 'Weapon Familiarity',
    };
  }

  const magicSkillMatch = rawName.match(/^Magic Skill\s*\((.+?)\s+(\d+)\)(?:\s*\(([^)]+)\))?$/i);
  if (magicSkillMatch) {
    const purchasedPoints = numberValue(item.points ?? item.baseCost, 0);
    const baseCost = purchasedPoints > 0 ? Math.min(3, purchasedPoints) : 3;
    return {
      xmlId: 'PROFESSIONAL_SKILL',
      alias: 'Magic Skill',
      name: 'Magic Skill',
      input: magicSkillMatch[1].trim(),
      baseCost,
      levels: Math.max(0, purchasedPoints - baseCost),
      roll: Number(magicSkillMatch[2]),
      notes: magicSkillMatch[3]?.trim() ? `Sheet abbreviation: ${magicSkillMatch[3].trim()}` : undefined,
      characteristic: 'INT',
      familiarity: false,
      proficiency: false,
    };
  }

  const combatLevelsMatch = rawName.match(/^\+(\d+)\s+OCV\b(?:.*?\bwith\b\s+(.+))?$/i);
  if (combatLevelsMatch) {
    const focus = combatLevelsMatch[2]?.trim();
    return {
      xmlId: 'COMBAT_LEVELS',
      name: 'Combat Skill Levels',
      alias: rawName,
      input: focus,
      levels: Number(combatLevelsMatch[1]),
      option: 'SINGLE',
      optionId: 'SINGLE',
      optionAlias: focus ? `with ${focus}` : 'with any single attack',
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

function languageMetadataFromCode(code) {
  switch (code) {
    case 'N':
      return {
        nativeTongue: true,
        option: 'NATIVE',
        optionId: 'NATIVE',
        optionAlias: 'native',
      };
    case 'CF':
    case 'F':
      return {
        option: 'FLUENT',
        optionId: 'FLUENT',
        optionAlias: 'completely fluent',
      };
    case 'B':
    default:
      return {
        option: 'BASIC',
        optionId: 'BASIC',
        optionAlias: 'basic conversation',
      };
  }
}

function normalizeSkillMetadata(item) {
  const xmlId = String(item.xmlId ?? '').trim().toUpperCase();
  const normalized = {
    ...item,
    familiarity: item.familiarity ?? false,
    proficiency: item.proficiency ?? false,
  };

  if (xmlId && xmlId !== 'LANGUAGES' && !normalized.characteristic) {
    normalized.characteristic = xmlId === 'STEALTH' ? 'DEX' : 'GENERAL';
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

  const scholar = skills.find((item) => item.tag === 'SCHOLAR');
  if (scholar) {
    scholar.id = scholar.id ?? 'skill-enhancer-scholar';
    const nextEnhancerPosition = nextEnhancerBoundary(skills, scholar.position);
    for (const skill of skills) {
      if (!skill.parentId && skill.position > scholar.position && skill.position < nextEnhancerPosition && isScholarKnowledgeSkill(skill)) {
        skill.parentId = scholar.id;
        Object.assign(skill, normalizeSkillMetadata(skill));
      }
    }
  }

  return skills.sort((left, right) => left.position - right.position);
}

function nextEnhancerBoundary(items, position) {
  return items
    .filter((item) => item.position > position && (item.tag === 'SCIENTIST' || item.tag === 'LINGUIST' || item.tag === 'SCHOLAR' || item.tag === 'LIST'))
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

function isKnowledgeSkill(item) {
  return lower(item.xmlId) === 'knowledge_skill' || ['KS', 'AK', 'CK', 'CuK'].includes(String(item.alias ?? '').trim());
}

function isScholarKnowledgeSkill(item) {
  const alias = String(item.alias ?? '').trim();
  return isKnowledgeSkill(item) && !['AK', 'CK', 'CuK'].includes(alias);
}

function normalizedSkillInput(item) {
  const name = String(item.name ?? '').trim();
  if (name.startsWith('SS:')) {
    return name.slice(3).trim();
  }
  return name;
}

function isListItem(item) {
  return item?.tag === 'LIST' || item?.isGroup || String(item?.xmlId ?? '').trim().toUpperCase() === 'LIST';
}

function sanitizeExistingLists(items) {
  const seenListKeys = new Set();
  return items
    .map((item, index) => ({ ...item, position: numberValue(item.position) ?? index }))
    .filter((item) => {
      if (!isListItem(item)) {
        return true;
      }
      const key = `${item.id ?? ''}::${item.alias ?? ''}`;
      if (seenListKeys.has(key)) {
        return false;
      }
      seenListKeys.add(key);
      return true;
    })
    .sort((left, right) => left.position - right.position);
}

function groupPowersForDisplay(items) {
  if (items.some(isListItem)) {
    return sanitizeExistingLists(items);
  }

  const powers = items
    .map((item, index) => ({ ...item, position: numberValue(item.position) ?? index }))
    .sort((left, right) => left.position - right.position);
  const repeatedPrefixGroups = detectRepeatedPowerPrefixes(powers);
  const grouped = [];
  let currentGroupId;
  let currentGroupAlias;
  const aliasCounts = new Map();

  for (const power of powers) {
    const matchedPrefix = extractPowerNamePrefix(power.name ?? power.alias);
    const groupAlias = inferPowerGroupAlias(power, repeatedPrefixGroups);
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
    if (matchedPrefix && repeatedPrefixGroups.get(matchedPrefix) === groupAlias) {
      stripGroupedPowerPrefix(power, matchedPrefix);
    }
    grouped.push(power);
  }

  return grouped;
}

function detectRepeatedPowerPrefixes(items) {
  const counts = new Map();
  for (const item of items) {
    const prefix = extractPowerNamePrefix(item.name ?? item.alias);
    if (!prefix) {
      continue;
    }
    counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
  }

  const groups = new Map();
  for (const [prefix, count] of counts.entries()) {
    if (count < 2) {
      continue;
    }
    groups.set(prefix, powerPrefixGroupAlias(prefix));
  }
  return groups;
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

function inferPowerGroupAlias(item, repeatedPrefixGroups = new Map()) {
  const prefix = extractPowerNamePrefix(item.name ?? item.alias);
  if (prefix && repeatedPrefixGroups.has(prefix)) {
    return repeatedPrefixGroups.get(prefix);
  }

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

function extractPowerNamePrefix(value) {
  const match = String(value ?? '').trim().match(/^([A-Za-z][A-Za-z' -]{1,40}):\s+\S/);
  return match ? match[1].trim() : undefined;
}

function powerPrefixGroupAlias(prefix) {
  const normalized = String(prefix ?? '').trim();
  if (!normalized) {
    return undefined;
  }
  if (/^spell$/i.test(normalized)) {
    return 'Spells';
  }
  if (/powers?$/i.test(normalized)) {
    return normalized;
  }
  return `${normalized} Powers`;
}

function stripGroupedPowerPrefix(item, prefix) {
  const trimmedPrefix = String(prefix ?? '').trim();
  if (!trimmedPrefix) {
    return item;
  }

  const prefixPattern = new RegExp(`^${escapeRegex(trimmedPrefix)}:\\s*`, 'i');
  if (typeof item.name === 'string') {
    item.name = item.name.replace(prefixPattern, '').trim();
  }
  if (typeof item.text === 'string') {
    item.text = item.text.replace(prefixPattern, '').trim();
  }
  if (typeof item.alias === 'string' && item.alias.trim() && prefixPattern.test(item.alias)) {
    item.alias = item.alias.replace(prefixPattern, '').trim();
  }
  return item;
}

function escapeRegex(value) {
  return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function refineEquipmentItems(items) {
  if (items.length === 0) {
    return items;
  }

  if (items.some((item) => isListItem(item) && item.alias === 'Equipment')) {
    const scaffoldItems = items.filter((item) => isListItem(item) || item.parentId);
    const rawItems = items.filter((item) => !isListItem(item) && !item.parentId);
    const sanitized = sanitizeExistingLists(scaffoldItems);
    const equipmentList = sanitized.find((item) => isListItem(item) && item.alias === 'Equipment');
    const parentId = equipmentList?.id ?? 'equipment-group-main';
    const existingNames = new Set(sanitized.map((item) => lower(item.name ?? item.alias)));
    const appended = [...sanitized];

    for (const item of rawItems) {
      if (existingNames.has(lower(item.name ?? item.alias))) {
        continue;
      }
      appended.push(refineEquipmentItem(item, appended.length, parentId));
      existingNames.add(lower(item.name ?? item.alias));
    }
    return appended;
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

function recoverEquipmentFromGrid(items, grid) {
  if (!grid) {
    return items;
  }

  const gearSheet = asArray(grid.sheets).find((sheet) => /^Gear$/i.test(sheet.name));
  if (!gearSheet) {
    return items;
  }

  const existingNames = new Set(items.map((item) => lower(item.name ?? item.alias)));
  const rows = new Map();

  for (const cell of asArray(gearSheet.cells)) {
    const row = rows.get(cell.row) ?? {};
    row[cell.columnName] = String(cell.value ?? '').trim();
    rows.set(cell.row, row);
  }

  const orderedRows = [...rows.keys()].sort((left, right) => left - right);
  const recovered = [];

  for (let index = 0; index < orderedRows.length; index += 1) {
    const rowNumber = orderedRows[index];
    const row = rows.get(rowNumber) ?? {};
    const itemName = String(row.A ?? '').trim();
    const slot = String(row.E ?? '').trim();
    if (!itemName || !/weapon\s*#\d+/i.test(slot)) {
      continue;
    }
    if (existingNames.has(lower(itemName))) {
      continue;
    }

    const detailLines = [];
    let endRow = rowNumber;
    for (let nextIndex = index + 1; nextIndex < orderedRows.length; nextIndex += 1) {
      const nextRowNumber = orderedRows[nextIndex];
      const nextRow = rows.get(nextRowNumber) ?? {};
      if (String(nextRow.A ?? '').trim()) {
        break;
      }
      const detail = String(nextRow.B ?? '').trim();
      if (detail) {
        detailLines.push(detail);
        endRow = nextRowNumber;
      }
    }

    if (detailLines.length === 0) {
      continue;
    }

    recovered.push({
      name: itemName,
      alias: itemName,
      carried: true,
      notes: `Imported gear: ${detailLines.join(' | ')} | Slot: ${slot}`,
      sourceRefs: [`Gear!A${rowNumber}:E${endRow}`],
    });
    existingNames.add(lower(itemName));
  }

  return [...items, ...recovered];
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
  for (const child of parseResolvedEquipmentPowerChildren(item, noteText)) {
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
      modifiers: [],
      adders: [],
    });
  }

  const affectsPrimary = children.some((child) => isCharacteristicChild(child));

  return {
    ...item,
    id: item.id ?? `equipment-${index + 1}`,
    parentId,
    xmlId: 'COMPOUNDPOWER',
    isContainer: true,
    baseCost: 0,
    levels: 0,
    price: item.price ?? 0,
    weight: item.weight ?? 0,
    carried: item.carried ?? true,
    affectsPrimary,
    affectsTotal: true,
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

function isCharacteristicChild(child) {
  const xmlId = String(child?.xmlId ?? child?.type ?? child?.tag ?? '').trim().toUpperCase();
  return new Set([
    'STR', 'DEX', 'CON', 'INT', 'EGO', 'PRE',
    'OCV', 'DCV', 'OMCV', 'DMCV',
    'SPD', 'PD', 'ED', 'REC', 'END', 'BODY', 'STUN',
    'RUNNING', 'SWIMMING', 'LEAPING',
  ]).has(xmlId);
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
  for (const match of text.matchAll(/\b(str|dex|con|int|ego|pre|ocv|dcv|omcv|dmcv|pd|ed|rec|end|body|stun)\s*([+-]\d+)\b/ig)) {
    const type = statMap[match[1].toLowerCase()];
    const value = Number(match[2]);
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
  const hka = text.match(/\b(\d+)D6(?:\s*-\s*(\d+))?\s*HKA(?:\s*\[(\d+)D6(?:\+(\d+))?\])?/i);
  if (hka) {
    const minusOnePip = hka[2] ? Number(hka[2]) : 0;
    children.push({
      id: `${slug(item.name)}-hka`,
      xmlId: 'HKA',
      name: item.name,
      alias: 'Hand-To-Hand Killing Attack',
      input: 'PD',
      levels: Number(hka[1]),
      baseCost: 0,
      useStandardEffect: false,
      affectsPrimary: false,
      affectsTotal: true,
      adders: [
        ...(minusOnePip ? [{
          id: `${slug(item.name)}-minus-one-pip`,
          xmlId: 'MINUSONEPIP',
          alias: '+1d6 -1',
          baseCost: 10,
        }] : []),
        ...(hka[4] ? [{
          id: `${slug(item.name)}-plus-one-pip`,
          xmlId: 'PLUSONEPIP',
          alias: '+1 pip',
          baseCost: Number(hka[4]) * 5,
        }] : []),
      ],
    });
  }
  const rka = text.match(/\b(\d+)D6(?:\s*-\s*(\d+))?\s*RKA\b/i);
  if (rka) {
    const minusOnePip = rka[2] ? Number(rka[2]) : 0;
    children.push({
      id: `${slug(item.name)}-rka`,
      xmlId: 'RKA',
      name: item.name,
      alias: 'Ranged Killing Attack',
      input: 'PD',
      levels: Number(rka[1]),
      baseCost: 0,
      useStandardEffect: false,
      affectsPrimary: false,
      affectsTotal: true,
      adders: minusOnePip ? [{
        id: `${slug(item.name)}-rka-minus-one-pip`,
        xmlId: 'MINUSONEPIP',
        alias: '+1d6 -1',
        baseCost: 10,
      }] : undefined,
    });
  }
  return children;
}

function parseResolvedEquipmentPowerChildren(item, text) {
  const children = [];
  const segments = splitEffectSegments(text);

  for (const [index, segment] of segments.entries()) {
    const promoted = normalizePowerForHeroDesigner({
      name: item.name,
      alias: item.alias ?? item.name,
      notes: segment,
      preserveAsCustom: true,
      sourceRefs: item.sourceRefs,
    });
    if (promoted?.preserveAsCustom === false && promoted?.custom === false && promoted?.hdcXmlId) {
      children.push({
        ...promoted,
        id: `${slug(item.name)}-resolved-${index + 1}`,
        parentId: undefined,
        position: undefined,
      });
    }
  }

  if (/spectral chest/i.test(text)) {
    children.push({
      id: `${slug(item.name)}-spectral-chest`,
      hdcXmlId: 'EXTRADIMENSIONALMOVEMENT',
      name: item.name,
      alias: 'Extra-Dimensional Movement',
      input: 'Spectral Chest',
      baseCost: 20,
      levels: 0,
      option: 'SINGLE',
      optionId: 'SINGLE',
      optionAlias: 'Single Dimension',
      range: 'SELF',
      duration: 'INSTANT',
      target: 'SELFONLY',
      affectsPrimary: false,
      affectsTotal: true,
      modifiers: [{
        id: `${slug(item.name)}-spectral-chest-only`,
        xmlId: 'MODIFIER',
        alias: 'Only to move Eli’s Spectral Chest',
        baseCost: -1,
      }],
    });
  }

  return dedupeChildren(children, (child) => [
    child.hdcXmlId ?? child.xmlId ?? child.type ?? '',
    lower(child.optionId ?? ''),
    lower(child.input ?? ''),
    child.levels ?? '',
    lower(child.alias ?? child.name ?? ''),
  ].join(':'));
}

function splitEffectSegments(text) {
  return String(text ?? '')
    .split(/\s*;\s*/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function bindCombatSkillLevels(skills, powers, equipment, martialArts) {
  const attackTargets = collectCombatSkillTargets(powers, equipment, martialArts);
  return asArray(skills).map((skill) => bindCombatSkillLevel(skill, attackTargets));
}

function collectCombatSkillTargets(powers, equipment, martialArts) {
  const candidates = [];

  function pushCandidate(item, source = '', parentName = '') {
    if (!item || item.tag === 'LIST') {
      return;
    }
    const name = String(item.name ?? item.alias ?? '').trim();
    if (!name) {
      return;
    }
    const haystack = lower(`${item.name ?? ''} ${item.alias ?? ''} ${item.notes ?? ''} ${source} ${parentName}`);
    candidates.push({
      name,
      haystack,
      source,
      isContainer: item.isContainer === true || String(item.xmlId ?? '').toUpperCase() === 'COMPOUNDPOWER',
      focuses: extractCombatFocuses(haystack),
    });
    for (const child of asArray(item.subPowers)) {
      pushCandidate(child, source, `${parentName} ${name}`.trim());
    }
  }

  for (const item of asArray(powers)) {
    pushCandidate(item, 'power');
  }
  for (const item of asArray(equipment)) {
    pushCandidate(item, 'equipment');
  }
  for (const item of asArray(martialArts)) {
    pushCandidate(item, 'martial');
  }

  return dedupeChildren(candidates, (candidate) => lower(candidate.name));
}

function bindCombatSkillLevel(skill, attackTargets) {
  if (String(skill?.xmlId ?? '').toUpperCase() !== 'COMBAT_LEVELS') {
    return skill;
  }
  if (!['SINGLE', 'TIGHT', 'BROAD'].includes(String(skill.optionId ?? '').toUpperCase())) {
    return skill;
  }

  const targetName = inferCombatSkillTargetName(skill, attackTargets);
  if (!targetName) {
    return skill;
  }

  const adders = [...asArray(skill.adders)];
  const alreadyLinked = adders.some((adder) =>
    String(adder.xmlId ?? '').toUpperCase() === 'ADDER'
    && lower(adder.alias ?? adder.name) === lower(targetName),
  );
  if (!alreadyLinked) {
    adders.push({
      id: `${slug(skill.name ?? skill.alias ?? 'csl')}-link`,
      xmlId: 'ADDER',
      alias: targetName,
      baseCost: 0,
      selected: true,
      includeInBase: false,
      displayInString: false,
      required: false,
      private: false,
      showAlias: false,
    });
  }

  const existingOptionAlias = String(skill.optionAlias ?? '');
  return {
    ...skill,
    optionAlias: isGenericCombatOptionAlias(existingOptionAlias) ? `with ${targetName}` : existingOptionAlias,
    adders,
  };
}

function inferCombatSkillTargetName(skill, attackTargets) {
  const text = lower(`${skill.name ?? ''} ${skill.alias ?? ''} ${skill.input ?? ''} ${skill.notes ?? ''}`);
  const focuses = extractCombatFocuses(text);
  if (focuses.length === 0 || focuses.length > 1) {
    return undefined;
  }

  const matches = attackTargets
    .map((candidate) => ({
      ...candidate,
      score: scoreCombatSkillTarget(candidate, focuses[0]),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));

  if (matches.length === 0) {
    return undefined;
  }

  const [best, secondBest] = matches;
  if (best.score < 8) {
    return undefined;
  }
  if (secondBest && secondBest.score >= best.score - 1) {
    return undefined;
  }

  return best.name;
}

function extractCombatFocuses(text) {
  const normalized = lower(text)
    .replace(/\bw\.\s*p\.\b/g, 'weapon proficiency')
    .replace(/\bw\//g, 'with ')
    .replace(/[^a-z0-9]+/g, ' ');
  const focuses = [];
  for (const [focus, terms] of COMBAT_FOCUS_GROUPS.entries()) {
    if (terms.some((term) => normalized.match(new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')))) {
      focuses.push(focus);
    }
  }
  return focuses;
}

function scoreCombatSkillTarget(candidate, focus) {
  const terms = COMBAT_FOCUS_GROUPS.get(focus) ?? [focus];
  const name = lower(candidate.name);
  let score = 0;

  if (candidate.focuses.includes(focus)) {
    score += 6;
  }

  for (const term of terms) {
    const exactWord = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (name.match(exactWord)) {
      score += 6;
    } else if (candidate.haystack.match(exactWord)) {
      score += 2;
    }
  }

  if (isWeaponFocus(focus) && candidate.source === 'equipment') {
    score += 3;
  }
  if (['grab', 'tendril', 'claw', 'bite', 'strike'].includes(focus) && candidate.source === 'martial') {
    score += 3;
  }
  if (candidate.isContainer) {
    score += 1;
  }

  return score;
}

function isWeaponFocus(focus) {
  return ['sword', 'knife', 'axe', 'spear', 'staff', 'club', 'bow', 'crossbow', 'whip', 'shield'].includes(focus);
}

function isGenericCombatOptionAlias(value) {
  const normalized = lower(value);
  return !normalized || normalized === 'with any single attack' || normalized === 'combat' || normalized === 'with any attack';
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
  const campaignGrantedFree = inferCampaignGrantedFreePower(item.sourceRefs, gridIndex);
  const explicitlyResolved = item.preserveAsCustom === false
    || (Boolean(item.hdcXmlId) && item.preserveAsCustom !== true);
  if (explicitlyResolved) {
    return {
      ...item,
      campaignGrantedFree,
      preserveAsCustom: false,
      baseCost: numberValue(item.baseCost) ?? 0,
    };
  }

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
      const value = parseWorkbookNumber(gridIndex.get(`${sheetName}!${col}${row}`.toLowerCase()));
      if (value !== undefined) {
        return value;
      }
    }
    const startValue = parseWorkbookNumber(gridIndex.get(`${sheetName}!${startCol}${row}`.toLowerCase()));
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

  match = text.match(/\+(\d+)\s*(?:SPD|Speed)\b/i);
  if (match) {
    return promotePower(item, {
      hdcXmlId: 'SPD',
      levels: Number(match[1]),
      baseCost: 0,
      lvlCost: 10,
      range: 'SELF',
      duration: 'PERSISTENT',
      target: 'SELFONLY',
      affectsPrimary: true,
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

  match = text.match(/\bRKA\s+(\d+)D6\b/i);
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

  match = text.match(/\b(\d+)D6\s+EB\b/i);
  if (match) {
    return promotePower(item, {
      hdcXmlId: 'ENERGYBLAST',
      levels: Number(match[1]),
      baseCost: 0,
      lvlCost: 5,
      range: 'YES',
      duration: 'INSTANT',
      target: 'DCV',
      defense: 'NORMAL',
      doesDamage: true,
      doesKnockback: true,
      doesBody: false,
      killing: false,
    });
  }

  match = text.match(/\b(\d+)D6\s+Luck\b/i);
  if (match) {
    return promotePower(item, {
      hdcXmlId: 'LUCK',
      levels: Number(match[1]),
      baseCost: 0,
      lvlCost: 5,
      range: 'SELF',
      duration: 'PERSISTENT',
      target: 'SELFONLY',
      doesDamage: false,
      doesKnockback: false,
      doesBody: false,
      killing: false,
    });
  }

  match = text.match(/\b(\d+)D6\s+Drain\s+to\s+([A-Za-z ]+?)(?:,|;|$)/i);
  if (match) {
    return promotePower(item, {
      hdcXmlId: 'DRAIN',
      levels: Number(match[1]),
      baseCost: 0,
      lvlCost: 10,
      input: match[2].trim(),
      range: 'YES',
      duration: 'INSTANT',
      target: 'DCV',
      defense: 'POWER',
      doesDamage: false,
      doesKnockback: false,
      doesBody: false,
      killing: false,
    });
  }

  match = text.match(/\b(\d+)D6\s+Aid\s+to\s+([A-Za-z ]+?)(?:,|;|$)/i);
  if (match) {
    return promotePower(item, {
      hdcXmlId: 'AID',
      levels: Number(match[1]),
      baseCost: 0,
      lvlCost: 6,
      input: match[2].trim(),
      range: 'NO',
      duration: 'INSTANT',
      target: 'SELFONLY',
      defense: 'POWER',
      doesDamage: false,
      doesKnockback: false,
      doesBody: false,
      killing: false,
    });
  }

  match = text.match(/\bExtra-?Dimensional\s+Movement\b/i);
  if (match) {
    const destination = text.match(/\bto\s+([^;,(]+(?:\([^)]*\))?)/i)?.[1]?.trim();
    return promotePower(item, {
      hdcXmlId: 'EXTRADIMENSIONALMOVEMENT',
      levels: 0,
      baseCost: 20,
      lvlCost: 0,
      input: destination,
      option: 'SINGLE',
      optionId: 'SINGLE',
      optionAlias: /\bSingle\s+Dimension\b/i.test(text) ? 'Single Dimension' : 'Single Dimension',
      range: 'SELF',
      duration: 'INSTANT',
      target: 'SELFONLY',
      affectsPrimary: false,
      affectsTotal: true,
    });
  }

  match = text.match(/\b(\d+)\s*(?:lvls?|levels?)\s+Damage\s+Negation\b/i);
  if (match) {
    const levels = Number(match[1]);
    return promotePower(item, {
      hdcXmlId: 'DAMAGENEGATION',
      levels: 0,
      baseCost: 0,
      lvlCost: 0,
      range: 'NO',
      duration: 'PERSISTENT',
      target: 'SELFONLY',
      adders: [inferDamageNegationAdder(item, text, levels)],
    });
  }

  match = text.match(/\b(\d+)\s*pt\s*flash\s*defen[cs]e\s*(hearing|sight|smell|touch|mental)?/i);
  if (match) {
    return promotePower(item, {
      hdcXmlId: 'FLASHDEFENSE',
      levels: Number(match[1]),
      baseCost: 0,
      lvlCost: 1,
      input: match[2] ? match[2][0].toUpperCase() + match[2].slice(1).toLowerCase() : undefined,
      range: 'NO',
      duration: 'PERSISTENT',
      target: 'SELFONLY',
      affectsPrimary: false,
      affectsTotal: true,
    });
  }

  match = text.match(/\b(\d+)\s*DC\s+(Energy|Physical|Mental)\s+Damage\s+Negation\b/i);
  if (match) {
    const levels = Number(match[1]);
    return promotePower(item, {
      hdcXmlId: 'DAMAGENEGATION',
      levels: 0,
      baseCost: 0,
      lvlCost: 0,
      range: 'NO',
      duration: 'PERSISTENT',
      target: 'SELFONLY',
      adders: [damageNegationAdder(match[2], levels, item)],
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

  match = text.match(/\bCosmetic\s+Transform\s+(\d+)D6\b/i);
  if (match) {
    const levels = Number(match[1]);
    return promotePower(item, {
      hdcXmlId: 'TRANSFORM',
      levels,
      baseCost: 0,
      lvlCost: 3,
      option: 'COSMETIC',
      optionId: 'COSMETIC',
      range: 'YES',
      duration: 'INSTANT',
      target: 'DCV',
      defense: 'POWER',
      doesDamage: true,
      optionAlias: 'Cosmetic Transform',
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

  match = text.match(/\b(\d+)D6\s+(Minor|Major|Severe)\s+Transform\b/i);
  if (match) {
    const grade = match[2].toUpperCase();
    const levels = Number(match[1]);
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
      optionAlias: `${match[2]} Transform`,
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

function decoratePowerFromNotes(item) {
  if (!item || item.tag === 'LIST') {
    return item;
  }
  return decoratePromotedPower(item);
}

function decoratePromotedPower(item) {
  const text = `${item.name ?? ''} ${item.alias ?? ''} ${item.input ?? ''} ${item.notes ?? ''}`;
  const modifiers = [...asArray(item.modifiers)];
  const adders = [...asArray(item.adders)];
  const powerXmlId = item.hdcXmlId ?? item.xmlId;
  const costsEndToActivate = /\bCosts?\s+END(?:urance)?\s+to\s+Activate\b/i.test(text);
  const halfEndToMaintain = /\b(?:1\/2|Half)\s*END(?:urance)?\s+to\s+maintain\b/i.test(text);
  const costsEnd = /\bCosts?\s+END(?:urance)?\b/i.test(text);

  if (/\bIncreased\s+END(?:urance)?\s*\(\s*x2\s*END\s*;?\s*-1\s*\)/i.test(text) && supportsReducedEndAdvantage(powerXmlId)) {
    modifiers.push({
      id: `${slug(item.name ?? item.alias ?? 'power')}-increased-end`,
      xmlId: 'INCREASEDEND',
      alias: 'Increased Endurance Cost',
      baseCost: -0.5,
      option: '2X',
      optionId: '2X',
      optionAlias: 'x2 END',
      isLimitation: true,
    });
  }

  if (/\bNO\s*END\b/i.test(text) && supportsReducedEndAdvantage(powerXmlId)) {
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

  if (!halfEndToMaintain && /\b(?:1\/2|Half)\s*END\b/i.test(text) && supportsReducedEndAdvantage(powerXmlId)) {
    modifiers.push({
      id: `${slug(item.name ?? item.alias ?? 'power')}-half-end`,
      xmlId: 'REDUCEDEND',
      alias: 'Reduced Endurance',
      baseCost: 0.25,
      option: 'HALFEND',
      optionId: 'HALFEND',
      optionAlias: 'Half END (1/2 END)',
    });
  }

  if (halfEndToMaintain && supportsCostsEndLimitation(powerXmlId)) {
    modifiers.push({
      id: `${slug(item.name ?? item.alias ?? 'power')}-costs-end-to-maintain`,
      xmlId: 'COSTSENDTOMAINTAIN',
      alias: 'Costs END To Maintain',
      baseCost: -0.25,
      option: 'HALF',
      optionId: 'HALF',
      optionAlias: 'Half END Cost',
      comments: '',
      isLimitation: true,
      forceAllow: true,
    });
  }

  if (costsEnd && supportsCostsEndLimitation(powerXmlId)) {
    const onlyToActivate = costsEndToActivate && !halfEndToMaintain;
    modifiers.push({
      id: `${slug(item.name ?? item.alias ?? 'power')}-costs-end`,
      xmlId: 'COSTSEND',
      alias: 'Costs Endurance',
      baseCost: onlyToActivate ? -0.25 : -0.5,
      option: onlyToActivate ? 'ACTIVATE' : 'EVERYPHASE',
      optionId: onlyToActivate ? 'ACTIVATE' : 'EVERYPHASE',
      optionAlias: onlyToActivate ? 'Only Costs END to Activate' : 'Costs END Every Phase',
      comments: '',
      isLimitation: true,
      forceAllow: true,
    });
  }

  if ((/\bArmor\s+Piercing\b/i.test(text) || /\bAP\b(?=\s*[+-])/.test(text)) && supportsArmorPiercing(item.hdcXmlId)) {
    modifiers.push({
      id: `${slug(item.name ?? item.alias ?? 'power')}-armor-piercing`,
      xmlId: 'ARMORPIERCING',
      alias: 'Armor Piercing',
      baseCost: 0.25,
      levels: 1,
    });
  }

  if (/\bPenetrating\b/i.test(text) && supportsPenetrating(item.hdcXmlId ?? item.xmlId)) {
    modifiers.push({
      id: `${slug(item.name ?? item.alias ?? 'power')}-penetrating`,
      xmlId: 'PENETRATING',
      alias: 'Penetrating',
      baseCost: 0,
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

  if (/\bGest(?:ures?)?\b|\bmust\s+snap\s+(?:(?:his|her|their)\s+)?fingers?\b/i.test(text)) {
    modifiers.push({
      id: `${slug(item.name ?? item.alias ?? 'power')}-gestures`,
      xmlId: 'GESTURES',
      alias: 'Gestures',
      baseCost: -0.25,
      isLimitation: true,
    });
  }

  if (/\bDoes\s+Body\b/i.test(text)) {
    item = {
      ...item,
      doesBody: true,
    };
  }

  if (/\bIncant(?:ation|ations)?\b/i.test(text)) {
    modifiers.push({
      id: `${slug(item.name ?? item.alias ?? 'power')}-incantations`,
      xmlId: 'INCANTATIONS',
      alias: 'Incantations',
      baseCost: -0.25,
      isLimitation: true,
    });
  }

  const autofireMatch = text.match(/\bAF(?:\s*(\d+))?(?:\s*\+\s*\d+(?:\.\d+)?)?\b/i);
  if (autofireMatch) {
    const shotCount = Number(autofireMatch[1] ?? 5);
    const autofireOption = resolveAutofireOption(shotCount);
    modifiers.push({
      id: `${slug(item.name ?? item.alias ?? 'power')}-autofire`,
      xmlId: 'AUTOFIRE',
      alias: 'Autofire',
      baseCost: autofireOption.baseCost,
      option: autofireOption.option,
      optionId: autofireOption.optionId,
      optionAlias: autofireOption.optionAlias,
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

  if (/\bET\s*(?:1\s*PH|1PH|FULL\s*PHASE)\b/i.test(text)) {
    modifiers.push({
      id: `${slug(item.name ?? item.alias ?? 'power')}-extra-time-phase`,
      xmlId: 'EXTRATIME',
      alias: 'Extra Time',
      baseCost: -0.5,
      option: 'FULL',
      optionId: 'FULL',
      optionAlias: 'Full Phase',
      isLimitation: true,
    });
  }

  if (/\b(?:ET|Extra\s+Time(?:\s+to\s+come\s+into\s+effect)?)\s*5\s*minutes?\b/i.test(text)) {
    modifiers.push({
      id: `${slug(item.name ?? item.alias ?? 'power')}-extra-time-five-minutes`,
      xmlId: 'EXTRATIME',
      alias: 'Extra Time',
      baseCost: -2,
      option: '5MINUTES',
      optionId: '5MINUTES',
      optionAlias: '5 Minutes',
      isLimitation: true,
    });
  }

  if (/Skill Roll:Earth Magic Casting/i.test(text)) {
    modifiers.push({
      id: `${slug(item.name ?? item.alias ?? 'power')}-skill-roll`,
      xmlId: 'REQUIRESASKILLROLL',
      alias: 'Requires A Roll',
      baseCost: -0.5,
      option: 'SKILL',
      optionId: 'SKILL',
      optionAlias: 'Earth Magic Casting',
      comments: '',
      isLimitation: true,
    });
  }

  const inferredSkillRoll = inferSkillRollRequirement(item, text);
  if (inferredSkillRoll) {
    modifiers.push(inferredSkillRoll);
  }

  const genericSkillRoll = text.match(/\bRequires\s+A\s+Roll\s*\((\d+)-\s*roll/i);
  if (genericSkillRoll) {
    modifiers.push({
      id: `${slug(item.name ?? item.alias ?? 'power')}-requires-roll-${genericSkillRoll[1]}`,
      xmlId: 'REQUIRESASKILLROLL',
      alias: 'Requires A Roll',
      baseCost: Number(genericSkillRoll[1]) <= 11 ? -0.5 : -0.25,
      option: genericSkillRoll[1],
      optionId: genericSkillRoll[1],
      optionAlias: `${genericSkillRoll[1]}- roll`,
      comments: '',
      isLimitation: true,
    });
  }

  const flashDefense = text.match(/\b(\d+)\s*pt\s*flash\s*defen[cs]e\s*(hearing|sight|smell|touch|mental)?/i);
  if (flashDefense && item.hdcXmlId === 'FLASHDEFENSE') {
    item.input = flashDefense[2] ? flashDefense[2][0].toUpperCase() + flashDefense[2].slice(1).toLowerCase() : item.input;
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

  if (/\bOIF\b/i.test(text)) {
    modifiers.push({
      id: `${slug(item.name ?? item.alias ?? 'power')}-oif`,
      xmlId: 'FOCUS',
      alias: 'Obvious Inaccessible Focus',
      baseCost: -0.5,
      option: 'OIF',
      optionId: 'OIF',
      optionAlias: 'Obvious Inaccessible Focus (OIF)',
      isLimitation: true,
    });
  }

  if (/\bRequires\s+Multiple\s+Foci\b/i.test(text)) {
    modifiers.push({
      id: `${slug(item.name ?? item.alias ?? 'power')}-multiple-foci`,
      xmlId: 'FOCUS',
      alias: 'Obvious Accessible Focus',
      baseCost: -1,
      option: 'OAF',
      optionId: 'OAF',
      optionAlias: 'Obvious Accessible Focus (OAF)',
      adders: [{
        id: `${slug(item.name ?? item.alias ?? 'power')}-multiple-foci-adder`,
        xmlId: 'MULTIPLEFOCI',
        alias: 'Requires Multiple Foci or functions at reduced effectiveness',
        baseCost: 0.25,
      }],
      isLimitation: true,
    });
  }

  if (/\b1\s+charge\b|\b1\s+non-recoverable\s+charge\b/i.test(text)) {
    modifiers.push({
      id: `${slug(item.name ?? item.alias ?? 'power')}-one-charge`,
      xmlId: 'CHARGES',
      alias: 'Charges',
      baseCost: -2,
      option: 'ONE',
      optionId: 'ONE',
      optionAlias: '1 Charge',
      isLimitation: true,
    });
  }

  if (/\bExtra\s+Time\s*\(1\s*Hour\b/i.test(text)) {
    modifiers.push({
      id: `${slug(item.name ?? item.alias ?? 'power')}-extra-time-hour`,
      xmlId: 'EXTRATIME',
      alias: 'Extra Time',
      baseCost: -3,
      option: '1HOUR',
      optionId: '1HOUR',
      optionAlias: '1 Hour',
      isLimitation: true,
    });
  }

  if (/\b(?:Conc(?:entration)?\s*\(?\s*1\/2\s*D(?:CV|VC)|Concentration\s*\(1\/2\s*D(?:CV|VC))/i.test(text)) {
    modifiers.push({
      id: `${slug(item.name ?? item.alias ?? 'power')}-concentration`,
      xmlId: 'CONCENTRATION',
      alias: 'Concentration',
      baseCost: -0.25,
      option: 'HALF',
      optionId: 'HALF',
      optionAlias: '1/2 DCV',
      adders: /\btotally\s+unaware\s+of\s+nearby\s+events\b/i.test(text) ? [{
        id: `${slug(item.name ?? item.alias ?? 'power')}-concentration-oblivious`,
        xmlId: 'OBLIVIOUS',
        alias: 'Character is totally unaware of nearby events',
        baseCost: -0.25,
      }] : undefined,
      isLimitation: true,
    });
  }

  if (/\b(?:Conc(?:entration)?\s*\(?\s*0\s*D(?:CV|VC)|Concentration\s*\(0\s*D(?:CV|VC))/i.test(text)) {
    modifiers.push({
      id: `${slug(item.name ?? item.alias ?? 'power')}-concentration-zero`,
      xmlId: 'CONCENTRATION',
      alias: 'Concentration',
      baseCost: -0.5,
      option: 'ZERO',
      optionId: 'ZERO',
      optionAlias: '0 DCV',
      adders: /\btotally\s+unaware\s+of\s+nearby\s+events\b/i.test(text) ? [{
        id: `${slug(item.name ?? item.alias ?? 'power')}-concentration-zero-oblivious`,
        xmlId: 'OBLIVIOUS',
        alias: 'Character is totally unaware of nearby events',
        baseCost: -0.25,
      }] : undefined,
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
    'ENERGYBLAST',
    'DRAIN',
    'EGOATTACK',
    'ENTANGLE',
    'FLASH',
    'HKA',
    'RKA',
    'TELEKINESIS',
  ]).has(String(xmlId ?? '').toUpperCase());
}

function supportsPenetrating(xmlId) {
  return new Set([
    'ENERGYBLAST',
    'DRAIN',
    'EGOATTACK',
    'ENTANGLE',
    'FLASH',
    'HANDTOHANDATTACK',
    'HKA',
    'RKA',
    'TELEKINESIS',
  ]).has(String(xmlId ?? '').toUpperCase());
}

function supportsReducedEndAdvantage(xmlId) {
  const normalizedXmlId = String(xmlId ?? '').toUpperCase();
  return !new Set([
    'CUSTOMPOWER',
    'COMPOUNDPOWER',
  ]).has(normalizedXmlId) && !NO_END_POWER_XML_IDS.has(normalizedXmlId);
}

function supportsCostsEndLimitation(xmlId) {
  return NO_END_POWER_XML_IDS.has(String(xmlId ?? '').toUpperCase());
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
      pattern: /\b(?:Spellcaster\s+)?Signature\b(?:\s*\[-1\/4\]|\s*-\s*1\/4)?/i,
      xmlId: 'MODIFIER',
      alias: 'Has Signature',
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
  const genericDetect = !directDetect && !vibrationsDetect
    ? text.match(/\bDetect\s+([^;,+]+?)(?:\s+\+\d+\s*PRE.*)?(?:;|,|$)/i)
    : null;
  if (!directDetect && !vibrationsDetect && !genericDetect) {
    return null;
  }

  const option = vibrationsDetect
    ? { id: 'SINGLE', alias: 'A Single Thing', baseCost: 3 }
    : directDetect
      ? normalizeDetectOption(directDetect[1])
      : { id: 'CLASS', alias: 'A Class Of Things', baseCost: 5 };

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
    input: inferDetectSubject(item, text, genericDetect?.[1]),
    range: 'SELF',
    duration: 'PERSISTENT',
    target: 'SELFONLY',
    adders,
  };
}

function inferSkillRollRequirement(item, text) {
  if (/\bSkill\s+Roll:Earth\s+Magic\s+Casting\b/i.test(text)) {
    return null;
  }

  const explicitWizardry = /\bWiz(?:ardry|ardly)\s+Skill\s+Rol(?:l|e)\b/i.test(text);
  const msrMatch = text.match(/\bMSR\b(?:\s*:\s*([^;,.]+))?/i);
  if (!explicitWizardry && !msrMatch) {
    return null;
  }

  const skillName = explicitWizardry
    ? 'Wizardry'
    : normalizeSkillRollName(msrMatch?.[1] ?? inferDefaultSkillRollName(item, text));

  return {
    id: `${slug(item.name ?? item.alias ?? 'power')}-skill-roll`,
    xmlId: 'REQUIRESASKILLROLL',
    alias: 'Requires A Roll',
    baseCost: -0.5,
    option: 'SKILL',
    optionId: 'SKILL',
    optionAlias: skillName,
    comments: '',
    isLimitation: true,
  };
}

function inferDefaultSkillRollName(item, text) {
  if (/\bWiz\b|\bWizardry\b/i.test(`${item.name ?? ''} ${item.alias ?? ''} ${text}`)) {
    return 'Wizardry';
  }
  if (preferredMagicSkillRollName) {
    return preferredMagicSkillRollName;
  }
  if (
    /\(Wiz\)/i.test(item.name ?? '')
    || /\bspells?\b/i.test(item.parentId ?? '')
    || /\bpower-group-spells?\b/i.test(item.parentId ?? '')
  ) {
    return 'Wizardry';
  }
  return 'Skill roll';
}

function resolvePreferredMagicSkillRollName(skills) {
  const explicitMagicSkills = asArray(skills)
    .filter((skill) => /\bmagic skill\b/i.test(`${skill.name ?? ''} ${skill.alias ?? ''}`))
    .map((skill) => normalizeSkillRollName(skill.input ?? skill.name ?? skill.alias ?? ''))
    .filter((name) => name && name !== 'Skill roll');

  const uniqueExplicitMagicSkills = [...new Set(explicitMagicSkills)];
  if (uniqueExplicitMagicSkills.length === 1) {
    return uniqueExplicitMagicSkills[0];
  }

  const candidates = asArray(skills)
    .map((skill) => normalizeSkillRollName(skill.input ?? skill.name ?? skill.alias ?? ''))
    .filter((name) => /^(Wizardry|Sorcery|Spellcasting)$/i.test(name));

  const uniqueCandidates = [...new Set(candidates)];
  if (uniqueCandidates.length === 1) {
    return uniqueCandidates[0];
  }
  return null;
}

function normalizeSkillRollName(value) {
  const text = String(value ?? '').trim();
  if (!text) {
    return 'Skill roll';
  }
  if (/^wiz(?:ardry)?$/i.test(text)) {
    return 'Wizardry';
  }
  return text.replace(/\s*magic$/i, ' Magic').trim();
}

function resolveAutofireOption(shotCount) {
  if (!Number.isFinite(shotCount) || shotCount <= 0) {
    return {
      option: 'FIVE',
      optionId: 'FIVE',
      optionAlias: '5 Shots',
      baseCost: 0.5,
    };
  }
  if (shotCount <= 2) {
    return {
      option: 'TWO',
      optionId: 'TWO',
      optionAlias: '2 Shots',
      baseCost: 0.25,
    };
  }
  if (shotCount <= 3) {
    return {
      option: 'THREE',
      optionId: 'THREE',
      optionAlias: '3 Shots',
      baseCost: 0.25,
    };
  }
  if (shotCount <= 5) {
    return {
      option: 'FIVE',
      optionId: 'FIVE',
      optionAlias: '5 Shots',
      baseCost: 0.5,
    };
  }
  const doublesBeyondFive = Math.max(1, Math.ceil(Math.log2(shotCount / 5)));
  return {
    option: 'FIVE',
    optionId: 'FIVE',
    optionAlias: `${shotCount} Shots`,
    baseCost: 0.5 + (0.5 * doublesBeyondFive),
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

function inferDetectSubject(item, text, genericSubject) {
  const explicit = text.match(/\bDetect\s+Physical\s+Vibrations\b/i);
  if (explicit) {
    return 'Physical Vibrations';
  }
  if (genericSubject) {
    return String(genericSubject).trim();
  }
  const nameMatch = String(item.name ?? '').match(/^Detect\s+(.+)$/i);
  if (nameMatch) {
    return nameMatch[1].trim();
  }
  return item.input ?? item.name ?? '';
}

function inferLifeSupportPower(item, text) {
  const normalizedXmlId = String(item.hdcXmlId ?? item.xmlId ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, '');
  const lifeSupportLike = /\bLife\s*Support\b|\bLS\b|\bSelf[- ]?Contained\b|\bLongevity\b|\bImmunity\b|\bSafe in\b|\bdoes\s+not\s+age\b/i.test(text);
  if (normalizedXmlId !== 'LIFESUPPORT' && !lifeSupportLike) {
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

function inferDamageNegationAdder(item, text, levels) {
  if (/\benergy\b|\bfire\b|\bheat\b/i.test(text)) {
    return damageNegationAdder('Energy', levels, item);
  }
  if (/\bmental\b/i.test(text)) {
    return damageNegationAdder('Mental', levels, item);
  }
  return damageNegationAdder('Physical', levels, item);
}

function damageNegationAdder(kind, levels, item) {
  const normalized = String(kind ?? 'Physical').trim().toUpperCase();
  const xmlId = normalized === 'ENERGY' ? 'ENERGY' : normalized === 'MENTAL' ? 'MENTAL' : 'PHYSICAL';
  const alias = normalized === 'ENERGY' ? 'Energy DCs' : normalized === 'MENTAL' ? 'Mental DCs' : 'Physical DCs';
  return {
    id: `${slug(item.name ?? item.alias ?? 'damage-negation')}-${xmlId.toLowerCase()}`,
    xmlId,
    alias,
    baseCost: 0,
    levels,
    lvlCost: 5,
    lvlVal: 1,
    includeInBase: true,
    selected: true,
  };
}
