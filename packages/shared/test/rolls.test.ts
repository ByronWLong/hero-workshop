import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCharacteristicsView, buildItemTree, characteristicRoll, decodeHdcBytes, parseHdcFile, type ItemRowView } from '../src/index.js';

// Rolls as Hero Designer works them out; the expected values are from its printout of Skralk
// (samples/Skralk SkekMal.HTML)

const skralk = parseHdcFile(decodeHdcBytes(readFileSync(resolve(__dirname, '../../../samples/SkralkSkekMal.hdc'))));

describe('rolls', () => {
  it('rounds characteristic rolls half up', () => {
    expect([10, 12, 13, 15, 18].map((v) => characteristicRoll(v))).toEqual(['11-', '11-', '12-', '12-', '13-']);
    const stats = buildCharacteristicsView(skralk).groups.flatMap((g) => g.stats);
    const roll = (type: string) => stats.find((s) => s.type === type)?.roll;
    expect(['STR', 'DEX', 'CON', 'INT', 'EGO', 'PRE'].map(roll)).toEqual(['15-', '11-', '15-', '12-', '12-', '14-']);
  });

  it('shows each skill its roll', () => {
    const rows = (list: ItemRowView[]): ItemRowView[] => list.flatMap((r) => [r, ...rows(r.children)]);
    const rolls = rows(buildItemTree(skralk, 'skills')).map((r) => [r.name, r.roll ?? '']);
    expect(rolls).toEqual([
      ['Everyman', ''],
      ['Language:  Skaven (idiomatic) [Native]', ''],
      ['Stealth', '8-'],
      ['Climbing', '8-'],
      ['Shadowing', '8-'],
      ['Paramedics', '8-'],
      ['PS: Jeweler', '11-'],
      ['Everyman Upgrades', ''],
      ['AK: Anarch', '11-'],
      ['Shadowing', '12-'],
      ['Social', ''],
      ['Language:  Common (imitate dialects)', ''],
      ['Acting', '14-'],
      ['Charm', '14-'],
      ['Conversation', '14-'],
      ['High Society', '14-'],
      ['Persuasion', '14-'],
      ['Wizardy', ''],
      ['MSR: Wizardy', '17-'],
      ['KS: Arcana', '11-'],
      ['Spell Research: Inventor', '12-'],
      [' Sorcery', ''],
      ['MSR: Sorcery', '17-'],
      ['KS: Mind Magic', '11-'],
      ["KS: Master's High Mage Tower", '8-'],
      ['Demonic Claw Focus: Combat Skill Levels', ''],
      ['WF', ''],
    ]);
  });
});
