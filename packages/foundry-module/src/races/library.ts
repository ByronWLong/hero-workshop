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
  type Character,
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
    icon: 'fa-solid fa-book-open',
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
  if (actor.system._hdcXml) {
    const doc = HdcDocument.parse(actor.system._hdcXml);
    doc.ensureIds();
    return { id: newRaceId(), name: actor.name, stats: listedStats(parseHdcDocument(doc)) };
  }
  const stats: CharacteristicMaxima = {};
  const characteristics = (actor.system.characteristics ?? {}) as Record<string, { max?: number }>;
  for (const type of MAXIMA_CHARACTERISTICS) {
    const max = characteristics[type.toLowerCase()]?.max;
    if (typeof max === 'number') stats[type] = max;
  }
  return { id: newRaceId(), name: actor.name, stats };
}

/** A creature's characteristics (purchased values, without temporary effects) are its race's listed stats */
function listedStats(character: Character): CharacteristicMaxima {
  const stats: CharacteristicMaxima = {};
  for (const c of character.characteristics) {
    if (MAXIMA_CHARACTERISTICS.includes(c.type)) stats[c.type] = c.totalValue;
  }
  return stats;
}

/**
 * Imports a race from a Hero Designer file. A rules file (or a character's embedded rules)
 * with maxima gives them directly: listed stats are those minus the campaign's bonuses, and
 * the race is named after the rules' races, or the rules name when it doesn't list any.
 * Without maxima, a character file is taken as the creature itself: its characteristics are
 * the listed stats, and the maxima follow the usual rule (+10, SPD +1, CVs +2).
 */
export function raceFromRulesFile(bytes: Uint8Array, fileName = ''): RaceDefinition {
  const doc = HdcDocument.parse(decodeHdcBytes(bytes));
  doc.ensureIds();
  const character = parseHdcDocument(doc);
  const rules = character.rules;
  if (rules && Object.keys(rules.characteristicMaxima).length) {
    const { campaign, races } = parseRulesName(rules.name);
    return {
      id: newRaceId(),
      name: races.join('/') || campaign || 'Imported race',
      stats: raceStatsFromMaxima(rules.characteristicMaxima),
      notes: `Imported from rules "${rules.name}"`,
    };
  }
  if (!doc.root.firstElement('CHARACTERISTICS')) {
    throw new Error('That file has no characteristics or characteristic maxima.');
  }
  const named = character.characterInfo.characterName;
  const name = (named !== 'New Character' && named) || fileName.replace(/\.[^.]+$/, '') || 'Imported race';
  return {
    id: newRaceId(),
    name,
    stats: listedStats(character),
    notes: `Imported from the characteristics in "${fileName || name}"`,
  };
}
