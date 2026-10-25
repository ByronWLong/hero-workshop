import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  HdcDocument,
  LIST_TYPE,
  blankHdc,
  decodeHdcBytes,
  itemForm,
  itemFormValues,
  newItemFormValues,
  parseHdcFile,
  saveItemForm,
  updateHdc,
} from '../src/index.js';

const sample = (name: string) => decodeHdcBytes(readFileSync(resolve(__dirname, '../../../samples', name)));
const EVO = sample('EliVokSkekMal Actual.hdc');

describe('item forms', () => {
  it('adds catalog skills with template costs and writes them correctly', () => {
    const character = parseHdcFile(EVO);
    let edited = saveItemForm(character, 'skills', undefined, { ...itemFormValues(character, 'skills'), xmlid: 'STEALTH', levels: 2, characteristic: 'DEX' });
    const stealthForm = itemForm('skills', { xmlid: 'STEALTH', levels: 2, characteristic: 'DEX' }, true);
    expect(stealthForm.cost).toBe(7); // 3 + 2 x 2
    edited = saveItemForm(edited, 'skills', undefined, { xmlid: 'KNOWLEDGE_SKILL', input: 'Dragon Lore', characteristic: 'GENERAL', levels: 1 });
    expect(itemForm('skills', { xmlid: 'KNOWLEDGE_SKILL', characteristic: 'GENERAL', levels: 1 }, true).cost).toBe(3); // 2 + 1

    const { xml, report } = updateHdc(EVO, edited);
    const doc = HdcDocument.parse(xml);
    const stealth = doc.findById(report.idMap[edited.skills.at(-2)!.id]!)!;
    expect(stealth.getAttr('XMLID')).toBe('STEALTH');
    expect(stealth.getAttr('CHARACTERISTIC')).toBe('DEX');
    expect(stealth.getAttr('LEVELS')).toBe('2');
    const lore = doc.findById(report.idMap[edited.skills.at(-1)!.id]!)!;
    expect(lore.getAttr('XMLID')).toBe('KNOWLEDGE_SKILL');
    expect(lore.getAttr('INPUT')).toBe('Dragon Lore');
    expect(parseHdcFile(xml).skills.find((s) => s.input === 'Dragon Lore')?.name).toBe('KS: Dragon Lore');
  });

  it('edits keep what the form does not show (adders, modifiers, grouping)', () => {
    const character = parseHdcFile(EVO);
    const perk = character.perks.find((p) => (p.adders?.length ?? 0) > 0) ?? character.perks[0]!;
    const values = { ...itemFormValues(character, 'perks', perk.id), name: 'Diplomat' };
    const edited = saveItemForm(character, 'perks', perk.id, values);
    const after = edited.perks.find((p) => p.id === perk.id)!;
    expect(after.adders).toEqual(perk.adders);
    expect(after.parentId).toBe(perk.parentId);

    const { xml } = updateHdc(EVO, edited);
    const before = HdcDocument.parse(EVO);
    before.ensureIds();
    const b = before.findById(perk.id)!;
    const a = HdcDocument.parse(xml).findById(perk.id)!;
    expect(a.elements('ADDER').map((x) => x.toString())).toEqual(b.elements('ADDER').map((x) => x.toString()));
    expect(a.getAttr('NAME')).toBe('Diplomat');
    expect(a.elements('MODIFIER').map((x) => x.toString())).toEqual(b.elements('MODIFIER').map((x) => x.toString()));
  });

  it('saves an unchanged form without changing the file', () => {
    const character = parseHdcFile(EVO);
    let edited = character;
    for (const section of ['skills', 'talents', 'disadvantages'] as const) {
      const first = (section === 'skills' ? character.skills : section === 'talents' ? character.talents : character.disadvantages)
        .find((i) => !('isGroup' in i && i.isGroup) && !('isEnhancer' in i && i.isEnhancer));
      if (first) edited = saveItemForm(edited, section, first.id, itemFormValues(edited, section, first.id));
    }
    const { report } = updateHdc(EVO, edited);
    expect(report.changes.filter((c) => !c.startsWith('Foundry'))).toEqual([]);
  });

  it('adds complications with Hero Designer XMLIDs and detail', () => {
    const character = parseHdcFile(EVO);
    const edited = saveItemForm(character, 'disadvantages', undefined, { type: 'SOCIAL_COMPLICATION', detail: 'Secret Identity', points: 15 });
    const { xml, report } = updateHdc(EVO, edited);
    const el = HdcDocument.parse(xml).findById(report.idMap[edited.disadvantages.at(-1)!.id]!)!;
    expect(el.getAttr('XMLID')).toBe('SOCIALLIMITATION');
    expect(el.getAttr('INPUT')).toBe('Secret Identity');
  });

  it('adds lists and moves items into and out of them', () => {
    for (const section of ['skills', 'perks', 'talents', 'martialarts'] as const) {
      const character = parseHdcFile(EVO);
      const items = () => (section === 'martialarts' ? 'martialArts' : section);
      const member = character[items()].find((i) => !i.isGroup && !i.parentId && !('isEnhancer' in i && i.isEnhancer));
      if (!member) continue;
      const listValues = { ...newItemFormValues(character, section, LIST_TYPE), name: 'Dragon Lore' };
      expect(itemForm(section, listValues, true, character).title).toBe('Add list');
      let edited = saveItemForm(character, section, undefined, listValues);
      const list = edited[items()].at(-1)!;
      expect(list.isGroup).toBe(true);

      // The new list is offered on the item's form, and the item saved into it
      const values = itemFormValues(edited, section, member.id);
      expect(itemForm(section, values, false, edited).fields.find((f) => f.name === 'list')?.options?.map((o) => o.label)).toContain('Dragon Lore');
      edited = saveItemForm(edited, section, member.id, { ...values, list: list.id });

      const { xml, report } = updateHdc(EVO, edited);
      const doc = HdcDocument.parse(xml);
      const listEl = doc.findById(report.idMap[list.id]!)!;
      expect(listEl.name, section).toBe('LIST');
      expect(listEl.getAttr('ALIAS')).toBe('Dragon Lore');
      expect(doc.findById(member.id)!.getAttr('PARENTID')).toBe(listEl.getAttr('ID'));
      const reread = parseHdcFile(xml);
      expect(reread[items()].find((i) => i.id === member.id)?.parentId).toBe(listEl.getAttr('ID'));

      // And out again
      const out = saveItemForm(reread, section, member.id, { ...itemFormValues(reread, section, member.id), list: '' });
      expect(HdcDocument.parse(updateHdc(xml, out).xml).findById(member.id)!.hasAttr('PARENTID')).toBe(false);
    }
  });

  it("prices a Weapon Familiarity from its weapon groups", () => {
    const character = parseHdcFile(sample('SkralkSkekMal.hdc'));
    const wf = character.skills.find((s) => s.xmlid === 'WEAPON_FAMILIARITY')!;
    const values = itemFormValues(character, 'skills', wf.id);
    expect(itemForm('skills', values, false, character).cost).toBe(3);
    expect(saveItemForm(character, 'skills', wf.id, values).skills.find((s) => s.id === wf.id)?.realCost).toBe(3);
  });

  it('offers no list field where there are no lists', () => {
    const character = parseHdcFile(blankHdc());
    const values = newItemFormValues(character, 'skills', 'STEALTH');
    expect(itemForm('skills', values, true, character).fields.some((f) => f.name === 'list')).toBe(false);
  });

  it('edits a skill list as a list (name and notes only)', () => {
    const source = sample('SkralkSkekMal.hdc');
    const character = parseHdcFile(source);
    const group = character.skills.find((s) => s.isGroup);
    expect(group).toBeDefined();
    if (!group) return;
    const values = itemFormValues(character, 'skills', group.id);
    expect(itemForm('skills', values, false).fields.map((f) => f.name)).toEqual(['name', 'notes']);
    const edited = saveItemForm(character, 'skills', group.id, { ...values, name: 'Renamed List' });
    const { xml, report } = updateHdc(source, edited);
    const el = HdcDocument.parse(xml).findById(group.id)!;
    expect(el.name).toBe('LIST');
    expect([el.getAttr('ALIAS'), el.getAttr('NAME')]).toContain('Renamed List');
    expect(report.changes.length).toBe(1);
  });
});
