#!/usr/bin/env node
/**
 * Scores a generated .hdc against the sheet it came from, using Hero Workshop's own reading of
 * the file (packages/shared: the same costs the Foundry module shows):
 * - each item's Real Cost beside the sheet's cost for it (IR `sheetCost`/`realCost`/`points`)
 * - section totals and points spent
 * - fallbacks: custom powers and custom modifiers, which hero6e can't roll or apply
 * - Foundry checks: validateForFoundry issues and what repairForFoundry would still change
 *
 * Usage: node score-hdc.mjs <character.ir.json> <generated.hdc> [report.md]
 * The shared package must be built (npm run build:shared); HERO_WORKSHOP_SHARED overrides its path.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { hw } from './lib/shared.mjs';

const [, , irPath, hdcPath, reportPath] = process.argv;
if (!irPath || !hdcPath) {
  console.error('Usage: node score-hdc.mjs <character.ir.json> <generated.hdc> [report.md]');
  process.exit(1);
}

export const SECTIONS = ['skills', 'perks', 'talents', 'martialArts', 'powers', 'equipment', 'disadvantages', 'complications'];
/** The Character section an IR section's items land in */
const MODEL_SECTION = { complications: 'disadvantages' };

/** The sheet's own cost for an IR item, when it recorded one */
export function sheetCost(item) {
  for (const key of ['sheetCost', 'realCost', 'points']) {
    const v = Number(item?.[key]);
    if (item?.[key] !== undefined && item?.[key] !== '' && Number.isFinite(v)) return v;
  }
  return undefined;
}

