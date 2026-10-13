import { describe, expect, it } from 'vitest';
import {
  HdcDocument,
  blankHdc,
  buildItemTree,
  extractItems,
  insertItems,
  insertParts,
  itemForm,
  itemFormValues,
  levelTargetsField,
  moveItem,
  parseHdcFile,
  saveItemForm,
  skillsInAlias,
  updateHdc,
  withLevelTargets,
} from '../src/index.js';

const withPowers = (powers: string) =>
  HdcDocument.parse(blankHdc().replace(/<POWERS\s*\/>|<POWERS>\s*<\/POWERS>/, `<POWERS>\n${powers}\n  </POWERS>`)).toString();

const source = withPowers(`    <POWER XMLID="FLIGHT" ID="9001" POSITION="0" LEVELS="10" NAME="Wings" />
    <LIST XMLID="GENERIC_OBJECT" ID="9010" POSITION="1" ALIAS="Spells" NAME="" />
    <POWER XMLID="DRAIN" ID="9011" PARENTID="9010" POSITION="2" LEVELS="3" INPUT="BODY" NAME="Life Sap" />
    <POWER XMLID="ENERGYBLAST" ID="9012" PARENTID="9010" POSITION="3" LEVELS="4" NAME="Bolt" />
    <POWER XMLID="COMPOUNDPOWER" ID="9020" POSITION="4" NAME="Sword">
      <POWER XMLID="HKA" ID="9021" POSITION="0" LEVELS="1" NAME="Edge" />
      <POWER XMLID="ARMOR" ID="9022" POSITION="1" LEVELS="2" NAME="Parry" />
    </POWER>
    <POWER XMLID="RUNNING" ID="9030" POSITION="5" LEVELS="6" NAME="Sprint" />`);

const order = (xml: string) => buildItemTree(parseHdcFile(xml), 'powers').map((r) => r.name);
const positions = (xml: string) => HdcDocument.parse(xml).section('POWERS')!.elements().map((el) => `${el.getAttr('ID')}:${el.getAttr('POSITION')}`);

describe('reordering items', () => {
  it('moves an item before another and renumbers POSITION in document order', () => {
    const xml = moveItem(source, '9030', { id: '9001', after: false })!;
    expect(order(xml)).toEqual(['Sprint', 'Wings', 'Spells', 'Sword']);
    expect(positions(xml)).toEqual(['9030:0', '9001:1', '9010:2', '9011:3', '9012:4', '9020:5']);
  });

  it('moves a list with its members, and after a list means after its members', () => {
    const xml = moveItem(source, '9010', { id: '9020', after: true })!;
    expect(order(xml)).toEqual(['Wings', 'Sword', 'Spells', 'Sprint']);
    const back = moveItem(xml, '9001', { id: '9010', after: true })!;
    expect(order(back)).toEqual(['Sword', 'Spells', 'Wings', 'Sprint']);
  });

  it('reorders a list’s members and a compound’s parts', () => {
    const members = moveItem(source, '9012', { id: '9011', after: false })!;
    expect(buildItemTree(parseHdcFile(members), 'powers')[1]!.children.map((c) => c.name)).toEqual(['Bolt', 'Life Sap']);
    const parts = moveItem(source, '9022', { id: '9021', after: false })!;
    const sword = HdcDocument.parse(parts).findById('9020')!;
    expect(sword.elements().map((el) => `${el.getAttr('NAME')}:${el.getAttr('POSITION')}`)).toEqual(['Parry:0', 'Edge:1']);
  });

  it('only moves items that share a list, framework or compound', () => {
    expect(moveItem(source, '9001', { id: '9011', after: false })).toBeUndefined();
    expect(moveItem(source, '9021', { id: '9030', after: false })).toBeUndefined();
  });

  it('leaves everything else untouched', () => {
    const xml = moveItem(source, '9030', { id: '9001', after: false })!;
    const report = updateHdc(xml, parseHdcFile(xml));
    expect(report.xml).toBe(xml);
  });
});

