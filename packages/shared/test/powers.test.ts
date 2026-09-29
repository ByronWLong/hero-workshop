import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  HdcDocument,
  addAdder,
  blankHdc,
  compoundPartsCharacter,
  setSubPowers,
  addModifier,
  decodeHdcBytes,
  parseHdcFile,
  powerCosts,
  powerDraft,
  savePowerDraft,
  selectPower,
  setModifierOption,
  updateHdc,
} from '../src/index.js';

const EVO = decodeHdcBytes(readFileSync(resolve(__dirname, '../../../samples/EliVokSkekMal Actual.hdc')));

describe('power drafts', () => {
  it('builds a new power with template adders and option-priced modifiers', () => {
    const character = parseHdcFile(EVO);
    let draft = selectPower(powerDraft(character, 'powers'), 'DRAIN');
    draft = { ...draft, levels: 3, input: 'BODY', name: 'Life Sap' };
    draft = addAdder(draft, 'REDUCEDNEGATION');
    draft = addModifier(draft, 'DELAYEDRETURNRATE');
    const drr = draft.modifiers[0]!;
    draft = setModifierOption(draft, drr.id, 'FIVEMINUTES');
    expect(draft.modifiers[0]!.value).toBe(1.25);

    const costs = powerCosts(draft);
    // Drain 3d6 = 30, +2 for Reduced Negation 1 = 32 base; x2.25 = 72 active
    expect(costs.base).toBe(32);
    expect(costs.active).toBe(72);

    const edited = savePowerDraft(character, 'powers', undefined, draft);
    const { xml, report } = updateHdc(EVO, edited);
    const el = HdcDocument.parse(xml).findById(report.idMap[edited.powers.at(-1)!.id]!)!;
    expect(el.getAttr('XMLID')).toBe('DRAIN');
    expect(el.getAttr('NAME')).toBe('Life Sap');
    expect(el.getAttr('INPUT')).toBe('BODY');
    expect(el.getAttr('LEVELS')).toBe('3');
    expect(el.elements('ADDER').map((a) => a.getAttr('XMLID'))).toEqual(['REDUCEDNEGATION']);
    const modifier = el.elements('MODIFIER')[0]!;
    expect(modifier.getAttr('XMLID')).toBe('DELAYEDRETURNRATE');
    expect(modifier.getAttr('OPTIONID')).toBe('FIVEMINUTES');
  });

  it('saves every existing power and equipment item unchanged when nothing is edited', () => {
    const character = parseHdcFile(EVO);
    let edited = character;
    for (const p of character.powers) edited = savePowerDraft(edited, 'powers', p.id, powerDraft(edited, 'powers', p.id));
    for (const e of character.equipment ?? []) edited = savePowerDraft(edited, 'equipment', e.id, powerDraft(edited, 'equipment', e.id));
    const { report } = updateHdc(EVO, edited);
    expect(report.changes.filter((c) => !c.startsWith('Foundry'))).toEqual([]);
    expect(report.warnings).toEqual([]);
  });

  it('edits equipment fields', () => {
    const character = parseHdcFile(EVO);
    const item = character.equipment![0]!;
    const draft = { ...powerDraft(character, 'equipment', item.id), price: 42 };
    const { xml } = updateHdc(EVO, savePowerDraft(character, 'equipment', item.id, draft));
    expect(HdcDocument.parse(xml).findById(item.id)!.getAttr('PRICE')).toBe('42.0');
  });

  it.each(['equipment', 'powers'] as const)('builds a compound %s item from its parts', (section) => {
    const base = blankHdc();
    const character = parseHdcFile(base);
    let compound = { ...powerDraft(character, section, undefined, 'compound'), name: 'Longsword' };
    // Parts are added with the ordinary power form, on a scratch character holding just the parts
    for (const [xmlId, levels] of [['HKA', 1], ['FORCEFIELD', 2]] as const) {
      const scratch = compoundPartsCharacter(character, compound);
      const part = { ...selectPower(powerDraft(scratch, 'powers'), xmlId), levels };
      compound = setSubPowers(compound, savePowerDraft(scratch, 'powers', undefined, part).powers);
    }
    expect(powerCosts(compound).real).toBe(compound.subPowers.reduce((n, p) => n + (p.realCost ?? 0), 0));

    const edited = savePowerDraft(character, section, undefined, compound);
    const { xml } = updateHdc(base, edited);
    const doc = HdcDocument.parse(xml);
    const container = doc.section(section === 'equipment' ? 'EQUIPMENT' : 'POWERS')!;
    const top = container.elements();
    expect(top).toHaveLength(1);
    expect(top[0]!.getAttr('XMLID')).toBe('COMPOUNDPOWER');
    expect(top[0]!.elements('POWER').map((el) => el.getAttr('XMLID'))).toEqual(['HKA', 'FORCEFIELD']);

    // Reopening the compound shows its parts; removing one writes the removal
    const reparsed = parseHdcFile(xml);
    const id = (section === 'equipment' ? reparsed.equipment![0]! : reparsed.powers.find((p) => p.type === 'COMPOUNDPOWER')!).id;
    const reopened = powerDraft(reparsed, section, id);
    expect(reopened.subPowers.map((p) => p.type)).toEqual(['HKA', 'FORCEFIELD']);
    const trimmed = setSubPowers(reopened, reopened.subPowers.slice(0, 1));
    const after = HdcDocument.parse(updateHdc(xml, savePowerDraft(reparsed, section, id, trimmed)).xml);
    expect(after.findById(id)!.elements('POWER').map((el) => el.getAttr('XMLID'))).toEqual(['HKA']);
  });
});
