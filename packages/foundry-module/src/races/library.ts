/**
 * The world's race library: races and their listed characteristics, from which characters'
 * characteristic maxima are derived. Stored in a world setting (readable by everyone,
 * writable by the GM).
 */

import {
  HdcDocument,
  MAXIMA_CHARACTERISTICS,
  decodeHdcBytes,
  parseHdcDocument,
  parseRulesName,
  raceStatsFromMaxima,
  type CharacteristicMaxima,
  type RaceDefinition,
} from '@hero-workshop/shared';
import { MODULE_ID } from '../sync/session';

const SETTING = 'races';

export function registerRaceSettings(openManager: () => void): void {
  game.settings.register(MODULE_ID, SETTING, {
    name: 'Race library',
    scope: 'world',
    config: false,
    type: Array,
    default: [],
  });
  game.settings.registerMenu(MODULE_ID, 'raceLibrary', {
    name: 'HERO_WORKSHOP.RaceLibrary',
    label: 'HERO_WORKSHOP.ManageRaces',
    hint: 'HERO_WORKSHOP.RaceLibraryHint',
    icon: 'fa-solid fa-dna',
    restricted: true,
    // registerMenu requires an ApplicationV2 subclass; this one just opens the React manager
    type: class extends (foundry.applications.api.ApplicationV2 as unknown as new () => object) {
      render() {
        openManager();
        return this;
      }
    },
  });
}

export function getRaceLibrary(): RaceDefinition[] {
  const value = game.settings.get(MODULE_ID, SETTING);
  return Array.isArray(value) ? (value as RaceDefinition[]) : [];
}

export async function saveRaceLibrary(races: RaceDefinition[]): Promise<void> {
  await game.settings.set(MODULE_ID, SETTING, races);
}

export const canManageRaces = () => game.user.isGM;

export function newRaceId(): string {
  return `race-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * A creature actor's characteristics are its listed stats. Read from its HDC when it has
 * one (the purchased values, without temporary effects), else from Foundry's values.
 */
export function raceFromActor(actor: FoundryActor): RaceDefinition {
  const stats: CharacteristicMaxima = {};
  if (actor.system._hdcXml) {
    const doc = HdcDocument.parse(actor.system._hdcXml);
    doc.ensureIds();
    for (const c of parseHdcDocument(doc).characteristics) {
      if (MAXIMA_CHARACTERISTICS.includes(c.type)) stats[c.type] = c.totalValue;
    }
  } else {
    const characteristics = (actor.system.characteristics ?? {}) as Record<string, { max?: number }>;
    for (const type of MAXIMA_CHARACTERISTICS) {
      const max = characteristics[type.toLowerCase()]?.max;
      if (typeof max === 'number') stats[type] = max;
    }
  }
  return { id: newRaceId(), name: actor.name, stats };
}

/**
 * A Hero Designer rules file (or a character's embedded rules) gives maxima; listed stats
 * are those minus the campaign's bonuses. The race is named after the rules' races, or
 * the rules name when it doesn't list any.
 */
export function raceFromRulesFile(bytes: Uint8Array): RaceDefinition {
  const doc = HdcDocument.parse(decodeHdcBytes(bytes));
  const rules = parseHdcDocument(doc).rules;
  if (!rules || !Object.keys(rules.characteristicMaxima).length) {
    throw new Error('That file has no characteristic maxima.');
  }
  const { campaign, races } = parseRulesName(rules.name);
  return {
    id: newRaceId(),
    name: races.join('/') || campaign || 'Imported race',
    stats: raceStatsFromMaxima(rules.characteristicMaxima),
    notes: `Imported from rules "${rules.name}"`,
  };
}
