import { describe, expect, it } from 'vitest';
import { addModifier, blankHdc, modifierBookNotes, parseHdcFile, powerDraft, powerFormView, setModifierAdder } from '../src/index.js';

const on = (xmlId: string, modifiers: { xmlId: string; optionId?: string; adders?: { xmlId: string; baseCost: number }[] }[]) => ({
  xmlId,
  modifiers: modifiers.map((m) => ({ value: 0, ...m })),
});
const notes = (power: ReturnType<typeof on>, xmlId: string) =>
  modifierBookNotes(power.modifiers.find((m) => m.xmlId === xmlId)!, power).map((n) => n.page);

describe('Rules only the book states', () => {
  it("notes Autofire's surcharge on an AVAD attack, until it's paid (6E1 327)", () => {
    expect(notes(on('ENERGYBLAST', [{ xmlId: 'AVAD' }, { xmlId: 'AUTOFIRE' }]), 'AUTOFIRE')).toEqual([327]);
    expect(notes(on('ENERGYBLAST', [{ xmlId: 'AVAD' }, { xmlId: 'AUTOFIRE', adders: [{ xmlId: 'ODDPOWER', baseCost: 1 }] }]), 'AUTOFIRE')).toEqual([]);
    expect(notes(on('ENERGYBLAST', [{ xmlId: 'AUTOFIRE' }]), 'AUTOFIRE')).toEqual([]);
  });

  it('notes Side Effects on a Constant power that Requires A Roll (6E1 395)', () => {
    expect(notes(on('DARKNESS', [{ xmlId: 'REQUIRESASKILLROLL' }, { xmlId: 'SIDEEFFECTS' }]), 'SIDEEFFECTS')).toEqual([395]);
    expect(notes(on('ENERGYBLAST', [{ xmlId: 'REQUIRESASKILLROLL' }, { xmlId: 'SIDEEFFECTS' }]), 'SIDEEFFECTS')).toEqual([]);
  });

  it('notes other combinations the book rules out', () => {
    expect(notes(on('ENERGYBLAST', [{ xmlId: 'AVAD' }, { xmlId: 'PENETRATING' }]), 'PENETRATING')).toEqual([342]);
    const burnout = [{ xmlId: 'CHARGES', optionId: 'ONE' }, { xmlId: 'REQUIRESASKILLROLL', adders: [{ xmlId: 'BURNOUT', baseCost: 0 }] }];
    expect(notes(on('ENERGYBLAST', burnout), 'REQUIRESASKILLROLL')).toEqual([391]);
    expect(notes(on('ENERGYBLAST', [{ xmlId: 'CHARGES', adders: [{ xmlId: 'CONTINUING', baseCost: 1 }] }]), 'CHARGES')).toEqual([369]);
    expect(notes(on('REGENERATION', [{ xmlId: 'UOO' }]), 'UOO')).toEqual([360]);
    expect(notes(on('FLIGHT', [{ xmlId: 'FOCUS', optionId: 'OAF' }, { xmlId: 'RESTRAINABLE' }]), 'RESTRAINABLE')).toEqual([393]);
  });

  it('shows them in the power dialog with their page', () => {
    const xml = blankHdc().replace('<POWERS />', `<POWERS>
      <POWER XMLID="ENERGYBLAST" ID="9300" BASECOST="0.0" LEVELS="8" ALIAS="Blast" POSITION="0" NAME="Bolt" INPUT="ED" QUANTITY="1" />
    </POWERS>`);
    const c = parseHdcFile(xml);
    let draft = addModifier(addModifier(powerDraft(c, 'powers', '9300'), 'AVAD'), 'AUTOFIRE');
    expect(powerFormView(c, 'powers', draft, '9300').modifiers[1]!.bookNotes).toEqual([
      'Autofire on an AVAD or NND attack costs +1 more. Hero Designer and hero6e don\'t add it; tick "Non-Standard Attack Power" to pay it. (6E1 327)',
    ]);
    draft = setModifierAdder(draft, draft.modifiers[1]!.id, 'ODDPOWER', true);
    expect(draft.modifiers[1]!.value).toBe(1.25);
    expect(powerFormView(c, 'powers', draft, '9300').modifiers[1]!.bookNotes).toEqual([]);
  });
});
