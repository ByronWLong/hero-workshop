#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { XMLParser } from 'fast-xml-parser';

const [, , inputPath] = process.argv;

if (!inputPath) {
  console.error('Usage: node validate-hdc.mjs <character.hdc>');
  process.exit(2);
}

const xml = readTextFile(inputPath);
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseAttributeValue: true,
  trimValues: true,
});

const CHARACTERISTIC_POWER_TAGS = [
  'STR', 'DEX', 'CON', 'INT', 'EGO', 'PRE',
  'OCV', 'DCV', 'OMCV', 'DMCV',
  'SPD', 'PD', 'ED', 'REC', 'END', 'BODY', 'STUN',
  'RUNNING', 'SWIMMING', 'LEAPING',
];

const NO_END_POWER_TAGS = [
  'DEX', 'CON', 'INT', 'EGO', 'PRE',
  'OCV', 'DCV', 'OMCV', 'DMCV',
  'SPD', 'PD', 'ED', 'REC', 'END', 'BODY', 'STUN',
];

let parsed;
try {
  parsed = parser.parse(xml);
} catch (error) {
  console.error(`Invalid XML: ${error.message}`);
  process.exit(1);
}

const root = parsed.CHARACTER ?? parsed.HERO;
const errors = [];
const warnings = [];

if (!root) {
  errors.push('Missing CHARACTER or HERO root element.');
} else {
  const requiredSections = [
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
    'RULES',
  ];

  for (const section of requiredSections) {
    if (!Object.prototype.hasOwnProperty.call(root, section)) {
      errors.push(`Missing ${section} section.`);
    }
  }

  const info = root.CHARACTER_INFO ?? {};
  if (!info['@_CHARACTER_NAME'] && !info.CHARACTER_NAME) {
    warnings.push('Character name is empty.');
  }

  const characteristics = root.CHARACTERISTICS ?? {};
  const characteristicTypes = [
    'STR', 'DEX', 'CON', 'INT', 'EGO', 'PRE',
    'OCV', 'DCV', 'OMCV', 'DMCV',
    'SPD', 'PD', 'ED', 'REC', 'END', 'BODY', 'STUN',
    'RUNNING', 'SWIMMING', 'LEAPING',
  ];

  for (const type of characteristicTypes) {
    if (!characteristics[type]) {
      errors.push(`Missing characteristic ${type}.`);
    } else {
      const total = characteristics[type]['@_TOTAL'];
      const levels = characteristics[type]['@_LEVELS'];
      if (total === undefined || levels === undefined) {
        warnings.push(`${type} is missing TOTAL or LEVELS.`);
      }
    }
  }

  const counts = {
    skills: countObjects(root.SKILLS, ['SKILL', 'LIST', 'JACK_OF_ALL_TRADES', 'SCHOLAR', 'SCIENTIST', 'LINGUIST', 'TRAVELER']),
    perks: countObjects(root.PERKS, ['PERK', 'LIST', 'WELL_CONNECTED']),
    talents: countObjects(root.TALENTS, ['TALENT', 'LIST']),
    martialArts: countObjects(root.MARTIALARTS, ['MANEUVER', 'WEAPON_ELEMENT', 'LIST']),
    powers: countObjects(root.POWERS, ['POWER', 'LIST', ...CHARACTERISTIC_POWER_TAGS]),
    disadvantages: countObjects(root.DISADVANTAGES, ['DISAD']),
    equipment: countObjects(root.EQUIPMENT, ['POWER', 'LIST']),
  };

  warnMissingXmlIds(root.POWERS, ['POWER', ...CHARACTERISTIC_POWER_TAGS], 'power');
  warnMissingXmlIds(root.SKILLS, ['SKILL'], 'skill');
  warnMissingXmlIds(root.DISADVANTAGES, ['DISAD'], 'complication');
  warnCharacteristicPowerEncoding(root.POWERS);
  warnInvalidReducedEndurance(root.POWERS);
  for (const [section, label] of [
    [root.SKILLS, 'skill'],
    [root.PERKS, 'perk'],
    [root.TALENTS, 'talent'],
    [root.MARTIALARTS, 'martial art'],
    [root.POWERS, 'power'],
    [root.DISADVANTAGES, 'complication'],
    [root.EQUIPMENT, 'equipment'],
  ]) {
    warnFoundryIncompatibleItemAttributes(section, label);
    warnFoundryIncompatibleModifiers(section, label);
  }
  warnFoundryPowerFlags(root.POWERS, 'power');
  warnFoundryPowerFlags(root.EQUIPMENT, 'equipment');
  warnRequiresSkillRollTargets(root.POWERS, 'power', root.SKILLS);
  warnRequiresSkillRollTargets(root.EQUIPMENT, 'equipment', root.SKILLS);
  warnReputationAdders(root.PERKS);
  warnComplicationRollAdders(root.DISADVANTAGES);
  warnAttackDefenseInputs(root.POWERS, 'power');
  warnAttackDefenseInputs(root.EQUIPMENT, 'equipment');
  warnEmptyAdderAliases(root);

  const summary = {
    ok: errors.length === 0,
    root: parsed.CHARACTER ? 'CHARACTER' : 'HERO',
    version: root['@_version'] ?? root.version ?? '',
    characterName: info['@_CHARACTER_NAME'] ?? info.CHARACTER_NAME ?? '',
    counts,
    errors,
    warnings,
  };

  console.log(JSON.stringify(summary, null, 2));
}

