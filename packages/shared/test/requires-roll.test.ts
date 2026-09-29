import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  HdcDocument,
  addModifier,
  blankHdc,
  decodeHdcBytes,
  itemForm,
  itemFormValues,
  parseHdcFile,
  powerDraft,
  powerFormView,
  rollSkillChoices,
  saveItemForm,
  savePowerDraft,
  selectPower,
  setRequiredSkill,
  updateHdc,
} from '../src/index.js';

const SKRALK = decodeHdcBytes(readFileSync(resolve(__dirname, '../../../samples/SkralkSkekMal.hdc')));

describe('Requires A Roll skill binding', () => {
  it('offers the character skills by the name hero6e matches on', () => {
    const choices = rollSkillChoices(parseHdcFile(SKRALK));
    const values = choices.map((c) => c.value);
    // This (older) copy of Skralk labels his casting skills "MSR: Wizardy" and "MSR: Sorcery"
    expect(values).toContain('MSR: Wizardy');
    expect(values).toContain('MSR: Sorcery');
    expect(choices.some((c) => c.xmlid === 'COMBAT_LEVELS')).toBe(false);
  });

  it('binds a spell list to its casting skill, matching the roll category to the skill', () => {
    let character = parseHdcFile(SKRALK);
    const list = character.powers.find((p) => p.name === 'Wizardy Spells')!;
    const rarId = list.modifiers!.find((m) => m.xmlId === 'REQUIRESASKILLROLL')!.id;

    // Bound to "Wizardy", which matches no skill: the form says so
    let draft = powerDraft(character, 'powers', list.id);
    expect(powerFormView(character, 'powers', draft, list.id).modifiers.find((m) => m.id === rarId)!.skill?.missing).toBe(true);

    // "MSR: Wizardy" is a PS relabelled MSR: the Skill roll becomes a PS roll
    draft = setRequiredSkill(draft, rarId, 'MSR: Wizardy', character);
    expect(draft.modifiers.find((m) => m.id === rarId)!.optionId).toBe('PS');

    // A PS casting skill (like Eli's Magic Skill) turns it into a PS roll, at the PS roll's value
    const jeweler = character.skills.find((s) => s.input === 'Jeweler')!;
    character = saveItemForm(character, 'skills', jeweler.id, { ...itemFormValues(character, 'skills', jeweler.id), name: 'Magic Skill' });
    draft = setRequiredSkill(powerDraft(character, 'powers', list.id), rarId, 'Magic Skill', character);
    const bound = draft.modifiers.find((m) => m.id === rarId)!;
    expect(bound.optionId).toBe('PS');
    expect(bound.value).toBe(-0.25);

    const { xml } = updateHdc(SKRALK, savePowerDraft(character, 'powers', list.id, draft));
    const doc = HdcDocument.parse(xml);
    const el = doc.findById(rarId)!;
    expect(el.getAttr('OPTIONID')).toBe('PS');
    expect(el.getAttr('COMMENTS')).toBe('Magic Skill');
    expect(el.getAttr('OPTION_ALIAS')).toBe('Jeweler');
    expect(el.getAttr('BASECOST')).toBe('-0.25');
    expect(doc.findById(jeweler.id)!.getAttr('NAME')).toBe('Magic Skill');
  });

  it('relabels a PS (e.g. to Magic Skill Roll) without disturbing its subject', () => {
    const character = parseHdcFile(SKRALK);
    const jeweler = character.skills.find((s) => s.input === 'Jeweler')!;
    const values = itemFormValues(character, 'skills', jeweler.id);
    expect(values.label).toBe('PS');
    expect(itemForm('skills', values, false).fields.map((f) => f.name)).toContain('label');

    const edited = saveItemForm(character, 'skills', jeweler.id, { ...values, label: 'Magic Skill Roll' });
    const { xml } = updateHdc(SKRALK, edited);
    const el = HdcDocument.parse(xml).findById(jeweler.id)!;
    expect(el.getAttr('ALIAS')).toBe('Magic Skill Roll');
    expect(el.getAttr('INPUT')).toBe('Jeweler');
    expect(el.getAttr('NAME') ?? '').toBe('');
    expect(parseHdcFile(xml).skills.find((s) => s.id === jeweler.id)!.name).toBe('Magic Skill Roll: Jeweler');
  });

  it('saves every skill form unchanged without touching the file', () => {
    let character = parseHdcFile(SKRALK);
    for (const skill of character.skills.filter((s) => !s.isGroup && !s.isEnhancer)) {
      character = saveItemForm(character, 'skills', skill.id, itemFormValues(character, 'skills', skill.id));
    }
    expect(updateHdc(SKRALK, character).report.changes).toEqual([]);
  });

  it('converts a Professional Skill casting skill to a Power skill, turning its spells back into Skill rolls', () => {
    // A caster built with a PS "Magic Skill" and a spell bound to it as a PS roll (like Eli)
    const base = blankHdc();
    let character = parseHdcFile(base);
    character = saveItemForm(character, 'skills', undefined, {
      xmlid: 'PROFESSIONAL_SKILL', input: 'Wizardry', name: 'Magic Skill', characteristic: 'INT', levels: 12,
    });
    let spell = { ...selectPower(powerDraft(character, 'powers'), 'DRAIN'), name: 'Life Sap', input: 'BODY', levels: 3 };
    spell = addModifier(spell, 'REQUIRESASKILLROLL');
    spell = setRequiredSkill(spell, spell.modifiers[0]!.id, 'Magic Skill', character);
    expect(spell.modifiers[0]!.optionId).toBe('PS');
    character = savePowerDraft(character, 'powers', undefined, spell);
    const built = updateHdc(base, character).xml;

    const parsed = parseHdcFile(built);
    const skill = parsed.skills.find((s) => s.bindingName === 'Magic Skill')!;
    const psCost = parsed.powers.find((p) => p.name === 'Life Sap')!.realCost!;
    const converted = saveItemForm(parsed, 'skills', skill.id, { ...itemFormValues(parsed, 'skills', skill.id), xmlid: 'POWERSKILL' });

    // The spell's roll follows the skill: a Skill roll at -1/2 (still -1 per 10 Active Points)
    const lifeSap = converted.powers.find((p) => p.name === 'Life Sap')!;
    const rar = lifeSap.modifiers!.find((m) => m.xmlId === 'REQUIRESASKILLROLL')!;
    expect(rar.optionId).toBe('SKILL');
    expect(rar.value).toBe(-0.5);
    expect(lifeSap.realCost!).toBeLessThan(psCost);

    const { xml } = updateHdc(built, converted);
    const doc = HdcDocument.parse(xml);
    const skillEl = doc.findById(skill.id)!;
    expect(skillEl.getAttr('XMLID')).toBe('POWERSKILL');
    expect(skillEl.getAttr('ALIAS')).toBe('Power');
    expect(skillEl.getAttr('NAME')).toBe('Magic Skill');
    expect(skillEl.getAttr('INPUT')).toBe('Wizardry');
    expect(skillEl.getAttr('BASECOST')).toBe('3.0');
    const rarEl = doc.findById(rar.id)!;
    expect(rarEl.getAttr('OPTIONID')).toBe('SKILL');
    expect(rarEl.getAttr('BASECOST')).toBe('-0.5');
    expect(rarEl.getAttr('COMMENTS')).toBe('Magic Skill');
    expect(parseHdcFile(xml).skills.find((s) => s.id === skill.id)!.name).toBe('Magic Skill');
  });
});