describe('placing copies', () => {
  it('copies an item beside another, into that item’s list', () => {
    const { xml, id } = insertItems(source, extractItems(source, '9030')!, { at: { id: '9011', after: true } });
    const copy = HdcDocument.parse(xml).findById(id!)!;
    expect(copy.getAttr('PARENTID')).toBe('9010');
    expect(buildItemTree(parseHdcFile(xml), 'powers')[1]!.children.map((c) => c.name)).toEqual(['Life Sap', 'Sprint', 'Bolt']);
  });

  it('copies a part beside another part', () => {
    const { xml } = insertParts(source, extractItems(source, '9001')!, '9020', { at: { id: '9021', after: false } });
    const sword = HdcDocument.parse(xml).findById('9020')!;
    expect(sword.elements().map((el) => el.getAttr('NAME'))).toEqual(['Wings', 'Edge', 'Parry']);
  });

  it('refuses a list inside a list', () => {
    const other = withPowers(`    <LIST XMLID="GENERIC_OBJECT" ID="8010" POSITION="0" ALIAS="Gifts" NAME="" />`);
    expect(() => insertItems(source, extractItems(other, '8010')!, { parentId: '9010' })).toThrow(/can't go inside/);
    expect(() => insertItems(source, extractItems(other, '8010')!, { at: { id: '9011', after: false } })).toThrow(/can't go inside/);
  });
});

describe('Skill Levels', () => {
  const skills = HdcDocument.parse(
    blankHdc().replace(
      /<SKILLS\s*\/>|<SKILLS>\s*<\/SKILLS>/,
      `<SKILLS>
    <SKILL XMLID="STEALTH" ID="7001" POSITION="0" ALIAS="Stealth" CHARACTERISTIC="DEX" NAME="" />
    <SKILL XMLID="CLIMBING" ID="7002" POSITION="1" ALIAS="Climbing" CHARACTERISTIC="DEX" NAME="" />
    <SKILL XMLID="SKILL_LEVELS" ID="7003" POSITION="2" LEVELS="2" ALIAS="Skill Levels" OPTION="CHARACTERISTIC" OPTIONID="CHARACTERISTIC" OPTION_ALIAS="with single Skill or Characteristic Roll" NAME="" />
  </SKILLS>`,
    ),
  ).toString();

  it('choose the skills they apply to, named in OPTION_ALIAS as hero6e reads them', () => {
    const character = parseHdcFile(skills);
    const values = itemFormValues(character, 'skills', '7003');
    const field = itemForm('skills', values, false, character).fields.find((f) => f.name === 'skills')!;
    expect(field.value).toEqual([]);
    expect(field.options!.map((o) => o.value)).toEqual(['Stealth', 'Climbing']);
    const saved = saveItemForm(character, 'skills', '7003', { ...values, skills: ['Stealth', 'Climbing'] });
    const { xml } = updateHdc(skills, saved);
    expect(HdcDocument.parse(xml).findById('7003')!.getAttr('OPTION_ALIAS')).toBe('with Stealth, Climbing');
    expect(skillsInAlias('SKILL_LEVELS', 'with Stealth, Climbing and DEX Roll', field.options!)).toEqual(['Stealth', 'Climbing', 'DEX Roll']);
  });

  it('name the skills a broad option covers, so hero6e applies them', () => {
    const character = parseHdcFile(skills);
    const values = { ...itemFormValues(character, 'skills', '7003'), option: 'AGILITY' };
    const field = itemForm('skills', values, false, character).fields.find((f) => f.name === 'skills')!;
    expect(field.value).toEqual(['Stealth', 'Climbing']);
    expect(field.defaulted).toBe(true);
    expect(field.picks).toEqual([{ label: 'Tick all Agility skills', values: ['Stealth', 'Climbing'] }]);
    // Saved even when the checklist wasn't touched
    const { xml } = updateHdc(skills, saveItemForm(character, 'skills', '7003', values));
    const alias = HdcDocument.parse(xml).findById('7003')!.getAttr('OPTION_ALIAS')!;
    expect(alias).toBe('with all Agility Skills (Stealth, Climbing)');
    expect(skillsInAlias('SKILL_LEVELS', alias, field.options!)).toEqual(['Stealth', 'Climbing']);
    // A broad group offers its groups to tick, and starts with none
    const group = itemForm('skills', { ...values, option: 'GROUP' }, false, character).fields.find((f) => f.name === 'skills')!;
    expect(group.value).toEqual([]);
  });

  it('link Combat Skill Levels bought as a power to attacks through adders', () => {
    const character = parseHdcFile(source);
    const item = { xmlid: 'COMBAT_LEVELS', option: 'SINGLE', adders: [] };
    const field = levelTargetsField(character, item)!;
    expect(field.options!.map((o) => o.value)).toContain('Bolt');
    const { adders } = withLevelTargets(item, 'attacks', ['Bolt']);
    expect(adders).toEqual([expect.objectContaining({ xmlId: 'ADDER', alias: 'Bolt', baseCost: 0 })]);
    expect(levelTargetsField(character, { ...item, option: 'ALL' })).toBeUndefined();
  });
});
