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
  repairForFoundry,
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

  it("chooses a Weapon Familiarity's weapons, kept in their groups as Hero Designer keeps them", () => {
    const xml = blankHdc();
    const character = parseHdcFile(xml);
    const values = { ...newItemFormValues(character, 'skills', 'WEAPON_FAMILIARITY'), subjects: ['COMMONMISSILE', 'UNCOMMONMELEE/WHIPS', 'COMMONMELEE/BLADES'] };
    const form = itemForm('skills', values, true, character);
    const weapons = form.fields.find((f) => f.name === 'subjects')!;
    expect(weapons.options?.find((o) => o.value === 'COMMONMELEE')?.label).toBe('All Common Melee Weapons (2)');
    expect(weapons.options?.find((o) => o.value === 'UNCOMMONMELEE/WHIPS')?.group).toBe('Uncommon Melee Weapons');
    expect(weapons.options?.some((o) => o.value === 'UNCOMMONMELEE')).toBe(false);
    expect(form.cost).toBe(4);

    const edited = saveItemForm(character, 'skills', undefined, values);
    const written = updateHdc(xml, edited);
    const el = HdcDocument.parse(written.xml).findById(written.report.idMap[edited.skills.at(-1)!.id]!)!;
    const uncommon = el.elements('ADDER').find((a) => a.getAttr('XMLID') === 'UNCOMMONMELEE')!;
    expect(uncommon.getAttr('SELECTED')).toBe('NO');
    expect(uncommon.elements('ADDER').map((a) => a.getAttr('XMLID'))).toEqual(['WHIPS']);
    expect(el.elements('ADDER').find((a) => a.getAttr('XMLID') === 'COMMONMELEE')?.elements('ADDER').map((a) => a.getAttr('XMLID'))).toEqual(['BLADES']);
    const reread = parseHdcFile(written.xml).skills.at(-1)!;
    expect(reread.realCost).toBe(4);
    expect((itemFormValues(parseHdcFile(written.xml), 'skills', reread.id).subjects as string[]).sort()).toEqual(['COMMONMELEE/BLADES', 'COMMONMISSILE', 'UNCOMMONMELEE/WHIPS']);

    // A group bought whole takes in its members
    expect(itemForm('skills', { ...values, subjects: ['COMMONMELEE', 'COMMONMELEE/BLADES'] }, true, character).cost).toBe(2);
  });

  it("adds and removes an existing Weapon Familiarity's weapons", () => {
    const source = sample('SkralkSkekMal.hdc');
    const character = parseHdcFile(source);
    const wf = character.skills.find((s) => s.xmlid === 'WEAPON_FAMILIARITY')!;
    const values = itemFormValues(character, 'skills', wf.id);
    expect(values.subjects).toEqual(['COMMONMELEE', 'UNCOMMONMELEE/STAFFS']);
    expect(updateHdc(source, saveItemForm(character, 'skills', wf.id, values)).report.changes).toEqual([]);

    const more = updateHdc(source, saveItemForm(character, 'skills', wf.id, { ...values, subjects: [...(values.subjects as string[]), 'UNCOMMONMELEE/WHIPS'] }));
    const el = HdcDocument.parse(more.xml).findById(wf.id)!;
    expect(el.elements('ADDER').filter((a) => a.getAttr('XMLID') === 'UNCOMMONMELEE').map((a) => a.elements('ADDER').map((m) => m.getAttr('XMLID')))).toEqual([['STAFFS', 'WHIPS']]);
    expect(parseHdcFile(more.xml).skills.find((s) => s.id === wf.id)?.realCost).toBe(4);

    const fewer = updateHdc(source, saveItemForm(character, 'skills', wf.id, { ...values, subjects: ['COMMONMELEE'] }));
    const after = HdcDocument.parse(fewer.xml).findById(wf.id)!;
    expect(after.elements('ADDER').map((a) => a.getAttr('XMLID'))).toEqual(['COMMONMELEE']);
    expect(parseHdcFile(fewer.xml).skills.find((s) => s.id === wf.id)?.realCost).toBe(2);
  });

  it('buys a skill as a Proficiency (11-), its own choice beside Familiarity', () => {
    const xml = blankHdc();
    const character = parseHdcFile(xml);
    const values = { ...newItemFormValues(character, 'skills', 'SYSTEMS_OPERATION'), levels: 2 };
    const training = itemForm('skills', values, true, character).fields.find((f) => f.name === 'training')!;
    expect(training.options?.map((o) => o.label)).toEqual(['Full skill', 'Familiarity (8-, 1 pt)', 'Proficiency (11-, 2 pts)']);
    const form = itemForm('skills', { ...values, training: 'proficiency' }, true, character);
    expect(form.cost).toBe(2);
    expect(form.fields.some((f) => f.name === 'levels' || f.name === 'characteristic')).toBe(false);

    const edited = saveItemForm(character, 'skills', undefined, { ...values, training: 'proficiency' });
    const written = updateHdc(xml, edited);
    const el = HdcDocument.parse(written.xml).findById(written.report.idMap[edited.skills.at(-1)!.id]!)!;
    // Written as the General 11- skill hero6e rolls correctly (it rolls PROFICIENCY="Yes" at 10-)
    expect(['CHARACTERISTIC', 'PROFICIENCY', 'FAMILIARITY', 'BASECOST', 'LEVELS'].map((k) => el.getAttr(k))).toEqual(['GENERAL', 'No', 'No', '2.0', '0']);
    const reread = parseHdcFile(written.xml);
    const skill = reread.skills.at(-1)!;
    expect(skill.realCost).toBe(2);
    expect(itemFormValues(reread, 'skills', skill.id).training).toBe('proficiency');

    // Back to a full skill, and to a Familiarity
    const full = updateHdc(written.xml, saveItemForm(reread, 'skills', skill.id, { ...itemFormValues(reread, 'skills', skill.id), training: '', levels: 1 }));
    const fullEl = HdcDocument.parse(full.xml).findById(skill.id)!;
    expect(['CHARACTERISTIC', 'PROFICIENCY', 'BASECOST', 'LEVELS'].map((k) => fullEl.getAttr(k))).toEqual(['INT', 'No', '3.0', '1']);
    expect(parseHdcFile(full.xml).skills.find((s) => s.id === skill.id)?.realCost).toBe(5);
    const fam = updateHdc(written.xml, saveItemForm(reread, 'skills', skill.id, { ...itemFormValues(reread, 'skills', skill.id), training: 'familiarity' }));
    const famEl = HdcDocument.parse(fam.xml).findById(skill.id)!;
    expect(['CHARACTERISTIC', 'PROFICIENCY', 'FAMILIARITY', 'BASECOST'].map((k) => famEl.getAttr(k))).toEqual(['INT', 'No', 'Yes', '0.0']);
  });

  it('reads a General characteristic skill as a Proficiency, and leaves it as it is', () => {
    const xml = blankHdc();
    const blank = parseHdcFile(xml);
    const added = updateHdc(xml, saveItemForm(blank, 'skills', undefined, newItemFormValues(blank, 'skills', 'SYSTEMS_OPERATION')));
    const doc = HdcDocument.parse(added.xml);
    const el = doc.section('SKILLS')!.elements('SKILL')[0]!;
    el.setAttr('CHARACTERISTIC', 'GENERAL');
    el.setAttr('BASECOST', '2.0');
    const general = doc.toString();
    const character = parseHdcFile(general);
    const skill = character.skills[0]!;
    expect([skill.proficiency, skill.characteristic, skill.realCost]).toEqual([true, 'INT', 2]);
    const values = itemFormValues(character, 'skills', skill.id);
    expect(values.training).toBe('proficiency');
    expect(updateHdc(general, saveItemForm(character, 'skills', skill.id, values)).xml).toBe(general);

    // With levels it's a General skill, not a Proficiency
    el.setAttr('LEVELS', '1');
    expect(parseHdcFile(doc.toString()).skills[0]!.proficiency).toBe(false);
  });

  it("repairs Hero Designer's Proficiencies for hero6e", () => {
    const xml = blankHdc();
    const blank = parseHdcFile(xml);
    const added = updateHdc(xml, saveItemForm(blank, 'skills', undefined, newItemFormValues(blank, 'skills', 'STEALTH')));
    const doc = HdcDocument.parse(added.xml);
    const el = doc.section('SKILLS')!.elements('SKILL')[0]!;
    el.setAttr('PROFICIENCY', 'Yes');
    el.setAttr('LEVELS', '0');
    const repaired = repairForFoundry(doc.toString());
    expect(repaired.changes.some((c) => c.includes('Proficiency rolls 11-'))).toBe(true);
    const out = HdcDocument.parse(repaired.xml).section('SKILLS')!.elements('SKILL')[0]!;
    expect(['CHARACTERISTIC', 'PROFICIENCY', 'BASECOST'].map((k) => out.getAttr(k))).toEqual(['GENERAL', 'No', '2.0']);
    expect(parseHdcFile(repaired.xml).skills[0]!.proficiency).toBe(true);
  });

  it("doesn't offer a background skill a Proficiency (its General 11- is one)", () => {
    const character = parseHdcFile(blankHdc());
    const values = { ...newItemFormValues(character, 'skills', 'KNOWLEDGE_SKILL'), input: 'Dragons' };
    const training = itemForm('skills', values, true, character).fields.find((f) => f.name === 'training');
    expect(training?.options?.map((o) => o.value)).toEqual(['', 'familiarity']);
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
