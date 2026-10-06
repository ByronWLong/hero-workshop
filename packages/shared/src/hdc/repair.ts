/**
 * Repairs that make a character work fully in hero6e (Foundry) without changing its build:
 *
 * - Combat Skill Levels (and Mental CSLs, Penalty Skill Levels, Weapon Master) that apply to
 *   chosen attacks are linked to them. Hero Designer only names the attacks in the level's
 *   text ("+2 with Bite, Claws"); hero6e needs a cost-free custom adder per attack, named as
 *   the attack's Foundry item is. "with HTH Combat" / "with Ranged Combat" link every
 *   hand-to-hand / ranged attack.
 * - Adjustment powers list their targets comma-separated ("BODY and STUN" -> "BODY, STUN").
 * - "Usable As" movement says which movement it is (hero6e reads ALIAS or COMMENTS).
 *
 * Anything that can't be worked out is reported, not guessed.
 */

import type { Adder, Character, Skill } from '../types.js';
import { getPowerDefinition } from '../powerDefinitions.js';
import { isContainerType } from '../frameworks.js';
import { HdcDocument } from './document.js';
import { parseHdcDocument } from './parse.js';
import { updateHdc } from './write.js';

export interface RepairResult {
  xml: string;
  /** What was repaired */
  changes: string[];
  /** What couldn't be repaired automatically */
  unresolved: string[];
}

export function repairForFoundry(xml: string): RepairResult {
  const changes: string[] = [];
  const unresolved: string[] = [];

  const doc = HdcDocument.parse(xml);
  doc.ensureIds();
  const base = doc.toString();
  const character = parseHdcDocument(doc);
  const linked = linkCombatLevels(character, changes, unresolved);
  let out = linked === character ? base : updateHdc(base, linked).xml;

  const fixed = HdcDocument.parse(out);
  repairAdjustmentInputs(fixed, changes);
  repairUsableAs(fixed, changes);
  out = fixed.toString();
  return { xml: changes.length ? out : xml, changes, unresolved };
}

// =============================================================================
// Combat Skill Levels
// =============================================================================

const LINKED_LEVELS = ['COMBAT_LEVELS', 'MENTAL_COMBAT_LEVELS', 'PENALTY_SKILL_LEVELS', 'WEAPON_MASTER'];
/** Options that apply to every attack (no links needed) */
const UNLINKED_OPTIONS = ['ALL', 'SINGLEDCV', 'GROUPDCV', 'OVERALL'];
/** How many attacks each 6E option may name (hero6e's limits) */
const MAX_LINKS: Record<string, number> = { SINGLE: 1, TIGHT: 3, BROAD: 10, VERYLIMITED: 3, LIMITED: 10 };

/** hero6e's standard and optional combat maneuvers, which it gives every actor */
const STANDARD_MANEUVERS = [
  'Block', 'Brace', 'Disarm', 'Dodge', 'Grab', 'Grab By', 'Haymaker', 'Move By', 'Move Through',
  'Multiple Attack', 'Set', 'Shove', 'Strike', 'Throw', 'Trip', 'Choke Hold', 'Club Weapon', 'Cover',
  'Dive For Cover', 'Pulling A Punch', 'Roll With A Punch', 'Snap Shot', 'Sweep', 'Rapid Fire',
];
/** Plain blows Hero Designer writers name instead of the Strike maneuver */
const STRIKE_WORDS = /^(punch|kick|slam|smash|pummel|headbutt|head butt|fist|fists|blow|blows|strike)$/i;
const MINOR_WORDS = new Set(['with', 'the', 'and', 'attack', 'attacks', 'combat']);

interface Attack {
  name: string;
  ranged: boolean;
  /** A list or framework: stands for everything in it */
  container: boolean;
}

const norm = (s: string) => {
  const w = s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return w.split(' ').map((x) => (x.length > 3 && x.endsWith('s') && !x.endsWith('ss') ? x.slice(0, -1) : x)).join(' ');
};

