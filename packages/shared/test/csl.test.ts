import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HdcDocument, cslAttackChoices, decodeHdcBytes, itemForm, itemFormValues, parseHdcFile, saveItemForm, updateHdc } from '../src/index.js';

const SKRALK = decodeHdcBytes(readFileSync(resolve(__dirname, '../../../samples/SkralkSkekMal.hdc')));

describe('Combat Skill Level attacks', () => {
  it('lists the character attacks, lists and maneuvers a CSL can apply to', () => {
    const choices = cslAttackChoices(parseHdcFile(SKRALK));
    expect(choices.length).toBeGreaterThan(0);
  });

  it('links a CSL to attacks as cost-free custom adders, and unlinks them', () => {
    const character = parseHdcFile(SKRALK);
    const csl = character.skills.find((s) => s.xmlid === 'COMBAT_LEVELS')!;
    const values = itemFormValues(character, 'skills', csl.id);
    const form = itemForm('skills', values, false, character);
    const field = form.fields.find((f) => f.name === 'attacks')!;
    expect(field.type).toBe('attacks');
    const target = field.options!.find((o) => !o.selected)!.value;

    const linked = saveItemForm(character, 'skills', csl.id, { ...values, attacks: [...(values.attacks as string[]), target] });
    const { xml, report } = updateHdc(SKRALK, linked);
    expect(report.changes.some((c) => c.includes(target))).toBe(true);
    const el = HdcDocument.parse(xml).findById(csl.id)!;
    const adder = el.elements('ADDER').find((a) => a.getAttr('ALIAS') === target)!;
    expect(adder.getAttr('XMLID')).toBe('ADDER');
    expect(adder.getAttr('BASECOST')).toBe('0.0');
    // Linking costs nothing
    expect(parseHdcFile(xml).skills.find((s) => s.id === csl.id)!.realCost).toBe(csl.realCost);

    const reread = parseHdcFile(xml);
    const again = itemFormValues(reread, 'skills', csl.id);
    expect(again.attacks).toContain(target);
    const unlinked = saveItemForm(reread, 'skills', csl.id, { ...again, attacks: (again.attacks as string[]).filter((n) => n !== target) });
    const back = HdcDocument.parse(updateHdc(xml, unlinked).xml).findById(csl.id)!;
    expect(back.elements('ADDER').some((a) => a.getAttr('ALIAS') === target)).toBe(false);
  });
});
