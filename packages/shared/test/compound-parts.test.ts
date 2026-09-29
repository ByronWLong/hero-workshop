import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeHdcBytes, parseHdcFile, powerDraft, savePowerDraft, updateHdc } from '../src/index.js';

const SKRALK = decodeHdcBytes(readFileSync(resolve(__dirname, '../../../samples/SkralkSkekMal.hdc')));

describe('compound equipment parts', () => {
  it('includes characteristic parts such as a shield DCV', () => {
    const character = parseHdcFile(SKRALK);
    const glass = character.equipment!.find((e) => e.name === 'Flame Glass')!;
    const parts = glass.subPowers ?? [];
    expect(parts.map((p) => p.type)).toContain('DCV');
    expect(parts).toHaveLength(3);
    expect(glass.realCost).toBe(parts.reduce((n, p) => n + (p.realCost ?? 0), 0));

    // Opening and saving it unchanged leaves the file alone
    const draft = powerDraft(character, 'equipment', glass.id);
    expect(draft.subPowers).toHaveLength(3);
    const { report } = updateHdc(SKRALK, savePowerDraft(character, 'equipment', glass.id, draft));
    expect(report.changes).toEqual([]);
  });
});