function characterAttacks(character: Character): Attack[] {
  const out: Attack[] = [];
  const add = (name: string | undefined, ranged: boolean, container = false) => {
    if (name && !out.some((a) => a.name.toLowerCase() === name.toLowerCase())) out.push({ name, ranged, container });
  };
  const classify = (p: { type?: string; xmlId?: string; doesDamage?: boolean }) => {
    const xmlId = p.xmlId ?? p.type ?? '';
    const def = getPowerDefinition(xmlId);
    const attack = xmlId === 'HANDTOHANDATTACK' || !!p.doesDamage || !!def?.types?.includes('ATTACK');
    const ranged = !!def && !['No', 'SELF'].includes(def.range);
    return { attack, ranged };
  };
  for (const p of character.powers) {
    if (p.isContainer && isContainerType(p.type)) add(p.name, false, true);
    else if (p.type === 'COMPOUNDPOWER') {
      // A compound with an attack in it ("Fiery Whip": HKA + extras) is an attack
      const parts = character.powers.filter((c) => c.parentId === p.id).map(classify);
      if (parts.some((c) => c.attack)) add(p.name, parts.some((c) => c.attack && c.ranged));
    } else {
      const c = classify(p);
      if (c.attack) add(p.name, c.ranged);
    }
  }
  for (const e of character.equipment ?? []) {
    if (e.isContainer && isContainerType(e.xmlId)) add(e.name, false, true);
    else if (e.subPowers?.length) {
      for (const part of e.subPowers) {
        const c = classify(part);
        if (c.attack) add(part.name, c.ranged);
      }
    } else {
      const c = classify(e as { xmlId?: string });
      if (c.attack) add(e.name, c.ranged);
    }
  }
  // A martial arts style stands for its maneuvers
  for (const m of character.martialArts) if (!m.isWeaponElement) add(m.name, false, !!m.isGroup);
  return out;
}

/** The attack names in a level's text: "+2 OCV with Bite, Claws and Tail Bash" -> Bite, Claws, Tail Bash */
function namedTargets(text: string): string[] {
  const afterWith = /\bwith\b(.*)$/i.exec(text)?.[1] ?? text;
  return afterWith
    .replace(/^\s*[+-]?\d+\s*/, '')
    .replace(/\b(OCV|DCV|OMCV|DMCV)\b(\s*(or|and|\/)\s*\b(OCV|DCV|OMCV|DMCV)\b)?/gi, '')
    .split(/,|;|\/|&|\band\b|\bor\b/i)
    .map((s) => s.replace(/^\s*(the|his|her|its|their)\s+/i, '').trim())
    .filter((s) => s && !/^(attacks?|combat)$/i.test(s));
}

function matchAttack(target: string, attacks: Attack[]): string | undefined {
  const t = norm(target);
  const exact = attacks.find((a) => norm(a.name) === t);
  if (exact) return exact.name;
  const maneuver = STANDARD_MANEUVERS.find((m) => norm(m) === t);
  if (maneuver) return maneuver;
  // "Jaws" in "Bite (Jaws)", "Arm-Blades" for "Arm Blades"; the closest (shortest) name wins
  const words = (s: string) => ` ${norm(s)} `;
  const partial = attacks
    .filter((a) => words(a.name).includes(` ${t} `) || ` ${t} `.includes(words(a.name)))
    .sort((a, b) => a.name.length - b.name.length)[0];
  if (partial) return partial.name;
  if (STRIKE_WORDS.test(target.trim())) return 'Strike';
  // The one attack sharing a significant word ("Fire Breath" for a dragon's "Corrosive Breath")
  const significant = (s: string) => norm(s).split(' ').filter((w) => w.length > 3 && !MINOR_WORDS.has(w));
  const wanted = significant(target);
  const scored = attacks
    .map((a) => ({ a, score: significant(a.name).filter((w) => wanted.includes(w)).length }))
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score);
  if (scored.length && (scored.length === 1 || scored[0]!.score > scored[1]!.score)) return scored[0]!.a.name;
  return undefined;
}

const isLink = (a: Adder) => (a.xmlId === 'ADDER' || !a.xmlId) && !a.baseCost;
const linkAdder = (name: string, i: number): Adder => ({ id: `repair-${Date.now().toString(36)}-${i}`, xmlId: 'ADDER', name, alias: name, baseCost: 0, selected: true });

