import { describe, expect, it } from 'vitest';
import { blankHdc, HdcDocument, parseHdcFile, powerDraft, savePowerDraft, updateHdc } from '../src/index.js';

describe('equipment lists', () => {
  it("links a list's items by PARENTID, as Hero Designer does, instead of nesting them", () => {
    const xml = blankHdc();
    let c = parseHdcFile(xml);
    const list = { ...powerDraft(c, 'equipment', undefined, 'list'), name: 'Backpack' };
    c = savePowerDraft(c, 'equipment', undefined, list);
    const listId = c.equipment!.at(-1)!.id;
    const rope = { ...powerDraft(c, 'equipment', undefined, 'power'), xmlId: 'CUSTOM', name: 'Rope', parentId: listId, price: 2 };
    c = savePowerDraft(c, 'equipment', undefined, rope);
    const written = updateHdc(xml, c).xml;

    const doc = HdcDocument.parse(written);
    const section = doc.section('EQUIPMENT')!;
    const [listEl, ropeEl] = section.elements();
    expect(listEl!.name).toBe('LIST');
    expect(listEl!.elements('POWER')).toHaveLength(0);
    expect(ropeEl!.getAttr('NAME')).toBe('Rope');
    expect(ropeEl!.getAttr('PARENTID')).toBe(listEl!.getAttr('ID'));
    expect(parseHdcFile(written).equipment!.map((e) => e.name)).toEqual(['Backpack', 'Rope']);
  });
});
