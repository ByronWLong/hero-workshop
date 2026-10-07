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
