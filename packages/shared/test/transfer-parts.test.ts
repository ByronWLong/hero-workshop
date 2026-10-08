import { describe, expect, it } from 'vitest';
import {
  HdcDocument,
  blankHdc,
  extractItems,
  insertParts,
  parseHdcFile,
  partsFromTransfer,
  partsTarget,
  transferFromPart,
  updateHdc,
} from '../src/index.js';

const OAF = (id: string) => `<MODIFIER XMLID="FOCUS" ID="${id}" BASECOST="-1.0" LEVELS="0" ALIAS="Focus" OPTION="OAF" OPTIONID="OAF" />`;

const FILE = blankHdc()
  .replace('<POWERS />', `<POWERS>
    <POWER XMLID="ENERGYBLAST" ID="100" BASECOST="0.0" LEVELS="6" ALIAS="Blast" POSITION="0" NAME="Fire Bolt" INPUT="ED" />
  </POWERS>`)
  .replace(
    '<EQUIPMENT />',
    `<EQUIPMENT>
    <POWER XMLID="COMPOUNDPOWER" ID="200" BASECOST="0.0" LEVELS="0" ALIAS="Compound Power" POSITION="0" NAME="Sword" PRICE="10.0" WEIGHT="3" CARRIED="Yes">
      <POWER XMLID="HKA" ID="201" BASECOST="0.0" LEVELS="1" ALIAS="Killing Attack - Hand-To-Hand" POSITION="0" NAME="Blade">
        ${OAF('202')}
      </POWER>
      <DCV XMLID="DCV" ID="203" BASECOST="0.0" LEVELS="1" ALIAS="DCV" POSITION="1" NAME="Parry">
        ${OAF('204')}
      </DCV>
    </POWER>
    <POWER XMLID="ARMOR" ID="300" BASECOST="0.0" LEVELS="0" ALIAS="Resistant Protection" POSITION="1" NAME="Chain Shirt" PRICE="50.0" WEIGHT="10" CARRIED="Yes" PDLEVELS="6" EDLEVELS="2">
      <FOUNDRY_ICON SRC="icons/chain.webp" />
      ${OAF('301')}
    </POWER>
    <MULTIPOWER XMLID="MULTIPOWER" ID="400" BASECOST="30.0" LEVELS="0" ALIAS="Multipower" POSITION="2" NAME="Staff" />
    <POWER XMLID="FLASH" ID="401" BASECOST="0.0" LEVELS="2" ALIAS="Flash" POSITION="3" NAME="Glare" PARENTID="400" OPTION="SIGHTGROUP" OPTIONID="SIGHTGROUP" />
  </EQUIPMENT>`,
  );

describe('compound parts', () => {
  it('drops on a compound or its parts go into the compound; one power becomes a compound; lists and frameworks take none', () => {
    expect(partsTarget(FILE, '200')).toEqual({ id: '200', wrap: false });
    expect(partsTarget(FILE, '203')).toEqual({ id: '200', wrap: false });
    expect(partsTarget(FILE, '300')).toEqual({ id: '300', wrap: true });
    expect(partsTarget(FILE, '100')).toEqual({ id: '100', wrap: true });
    expect(partsTarget(FILE, '400')).toBeUndefined();
  });

  it('adds a part to a compound with fresh IDs and without equipment-only attributes', () => {
    const transfer = extractItems(FILE, '300')!;
    const { xml, ids } = insertParts(FILE, transfer, '200');
    const sword = parseHdcFile(xml).equipment!.find((e) => e.id === '200')!;
    expect(sword.subPowers!.map((p) => p.name)).toEqual(['Blade', 'Parry', 'Chain Shirt']);
    const added = HdcDocument.parse(xml).findById(ids[0]!)!;
    expect(added.parent!.getAttr('ID')).toBe('200');
    expect(added.getAttr('PRICE')).toBeUndefined();
    expect(added.getAttr('POSITION')).toBe('2');
    // The original is untouched
    expect(parseHdcFile(xml).equipment!.find((e) => e.id === '300')!.name).toBe('Chain Shirt');
  });

  it('makes a single piece of equipment a compound that keeps its ID, name, price and icon', () => {
    const transfer = extractItems(FILE, '201')!;
    const { xml, id } = insertParts(FILE, transfer, '300');
    expect(id).toBe('300');
    const doc = HdcDocument.parse(xml);
    const wrapper = doc.findById('300')!;
    expect(wrapper.getAttr('XMLID')).toBe('COMPOUNDPOWER');
    expect(wrapper.getAttr('NAME')).toBe('Chain Shirt');
    expect(wrapper.getAttr('PRICE')).toBe('50.0');
    expect(wrapper.getAttr('POSITION')).toBe('1');
    expect(wrapper.firstElement('FOUNDRY_ICON')?.getAttr('SRC')).toBe('icons/chain.webp');
    const shirt = parseHdcFile(xml).equipment!.find((e) => e.id === '300')!;
    expect(shirt.subPowers!.map((p) => p.name)).toEqual(['Chain Shirt', 'Blade']);
    const inner = wrapper.elements().find((el) => el.getAttr('XMLID') === 'ARMOR')!;
    expect(inner.getAttr('PRICE')).toBeUndefined();
    expect(inner.firstElement('FOUNDRY_ICON')).toBeUndefined();
    // The armor keeps its defenses and focus
    expect(inner.getAttr('PDLEVELS')).toBe('6');
    expect(inner.firstElement('MODIFIER')?.getAttr('OPTION')).toBe('OAF');
  });

  it("adds a compound's parts rather than the compound, and refuses a framework", () => {
    const { xml } = insertParts(FILE, extractItems(FILE, '200')!, '300');
    expect(parseHdcFile(xml).equipment!.find((e) => e.id === '300')!.subPowers!.map((p) => p.name)).toEqual([
      'Chain Shirt',
      'Blade',
      'Parry',
    ]);
    expect(() => insertParts(FILE, extractItems(FILE, '400')!, '200')).toThrow(/list or framework/);
  });

  it('a Multipower slot can become a part', () => {
    const { xml, ids } = insertParts(FILE, extractItems(FILE, '401')!, '200');
    expect(HdcDocument.parse(xml).findById(ids[0]!)!.getAttr('PARENTID')).toBeUndefined();
  });

  it('round-trips parts through a compound form', () => {
    const parts = partsFromTransfer(extractItems(FILE, '200')!);
    expect(parts.map((p) => [p.name, p.levels])).toEqual([['Blade', 1], ['Parry', 1]]);
    expect(parts.every((p) => p.id.startsWith('new-') && !p.parentId)).toBe(true);
    const back = transferFromPart(parts[0]!)!;
    expect(back.section).toBe('POWERS');
    const { xml } = insertParts(FILE, back, '200');
    const blade = parseHdcFile(xml).equipment!.find((e) => e.id === '200')!.subPowers![2]!;
    expect(blade.name).toBe('Blade');
    expect(blade.modifiers?.map((m) => m.xmlId)).toEqual(['FOCUS']);
  });

  it('the result writes back through the editor unchanged', () => {
    const { xml } = insertParts(FILE, extractItems(FILE, '201')!, '300');
    expect(updateHdc(xml, parseHdcFile(xml)).xml).toBe(xml);
  });
});
