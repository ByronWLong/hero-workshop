import { describe, expect, it } from 'vitest';
import {
  HdcDocument,
  blankHdc,
  buildItemTree,
  equipmentLoad,
  extractItems,
  insertItems,
  parseHdcFile,
  powerDraft,
  removeItems,
  savePowerDraft,
  selectPower,
  setCarried,
  strLiftKg,
  updateHdc,
} from '../src/index.js';

// Equipment carried and stored: lists ("Saddlebags") carried or put down with what's in them,
// what it all weighs, and what hero6e makes of that (encumbrance)

const LBS = (kg: number) => String(kg / 0.453592);
const item = (id: string, xmlId: string, name: string, kg: number, extra = '') =>
  `<POWER XMLID="${xmlId}" ID="${id}" BASECOST="0.0" LEVELS="2" ALIAS="${name}" POSITION="0" NAME="${name}" PRICE="0.0" WEIGHT="${LBS(kg)}" CARRIED="Yes" QUANTITY="1" ${extra}/>`;
const xml = blankHdc().replace(
  '<EQUIPMENT />',
  '<EQUIPMENT>' +
    `<LIST XMLID="GENERIC_OBJECT" ID="9001" BASECOST="0.0" LEVELS="0" ALIAS="Saddlebags" POSITION="0" PRICE="0.0" WEIGHT="0.0" CARRIED="Yes" NAME="Saddlebags" />` +
    item('9002', 'FORCEFIELD', 'Spare Armor', 10, 'PARENTID="9001" PDLEVELS="1" EDLEVELS="1"') +
    `<LIST XMLID="GENERIC_OBJECT" ID="9003" BASECOST="0.0" LEVELS="0" ALIAS="Pouch" POSITION="0" PRICE="0.0" WEIGHT="0.0" CARRIED="Yes" NAME="Pouch" PARENTID="9001" />` +
    item('9004', 'HKA', 'Knife', 0.5, 'PARENTID="9003"') +
    item('9005', 'HKA', 'Daggers', 1, 'QUANTITY="3"').replace('QUANTITY="1" ', '') +
    '</EQUIPMENT>',
);
const character = parseHdcFile(xml);

describe('carried and stored equipment', () => {
  it('puts a list down with everything in it, and writes each item Carried No', () => {
    const stored = setCarried(character, '9001', false);
    expect(stored.equipment!.map((e) => [e.id, e.carried]).sort()).toEqual([
      ['9001', false], ['9002', false], ['9003', false], ['9004', false], ['9005', true],
    ]);
    const out = updateHdc(xml, stored).xml;
    const doc = HdcDocument.parse(out);
    expect(['9001', '9002', '9003', '9004', '9005'].map((id) => doc.findById(id)!.getAttr('CARRIED'))).toEqual(['No', 'No', 'No', 'No', 'Yes']);
  });

  it("does the same when the list's Carried is unticked in its form", () => {
    const draft = { ...powerDraft(character, 'equipment', '9001'), carried: false };
    const saved = savePowerDraft(character, 'equipment', '9001', draft);
    expect(saved.equipment!.filter((e) => e.carried === false).map((e) => e.id).sort()).toEqual(['9001', '9002', '9003', '9004']);
  });

  it('stores a new item put in a stored list', () => {
    const stored = setCarried(character, '9001', false);
    const draft = { ...selectPower(powerDraft(stored, 'equipment'), 'HKA'), name: 'Hatchet', parentId: '9001' };
    const saved = savePowerDraft(stored, 'equipment', undefined, draft);
    expect(saved.equipment!.find((e) => e.name === 'Hatchet')?.carried).toBe(false);
  });

  it('weighs what is carried and what is stored, and the encumbrance hero6e gives it', () => {
    expect([strLiftKg(10), strLiftKg(20), strLiftKg(25), strLiftKg(55)]).toEqual([100, 400, 800, 50000]);
    // 10 + 0.5 + 3 x 1 kg against STR 10's 100 kg: 13%, -1 DCV
    expect(equipmentLoad(character)).toMatchObject({ carried: 13.5, stored: 0, lift: 100, percent: 13, dcv: -1, move: 0 });
    expect(equipmentLoad(setCarried(character, '9001', false))).toMatchObject({ carried: 3, stored: 10.5, percent: 3, dcv: 0 });

    const rows = buildItemTree(setCarried(character, '9003', false), 'equipment');
    expect(rows[0]!).toMatchObject({ carried: true, contents: { carried: 10, stored: 0.5 } });
    expect(rows[1]!).toMatchObject({ name: 'Daggers', weight: 3 });
  });

  it('takes an item out of a document with its members', () => {
    const removed = removeItems(xml, '9001')!;
    expect(removed.removedIds.sort()).toEqual(['9001', '9002', '9003', '9004']);
    expect(parseHdcFile(removed.xml).equipment!.map((e) => e.id)).toEqual(['9005']);
  });

  it('stores an item dragged into a stored list, or beside an item in one', () => {
    const stored = updateHdc(xml, setCarried(character, '9001', false)).xml;
    const into = insertItems(stored, extractItems(xml, '9005')!, { parentId: '9001' });
    expect(HdcDocument.parse(into.xml).findById(into.id!)!.getAttr('CARRIED')).toBe('No');
    const beside = insertItems(stored, extractItems(xml, '9005')!, { at: { id: '9002', after: true } });
    expect(HdcDocument.parse(beside.xml).findById(beside.id!)!.getAttr('CARRIED')).toBe('No');
    // Out of a list, it keeps what it had
    const top = insertItems(stored, extractItems(stored, '9004')!);
    expect(HdcDocument.parse(top.xml).findById(top.id!)!.getAttr('CARRIED')).toBe('No');
    // And into a carried list, it's carried
    const carried = insertItems(xml, extractItems(stored, '9004')!, { parentId: '9001' });
    expect(HdcDocument.parse(carried.xml).findById(carried.id!)!.getAttr('CARRIED')).toBe('Yes');
  });

  it('takes drops into an Equipment list, as into a compound', () => {
    const rows = buildItemTree(character, 'equipment');
    const flat = (r: typeof rows): typeof rows => r.flatMap((x) => [x, ...flat(x.children)]);
    const row = (id: string) => flat(rows).find((r) => r.id === id)!;
    expect([row('9001').acceptsChildren, row('9001').acceptsParts]).toEqual([true, false]);
    expect([row('9003').acceptsChildren, row('9005').acceptsChildren, row('9005').acceptsParts]).toEqual([true, false, true]);
  });
});