function linkCombatLevels(character: Character, changes: string[], unresolved: string[]): Character {
  const attacks = characterAttacks(character);
  let changed = false;
  const skills = character.skills.map((skill): Skill => {
    const xmlid = skill.xmlid ?? '';
    const option = (skill.option ?? '').toUpperCase();
    if (!LINKED_LEVELS.includes(xmlid) || UNLINKED_OPTIONS.includes(option)) return skill;
    if ((skill.adders ?? []).some(isLink)) return skill;

    const text = skill.optionAlias || skill.name;
    let names: string[];
    if (option === 'HTH' || /\bHTH\b|hand-to-hand/i.test(text) && !/ranged/i.test(text) && option !== 'SINGLE' && option !== 'TIGHT') {
      names = attacks.filter((a) => !a.ranged && !a.container).map((a) => a.name);
      if (!names.length) names = ['Strike'];
    } else if (option === 'RANGED') {
      names = attacks.filter((a) => a.ranged && !a.container).map((a) => a.name);
    } else {
      names = [];
      for (const target of namedTargets(text)) {
        const found = matchAttack(target, attacks);
        if (found && !names.includes(found)) names.push(found);
        else if (!found) unresolved.push(`${skill.name} (${text}): no attack named "${target}"`);
      }
    }
    const max = xmlid === 'COMBAT_LEVELS' || xmlid === 'MENTAL_COMBAT_LEVELS' || xmlid === 'WEAPON_MASTER' ? MAX_LINKS[option] : undefined;
    if (max !== undefined && names.length > max) {
      unresolved.push(`${skill.name} (${text}): names ${names.length} attacks; only ${max} linked`);
      names = names.slice(0, max);
    }
    if (!names.length) {
      if (!unresolved.some((u) => u.startsWith(`${skill.name} (${text})`))) unresolved.push(`${skill.name} (${text}): no attacks to link`);
      return skill;
    }
    changed = true;
    changes.push(`${skill.name} (${text}): linked to ${names.join(', ')}`);
    return { ...skill, adders: [...(skill.adders ?? []), ...names.map(linkAdder)] };
  });
  return changed ? { ...character, skills } : character;
}

// =============================================================================
// Adjustment targets and Usable As movement
// =============================================================================

const ADJUSTMENTS = ['DRAIN', 'AID', 'HEALING', 'ABSORPTION', 'TRANSFER', 'SUPPRESS', 'DISPEL'];
const CHARACTERISTICS = new Set(['STR', 'DEX', 'CON', 'INT', 'EGO', 'PRE', 'OCV', 'DCV', 'OMCV', 'DMCV', 'SPD', 'PD', 'ED', 'REC', 'END', 'BODY', 'STUN', 'COM']);

function repairAdjustmentInputs(doc: HdcDocument, changes: string[]): void {
  for (const el of doc.root.descendants()) {
    const xmlid = el.getAttr('XMLID') ?? '';
    if (!ADJUSTMENTS.includes(xmlid)) continue;
    const input = el.getAttr('INPUT')?.trim();
    if (!input) continue;
    const label = el.getAttr('NAME') || el.getAttr('ALIAS') || xmlid;
    if (xmlid === 'HEALING' && /^simplified\b/i.test(input) && input !== 'SIMPLIFIED') {
      el.setAttr('INPUT', 'SIMPLIFIED');
      changes.push(`${label}: Healing input "${input}" -> "SIMPLIFIED"`);
      continue;
    }
    const parts = input.split(/\s*(?:,|&|\band\b)\s*/i).filter(Boolean);
    if (parts.length > 1 && parts.every((p) => CHARACTERISTICS.has(p.toUpperCase()))) {
      const fixed = parts.map((p) => p.toUpperCase()).join(', ');
      if (fixed !== input) {
        el.setAttr('INPUT', fixed);
        changes.push(`${label}: ${xmlid} targets "${input}" -> "${fixed}"`);
      }
    }
  }
}

const MOVEMENTS: [RegExp, string][] = [
  [/under ?water|swim|aquatic|water/i, 'swimming'],
  [/fly|flight|air|glid/i, 'flight'],
  [/tunnel|burrow|dig/i, 'tunneling'],
  [/leap|jump/i, 'leaping'],
  [/swing/i, 'swinging'],
  [/teleport/i, 'teleportation'],
  [/run|ground|walk|land/i, 'running'],
];
const MOVEMENT_KEYS = /extradimensionalmovement|flight|ftl|leaping|running|swimming|swinging|teleportation|tunneling/i;

function repairUsableAs(doc: HdcDocument, changes: string[]): void {
  for (const el of doc.root.descendants()) {
    if (el.name !== 'MODIFIER' || el.getAttr('XMLID') !== 'USABLEAS') continue;
    const alias = el.getAttr('ALIAS') ?? '';
    if (MOVEMENT_KEYS.test(alias) || MOVEMENT_KEYS.test(el.getAttr('COMMENTS') ?? '')) continue;
    const movement = MOVEMENTS.find(([re]) => re.test(`${alias} ${el.getAttr('OPTION_ALIAS') ?? ''}`))?.[1];
    if (!movement) continue;
    el.setAttr('COMMENTS', movement);
    const owner = el.parent;
    changes.push(`${owner?.getAttr('NAME') || owner?.getAttr('ALIAS') || 'Power'}: "${alias}" is usable as ${movement}`);
  }
}
