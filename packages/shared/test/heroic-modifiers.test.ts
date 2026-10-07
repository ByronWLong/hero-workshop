import { describe, expect, it } from 'vitest';
import { blankHdc, getModifierByXmlId, modifierChoices, parseHdcFile, powerDraft, addModifier, setModifierOption, powerCosts } from '../src/index.js';

// Weapon and armor limitations from Hero Designer's Heroic template, and power-specific ones
const XML = blankHdc().replace('<EQUIPMENT />', `<EQUIPMENT>
    <POWER XMLID="HKA" ID="9900" BASECOST="0.0" LEVELS="1" ALIAS="Killing Attack - Hand-To-Hand" POSITION="0" NAME="Sword" QUANTITY="1" PRICE="10.0" WEIGHT="2.0" CARRIED="Yes">
      <MODIFIER XMLID="REALWEAPON" ID="9901" BASECOST="-0.25" LEVELS="0" ALIAS="Real Weapon" />
      <MODIFIER XMLID="STRMINIMUM" ID="9902" BASECOST="-0.5" LEVELS="0" ALIAS="STR Minimum" OPTION="9-13" OPTIONID="9-13" OPTION_ALIAS="9-13" />
      <MODIFIER XMLID="REQUIREDHANDS" ID="9903" BASECOST="-0.5" LEVELS="0" ALIAS="Required Hands" OPTION="TWO" OPTIONID="TWO" OPTION_ALIAS="Two-Handed" />
    </POWER>
  </EQUIPMENT>`);

describe('heroic and power-specific modifiers', () => {
  it('knows the Heroic template modifiers', () => {
    for (const id of ['REALWEAPON', 'REALARMOR', 'STRMINIMUM', 'REQUIREDHANDS', 'MASS', 'SPELL']) {
      expect(getModifierByXmlId(id)?.isLimitation, id).toBe(true);
    }
    const limits = modifierChoices().limitations.map((l) => l.value);
    expect(limits).toEqual(expect.arrayContaining(['REALWEAPON', 'REALARMOR', 'STRMINIMUM', 'REQUIREDHANDS', 'SPELL']));
    expect(getModifierByXmlId('SPELL')?.baseCost).toBe(-0.5);
  });

  it("offers a power's own modifiers only for that power", () => {
    expect(getModifierByXmlId('HANDTOHANDATTACK')?.isLimitation).toBe(true);
    expect(modifierChoices('HANDTOHANDATTACK').limitations.map((l) => l.value)).toContain('HANDTOHANDATTACK');
    expect(modifierChoices('ENERGYBLAST').limitations.map((l) => l.value)).not.toContain('HANDTOHANDATTACK');
  });

  it('prices a weapon with them as Hero Designer does', () => {
    const c = parseHdcFile(XML);
    const draft = powerDraft(c, 'equipment', '9900');
    expect(draft.modifiers.map((m) => m.value)).toEqual([-0.25, -0.5, -0.5]);
    expect(powerCosts(draft).real).toBe(7); // 15 / (1 + 1.25), rounded
    const added = addModifier({ ...draft, modifiers: [] }, 'REQUIREDHANDS');
    const hands = added.modifiers[0]!;
    expect(hands.value).toBe(-0.5); // Two-Handed, the first option
    expect(setModifierOption(added, hands.id, 'ONEANDAHALF').modifiers[0]!.value).toBe(-0.25);
  });
});

describe("a power's own definition of a modifier", () => {
  it("uses Drain's Costs Endurance (to maintain), not the general one with Full/Half options", () => {
    expect(modifierChoices('DRAIN').limitations).toContainEqual({ value: 'COSTSENDTOMAINTAIN', label: 'Costs Endurance (to maintain)' });
    expect(modifierChoices().limitations.find((l) => l.value === 'COSTSENDTOMAINTAIN')?.label).toBe('Costs END To Maintain');
    const xml = blankHdc().replace('<POWERS />', `<POWERS>
    <POWER XMLID="DRAIN" ID="9950" BASECOST="0.0" LEVELS="4" ALIAS="Drain" POSITION="0" NAME="Ward" INPUT="Magic" QUANTITY="1" />
  </POWERS>`);
    const c = parseHdcFile(xml);
    const draft = addModifier(powerDraft(c, 'powers', '9950'), 'COSTSENDTOMAINTAIN');
    expect(draft.modifiers[0]).toMatchObject({ value: -0.5, optionId: undefined, name: 'Costs Endurance (to maintain)' });
    expect(powerCosts(draft).real).toBe(27); // 40 / 1.5
  });
});

describe('Area Of Effect', () => {
  it("prices each doubling of the area at +1/4, as Hero Designer's 6E template does", async () => {
    const { aoeValue } = await import('../src/index.js');
    expect([1, 4, 7, 8, 12, 16, 32, 64].map((m) => aoeValue('RADIUS', m))).toEqual([0.25, 0.25, 0.5, 0.5, 0.75, 0.75, 1, 1.25]);
    expect([8, 16, 32].map((m) => aoeValue('CONE', m))).toEqual([0.25, 0.5, 0.75]);
    expect([16, 32, 64].map((m) => aoeValue('LINE', m))).toEqual([0.25, 0.5, 0.75]);
    expect([2, 4, 8].map((m) => aoeValue('SURFACE', m))).toEqual([0.25, 0.5, 0.75]);
  });
});
