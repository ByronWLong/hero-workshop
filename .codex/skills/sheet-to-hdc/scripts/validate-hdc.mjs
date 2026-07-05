#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { XMLParser } from 'fast-xml-parser';

const [, , inputPath] = process.argv;

if (!inputPath) {
  console.error('Usage: node validate-hdc.mjs <character.hdc>');
  process.exit(2);
}

const xml = readFileSync(inputPath, 'utf8');
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseAttributeValue: true,
  trimValues: true,
});

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
    skills: countObjects(root.SKILLS, ['SKILL', 'LIST', 'JACK_OF_ALL_TRADES', 'SCHOLAR', 'SCIENTIST', 'LINGUIST', 'TRAVELER', 'WELL_CONNECTED']),
    perks: countObjects(root.PERKS, ['PERK', 'LIST']),
    talents: countObjects(root.TALENTS, ['TALENT', 'LIST']),
    martialArts: countObjects(root.MARTIALARTS, ['MANEUVER', 'WEAPON_ELEMENT', 'LIST']),
    powers: countObjects(root.POWERS, ['POWER', 'LIST']),
    disadvantages: countObjects(root.DISADVANTAGES, ['DISAD']),
    equipment: countObjects(root.EQUIPMENT, ['POWER', 'LIST']),
  };

  warnMissingXmlIds(root.POWERS, ['POWER'], 'power');
  warnMissingXmlIds(root.SKILLS, ['SKILL'], 'skill');
  warnMissingXmlIds(root.DISADVANTAGES, ['DISAD'], 'complication');

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
