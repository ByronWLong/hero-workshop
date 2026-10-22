import { describe, expect, it } from 'vitest';
import {
  HdcDocument,
  addModifier,
  blankHdc,
  getModifierByXmlId,
  modifierAdders,
  parseHdcFile,
  powerDraft,
  powerFormView,
  savePowerDraft,
  setModifierAdder,
  setModifierAdderLevels,
  setModifierAdderOption,
  setModifierOption,
  updateHdc,
} from '../src/index.js';

const XML = blankHdc().replace('<POWERS />', `<POWERS>
    <POWER XMLID="ENERGYBLAST" ID="9800" BASECOST="0.0" LEVELS="8" ALIAS="Blast" POSITION="0" NAME="Bolt" INPUT="ED" QUANTITY="1" />
    <POWER XMLID="LIFESUPPORT" ID="9801" BASECOST="0.0" LEVELS="0" ALIAS="Life Support" POSITION="1" NAME="Air Tank" QUANTITY="1" />
  </POWERS>`);

const ids = (list: { xmlId: string }[]) => list.map((a) => a.xmlId);

describe('Modifier data from the template', () => {
  it('gives each option its own adders', () => {
    const aoe = getModifierByXmlId('AOE');
    expect(ids(modifierAdders(aoe, 'RADIUS'))).toEqual(['EXPLOSION', 'NONSELECTIVETARGET', 'SELECTIVETARGET', 'MOBILE', 'ACCURATE']);
    expect(ids(modifierAdders(aoe, 'CONE'))).toContain('THINCONE');
    expect(ids(modifierAdders(aoe, 'CONE'))).not.toContain('ACCURATE');
    expect(ids(modifierAdders(aoe, 'ANY'))).toContain('FIXEDSHAPE');
    expect(ids(modifierAdders(getModifierByXmlId('AUTOFIRE'), 'FIVE'))).toContain('DOUBLE');
    expect(ids(modifierAdders(getModifierByXmlId('AUTOFIRE'), 'THREE'))).not.toContain('DOUBLE');
    expect(ids(modifierAdders(getModifierByXmlId('EXTRATIME'), 'FULL'))).toContain('DELAYEDPHASE');
    expect(ids(modifierAdders(getModifierByXmlId('EXTRATIME'), 'TURN'))).toContain('NOOTHERACTIONS');
  });

  it('is no longer hidden behind hand-written copies', () => {
    expect(ids(getModifierByXmlId('CHARGES')!.adders!)).toEqual([
      'CLIPS', 'INCREASEDRELOAD', 'CONTINUING', 'FUEL', 'DIFFICULTFUEL', 'VERYDIFFICULTFUEL', 'EXTREMELYDIFFICULTFUEL',
      'BOOSTABLE', 'RECOVERABLE', 'INCREASEDTIME', 'NEVERRECOVER', 'LIMITEDRECOVER',
    ]);
    expect(ids(getModifierByXmlId('REQUIRESASKILLROLL')!.adders!)).toEqual(['BURNOUT', 'JAMMED', 'CHOOSE', 'EVERYPHASE']);
    expect(ids(getModifierByXmlId('TRIGGER')!.adders!)).toContain('MISFIRE');
    expect(ids(getModifierByXmlId('SIDEEFFECTS')!.adders!)).toContain('AFTERUSE');
    expect(ids(getModifierByXmlId('DAMAGEOVERTIME')!.adders!)).toEqual(['INCREMENTS', 'TIMEBETWEEN']);
    expect(ids(getModifierByXmlId('UOO')!.options!)).toEqual(['UBO', 'SIMULTANEOUSLY', 'UNB', 'UAA']);
    expect(ids(getModifierByXmlId('GESTURES')!.subModifiers!)).toEqual(['THROUGHOUT']);
    // Hero Designer's option name is stored; the fuller one is for choosing
    expect(getModifierByXmlId('FOCUS')!.options!.find((o) => o.xmlId === 'OAF')).toMatchObject({ display: 'OAF', label: 'Obvious Accessible Focus (OAF)' });
    expect(getModifierByXmlId('EXPANDEDEFFECT')).toMatchObject({ display: 'Expanded Effect', isAdvantage: true });
  });
});

