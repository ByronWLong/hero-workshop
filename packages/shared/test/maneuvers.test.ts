import { describe, expect, it } from 'vitest';
import { HdcDocument, blankHdc, createHdc, maneuverEffect, parseHdcFile, repairForFoundry, validateForFoundry } from '../src/index.js';

const base = () => parseHdcFile(blankHdc());

describe('custom martial maneuvers', () => {
  it('are written as Hero Designer writes them, with a CATEGORY hero6e needs to draw the sheet', () => {
    const character = {
      ...base(),
      martialArts: [{ id: 'new-1', name: 'Cut', ocv: 2, dcv: 1, phase: '1/2', dc: 0, baseCost: 3, realCost: 3, effectText: 'Strike', position: 0, levels: 0 }],
    };
    const { xml } = createHdc(character);
    const el = HdcDocument.parse(xml).section('MARTIALARTS')!.elements()[0]!;
    expect(el.getAttr('CATEGORY')).toBe('Hand to Hand');
    expect(el.getAttr('ALIAS')).toBe('Cut');
    expect(el.getAttr('EFFECT')).toBe('[NORMALDC] Strike');
    expect(el.getAttr('WEAPONEFFECT')).toBe('[NORMALDC] Strike');
    expect(el.getAttr('USEWEAPON')).toBe('No');
    expect(parseHdcFile(xml).martialArts[0]!.effectText).toBe('[NORMALDC] Strike');
    expect(validateForFoundry(HdcDocument.parse(xml)).filter((i) => /maneuver/.test(i.message))).toEqual([]);
  });

  it('get the damage tokens hero6e rolls', () => {
    expect(maneuverEffect('Strike')).toBe('[NORMALDC] Strike');
    expect(maneuverEffect('+v/5 Strike')).toBe('[NORMALDC] +v/5 Strike');
    expect(maneuverEffect('HKA 2 DC; Affects Desolidified')).toBe('[KILLINGDC], Affects Desolidified');
    expect(maneuverEffect('Killing Strike')).toBe('[KILLINGDC]');
    expect(maneuverEffect('Grab Two Limbs')).toBe('Grab Two Limbs, [STRDC] for holding on');
    expect(maneuverEffect('Dodge, +5 DCV')).toBe('Dodge, +5 DCV');
    expect(maneuverEffect('[NORMALDC] Crush')).toBe('[NORMALDC] Crush');
  });

  it('without a CATEGORY are repaired to Hand to Hand', () => {
    const xml = blankHdc().replace(
      '<MARTIALARTS />',
      `<MARTIALARTS>
    <MANEUVER XMLID="MANEUVER" ID="900" BASECOST="3.0" LEVELS="0" ALIAS="Cut" POSITION="0" NAME="" CUSTOM="Yes" DISPLAY="Cut" OCV="+2" DCV="+1" PHASE="1/2" DC="0" EFFECT="" />
  </MARTIALARTS>`,
    );
    expect(validateForFoundry(HdcDocument.parse(xml)).some((i) => /without CATEGORY/.test(i.message))).toBe(true);
    const repaired = repairForFoundry(xml);
    expect(HdcDocument.parse(repaired.xml).findById('900')!.getAttr('CATEGORY')).toBe('Hand to Hand');
  });
});

describe('characteristic rolls', () => {
  it('name just the characteristic hero6e rolls against', () => {
    const xml = blankHdc().replace(
      '<POWERS />',
      `<POWERS>
    <POWER XMLID="DETECT" ID="930" BASECOST="3.0" LEVELS="0" ALIAS="Detect" POSITION="0" NAME="Sense Network">
      <MODIFIER XMLID="REQUIRESASKILLROLL" ID="931" BASECOST="-0.5" LEVELS="0" ALIAS="Requires A Roll" POSITION="-1" OPTION="CHAR" OPTIONID="CHAR" OPTION_ALIAS="EGO Roll" COMMENTS="EGO roll" />
    </POWER>
  </POWERS>`,
    );
    expect(validateForFoundry(HdcDocument.parse(xml)).some((i) => /should be just "EGO"/.test(i.message))).toBe(true);
    const repaired = repairForFoundry(xml).xml;
    expect(HdcDocument.parse(repaired).findById('931')!.getAttr('COMMENTS')).toBe('EGO');
    expect(validateForFoundry(HdcDocument.parse(repaired)).filter((i) => /Requires A Roll/.test(i.message))).toEqual([]);
  });
});

describe('sense groups and Life Support', () => {
  it("repairs Invisibility without its Sense Group and Hero Workshop's old Self-Contained Breathing adder", () => {
    const xml = blankHdc().replace(
      '<POWERS />',
      `<POWERS>
    <POWER XMLID="INVISIBILITY" ID="910" BASECOST="20.0" LEVELS="0" ALIAS="Invisibility" POSITION="0" NAME="Hide" />
    <POWER XMLID="LIFESUPPORT" ID="920" BASECOST="0.0" LEVELS="0" ALIAS="Life Support" POSITION="1" NAME="Breath">
      <ADDER XMLID="SELFCONTAINED" ID="921" BASECOST="10.0" LEVELS="0" ALIAS="Self-Contained Breathing" POSITION="-1" />
    </POWER>
  </POWERS>`,
    );
    expect(validateForFoundry(HdcDocument.parse(xml)).some((i) => /Sense Group/.test(i.message))).toBe(true);
    const doc = HdcDocument.parse(repairForFoundry(xml).xml);
    expect(doc.findById('910')!.getAttr('OPTION_ALIAS')).toBe('Sight Group');
    expect(doc.findById('921')!.getAttr('XMLID')).toBe('SELFCONTAINEDBREATHING');
  });
});
