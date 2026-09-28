import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  HdcDocument,
  decodeHdcBytes,
  itemForm,
  itemFormValues,
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
    const values = { ...itemFormValues(character, 'perks', perk.id), levels: (perk.levels ?? 0) + 1 };
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
    expect(a.getAttr('LEVELS')).toBe(String((perk.levels ?? 0) + 1));
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
});
