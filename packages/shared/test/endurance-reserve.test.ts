import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HdcDocument, blankHdc, decodeHdcBytes, parseHdcFile, powerDraft, powerFormView, savePowerDraft, selectPower, updateHdc } from '../src/index.js';

// An Endurance Reserve's Recovery is a power nested in it (ENDURANCERESERVEREC), edited in the
// reserve's own form

const skralk = decodeHdcBytes(readFileSync(new URL('../../../samples/SkralkSkekMal.hdc', import.meta.url)));
const character = parseHdcFile(skralk);
const stone = character.equipment!.find((e) => e.name === 'Powerstone')!;
const rec = (xml: string, id: string) =>
  HdcDocument.parse(xml).findById(id)!.elements().find((el) => el.getAttr('XMLID') === 'ENDURANCERESERVEREC');

describe('Endurance Reserve Recovery', () => {
  it('shows the Recovery in the form, priced as the file prices it', () => {
    const draft = powerDraft(character, 'equipment', stone.id);
    expect(draft.recovery).toBe(5);
    const view = powerFormView(character, 'equipment', draft, stone.id);
    expect(view.recovery?.value).toBe(5);
    // Saving it unchanged costs what it did and leaves the file as it was
    const saved = savePowerDraft(character, 'equipment', stone.id, draft);
    const after = saved.equipment!.find((e) => e.id === stone.id)!;
    expect([after.activeCost, after.realCost]).toEqual([stone.activeCost, stone.realCost]);
    expect(updateHdc(skralk, saved).xml).toBe(skralk);
  });

  it('writes a changed Recovery into the nested element only', () => {
    const draft = { ...powerDraft(character, 'equipment', stone.id), recovery: 8 };
    const saved = savePowerDraft(character, 'equipment', stone.id, draft);
    const { xml } = updateHdc(skralk, saved);
    expect(rec(xml, stone.id)!.getAttr('LEVELS')).toBe('8');
    const reparsed = parseHdcFile(xml).equipment!.find((e) => e.id === stone.id)!;
    expect(reparsed.recoveryLevels).toBe(8);
    expect(reparsed.realCost).toBe(saved.equipment!.find((e) => e.id === stone.id)!.realCost);
    expect(reparsed.realCost).toBeGreaterThan(stone.realCost ?? 0);
  });

  it('gives a new reserve its Recovery', () => {
    const blank = blankHdc();
    const base = parseHdcFile(blank);
    const draft = { ...selectPower(powerDraft(base, 'powers'), 'ENDURANCERESERVE'), levels: 20, recovery: 3 };
    const saved = savePowerDraft(base, 'powers', undefined, draft);
    const { xml } = updateHdc(blank, saved);
    const reserve = HdcDocument.parse(xml).section('POWERS')!.elements()[0]!;
    const recovery = reserve.elements().find((el) => el.getAttr('XMLID') === 'ENDURANCERESERVEREC')!;
    expect(recovery.getAttr('LEVELS')).toBe('3');
    expect(recovery.getAttr('ID')).toMatch(/^\d+$/);
    expect(parseHdcFile(xml).powers[0]!.recoveryLevels).toBe(3);
  });
});