if (errors.length > 0) {
  process.exit(1);
}

function readTextFile(path) {
  const buffer = readFileSync(path);
  if (buffer.length >= 2) {
    if (buffer[0] === 0xff && buffer[1] === 0xfe) {
      return buffer.toString('utf16le').replace(/^\uFEFF/, '');
    }
    if (buffer[0] === 0xfe && buffer[1] === 0xff) {
      return swap16(buffer.subarray(2)).toString('utf16le').replace(/^\uFEFF/, '');
    }
  }
  return buffer.toString('utf8').replace(/^\uFEFF/, '');
}

function swap16(buffer) {
  const clone = Buffer.from(buffer);
  clone.swap16();
  return clone;
}

function asArray(value) {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function countObjects(section, tags) {
  if (!section || typeof section !== 'object') {
    return 0;
  }
  return tags.reduce((total, tag) => total + asArray(section[tag]).length, 0);
}

function warnMissingXmlIds(section, tags, label) {
  if (!section || typeof section !== 'object') {
    return;
  }
  for (const tag of tags) {
    for (const item of asArray(section[tag])) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      if (!item['@_XMLID']) {
        warnings.push(`A ${label} is missing XMLID: ${item['@_NAME'] ?? item['@_ALIAS'] ?? '(unnamed)'}.`);
      }
      if (!item['@_ID']) {
        warnings.push(`A ${label} is missing ID: ${item['@_NAME'] ?? item['@_ALIAS'] ?? '(unnamed)'}.`);
      }
    }
  }
}

function warnCharacteristicPowerEncoding(section) {
  for (const item of asArray(section?.POWER)) {
    const xmlId = String(item?.['@_XMLID'] ?? '').toUpperCase();
    if (CHARACTERISTIC_POWER_TAGS.includes(xmlId)) {
      warnings.push(`${item['@_NAME'] ?? xmlId} uses <POWER XMLID="${xmlId}">; use a <${xmlId}> element so Hero Designer preserves it.`);
    }
  }
}

function warnInvalidReducedEndurance(section) {
  for (const tag of NO_END_POWER_TAGS) {
    for (const item of asArray(section?.[tag])) {
      const hasReducedEnd = asArray(item?.MODIFIER)
        .some((modifier) => String(modifier?.['@_XMLID'] ?? '').toUpperCase() === 'REDUCEDEND');
      if (hasReducedEnd) {
        warnings.push(`${item['@_NAME'] ?? tag} applies Reduced Endurance to ${tag}, which does not normally cost END; use Costs Endurance when END expenditure is intended.`);
      }
    }
  }
}

function sectionItems(section) {
  if (!section || typeof section !== 'object') {
    return [];
  }
  return Object.entries(section)
    .filter(([tag]) => tag !== '#text' && !tag.startsWith('@_'))
    .flatMap(([tag, value]) => asArray(value).map((item) => ({ tag, item })))
    .filter(({ item }) => item && typeof item === 'object');
}

