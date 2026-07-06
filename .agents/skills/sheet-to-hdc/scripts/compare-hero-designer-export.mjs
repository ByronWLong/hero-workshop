#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';

const [, , irPath, htmlPath, outputPath] = process.argv;

if (!irPath || !htmlPath) {
  console.error('Usage: node compare-hero-designer-export.mjs <character-ir.json> <hero-designer-export.html> [output.json]');
  process.exit(2);
}

const ir = JSON.parse(readFileSync(irPath, 'utf8').replace(/^\uFEFF/, ''));
const html = readFileSync(htmlPath, 'utf8').replace(/^\uFEFF/, '');
const skillsSection = extractSection('SKILLS');
const powersSection = extractSection('POWERS');
const equipmentSection = extractSection('EQUIPMENT');
const irSummary = {
  skills: comparableItems(asArray(ir.skills), 'skills'),
  powers: comparableItems(asArray(ir.powers), 'powers'),
  equipment: comparableItems(asArray(ir.equipment), 'equipment'),
  martialArts: comparableItems(asArray(ir.martialArts), 'martialArts'),
  complications: comparableItems(asArray(ir.complications ?? ir.disadvantages), 'complications'),
  perks: comparableItems(asArray(ir.perks), 'perks'),
  talents: comparableItems(asArray(ir.talents), 'talents'),
};

