import { describe, expect, it } from 'vitest';
import {
  HdcDocument,
  addModifier,
  blankHdc,
  modifierChoices,
  parseHdcFile,
  powerCosts,
  powerDraft,
  powerEndCost,
  powerFormView,
  removeModifier,
  savePowerDraft,
  setModifierAdder,
  setModifierLink,
  setModifierOption,
  updateHdc,
  type PowerDraft,
} from '../src/index.js';

const XML = blankHdc().replace('<POWERS />', `<POWERS>
    <POWER XMLID="ENERGYBLAST" ID="9500" BASECOST="0.0" LEVELS="8" ALIAS="Blast" POSITION="0" NAME="Bolt" INPUT="ED" QUANTITY="1" />
    <POWER XMLID="DRAIN" ID="9501" BASECOST="0.0" LEVELS="2" ALIAS="Drain" POSITION="1" NAME="Sap" INPUT="STR" QUANTITY="1" />
    <POWER XMLID="EGOATTACK" ID="9502" BASECOST="0.0" LEVELS="2" ALIAS="Mental Blast" POSITION="2" NAME="Mindbolt" QUANTITY="1" />
    <POWER XMLID="DARKNESS" ID="9503" BASECOST="0.0" LEVELS="2" ALIAS="Darkness" POSITION="3" NAME="Gloom" OPTIONID="SIGHTGROUP" QUANTITY="1" />
    <POWER XMLID="FORCEFIELD" ID="9504" BASECOST="0.0" PDLEVELS="10" EDLEVELS="10" ALIAS="Resistant Protection" POSITION="4" NAME="Ward" QUANTITY="1" />
  </POWERS>`);

const character = () => parseHdcFile(XML);
const draftOf = (id: string) => powerDraft(character(), 'powers', id);
const last = (d: PowerDraft) => d.modifiers[d.modifiers.length - 1]!;
const withOption = (d: PowerDraft, xmlId: string, optionId: string) => {
  const added = addModifier(d, xmlId);
  return setModifierOption(added, last(added).id, optionId);
};

describe('Autofire (6E1 327)', () => {
  it('costs +1 more on attacks that need no normal Attack Roll or defense', () => {
    expect(last(withOption(draftOf('9500'), 'AUTOFIRE', 'THREE')).value).toBe(0.25); // Blast
    expect(last(withOption(draftOf('9501'), 'AUTOFIRE', 'THREE')).value).toBe(1.25); // Drain
    expect(last(withOption(draftOf('9502'), 'AUTOFIRE', 'THREE')).value).toBe(1.25); // Mental Blast
    // An Area Of Effect Blast, whichever modifier comes first
    const area = withOption(addModifier(draftOf('9500'), 'AOE'), 'AUTOFIRE', 'THREE');
    expect(last(area).value).toBe(1.25);
    expect(removeModifier(area, area.modifiers[0]!.id).modifiers[0]!.value).toBe(0.25);
  });

  it("doesn't charge twice when the Non-Standard Attack Power adder pays it", () => {
    let drain = withOption(draftOf('9501'), 'AUTOFIRE', 'THREE');
    drain = setModifierAdder(drain, last(drain).id, 'ODDPOWER', true);
    expect(last(drain).value).toBe(1.25);
  });

  it('doubles Reduced Endurance on an Autofire power', () => {
    let blast = withOption(draftOf('9500'), 'REDUCEDEND', 'ZERO');
    expect(blast.modifiers[0]!.value).toBe(0.5);
    blast = withOption(blast, 'AUTOFIRE', 'FIVE');
    expect(blast.modifiers[0]!.value).toBe(1); // 0 END on an Autofire power is +1
    expect(removeModifier(blast, last(blast).id).modifiers[0]!.value).toBe(0.5);
  });

  it('reads files the same way', () => {
    const xml = XML.replace(
      '<POWER XMLID="DRAIN" ID="9501" BASECOST="0.0" LEVELS="2" ALIAS="Drain" POSITION="1" NAME="Sap" INPUT="STR" QUANTITY="1" />',
      `<POWER XMLID="DRAIN" ID="9501" BASECOST="0.0" LEVELS="2" ALIAS="Drain" POSITION="1" NAME="Sap" INPUT="STR" QUANTITY="1">
        <MODIFIER XMLID="AUTOFIRE" ID="9601" BASECOST="0.5" LEVELS="0" ALIAS="Autofire" OPTION="FIVE" OPTIONID="FIVE" OPTION_ALIAS="5 Shots" />
        <MODIFIER XMLID="REDUCEDEND" ID="9602" BASECOST="0.5" LEVELS="0" ALIAS="Reduced Endurance" OPTION="ZERO" OPTIONID="ZERO" OPTION_ALIAS="0 END" />
      </POWER>`,
    );
    const drain = parseHdcFile(xml).powers.find((p) => p.id === '9501')!;
    expect(drain.modifiers!.map((m) => m.value)).toEqual([1.5, 1]);
  });
});

describe('Increased Endurance Cost (6E1 345)', () => {
  it('is worth half on a power that Costs END Only To Activate', () => {
    let gloom = withOption(draftOf('9503'), 'INCREASEDEND', '2X');
    expect(gloom.modifiers[0]!.value).toBe(-0.5);
    gloom = addModifier(gloom, 'COSTSENDONLYTOACTIVATE');
    expect(gloom.modifiers[0]!.value).toBe(-0.25);
  });
});

