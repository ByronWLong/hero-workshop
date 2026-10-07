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

  it("reads a compound item's skill and talent parts, priced as skills and talents", () => {
    const xml = blankHdc().replace('<EQUIPMENT />', `<EQUIPMENT>
    <POWER XMLID="COMPOUNDPOWER" ID="9300" BASECOST="0.0" LEVELS="0" ALIAS="Compound Power" NAME="Magic Sword">
      <POWER XMLID="HKA" ID="9301" BASECOST="0.0" LEVELS="1" ALIAS="Killing Attack - Hand-To-Hand" POSITION="1" INPUT="PD" />
      <SKILL XMLID="COMBAT_LEVELS" ID="9302" BASECOST="0.0" LEVELS="2" ALIAS="Combat Skill Levels" POSITION="2" NAME="+2 OCV" OPTION="HTH" OPTIONID="HTH" OPTION_ALIAS="with HTH Combat" />
      <TALENT XMLID="LIGHTSLEEP" ID="9303" BASECOST="3.0" LEVELS="0" ALIAS="Lightsleep" POSITION="3" />
    </POWER>
  </EQUIPMENT>`);
    const sword = parseHdcFile(xml).equipment![0]!;
    expect(sword.subPowers!.map((p) => [p.id, p.realCost])).toEqual([['9301', 15], ['9302', 16], ['9303', 3]]);
    expect(sword.activeCost).toBe(34);
  });

  it('holds Requires A Roll at -1/4 for a 14- roll, as Hero Designer does', () => {
    const xml = blankHdc().replace('<POWERS />', `<POWERS>
    <POWER XMLID="CLINGING" ID="9400" BASECOST="10.0" LEVELS="0" ALIAS="Clinging">
      <MODIFIER XMLID="REQUIRESASKILLROLL" ID="9401" BASECOST="0.25" LEVELS="0" ALIAS="Requires A Roll" OPTION="14" OPTIONID="14" OPTION_ALIAS="14- roll" />
    </POWER>
  </POWERS>`);
    const clinging = parseHdcFile(xml).powers[0]!;
    expect(clinging.modifiers![0]!.value).toBe(-0.25);
    expect(clinging.realCost).toBe(8);
  });
});