const exportSummary = {
  characterName: firstMatch(/<td class=['"]character-name['"]>(.*?)<br>/is),
  totalPoints: firstMatch(/<td class=['"]right second-page-header['"]>(\d+)/is) ?? firstMatch(/<td class=['"]total-points first-page-header['"]>\s*(\d+)/is),
  skills: extractSkillNames(),
  powers: extractPowerNames(powersSection),
  equipment: extractPowerNames(equipmentSection),
  martialArts: extractManeuvers(),
  complications: extractComplications(),
  perks: extractSpanText('perk-name').map(stripTrailingColon),
  talents: extractSpanText('talent-name').map(stripTrailingColon),
};

const report = {
  export: {
    characterName: exportSummary.characterName,
    totalPoints: exportSummary.totalPoints,
    counts: {
      skills: exportSummary.skills.length,
      powers: exportSummary.powers.length,
      equipment: exportSummary.equipment.length,
      martialArts: exportSummary.martialArts.length,
      complications: exportSummary.complications.length,
      perks: exportSummary.perks.length,
      talents: exportSummary.talents.length,
    },
  },
  ir: {
    source: ir.source,
    counts: {
      skills: irSummary.skills.length,
      powers: irSummary.powers.length,
      equipment: irSummary.equipment.length,
      martialArts: irSummary.martialArts.length,
      complications: irSummary.complications.length,
      perks: irSummary.perks.length,
      talents: irSummary.talents.length,
    },
  },
  missing: {
    skills: missingNames(irSummary.skills, exportSummary.skills),
    powers: missingNames(irSummary.powers, exportSummary.powers),
    equipment: missingNames(irSummary.equipment, exportSummary.equipment),
    martialArts: missingNames(irSummary.martialArts, exportSummary.martialArts),
    complications: missingNames(irSummary.complications, exportSummary.complications),
    perks: missingNames(irSummary.perks, exportSummary.perks),
    talents: missingNames(irSummary.talents, exportSummary.talents),
  },
  displayed: exportSummary,
};

const json = JSON.stringify(report, null, 2);
if (outputPath) {
  writeFileSync(outputPath, `${json}\n`, 'utf8');
  console.log(`Wrote ${outputPath}`);
} else {
  console.log(json);
}

function asArray(value) {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function firstMatch(pattern) {
  const match = html.match(pattern);
  return match ? cleanText(match[1]) : undefined;
}

function extractSpanText(className, source = html) {
  const pattern = new RegExp(`<span class=['"]${escapeRegex(className)}['"]>(.*?)<\\/span>`, 'gis');
  return [...source.matchAll(pattern)]
    .map((match) => cleanText(match[1]))
    .filter(Boolean);
}

function extractSection(name) {
  const pattern = new RegExp(`<!--[^>]*BEGIN\\s+${escapeRegex(name)}\\s+\\*+[^>]*-->([\\s\\S]*?)<!--[^>]*END\\s+${escapeRegex(name)}\\s+\\*+[^>]*-->`, 'i');
  const match = html.match(pattern);
  return match ? match[1] : '';
}

function extractSkillNames() {
  return extractCellBlocks('skill', skillsSection)
    .map(extractSkillNameFromBlock)
    .filter(Boolean);
}

function extractPowerNames(section) {
  return [
    ...extractSpanText('power-list-alias', section),
    ...extractSpanText('power-name', section),
  ].map(stripTrailingColon);
}

function extractCellBlocks(className, source = html) {
  const pattern = new RegExp(`<td class=['"]${escapeRegex(className)}['"]>([\\s\\S]*?)<\\/td>`, 'gis');
  return [...source.matchAll(pattern)].map((match) => match[1]);
}

function extractSkillNameFromBlock(block) {
  const primary = firstCaptured(block, /<span class=['"]skill-name['"]>(.*?)<\/span>/is);
  if (primary) {
    return stripTrailingColon(cleanText(primary));
  }

  const listName = firstCaptured(block, /<span class=['"]list-name['"]>(.*?)<\/span>/is);
  if (listName) {
    return stripTrailingColon(cleanText(listName));
  }

  const commentName = firstCaptured(block, /<!--NAME-->\s*([^\r\n<]+)/i);
  if (commentName) {
    return cleanText(commentName);
  }

  return '';
}

function firstCaptured(source, pattern) {
  const match = String(source).match(pattern);
  return match ? match[1] : '';
}

function extractComplications() {
  const pattern = /<td class=['"]complication-description['"]>(.*?)<\/td>/gis;
  return [...html.matchAll(pattern)]
    .map((match) => cleanText(match[1]))
    .map((text) => text.replace(/^\s*[^:]+:\s*/, ''))
    .filter(Boolean);
}

function extractManeuvers() {
  const names = extractSpanText('maneuver-name').map(stripTrailingColon);
  const descriptions = [...html.matchAll(/<td class=['"]maneuver-description['"]>(.*?)<\/td>/gis)]
    .map((match) => cleanText(match[1]))
    .filter(Boolean);
  return [...names, ...descriptions];
}

function missingNames(items, displayedNames) {
  const displayed = displayedNames.map(normalizeName);
  return items
    .map((item) => (typeof item === 'string' ? item : describeItem(item)))
    .filter(Boolean)
    .filter((name) => {
      const normalized = normalizeName(name);
      return !displayed.some((displayedName) => namesMatch(normalized, displayedName));
    })
    .map(String);
}

function isSkillEnhancer(item) {
  const xmlId = String(item?.xmlId ?? item?.tag ?? '').trim().toUpperCase();
  return xmlId === 'SCIENTIST' || xmlId === 'LINGUIST';
}

function comparableItems(items, kind) {
  return items
    .filter((item) => isComparableItem(item, kind))
    .map((item) => describeItem(item, kind))
    .filter(Boolean);
}

function isComparableItem(item, kind) {
  if (!item || typeof item !== 'object') {
    return Boolean(item);
  }
  if (kind === 'skills' && isSkillEnhancer(item)) {
    return true;
  }
  return Boolean(describeItem(item, kind));
}

function describeItem(item, kind = '') {
  if (!item || typeof item !== 'object') {
    return cleanText(String(item ?? ''));
  }

  const name = cleanText(String(item.name ?? ''));
  const alias = cleanText(String(item.alias ?? ''));
  const input = cleanText(String(item.input ?? ''));

  if (name) {
    return stripTrailingColon(name);
  }

  if (kind === 'skills' && alias && input) {
    return `${stripTrailingColon(alias)}: ${input}`;
  }

  return stripTrailingColon(alias || input);
}

function namesMatch(left, right) {
  if (!left || !right) {
    return false;
  }
  return left === right || left.includes(right) || right.includes(left);
}

function cleanText(value) {
  return decodeHtml(String(value).replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtml(value) {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&frac12;/g, '1/2')
    .replace(/&frac14;/g, '1/4')
    .replace(/&frac34;/g, '3/4')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

function stripTrailingColon(value) {
  return String(value).replace(/:\s*$/, '');
}

function normalizeName(value) {
  return stripTrailingColon(value)
    .toLowerCase()
    .replace(/^(city knowledge|area knowledge|cultural knowledge|ck|ak|cuk)\b/, 'ak')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
