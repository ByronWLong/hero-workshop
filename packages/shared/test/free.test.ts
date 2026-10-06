import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  HdcDocument,
  blankHdc,
  buildItemTree,
  calculateCostBreakdown,
  compoundPartsCharacter,
  decodeHdcBytes,
  itemForm,
  itemFormValues,
  parseHdcFile,
  powerDraft,
  removeItem,
  saveItemForm,
  savePowerDraft,
  selectPower,
  setSubPowers,
  updateHdc,
} from '../src/index.js';

const SKRALK = decodeHdcBytes(readFileSync(resolve(__dirname, '../../../samples/SkralkSkekMal.hdc')));
const rowFor = (rows: ReturnType<typeof buildItemTree>, name: string): ReturnType<typeof buildItemTree>[number] | undefined => {
  for (const r of rows) {
    if (r.name === name) return r;
    const hit = rowFor(r.children, name);
    if (hit) return hit;
  }
  return undefined;
};

describe('free items (cost multiplier 0)', () => {
  it('a free power costs no points, is written as MULTIPLIER 0 and lets Hero Designer honour it', () => {
    const character = parseHdcFile(SKRALK);
    const power = character.powers.find((p) => !p.isContainer && p.type !== 'COMPOUNDPOWER' && !character.powers.some((c) => c.parentId === p.id) && (p.realCost ?? 0) > 0)!;
    const before = calculateCostBreakdown(character).powers;

    const draft = { ...powerDraft(character, 'powers', power.id), free: true };
    const freed = savePowerDraft(character, 'powers', power.id, draft);
    expect(calculateCostBreakdown(freed).powers).toBe(before - power.realCost!);
    const row = rowFor(buildItemTree(freed, 'powers'), power.name)!;
    expect(row.free).toBe(true);
    expect(row.cost).toBe(0);

    const { xml, report } = updateHdc(SKRALK, freed);
    const doc = HdcDocument.parse(xml);
    expect(doc.findById(power.id)!.getAttr('MULTIPLIER')).toBe('0.0');
    expect(doc.root.firstElement('RULES')!.getAttr('MULTIPLIERALLOWED')).toBe('Yes');
    expect(report.changes.some((c) => c.includes('allow cost multipliers'))).toBe(true);

    // Read back: still free; the Active Points are untouched
    const reread = parseHdcFile(xml);
    const again = reread.powers.find((p) => p.id === power.id)!;
    expect(again.multiplier).toBe(0);
    expect(again.activeCost).toBe(power.activeCost);
    expect(powerDraft(reread, 'powers', power.id).free).toBe(true);

    // Unticking makes it cost points again
    const paid = savePowerDraft(reread, 'powers', power.id, { ...powerDraft(reread, 'powers', power.id), free: false });
    expect(HdcDocument.parse(updateHdc(xml, paid).xml).findById(power.id)!.getAttr('MULTIPLIER')).toBe('1.0');
  });

  it('a free part of a compound (and a free penalty) counts nothing, the rest still counts', () => {
    const base = blankHdc();
    const character = parseHdcFile(base);
    let compound = { ...powerDraft(character, 'equipment', undefined, 'compound'), name: 'Cursed Blade' };
    const scratch = () => compoundPartsCharacter(character, compound);
    const hka = savePowerDraft(scratch(), 'powers', undefined, { ...selectPower(powerDraft(scratch(), 'powers'), 'HKA'), levels: 2 });
    compound = setSubPowers(compound, hka.powers);
    // The GM's penalty: -2 DEX, which would otherwise give points back
    const penalty = savePowerDraft(scratch(), 'powers', undefined, { ...selectPower(powerDraft(scratch(), 'powers'), 'DEX'), levels: -2, free: true });
    compound = setSubPowers(compound, penalty.powers);
    const equipped = savePowerDraft(character, 'equipment', undefined, compound);

    const blade = rowFor(buildItemTree(equipped, 'equipment'), 'Cursed Blade')!;
    const dex = blade.children.find((c) => c.free)!;
    expect(dex.cost).toBe(0);
    expect(blade.cost).toBe(blade.children.find((c) => !c.free)!.cost);

    const { xml } = updateHdc(base, equipped);
    const reread = parseHdcFile(xml);
    const part = reread.equipment![0]!.subPowers!.find((p) => p.type === 'DEX')!;
    expect(part.multiplier).toBe(0);
    expect(part.levels).toBe(-2);
  });

  it('a free skill costs nothing, and list totals still match the point summary', () => {
    const character = parseHdcFile(SKRALK);
    const skill = character.skills.find((s) => !s.isGroup && !s.parentId && (s.realCost ?? 0) > 0)!;
    const values = itemFormValues(character, 'skills', skill.id);
    expect(itemForm('skills', values, false).fields.some((f) => f.name === 'free')).toBe(true);
    const freed = saveItemForm(character, 'skills', skill.id, { ...values, free: true });
    const skills = calculateCostBreakdown(freed).skills;
    expect(skills).toBe(calculateCostBreakdown(character).skills - skill.realCost!);
    expect(buildItemTree(freed, 'skills').reduce((n, r) => n + r.cost, 0)).toBe(skills);
    expect(HdcDocument.parse(updateHdc(SKRALK, freed).xml).findById(skill.id)!.getAttr('MULTIPLIER')).toBe('0.0');
  });

  it('a list holding a free compound totals its children after a save and re-read', () => {
    // A list is written before the compound inside it, which is written before its parts
    const xml = blankHdc().replace(
      '<POWERS />',
      `<POWERS>
    <LIST XMLID="GENERIC_OBJECT" ID="9100" BASECOST="0.0" LEVELS="0" ALIAS="Spells" POSITION="0" NAME="" />
    <POWER XMLID="FLIGHT" ID="9101" PARENTID="9100" BASECOST="0.0" LEVELS="10" ALIAS="Flight" POSITION="1" NAME="Wings" />
    <POWER XMLID="COMPOUNDPOWER" ID="9102" PARENTID="9100" BASECOST="0.0" LEVELS="0" ALIAS="Compound Power" POSITION="2" MULTIPLIER="0.0" NAME="Gift" />
    <POWER XMLID="FLIGHT" ID="9103" PARENTID="9102" BASECOST="0.0" LEVELS="6" ALIAS="Flight" POSITION="3" NAME="Glide" />
  </POWERS>`,
    );
    const character = parseHdcFile(xml);
    const list = rowFor(buildItemTree(character, 'powers'), 'Spells')!;
    expect(list.children.find((c) => c.name === 'Gift')!.cost).toBe(0);
    expect(list.cost).toBe(list.children.reduce((n, c) => n + c.cost, 0));
    expect(list.cost).toBeGreaterThan(0);
    expect(calculateCostBreakdown(character).powers).toBe(list.cost);
  });

  it('keeps list totals right when a power in a list is re-saved or deleted', () => {
    const character = parseHdcFile(SKRALK);
    const ids = new Set(character.powers.map((p) => p.id));
    const inList = character.powers.find((p) => p.parentId && ids.has(p.parentId) && !p.isContainer && (p.realCost ?? 0) > 0)!;
    const total = calculateCostBreakdown(character).powers;
    const resaved = savePowerDraft(character, 'powers', inList.id, powerDraft(character, 'powers', inList.id));
    expect(calculateCostBreakdown(resaved).powers).toBe(total);
    expect(buildItemTree(resaved, 'powers').reduce((n, r) => n + r.cost, 0)).toBe(total);
    const removed = removeItem(character, 'powers', inList.id);
    expect(calculateCostBreakdown(removed).powers).toBe(total - inList.realCost!);
  });
});
