import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  HdcDocument,
  addModifier,
  blankHdc,
  decodeHdcBytes,
  parseHdcFile,
  powerDraft,
  powerFormView,
  savePowerDraft,
  setModifierAdder,
  setModifierAdderOption,
  setModifierOption,
  setModifierSubModifier,
  updateHdc,
  type Power,
} from '../src/index.js';

const XML = blankHdc().replace('<POWERS />', `<POWERS>
    <POWER XMLID="ENERGYBLAST" ID="9900" BASECOST="0.0" LEVELS="8" ALIAS="Blast" POSITION="0" NAME="Bolt" INPUT="ED" QUANTITY="1" />
    <POWER XMLID="FORCEFIELD" ID="9901" BASECOST="0.0" PDLEVELS="10" EDLEVELS="10" ALIAS="Resistant Protection" POSITION="1" NAME="Ward" QUANTITY="1" />
  </POWERS>`);

const all = (items: Power[]): Power[] => items.flatMap((p) => [p, ...all((p.subPowers ?? []) as Power[])]);

describe("Modifiers' own modifiers", () => {
  it("reads them as Hero Designer prices them (its Skralk export)", () => {
    const skralk = parseHdcFile(decodeHdcBytes(readFileSync(resolve(__dirname, '../../../samples/SkralkSkekMal.hdc'))));
    const items = all([...skralk.powers, ...(skralk.equipment ?? [])] as Power[]);
    // "Extra Time (1 Turn (Post-Segment 12), Only to Activate, -3/4) (Real Cost: 12)"
    const blade = items.find((p) => /superheat blade/.test(p.name))!;
    expect(blade.modifiers?.[0]).toMatchObject({ xmlId: 'EXTRATIME', value: -0.75, name: 'Extra Time (1 Turn (Post-Segment 12)), Only to Activate' });
    // (Hero Designer shows its Real Cost as 12, from 22 / 1 3/4 = 12.57; Custom Power rounding is
    // a separate question)
    // "Concentration, Must Concentrate throughout use of Constant Power (1/2 DCV; -1/2)"
    const mending = items.find((p) => p.name === 'Mending')!;
    expect(mending.modifiers?.find((m) => m.xmlId === 'CONCENTRATION')?.value).toBe(-0.5);
    expect(mending.realCost).toBe(4);
  });

  it('offers "throughout" only on powers that last, and doubles Gestures with it (6E1 381)', () => {
    const c = parseHdcFile(XML);
    // An Instant Blast can't take Gestures throughout
    const blast = addModifier(powerDraft(c, 'powers', '9900'), 'GESTURES');
    expect(powerFormView(c, 'powers', blast, '9900').modifiers[0]!.subChoices).toEqual([]);

    let ward = addModifier(powerDraft(c, 'powers', '9901'), 'GESTURES');
    const gestures = ward.modifiers[0]!;
    expect(powerFormView(c, 'powers', ward, '9901').modifiers[0]!.subChoices).toEqual([
      { value: 'THROUGHOUT', label: 'Requires Gestures throughout', cost: 'x2', checked: false },
    ]);
    ward = setModifierSubModifier(ward, gestures.id, 'THROUGHOUT', true);
    expect(ward.modifiers[0]).toMatchObject({ value: -0.5, name: 'Gestures, throughout' });
    // Both hands applies before the doubling: (-1/4 - 1/4) x 2
    ward = setModifierAdder(ward, gestures.id, 'BOTHHAND', true);
    expect(ward.modifiers[0]!.value).toBe(-1);

    // Saved as Hero Designer saves it: Gestures at its own cost, "throughout" a MODIFIER inside it
    const xml = updateHdc(XML, savePowerDraft(c, 'powers', '9901', ward)).xml;
    const mod = HdcDocument.parse(xml).findById('9901')!.elements('MODIFIER')[0]!;
    expect(mod.getAttr('BASECOST')).toBe('-0.25');
    expect(mod.elements('MODIFIER').map((m) => [m.getAttr('XMLID'), m.getAttr('BASECOST')])).toEqual([['THROUGHOUT', '1.0']]);
    expect(parseHdcFile(xml).powers.find((p) => p.id === '9901')!.modifiers![0]!.value).toBe(-1);

    // Turning it off again removes the element
    const back = powerDraft(parseHdcFile(xml), 'powers', '9901');
    const off = setModifierSubModifier(back, back.modifiers[0]!.id, 'THROUGHOUT', false);
    expect(off.modifiers[0]!.value).toBe(-0.5);
    const xml2 = updateHdc(xml, savePowerDraft(parseHdcFile(xml), 'powers', '9901', off)).xml;
    expect(HdcDocument.parse(xml2).findById('9901')!.elements('MODIFIER')[0]!.elements('MODIFIER')).toHaveLength(0);
  });

  it('halves Extra Time that is only to activate, to the nearest 1/4 (6E1 375)', () => {
    let draft = addModifier(powerDraft(parseHdcFile(XML), 'powers', '9901'), 'EXTRATIME');
    const et = draft.modifiers[0]!;
    draft = setModifierOption(draft, et.id, 'TURN');
    draft = setModifierSubModifier(draft, et.id, 'ACTIVATEONLY', true);
    expect(draft.modifiers[0]!.value).toBe(-0.75); // -1 1/4 halved
    draft = setModifierOption(draft, et.id, 'PHASE');
    expect(draft.modifiers[0]!.value).toBe(-0.25); // never below -1/4
  });

  it("applies Damage Over Time's own rules (6E1 330)", () => {
    // Acid: 3 increments, one per Turn, defenses only apply once: +2
    let draft = addModifier(powerDraft(parseHdcFile(XML), 'powers', '9900'), 'DAMAGEOVERTIME');
    const dot = draft.modifiers[0]!;
    draft = setModifierAdderOption(draft, dot.id, 'INCREMENTS', '3');
    draft = setModifierAdderOption(draft, dot.id, 'TIMEBETWEEN', 'TURN');
    expect(draft.modifiers[0]!.value).toBe(1.5);
    draft = setModifierSubModifier(draft, dot.id, 'ONEDEFENSE', true);
    expect(draft.modifiers[0]!.value).toBe(2);
    // Lock out doubles a "less Advantage" time value: every 5 Minutes -1 becomes -2
    draft = setModifierAdderOption(draft, dot.id, 'TIMEBETWEEN', '5MINUTES');
    draft = setModifierSubModifier(draft, dot.id, 'LOCKOUT', true);
    expect(draft.modifiers[0]!.value).toBe(0); // 1 + 1/2 x 2 - 1 x 2
  });

  it('doubles Side Effects that always occur (6E1 395)', () => {
    let draft = addModifier(powerDraft(parseHdcFile(XML), 'powers', '9900'), 'SIDEEFFECTS');
    draft = setModifierSubModifier(draft, draft.modifiers[0]!.id, 'ALWAYSOCCURS', true);
    expect(draft.modifiers[0]!.value).toBe(-0.5);
  });
});
