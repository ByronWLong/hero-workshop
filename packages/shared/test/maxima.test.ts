import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  HdcDocument,
  characteristicCost,
  combinedRaceMaxima,
  decodeHdcBytes,
  formatRulesName,
  parseHdcFile,
  parseRulesName,
  raceStatsFromMaxima,
  updateHdc,
  type RaceDefinition,
} from '../src/index.js';

const sample = (name: string) => decodeHdcBytes(readFileSync(resolve(__dirname, '../../../samples', name)));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe('characteristic costs', () => {
  it('uses the 6e template costs', () => {
    expect(characteristicCost('CON', 5)).toBe(5);
    expect(characteristicCost('DEX', 5)).toBe(10);
    expect(characteristicCost('SWIMMING', 4)).toBe(2);
    expect(characteristicCost('STUN', 10)).toBe(5);
    expect(characteristicCost('STR', -5)).toBe(0);
  });

  it('doubles levels above the maximum, like Hero Designer', () => {
    // STR 30 with a maximum of 24: 20 levels, 6 of them above the maximum
    expect(characteristicCost('STR', 20, 24)).toBe(26);
    // Entirely below the maximum: no surcharge
    expect(characteristicCost('STR', 10, 24)).toBe(10);
    // Base already above the maximum: Hero Designer surcharges every point above it (3 here)
    expect(characteristicCost('SPD', 2, 1)).toBe(50);
    // Base below the maximum: the surcharge never exceeds the levels bought
    expect(characteristicCost('SPD', 2, 3)).toBe(30);
  });
});

describe('race maxima', () => {
  const skaven: RaceDefinition = { id: 's', name: 'Skaven', stats: { STR: 10, DEX: 15, SPD: 3, OCV: 5 } };
  const kitsune: RaceDefinition = { id: 'k', name: 'Kitsune', stats: { STR: 8, DEX: 18, SPD: 4, OCV: 6 } };
  const demon: RaceDefinition = { id: 'd', name: 'Lesser Demon', stats: { STR: 15, DEX: 12, SPD: 3, OCV: 4, EGO: 13 } };

  it('adds +10, +1 SPD and +2 to combat values', () => {
    expect(combinedRaceMaxima([skaven])).toEqual({ STR: 20, DEX: 25, SPD: 4, OCV: 7 });
  });

  it('averages mixed races and rounds up', () => {
    // STR (20+18+25)/3 = 21, DEX (25+28+22)/3 = 25, SPD (4+5+4)/3 = 4.33 -> 5,
    // OCV (7+8+6)/3 = 7, EGO only listed by one race -> 23
    expect(combinedRaceMaxima([skaven, kitsune, demon])).toEqual({ STR: 21, DEX: 25, SPD: 5, OCV: 7, EGO: 23 });
  });

  it('recovers listed stats from a set of maxima', () => {
    expect(raceStatsFromMaxima({ STR: 24, SPD: 5, DCV: 7 })).toEqual({ STR: 14, SPD: 4, DCV: 5 });
  });

  it('records races in the RULES name', () => {
    expect(parseRulesName('TONS (Skaven/Kitsune/Lesser Demon)')).toEqual({ campaign: 'TONS', races: ['Skaven', 'Kitsune', 'Lesser Demon'] });
    expect(parseRulesName('Default')).toEqual({ campaign: 'Default', races: [] });
    expect(formatRulesName('TONS', ['Skaven', 'Kitsune'])).toBe('TONS (Skaven/Kitsune)');
  });
});

describe('maxima in HDC files', () => {
  it("reads Strevka's per-race maxima and races", () => {
    const strevka = parseHdcFile(sample("Strevka Skek'Mal.hdc"));
    expect(strevka.rules?.races).toEqual(['Skaven', 'Kitsune', 'Lesser Demon']);
    expect(strevka.rules?.characteristicMaxima).toMatchObject({ STR: 24, DEX: 25, INT: 27, SPD: 5, OCV: 7, DMCV: 8 });
    // No movement maxima in the file means no limit
    expect(strevka.rules?.characteristicMaxima.RUNNING).toBeUndefined();
  });

  it('writes changed maxima and races, and nothing else', () => {
    const text = sample("Strevka Skek'Mal.hdc");
    const doc = HdcDocument.parse(text);
    doc.ensureIds();
    const original = doc.toString();
    const edited = clone(parseHdcFile(text));
    edited.rules!.characteristicMaxima.STR = 26;
    delete edited.rules!.characteristicMaxima.PRE;
    edited.rules!.races = ['Skaven', 'Kitsune'];

    const { xml, report } = updateHdc(text, edited);
    expect(report.warnings).toEqual([]);
    const rules = HdcDocument.parse(xml).root.firstElement('RULES')!;
    expect(rules.getAttr('STR_MAX')).toBe('26');
    expect(rules.hasAttr('PRE_MAX')).toBe(false);
    expect(rules.getAttr('DEX_MAX')).toBe('25');
    expect(rules.getAttr('name')).toBe('TONS (Skaven/Kitsune)');
    // Only the RULES line changed
    const originalLines = original.split('\n');
    const changed = xml.split('\n').filter((line, i) => line !== originalLines[i]);
    expect(changed).toHaveLength(1);
    expect(changed[0]).toContain('<RULES');
  });

  it('adds a RULES element to files without one', () => {
    const text = sample('Whisper-of-Vines - Bandapa Follower.hdc');
    const edited = clone(parseHdcFile(text));
    edited.rules = { ...edited.rules!, characteristicMaxima: { STR: 20, DEX: 23 }, races: ['Bandapa'] };
    const { xml } = updateHdc(text, edited);
    const reparsed = parseHdcFile(xml);
    expect(reparsed.rules?.characteristicMaxima).toEqual({ STR: 20, DEX: 23 });
    expect(reparsed.rules?.races).toEqual(['Bandapa']);
  });

  it('costs characteristics against the maxima', () => {
    const text = sample("Strevka Skek'Mal.hdc");
    const strevka = parseHdcFile(text);
    const str = strevka.characteristics.find((c) => c.type === 'STR')!;
    const max = strevka.rules!.characteristicMaxima.STR!;
    expect(str.realCost).toBe(characteristicCost('STR', str.levels, max));
  });
});
