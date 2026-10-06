/**
 * Power frameworks: Multipowers and Variable Power Pools, priced as desktop Hero Designer
 * prices them (com.hero.objects.Multipower / VariablePowerPool).
 *
 * - A Multipower costs its reserve (BASECOST, plus adders, with its own advantages and
 *   limitations). Each slot costs its Real Cost / 10 if fixed (HDC ULTRA_SLOT="Yes"), / 5 if
 *   variable, rounded half down, at least 1 if it costs anything.
 * - A Variable Power Pool costs its pool (LEVELS) plus its control cost (the CONTROLCOST
 *   adder, half the pool by default); its limitations reduce only the control cost. Powers in
 *   the pool cost nothing themselves.
 * - The framework's modifiers don't change its slots' costs (Hero Designer only shows them
 *   alongside the slots).
 */

import type { Adder, Modifier } from './types.js';
import { calculateAdderCost, heroRoundCost } from './utils.js';

export const FRAMEWORK_TYPES = ['MULTIPOWER', 'VPP'] as const;
export type FrameworkType = (typeof FRAMEWORK_TYPES)[number];

export const isFramework = (type: string | undefined): type is FrameworkType =>
  type === 'MULTIPOWER' || type === 'VPP';

/** Lists and frameworks: elements other items hang off through PARENTID */
export const isContainerType = (type: string | undefined): boolean => type === 'LIST' || isFramework(type);

export const FRAMEWORK_NAMES: Record<FrameworkType, string> = { MULTIPOWER: 'Multipower', VPP: 'Variable Power Pool' };

interface FrameworkFields {
  type: string;
  /** Multipower reserve */
  baseCost?: number;
  /** Variable Power Pool size */
  levels?: number;
  adders?: Adder[];
  modifiers?: Modifier[];
}

const advantages = (mods: Modifier[] = []) => mods.filter((m) => (m.value ?? 0) > 0).reduce((s, m) => s + (m.value ?? 0), 0);
const limitations = (mods: Modifier[] = []) => mods.filter((m) => (m.value ?? 0) < 0).reduce((s, m) => s + Math.abs(m.value ?? 0), 0);

/** The control cost of a Variable Power Pool: its CONTROLCOST adder, or half the pool */
export function vppControlCost(framework: Pick<FrameworkFields, 'levels' | 'adders'>): number {
  const control = framework.adders?.find((a) => a.xmlId === 'CONTROLCOST');
  if (!control) return heroRoundCost((framework.levels ?? 0) / 2);
  return calculateAdderCost([control]);
}

/** The framework's own Active and Real Cost (reserve or pool), without its slots */
export function frameworkOwnCost(framework: FrameworkFields): { base: number; active: number; real: number } {
  const adv = advantages(framework.modifiers);
  const lim = limitations(framework.modifiers);
  if (framework.type === 'VPP') {
    const pool = framework.levels ?? 0;
    const control = vppControlCost(framework);
    const otherAdders = calculateAdderCost((framework.adders ?? []).filter((a) => a.xmlId !== 'CONTROLCOST'));
    const controlActive = (control + otherAdders) * (1 + adv);
    const active = heroRoundCost(pool + controlActive);
    const real = Math.max(1, pool + heroRoundCost(controlActive / (1 + lim)));
    return { base: pool + control + otherAdders, active, real };
  }
  const base = (framework.baseCost ?? 0) + calculateAdderCost(framework.adders ?? []);
  const active = heroRoundCost(base * (1 + adv));
  const real = lim > 0 ? heroRoundCost(active / (1 + lim)) : active;
  return { base, active, real };
}

/** What a power costs as a slot of this framework, from its own Real Cost */
export function slotCost(frameworkType: string, realCost: number, fixed: boolean): number {
  if (frameworkType === 'VPP') return 0;
  if (realCost <= 0) return 0;
  return Math.max(1, heroRoundCost(realCost / (fixed ? 10 : 5)));
}