function itemLabel(item, tag) {
  return item?.['@_NAME'] ?? item?.['@_ALIAS'] ?? item?.['@_XMLID'] ?? tag;
}

function warnFoundryIncompatibleItemAttributes(section, sectionLabel) {
  for (const { tag, item } of nestedSectionItems(section)) {
    if (tag !== 'ADDER' && item['@_LVLCOST'] !== undefined) {
      warnings.push(`${sectionLabel} ${itemLabel(item, tag)} has top-level LVLCOST; current Foundry HERO 6e models reject this field. Let the Hero Designer template supply level cost.`);
    }
  }
}

function nestedSectionItems(section) {
  const items = [];
  const visit = (container) => {
    if (!container || typeof container !== 'object') {
      return;
    }
    for (const [tag, value] of Object.entries(container)) {
      if (tag === '#text' || tag.startsWith('@_')) {
        continue;
      }
      for (const item of asArray(value)) {
        if (!item || typeof item !== 'object') {
          continue;
        }
        if (item['@_XMLID'] !== undefined) {
          items.push({ tag, item });
        }
        visit(item);
      }
    }
  };
  visit(section);
  return items;
}

function warnFoundryPowerFlags(section, sectionLabel) {
  for (const { tag, item } of nestedSectionItems(section)) {
    if (tag !== 'POWER') {
      continue;
    }
    for (const attribute of ['DOESBODY', 'DOESDAMAGE', 'DOESKNOCKBACK', 'KILLING']) {
      if (item[`@_${attribute}`] === undefined) {
        warnings.push(`${sectionLabel} ${itemLabel(item, tag)} is missing ${attribute}; direct Foundry imports require explicit power damage flags.`);
      }
    }
  }
}

function warnFoundryIncompatibleModifiers(section, sectionLabel) {
  for (const { tag, item } of sectionItems(section)) {
    for (const modifier of asArray(item.MODIFIER)) {
      if (modifier?.['@_ISLIMITATION'] !== undefined) {
        warnings.push(`${sectionLabel} ${itemLabel(item, tag)} modifier ${modifier['@_ALIAS'] ?? modifier['@_XMLID'] ?? '(unnamed)'} has ISLIMITATION; current Foundry HERO 6e models infer this from BASECOST and reject the attribute.`);
      }
    }
  }
}

function foundrySkills(section) {
  return asArray(section?.SKILL).map((skill) => ({
    xmlId: String(skill?.['@_XMLID'] ?? '').toUpperCase(),
    names: [...new Set([
      String(skill?.['@_NAME'] ?? '').trim(),
      String(skill?.['@_ALIAS'] ?? '').trim(),
    ].filter(Boolean))],
  }));
}

function expectedSkillRollOptionPrefix(skillXmlId) {
  if (skillXmlId === 'PROFESSIONAL_SKILL') {
    return 'PS';
  }
  if (skillXmlId === 'SCIENCE_SKILL') {
    return 'SS';
  }
  if (['KNOWLEDGE_SKILL', 'AREA_KNOWLEDGE', 'CITY_KNOWLEDGE'].includes(skillXmlId)) {
    return 'KS';
  }
  return 'SKILL';
}

function warnRequiresSkillRollTargets(section, sectionLabel, skillsSection) {
  const importedSkills = foundrySkills(skillsSection);
  for (const { tag, item } of sectionItems(section)) {
    for (const modifier of asArray(item.MODIFIER)) {
      if (String(modifier?.['@_XMLID'] ?? '').toUpperCase() !== 'REQUIRESASKILLROLL') {
        continue;
      }
      const optionId = String(modifier['@_OPTIONID'] ?? '').toUpperCase();
      if (!/^(?:SKILL|PS|KS|SS)(?:1PER(?:5|20))?$/.test(optionId)) {
        continue;
      }
      const optionAlias = String(modifier['@_OPTION_ALIAS'] ?? '').trim();
      const comments = String(modifier['@_COMMENTS'] ?? '').trim();
      const matchedSkills = importedSkills.filter((skill) => skill.names.some((skillName) => skillName.toLowerCase() === comments.toLowerCase()));
      if (!optionAlias || !comments) {
        warnings.push(`${sectionLabel} ${itemLabel(item, tag)} Requires A Roll needs a Hero Designer skill label in OPTION_ALIAS and a Foundry skill NAME or ALIAS in COMMENTS.`);
      } else if (matchedSkills.length === 0) {
        warnings.push(`${sectionLabel} ${itemLabel(item, tag)} Requires A Roll targets COMMENTS="${comments}", but no emitted skill has that NAME or ALIAS.`);
      } else if (matchedSkills.length === 1) {
        const expectedPrefix = expectedSkillRollOptionPrefix(matchedSkills[0].xmlId);
        const actualPrefix = optionId.replace(/1PER(?:5|20)$/, '');
        if (actualPrefix !== expectedPrefix) {
          warnings.push(`${sectionLabel} ${itemLabel(item, tag)} Requires A Roll uses OPTIONID="${optionId}", but ${comments} (${matchedSkills[0].xmlId}) requires the ${expectedPrefix} background-skill category.`);
        }
      }
    }
  }
}

