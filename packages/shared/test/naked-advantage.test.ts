import { describe, expect, it } from 'vitest';
import {
  HdcDocument,
  addModifier,
  blankHdc,
  modifierProblem,
  parseHdcFile,
  powerCosts,
  powerDraft,
  powerFormView,
  savePowerDraft,
  setModifierOption,
  setModifierPrivate,
  updateHdc,
  type PowerDraft,
} from '../src/index.js';

// Renegade's Quick Shot (6E1 315): Autofire (3 shots; +1/4) for any non-Autofire firearm of up
// to 60 Active Points. 15 points, 1 END; with Reduced Endurance (+1/2) on it, 22 points.
const XML = blankHdc().replace('<POWERS />', `<POWERS>
    <POWER XMLID="NAKEDMODIFIER" ID="9100" BASECOST="0.0" LEVELS="60" ALIAS="Naked Advantage" POSITION="0" NAME="Quick Shot" INPUT="any non-Autofire firearm" QUANTITY="1" />
  </POWERS>`);

const last = (d: PowerDraft) => d.modifiers[d.modifiers.length - 1]!;
const withOption = (d: PowerDraft, xmlId: string, optionId: string) => {
  const added = addModifier(d, xmlId);
  return setModifierOption(added, last(added).id, optionId);
};

describe('Naked advantages (6E1 314-316)', () => {
  it("costs the advantage's value on the Active Points it's for", () => {
    const c = parseHdcFile(XML);
    let shot = withOption(powerDraft(c, 'powers', '9100'), 'AUTOFIRE', 'THREE');
    expect(last(shot).value).toBe(0.25); // no Autofire surcharge on the naked advantage itself
    expect(powerCosts(shot)).toEqual({ base: 15, active: 15, real: 15, end: 1 });

    // Reduced Endurance on the naked advantage itself: 0 END, 22 points
    shot = withOption(shot, 'REDUCEDEND', 'ZERO');
    shot = setModifierPrivate(shot, last(shot).id, true);
    expect(powerCosts(shot)).toEqual({ base: 15, active: 22, real: 22, end: 0 });

    // A Focus on it is a Limitation of the naked advantage (on it by default)
    shot = withOption(shot, 'FOCUS', 'OAF');
    expect(last(shot).private).toBe(true);
    expect(powerCosts(shot).real).toBe(11);
  });

  it('costs no END when it is itself Reduced Endurance', () => {
    const c = parseHdcFile(XML);
    const zero = withOption(powerDraft(c, 'powers', '9100'), 'REDUCEDEND', 'ZERO');
    expect(powerCosts(zero)).toEqual({ base: 30, active: 30, real: 30, end: 0 });
  });

  it('saves and reads back as Hero Designer does (PRIVATE marks the naked advantage\'s own modifiers)', () => {
    const c = parseHdcFile(XML);
    let shot = withOption(powerDraft(c, 'powers', '9100'), 'AUTOFIRE', 'THREE');
    shot = withOption(shot, 'REDUCEDEND', 'ZERO');
    shot = setModifierPrivate(shot, last(shot).id, true);
    const xml = updateHdc(XML, savePowerDraft(c, 'powers', '9100', shot)).xml;
    const mods = HdcDocument.parse(xml).findById('9100')!.elements('MODIFIER');
    expect(mods.map((m) => [m.getAttr('XMLID'), m.getAttr('PRIVATE')])).toEqual([['AUTOFIRE', 'No'], ['REDUCEDEND', 'Yes']]);
    const power = parseHdcFile(xml).powers.find((p) => p.id === '9100')!;
    expect([power.activeCost, power.realCost, power.endCost]).toEqual([22, 22, 0]);
  });

  it('takes any advantage, and the dialog marks which modifiers are on it', () => {
    expect(modifierProblem('HARDENED', { xmlId: 'NAKEDMODIFIER', modifiers: [] })).toBe('');
    const c = parseHdcFile(XML);
    const shot = withOption(powerDraft(c, 'powers', '9100'), 'AUTOFIRE', 'THREE');
    const view = powerFormView(c, 'powers', shot, '9100');
    expect(view.definition?.levelsTitle).toBe('Up to Active Points');
    expect(view.modifiers[0]!.nakedPart).toEqual({ private: false });
  });
});
