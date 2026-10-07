import { describe, expect, it } from 'vitest';
import {
  HdcDocument,
  addModifier,
  blankHdc,
  parseHdcFile,
  powerCosts,
  powerDraft,
  powerFormView,
  savePowerDraft,
  setModifierAdder,
  setModifierInput,
  setModifierOption,
  updateHdc,
  NND,
  modifierChoices,
} from '../src/index.js';

// An NND attack in 6E: Attack Versus Alternate Defense with All Or Nothing, naming the defense;
// Does BODY is a separate advantage
const XML = blankHdc().replace('<POWERS />', `<POWERS>
    <POWER XMLID="ENERGYBLAST" ID="9700" BASECOST="0.0" LEVELS="4" ALIAS="Blast" POSITION="0" NAME="Mystic Bolt" INPUT="ED" QUANTITY="1" />
  </POWERS>`);

describe('Attack Versus Alternate Defense', () => {
  it('builds an NND attack: defense, All Or Nothing and Does BODY', () => {
    const c = parseHdcFile(XML);
    let draft = powerDraft(c, 'powers', '9700');
    draft = addModifier(draft, 'AVAD');
    const avad = draft.modifiers[0]!;
    draft = setModifierOption(draft, avad.id, 'VERYRARE');
    expect(draft.modifiers[0]!.value).toBe(1.5);

    const view = powerFormView(c, 'powers', draft, '9700').modifiers[0]!;
    expect(view.input?.label).toBe('Defense');
    expect(view.adderChoices.map((a) => a.value)).toEqual(['NND']);

    draft = setModifierAdder(draft, avad.id, 'NND', true);
    draft = setModifierInput(draft, avad.id, "Wizard's Shield");
    draft = addModifier(draft, 'DOESBODY');
    expect(draft.modifiers.map((m) => m.value)).toEqual([1, 1]);
    expect(powerCosts(draft).active).toBe(60); // 20 x (1 + 1 + 1)

    const xml = updateHdc(XML, savePowerDraft(c, 'powers', '9700', draft)).xml;
    const el = HdcDocument.parse(xml).findById('9700')!;
    const mod = el.elements('MODIFIER').find((m) => m.getAttr('XMLID') === 'AVAD')!;
    expect(mod.getAttr('BASECOST')).toBe('1.5');
    expect(mod.getAttr('OPTIONID')).toBe('VERYRARE');
    expect(mod.getAttr('INPUT')).toBe("Wizard's Shield");
    expect(mod.elements('ADDER').map((a) => [a.getAttr('XMLID'), a.getAttr('ALIAS'), a.getAttr('BASECOST')])).toEqual([['NND', 'All Or Nothing', '-0.5']]);
    expect(el.elements('MODIFIER').some((m) => m.getAttr('XMLID') === 'DOESBODY')).toBe(true);

    // Reads back the same, and turning All Or Nothing off removes the adder
    const again = parseHdcFile(xml);
    const back = powerDraft(again, 'powers', '9700');
    expect(back.modifiers.map((m) => m.value)).toEqual([1, 1]);
    const off = setModifierAdder(back, back.modifiers[0]!.id, 'NND', false);
    expect(off.modifiers[0]!.value).toBe(1.5);
    const xml2 = updateHdc(xml, savePowerDraft(again, 'powers', '9700', off)).xml;
    expect(HdcDocument.parse(xml2).findById('9700')!.elements('MODIFIER')[0]!.elements('ADDER')).toHaveLength(0);
  });

  it('offers No Normal Defense as its own advantage: AVAD Very Common -> Rare, All Or Nothing', () => {
    expect(modifierChoices().advantages).toContainEqual({ value: NND.choice, label: 'No Normal Defense (NND)' });
    const c = parseHdcFile(XML);
    let draft = addModifier(powerDraft(c, 'powers', '9700'), NND.choice);
    const nnd = draft.modifiers[0]!;
    expect(nnd).toMatchObject({ xmlId: 'AVAD', optionId: 'VERYRARE', value: 1, name: 'No Normal Defense (NND)' });
    expect(nnd.adders?.map((a) => a.xmlId)).toEqual(['NND']);

    // Shown with only its defense to fill in
    const row = powerFormView(c, 'powers', draft, '9700').modifiers[0]!;
    expect(row).toMatchObject({ isNnd: true, options: undefined, adderChoices: [], input: { label: 'Rare defense', value: '' } });

    draft = setModifierInput(draft, nnd.id, 'Life Support (Self-Contained Breathing)');
    const xml = updateHdc(XML, savePowerDraft(c, 'powers', '9700', draft)).xml;
    const mod = HdcDocument.parse(xml).findById('9700')!.elements('MODIFIER')[0]!;
    expect([mod.getAttr('XMLID'), mod.getAttr('OPTIONID'), mod.getAttr('BASECOST'), mod.getAttr('INPUT')]).toEqual(['AVAD', 'VERYRARE', '1.5', 'Life Support (Self-Contained Breathing)']);

    // Read back as NND
    expect(parseHdcFile(xml).powers.find((p) => p.id === '9700')!.modifiers![0]!.name).toBe('No Normal Defense (NND)');
  });
});