export const normName = (s) => String(s ?? '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Every Character item of a section, equipment's compound parts included */
function hdcItems(character, section) {
  const items = character[MODEL_SECTION[section] ?? section] ?? [];
  return section === 'equipment' ? items.flatMap((e) => [e, ...(e.subPowers ?? [])]) : items;
}

/** Custom fallbacks Hero Workshop/hero6e treat as text only */
function fallbacks(item) {
  const found = [];
  const xmlId = item.xmlId ?? item.type;
  if (/^CUSTOM/.test(xmlId ?? '')) found.push(xmlId);
  for (const m of item.modifiers ?? []) if (m.xmlId === 'MODIFIER' || m.xmlId === 'GENERIC_OBJECT') found.push(`custom ${m.isLimitation || m.value < 0 ? 'limitation' : 'advantage'} "${m.alias ?? m.name}"`);
  return found;
}

/**
 * `map` (written by build-hdc.mjs next to the .hdc) says which HDC ID each IR item became;
 * without it items are matched by name.
 */
export function score(ir, xml, map) {
  const character = hw.parseHdcFile(xml);
  const rows = [];
  for (const section of SECTIONS) {
    const all = ir[section] ?? [];
    const sheetItems = all.filter((x) => !x.isContainer && !x.group && !x.isGroup && x.xmlId !== 'LIST' && x.kind !== 'list');
    const built = hdcItems(character, section);
    const byId = new Map(built.map((b) => [b.id, b]));
    const mapped = new Map((map ?? []).filter((m) => m.section === section).map((m) => [m.index, m.id]));
    const byName = new Map();
    for (const b of built) {
      for (const key of [b.name, b.alias, b.display].map(normName).filter(Boolean)) {
        if (!byName.has(key)) byName.set(key, []);
        byName.get(key).push(b);
      }
    }
    const used = new Set();
    for (const s of sheetItems) {
      const candidates = byName.get(normName(s.name)) ?? byName.get(normName(s.alias)) ?? [];
      const b = map ? byId.get(mapped.get(all.indexOf(s))) : candidates.find((x) => !used.has(x)) ?? candidates[0];
      if (b) used.add(b);
      const expected = sheetCost(s);
      const actual = b ? (MODEL_SECTION[section] === 'disadvantages' || section === 'disadvantages' ? b.points : b.realCost ?? b.points ?? b.baseCost) : undefined;
      rows.push({
        section, name: s.name ?? s.detail, sheet: expected, built: actual, found: !!b,
        delta: expected !== undefined && actual !== undefined ? Math.round((actual - expected) * 100) / 100 : undefined,
        fallbacks: b ? fallbacks(b) : [],
        xmlId: b?.xmlId ?? b?.type,
        child: !!b?.parentId,
      });
    }
  }
  const doc = hw.HdcDocument.parse(xml);
  const foundry = hw.validateForFoundry(doc);
  const repair = hw.repairForFoundry(xml);
  return { character, rows, foundry, repair, breakdown: hw.calculateCostBreakdown(character), available: hw.calculateAvailablePoints(character) };
}

export function summarize({ rows, foundry, repair, breakdown, available, character }) {
  const priced = rows.filter((r) => r.sheet !== undefined && r.built !== undefined && r.section !== 'equipment');
  const exact = priced.filter((r) => Math.abs(r.delta) < 0.5).length;
  const missing = rows.filter((r) => !r.found).length;
  const custom = rows.filter((r) => r.fallbacks.length).length;
  return {
    items: rows.length,
    priced: priced.length,
    exact,
    missing,
    custom,
    foundryIssues: foundry.length,
    repairs: repair.changes.length + repair.unresolved.length,
    breakdown,
    available,
    disadvantages: hw.calculateDisadvantageTotal(character.disadvantages),
  };
}

function report(ir, result) {
  const s = summarize(result);
  const lines = [
    `# Score: ${ir.characterInfo?.characterName ?? ir.source ?? hdcPath}`,
    '',
    `- Items: ${s.items} (${s.missing} not found in the HDC)`,
    `- Costs: ${s.exact} of ${s.priced} priced items match the sheet (equipment is priced in money, not points)`,
    `- Custom fallbacks: ${s.custom} items use a custom power or custom modifier`,
    `- Foundry: ${s.foundryIssues} validation issues, ${s.repairs} repairs needed on import`,
    `- Points spent: ${s.breakdown.total}${ir.sheetTotal !== undefined ? ` (the sheet says ${ir.sheetTotal})` : ''}: characteristics ${s.breakdown.characteristics}, skills ${s.breakdown.skills}, perks ${s.breakdown.perks}, talents ${s.breakdown.talents}, martial arts ${s.breakdown.martialArts}, powers ${s.breakdown.powers}; complications ${s.disadvantages}`,
    '',
    '| Section | Item | Sheet | Built | Δ | XMLID | Fallbacks |',
    '|---|---|---:|---:|---:|---|---|',
  ];
  for (const r of result.rows) {
    const flag = !r.found || (r.delta !== undefined && Math.abs(r.delta) >= 0.5 && r.section !== 'equipment') || r.fallbacks.length;
    if (!flag) continue;
    lines.push(`| ${r.section} | ${r.name}${r.child ? ' (in list)' : ''} | ${r.sheet ?? ''} | ${r.found ? r.built ?? '' : 'missing'} | ${r.delta ?? ''} | ${r.xmlId ?? ''} | ${r.fallbacks.join('; ')} |`);
  }
  if (result.foundry.length) {
    lines.push('', '## Foundry validation', '');
    for (const i of result.foundry) lines.push(`- ${i.message ?? JSON.stringify(i)}`);
  }
  const repairs = [...result.repair.changes, ...result.repair.unresolved.map((u) => `unresolved: ${u}`)];
  if (repairs.length) {
    lines.push('', '## Repairs hero6e import would apply', '');
    for (const r of repairs) lines.push(`- ${typeof r === 'string' ? r : r.message ?? JSON.stringify(r)}`);
  }
  return { text: lines.join('\n') + '\n', summary: s };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const ir = JSON.parse(readFileSync(irPath, 'utf8').replace(/^\uFEFF/, ''));
  const xml = hw.decodeHdcBytes(readFileSync(hdcPath));
  const map = existsSync(`${hdcPath}.map.json`) ? JSON.parse(readFileSync(`${hdcPath}.map.json`, 'utf8')) : undefined;
  const { text, summary } = report(ir, score(ir, xml, map));
  if (reportPath) writeFileSync(reportPath, text);
  else process.stdout.write(text);
  console.error(`${summary.exact}/${summary.priced} costs match; ${summary.custom} custom; ${summary.missing} missing; ${summary.foundryIssues} Foundry issues; ${summary.repairs} repairs`);
}