describe('Time Limit (6E1 346)', () => {
  it("takes its table from the power's duration", () => {
    // An Instant Blast: an Advantage from +1/4 for an Extra Phase
    let blast = addModifier(draftOf('9500'), 'TIMELIMIT');
    expect(last(blast)).toMatchObject({ optionId: 'EXTRAPHASE', value: 0.25 });
    blast = setModifierOption(blast, last(blast).id, '1MINUTE');
    expect(last(blast).value).toBe(0.75);

    // Constant Darkness: +1/4 for a Turn
    expect(last(addModifier(draftOf('9503'), 'TIMELIMIT'))).toMatchObject({ optionId: '1TURN', value: 0.25 });

    // Persistent Resistant Protection: a Limitation, listed with them
    expect(modifierChoices('FORCEFIELD').limitations.map((c) => c.value)).toContain('TIMELIMIT');
    expect(modifierChoices('ENERGYBLAST').advantages.map((c) => c.value)).toContain('TIMELIMIT');
    let ward = addModifier(draftOf('9504'), 'TIMELIMIT');
    ward = setModifierOption(ward, last(ward).id, '1HOUR');
    expect(last(ward)).toMatchObject({ value: -0.75, isLimitation: true });
  });

  it('saves the option and its cost as Hero Designer does', () => {
    let blast = addModifier(draftOf('9500'), 'TIMELIMIT');
    blast = setModifierOption(blast, last(blast).id, '1MINUTE');
    const xml = updateHdc(XML, savePowerDraft(character(), 'powers', '9500', blast)).xml;
    const mod = HdcDocument.parse(xml).findById('9500')!.elements('MODIFIER')[0]!;
    expect([mod.getAttr('XMLID'), mod.getAttr('OPTIONID'), mod.getAttr('BASECOST')]).toEqual(['TIMELIMIT', '1MINUTE', '0.75']);
    expect(parseHdcFile(xml).powers.find((p) => p.id === '9500')!.modifiers![0]!.value).toBe(0.75);
  });
});

describe('Linked (6E1 383)', () => {
  it('is -1/2 linked to a greater power, -1/4 to a lesser one', () => {
    const c = character();
    // Drain 2d6 (20 AP) linked to the Blast 8d6 (40 AP)
    let drain = addModifier(draftOf('9501'), 'LINKED');
    expect(powerFormView(c, 'powers', drain, '9501').modifiers[0]!.linkChoices?.map((o) => o.value)).toEqual(['9500', '9502', '9503', '9504']);
    drain = setModifierLink(drain, drain.modifiers[0]!.id, '9500', c);
    expect(drain.modifiers[0]).toMatchObject({ linkedId: '9500', value: -0.5 });

    // The Blast linked to the Drain
    let blast = addModifier(draftOf('9500'), 'LINKED');
    blast = setModifierLink(blast, blast.modifiers[0]!.id, '9501', c);
    expect(blast.modifiers[0]).toMatchObject({ linkedToLesser: true, value: -0.25 });

    const xml = updateHdc(XML, savePowerDraft(c, 'powers', '9500', blast)).xml;
    const mod = HdcDocument.parse(xml).findById('9500')!.elements('MODIFIER')[0]!;
    expect([mod.getAttr('BASECOST'), mod.getAttr('LINKED_ID')]).toEqual(['-0.25', '9501']);
    expect(parseHdcFile(xml).powers.find((p) => p.id === '9500')!.modifiers![0]).toMatchObject({ linkedId: '9501', linkedToLesser: true, value: -0.25 });
  });
});

describe('END cost (GenericObject.getEndUsage)', () => {
  const end = (d: PowerDraft) => powerCosts(d).end;

  it('is 1 per 10 Active Points, halves rounding down, at least 1', () => {
    expect(end(draftOf('9500'))).toBe(4); // Blast 8d6, 40 AP
    expect(powerEndCost(65, true, [])).toBe(6);
    expect(powerEndCost(66, true, [])).toBe(7);
    expect(powerEndCost(3, true, [])).toBe(1);
    expect(end(draftOf('9504'))).toBe(0); // Resistant Protection costs no END
  });

  it('follows Reduced Endurance, leaving the half END advantage out (6E1 345)', () => {
    // Blast 10d6, Reduced Endurance (1/2 END): 62 Active Points, but 5 END before halving: 2 END
    const halfEnd = [{ xmlId: 'REDUCEDEND', optionId: 'HALFEND', value: 0.25 }];
    expect(powerEndCost(50, true, halfEnd)).toBe(2);
    expect(end(withOption(draftOf('9500'), 'REDUCEDEND', 'ZERO'))).toBe(0);
  });

  it('follows Charges, Costs Endurance and Increased Endurance Cost', () => {
    expect(end(withOption(draftOf('9500'), 'CHARGES', 'EIGHT'))).toBe(0);
    expect(end(addModifier(withOption(draftOf('9500'), 'CHARGES', 'EIGHT'), 'COSTSEND'))).toBe(4);
    // A 0-END power (Mental Defense 20 points) that Costs Endurance, or half of it
    expect(powerEndCost(20, false, [{ xmlId: 'COSTSEND', optionId: 'EVERYPHASE', value: -0.5 }])).toBe(2);
    expect(powerEndCost(20, false, [{ xmlId: 'COSTSEND', optionId: 'HALFEND', value: -0.25 }])).toBe(1);
    expect(end(withOption(draftOf('9500'), 'INCREASEDEND', '3X'))).toBe(12);
  });
});
