/**
 * Skills priced by breadth: Combat Skill Levels, Skill Levels, Mental Combat Skill Levels and
 * Penalty Skill Levels. Each option's cost per level comes from Hero Designer's 6E template
 * (e.g. CSLs: 2 with a single attack, 8 with HTH or Ranged Combat, 10 with all attacks).
 */

import { SKILL_CATALOG_6E, type SkillCatalogOption } from './generated/skillCatalog6e.js';

const BY_ID = new Map(SKILL_CATALOG_6E.map((s) => [s.xmlId, s]));

/**
 * Options earlier Hero Workshop versions wrote that the template doesn't have, at the price
 * they were bought at
 */
const LEGACY_OPTIONS: Record<string, Record<string, { display: string; lvlCost: number }>> = {
  COMBAT_LEVELS: { SMALL: { display: 'with a small group of attacks', lvlCost: 3 } },
  SKILL_LEVELS: {
    THREE: { display: 'with three related Skills', lvlCost: 3 },
    ALL: { display: 'with all Skills', lvlCost: 6 },
  },
};

/** A skill's breadth options, when it is priced by breadth (options with a cost per level) */
export function skillLevelOptions(xmlid: string): SkillCatalogOption[] | undefined {
  const options = BY_ID.get(xmlid)?.options;
  return options?.length && options.every((o) => o.lvlCost !== undefined) ? options : undefined;
}

/** The option as the template (or an earlier Hero Workshop version) defines it */
export function skillLevelOption(xmlid: string, option: string | undefined): SkillCatalogOption | undefined {
  if (!option) return undefined;
  const legacy = LEGACY_OPTIONS[xmlid]?.[option];
  return skillLevelOptions(xmlid)?.find((o) => o.xmlId === option) ?? (legacy && { xmlId: option, ...legacy });
}

// =============================================================================
// Penalty Skill Levels: the penalty they offset
// =============================================================================

export type PslPenalty = 'range' | 'location' | 'throwing' | 'underwater' | 'encumbrance' | 'armor' | 'groundfighting';

/**
 * The penalties hero6e knows. It finds a 6E PSL's penalty by looking for `keyword` in its
 * OPTION_ALIAS (5E: INPUT), in this order; Hero Designer keeps an edited OPTION_ALIAS.
 * `wording` goes into the option's text; `cv` is the modifier it offsets.
 */
export const PSL_PENALTIES: { value: PslPenalty; label: string; wording: string; cv: 'OCV' | 'DCV' | 'any' }[] = [
  { value: 'range', label: 'Range', wording: 'Range', cv: 'OCV' },
  { value: 'location', label: 'Hit Location (called shots)', wording: 'Hit Location', cv: 'OCV' },
  { value: 'throwing', label: 'Throwing', wording: 'Throwing', cv: 'OCV' },
  { value: 'encumbrance', label: 'Encumbrance', wording: 'Encumbrance', cv: 'DCV' },
  { value: 'armor', label: 'Armor', wording: 'Armor', cv: 'DCV' },
  { value: 'groundfighting', label: 'Being prone (Groundfighting)', wording: 'Groundfighting (prone)', cv: 'DCV' },
  { value: 'underwater', label: 'Underwater', wording: 'Underwater', cv: 'any' },
];

/** hero6e's order of checking: the first keyword in its list that the text contains */
const PSL_KEYWORD_ORDER: PslPenalty[] = ['armor', 'encumbrance', 'groundfighting', 'location', 'range', 'throwing', 'underwater'];

/** The penalty hero6e reads from a PSL's option text and INPUT ('' when it finds none) */
export function pslPenalty(optionAlias: string | undefined, input?: string): PslPenalty | '' {
  const text = `${optionAlias ?? ''}${input ?? ''}`.toLowerCase();
  return PSL_KEYWORD_ORDER.find((k) => text.includes(k)) ?? '';
}

/** Words writers use in a PSL's name for each penalty ("+6 vs Range Modifier with Crossbows") */
const NAMED_PENALTIES: [RegExp, PslPenalty][] = [
  [/\brange\b/i, 'range'],
  [/\b(hit locations?|called shots?|targeting)\b/i, 'location'],
  [/\bthrow(ing|n)?\b/i, 'throwing'],
  [/\bencumbrance\b/i, 'encumbrance'],
  [/\barmou?r\b/i, 'armor'],
  [/\b(prone|groundfighting|ground fighting)\b/i, 'groundfighting'],
  [/\bunderwater\b/i, 'underwater'],
];

/** The one penalty a PSL's name states, if it states exactly one */
export function pslPenaltyInName(name: string | undefined): PslPenalty | '' {
  const found = NAMED_PENALTIES.filter(([re]) => re.test(name ?? '')).map(([, p]) => p);
  return found.length === 1 ? found[0]! : '';
}

/** Whether a PSL option offsets OCV or DCV modifiers */
export function pslOptionCv(option: string | undefined): 'OCV' | 'DCV' {
  return option === 'SINGLEDCV' || option === 'GROUPDCV' ? 'DCV' : 'OCV';
}

/** The penalties a PSL with this option can offset */
export function pslPenaltiesFor(option: string | undefined): typeof PSL_PENALTIES {
  const cv = pslOptionCv(option);
  return PSL_PENALTIES.filter((p) => p.cv === cv || p.cv === 'any');
}

/**
 * A PSL option's text naming its penalty, in Hero Designer's wording: "to offset the Range OCV
 * modifier with any single attack". No penalty gives the template's own text.
 */
export function pslOptionAlias(option: string | undefined, penalty: PslPenalty | '' | undefined): string | undefined {
  const display = skillLevelOption('PENALTY_SKILL_LEVELS', option)?.display;
  const wording = PSL_PENALTIES.find((p) => p.value === penalty)?.wording;
  if (!display || !wording) return display;
  return display.replace(/a specific negative ([OD]CV) modifier/, `the ${wording} $1 modifier`);
}

/**
 * The cost of `levels` of a breadth-priced skill (Hero Designer: levels ÷ LVLVAL × LVLCOST);
 * undefined for other skills. An unknown option costs the skill's own cost per level.
 */
export function skillLevelCost(xmlid: string, option: string | undefined, levels: number): number | undefined {
  if (!skillLevelOptions(xmlid)) return undefined;
  const chosen = skillLevelOption(xmlid, option);
  const lvlCost = chosen?.lvlCost ?? BY_ID.get(xmlid)?.lvlCost ?? 2;
  const lvlVal = chosen?.lvlVal ?? 1;
  return Math.ceil((levels / lvlVal) * lvlCost);
}