describe('Modifier adders in the editor', () => {
  const blast = () => powerDraft(parseHdcFile(XML), 'powers', '9800');

  it('adds the adders a modifier requires (Damage Over Time: increments and time between)', () => {
    const draft = addModifier(blast(), 'DAMAGEOVERTIME');
    const dot = draft.modifiers[0]!;
    expect(dot.adders?.map((a) => [a.xmlId, a.optionId])).toEqual([['INCREMENTS', '2'], ['TIMEBETWEEN', 'SEGMENT']]);
    expect(dot.value).toBe(3.25); // +1, 2 increments +1/4, every Segment +2

    // 5 increments every Minute: +1 +1 -1/2
    let next = setModifierAdderOption(draft, dot.id, 'INCREMENTS', '6');
    next = setModifierAdderOption(next, dot.id, 'TIMEBETWEEN', 'MINUTE');
    expect(next.modifiers[0]!.value).toBe(1.5);
    // Required adders can't be turned off
    expect(setModifierAdderOption(next, dot.id, 'TIMEBETWEEN', '').modifiers[0]!.adders).toHaveLength(2);

    const row = powerFormView(parseHdcFile(XML), 'powers', next, '9800').modifiers[0]!;
    expect(row.adderChoices.map((a) => [a.value, a.kind, a.required])).toEqual([['INCREMENTS', 'select', true], ['TIMEBETWEEN', 'select', true]]);
  });

  it("drops an option's adders when the option changes", () => {
    let draft = addModifier(blast(), 'AOE');
    const aoe = draft.modifiers[0]!;
    draft = setModifierAdder(draft, aoe.id, 'ACCURATE', true);
    draft = setModifierAdder(draft, aoe.id, 'SELECTIVETARGET', true);
    expect(draft.modifiers[0]!.value).toBe(0.75);
    draft = setModifierOption(draft, aoe.id, 'CONE');
    expect(draft.modifiers[0]!.adders?.map((a) => a.xmlId)).toEqual(['SELECTIVETARGET']);
  });

  it('swaps excluded adders and adds required ones', () => {
    let draft = addModifier(blast(), 'UOO');
    const uoo = draft.modifiers[0]!;
    draft = setModifierAdder(draft, uoo.id, 'GRANTORTAKEBACK', true);
    // Grantor controls the power totally: excludes "can take back", requires "pays the END"
    draft = setModifierAdder(draft, uoo.id, 'TOTALCONTROL', true);
    expect(draft.modifiers[0]!.adders?.map((a) => a.xmlId)).toEqual(['TOTALCONTROL', 'GRANTORPAYSEND']);
    expect(draft.modifiers[0]!.value).toBe(0.5); // 1/4 + 1/2 - 1/4
    // Turning off what it requires turns it off too
    draft = setModifierAdder(draft, uoo.id, 'GRANTORPAYSEND', false);
    expect(draft.modifiers[0]!.adders).toEqual([]);
  });

  it('prices leveled adders (Autofire x2 shots)', () => {
    let draft = addModifier(blast(), 'AUTOFIRE');
    const af = draft.modifiers[0]!;
    draft = setModifierOption(draft, af.id, 'FIVE');
    draft = setModifierAdderLevels(draft, af.id, 'DOUBLE', 2);
    expect(draft.modifiers[0]!.value).toBe(1.5); // 5 shots +1/2, x4 shots +1
    expect(draft.modifiers[0]!.adders?.[0]).toMatchObject({ alias: 'x4 Shots', levels: 2, lvlCost: 0.5 });
    expect(setModifierAdderLevels(draft, af.id, 'DOUBLE', 0).modifiers[0]!.value).toBe(0.5);
  });
});

describe('Charges', () => {
  it('prices Continuing, Recoverable and Boostable by rows of the Charges Table', () => {
    let draft = addModifier(powerDraft(parseHdcFile(XML), 'powers', '9800'), 'CHARGES');
    const charges = draft.modifiers[0]!;
    expect(charges).toMatchObject({ optionId: 'ONE', value: -2 });

    // 1 Charge lasting 1 Minute: three rows down, as Hero Designer saves it (+1)
    draft = setModifierAdderOption(draft, charges.id, 'CONTINUING', 'MINUTE');
    expect(draft.modifiers[0]!.adders?.[0]?.baseCost).toBe(1);
    expect(draft.modifiers[0]!.value).toBe(-1);

    // 12 Recoverable Charges: two rows down (+1/2), so +1/4 in all
    draft = setModifierAdderOption(draft, charges.id, 'CONTINUING', '');
    draft = setModifierOption(draft, charges.id, 'TWELVE');
    draft = setModifierAdder(draft, charges.id, 'RECOVERABLE', true);
    expect(draft.modifiers[0]!.adders?.[0]?.baseCost).toBe(0.5);
    expect(draft.modifiers[0]!.value).toBe(0.25);

    // Boostable moves it another row: 32 -> 64 (+1/4)
    draft = setModifierAdder(draft, charges.id, 'BOOSTABLE', true);
    expect(draft.modifiers[0]!.value).toBe(0.5);
  });

  it('caps Charges at +1, or -0 on a power that costs no END (6E1 368)', () => {
    let blast = addModifier(powerDraft(parseHdcFile(XML), 'powers', '9800'), 'CHARGES');
    blast = setModifierOption(blast, blast.modifiers[0]!.id, 'SIXTEENTHOUSAND');
    expect(blast.modifiers[0]!.value).toBe(1);

    let tank = addModifier(powerDraft(parseHdcFile(XML), 'powers', '9801'), 'CHARGES');
    tank = setModifierOption(tank, tank.modifiers[0]!.id, 'SIXTYFOUR');
    expect(tank.modifiers[0]!.value).toBe(0);

    // Reduced Endurance (0 END) means the Blast no longer costs END either
    blast = addModifier(blast, 'REDUCEDEND');
    blast = setModifierOption(blast, blast.modifiers[1]!.id, 'ZERO');
    expect(blast.modifiers[0]!.value).toBe(0);
  });

  it('saves as Hero Designer does: the option cost, and the adder at its computed cost', () => {
    const c = parseHdcFile(XML);
    let draft = addModifier(powerDraft(c, 'powers', '9800'), 'CHARGES');
    draft = setModifierAdderOption(draft, draft.modifiers[0]!.id, 'CONTINUING', 'MINUTE');
    const xml = updateHdc(XML, savePowerDraft(c, 'powers', '9800', draft)).xml;
    const mod = HdcDocument.parse(xml).findById('9800')!.elements('MODIFIER')[0]!;
    expect([mod.getAttr('BASECOST'), mod.getAttr('OPTIONID'), mod.getAttr('OPTION_ALIAS')]).toEqual(['-2.0', 'ONE', '1']);
    expect(mod.elements('ADDER').map((a) => [a.getAttr('XMLID'), a.getAttr('BASECOST'), a.getAttr('OPTIONID')])).toEqual([['CONTINUING', '1.0', 'MINUTE']]);
    expect(parseHdcFile(xml).powers.find((p) => p.id === '9800')!.modifiers![0]!.value).toBe(-1);
  });
});