function warnReputationAdders(section) {
  for (const item of asArray(section?.PERK)) {
    if (String(item?.['@_XMLID'] ?? '').toUpperCase() !== 'REPUTATION') {
      continue;
    }
    const adders = asArray(item.ADDER);
    const adderIds = new Set(adders.map((adder) => String(adder?.['@_XMLID'] ?? '').toUpperCase()));
    if (!adderIds.has('HOWWIDE') || !adderIds.has('HOWWELL')) {
      warnings.push(`Positive Reputation ${itemLabel(item, 'PERK')} must include required HOWWIDE and HOWWELL adders.`);
    }
  }
}

function warnComplicationRollAdders(section) {
  const requiredByXmlId = {
    ACCIDENTALCHANGE: ['CHANCETOCHANGE'],
    DEPENDENTNPC: ['APPEARANCE'],
    ENRAGED: ['CHANCETOGO'],
    HUNTED: ['APPEARANCE'],
    PSYCHOLOGICALLIMITATION: ['INTENSITY'],
    REPUTATION: ['RECOGNIZED'],
    SOCIALLIMITATION: ['OCCUR', 'EFFECTS'],
  };
  for (const item of asArray(section?.DISAD)) {
    const xmlId = String(item?.['@_XMLID'] ?? '').toUpperCase();
    const required = requiredByXmlId[xmlId];
    if (!required) {
      continue;
    }
    const adderIds = new Set(asArray(item.ADDER).map((adder) => String(adder?.['@_XMLID'] ?? '').toUpperCase()));
    const missing = required.filter((adderId) => !adderIds.has(adderId));
    if (missing.length > 0) {
      warnings.push(`${itemLabel(item, 'DISAD')} (${xmlId}) is missing required roll adder${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}.`);
    }
  }
}

function warnAttackDefenseInputs(section, sectionLabel) {
  const attackDefaults = new Set(['ENERGYBLAST', 'HANDTOHANDATTACK', 'HKA', 'RKA', 'TELEKINESIS']);
  for (const { tag, item } of sectionItems(section)) {
    const xmlId = String(item?.['@_XMLID'] ?? tag).toUpperCase();
    if (!attackDefaults.has(xmlId)) {
      continue;
    }
    const input = String(item['@_INPUT'] ?? '').trim().toUpperCase();
    if (!['PD', 'ED', 'MD'].includes(input)) {
      warnings.push(`${sectionLabel} ${itemLabel(item, tag)} (${xmlId}) needs INPUT="PD", "ED", or "MD" so Foundry can resolve its defense.`);
    }
  }
}

function warnEmptyAdderAliases(root) {
  function visit(value, parentLabel = 'item') {
    if (Array.isArray(value)) {
      for (const entry of value) {
        visit(entry, parentLabel);
      }
      return;
    }
    if (!value || typeof value !== 'object') {
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (key === 'ADDER') {
        for (const adder of asArray(child)) {
          const alias = String(adder?.['@_ALIAS'] ?? '').trim();
          if (!alias) {
            warnings.push(`${parentLabel} has an ADDER without ALIAS; Foundry's item description renderer can fail while trimming it.`);
          }
        }
        continue;
      }
      const label = child?.['@_ALIAS'] ?? child?.['@_NAME'] ?? key;
      visit(child, label);
    }
  }
  visit(root);
}
