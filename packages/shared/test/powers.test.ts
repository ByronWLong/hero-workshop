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
  setAdderMedium,
  setAdderOption,
  setAdderOptionAlias,
  setModifierComments,
  powerFormView,
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
      const picked = selectPower(powerDraft(scratch, 'powers'), xmlId);
      // Resistant Protection's levels are its defenses
      const part = { ...picked, levels, barrier: { ...picked.barrier, pd: levels / 2, ed: levels / 2 } };
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

  it.each(['powers', 'equipment'] as const)('prices and writes Resistant Protection by its defenses (%s)', (section) => {
    const base = blankHdc();
    const character = parseHdcFile(base);
    const picked = selectPower(powerDraft(character, section), 'FORCEFIELD');
    const draft = { ...picked, barrier: { ...picked.barrier, pd: 8, ed: 6, md: 1 } };
    // 15 points of defense at 3 per 2, a part pair costing a whole one
    expect(powerCosts(draft).base).toBe(24);
    const { xml } = updateHdc(base, savePowerDraft(character, section, undefined, draft));
    const el = HdcDocument.parse(xml).section(section === 'powers' ? 'POWERS' : 'EQUIPMENT')!.elements()[0]!;
    expect(['LEVELS', 'PDLEVELS', 'EDLEVELS', 'MDLEVELS', 'POWDLEVELS'].map((a) => el.getAttr(a))).toEqual(['15', '8', '6', '1', '0']);

    // Reopened, it shows its defenses; changing one rewrites both it and LEVELS
    const reparsed = parseHdcFile(xml);
    const id = (section === 'powers' ? reparsed.powers[0]! : reparsed.equipment![0]!).id;
    const reopened = powerDraft(reparsed, section, id);
    expect(reopened.barrier).toMatchObject({ pd: 8, ed: 6, md: 1, powd: 0 });
    const more = { ...reopened, barrier: { ...reopened.barrier, ed: 8 } };
    const after = HdcDocument.parse(updateHdc(xml, savePowerDraft(reparsed, section, id, more)).xml).findById(id)!;
    expect([after.getAttr('LEVELS'), after.getAttr('EDLEVELS')]).toEqual(['17', '8']);
  });

  it('splits the levels of Resistant Protection written without its defenses', () => {
    const xml = blankHdc().replace('<POWERS />', '<POWERS><POWER XMLID="FORCEFIELD" ID="1" BASECOST="0.0" LEVELS="10" ALIAS="Resistant Protection" POSITION="0" NAME="" QUANTITY="1" /></POWERS>');
    const character = parseHdcFile(xml);
    expect(powerDraft(character, 'powers', '1').barrier).toMatchObject({ pd: 5, ed: 5 });
  });

  it("edits a limitation's comments (why it applies)", () => {
    const xml = blankHdc().replace(
      '<POWERS />',
      '<POWERS><POWER XMLID="SWINGING" ID="9601" BASECOST="0.0" LEVELS="16" ALIAS="Swinging" POSITION="0" NAME="Vine Brachiation" QUANTITY="1">' +
        '<MODIFIER XMLID="LIMITEDPOWER" ID="9602" BASECOST="-0.5" LEVELS="0" ALIAS="Limited Power" POSITION="-1" OPTION="3" OPTIONID="3" OPTION_ALIAS="Power loses about a third of its effectiveness" NAME="" COMMENTS="" PRIVATE="No" FORCEALLOW="No" />' +
        '</POWER></POWERS>',
    );
    const character = parseHdcFile(xml);
    const draft = setModifierComments(powerDraft(character, 'powers', '9601'), '9602', ' Only in jungle or forest ');
    const { xml: out } = updateHdc(xml, savePowerDraft(character, 'powers', '9601', draft));
    expect(HdcDocument.parse(out).findById('9602')!.getAttr('COMMENTS')).toBe('Only in jungle or forest');
    expect(out.replace('COMMENTS="Only in jungle or forest"', 'COMMENTS=""')).toBe(xml);
    expect(parseHdcFile(out).powers[0]!.modifiers![0]!.comments).toBe('Only in jungle or forest');
  });

  it("qualifies Life Support's adders by their choices", () => {
    const base = blankHdc();
    const character = parseHdcFile(base);
    let draft = selectPower(powerDraft(character, 'powers'), 'LIFESUPPORT');
    for (const id of ['EATING', 'LONGEVITY', 'IMMUNITY']) draft = addAdder(draft, id);
    // Each starts on its first choice
    expect(draft.adders.map((a) => [a.optionId, a.baseCost])).toEqual([['WEEK', 1], ['TWOHUNDRED', 1], ['ALCOHOL', 3]]);
    const [eating, longevity, immunity] = draft.adders.map((a) => a.id);
    draft = setAdderOption(draft, eating!, 'NEVER');
    draft = setAdderOption(draft, longevity!, 'IMMORTAL');
    draft = setAdderOptionAlias(setAdderOption(draft, immunity!, 'ONETHING'), immunity!, 'Arsenic');
    // Does not eat 3, Immortal 5, a single substance 3
    expect(powerCosts(draft).real).toBe(11);
    const view = powerFormView(character, 'powers', draft);
    expect(view.adders[0]!.options?.find((o) => o.selected)?.value).toBe('NEVER');
    expect(view.adders[2]!.optionText?.value).toBe('Arsenic');

    const { xml } = updateHdc(base, savePowerDraft(character, 'powers', undefined, draft));
    const el = HdcDocument.parse(xml).section('POWERS')!.elements()[0]!;
    expect(el.elements('ADDER').map((a) => ['OPTIONID', 'OPTION_ALIAS', 'BASECOST'].map((k) => a.getAttr(k)))).toEqual([
      ['NEVER', 'Character does not eat', '3.0'],
      ['IMMORTAL', 'Immortal', '5.0'],
      ['ONETHING', 'Arsenic', '3.0'],
    ]);
    expect(parseHdcFile(xml).powers[0]!.realCost).toBe(11);
  });

  it("names Expanded Breathing's medium", () => {
    const base = blankHdc();
    const character = parseHdcFile(base);
    let draft = addAdder(selectPower(powerDraft(character, 'powers'), 'LIFESUPPORT'), 'EXPANDEDBREATHING');
    draft = setAdderMedium(draft, draft.adders[0]!.id, 'water');
    const view = powerFormView(character, 'powers', draft);
    expect([view.adders[0]!.name, view.adders[0]!.medium?.value]).toEqual(['Expanded Breathing', 'water']);
    const { xml } = updateHdc(base, savePowerDraft(character, 'powers', undefined, draft));
    const adder = HdcDocument.parse(xml).section('POWERS')!.elements()[0]!.elements('ADDER')[0]!;
    expect([adder.getAttr('ALIAS'), adder.getAttr('BASECOST')]).toEqual(['Expanded Breathing: water', '5.0']);
    const reparsed = parseHdcFile(xml);
    const reopened = powerFormView(reparsed, 'powers', powerDraft(reparsed, 'powers', reparsed.powers[0]!.id), reparsed.powers[0]!.id);
    expect(reopened.adders[0]!.medium?.value).toBe('water');
  });
});
