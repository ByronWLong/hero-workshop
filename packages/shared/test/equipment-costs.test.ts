import { describe, expect, it } from 'vitest';
import { blankHdc, parseHdcFile } from '../src/index.js';

// A Barrier: 9 rPD/9 rED (27), 40m long (39), 4m high (3), 10 BODY (10), plus the base 3 = 82
const BARRIER = (id: string, position: number) =>
  `<POWER XMLID="FORCEWALL" ID="${id}" BASECOST="3.0" LEVELS="0" ALIAS="Barrier" POSITION="${position}" NAME="Fence" PDLEVELS="9" EDLEVELS="9" MDLEVELS="0" POWDLEVELS="0" BODYLEVELS="10" LENGTHLEVELS="39" HEIGHTLEVELS="3" WIDTHLEVELS="0">
      <MODIFIER XMLID="FOCUS" ID="${id}1" BASECOST="-1.0" LEVELS="0" ALIAS="Focus" OPTION="OAF" OPTIONID="OAF" />
    </POWER>`;

const FILE = blankHdc()
  .replace('<POWERS />', `<POWERS>\n    ${BARRIER('9300', 0)}\n  </POWERS>`)
  .replace(
    '<EQUIPMENT />',
    `<EQUIPMENT>
    ${BARRIER('9310', 0)}
    <INT XMLID="INT" ID="9320" BASECOST="0.0" LEVELS="-5" ALIAS="INT" POSITION="1" NAME="Dull Helm" />
  </EQUIPMENT>`,
  );

// +3 Combat Skill Levels with all attacks (30), Usable By Others (+¼) and an OAF (-1)
const CSL = (id: string, position: number) =>
  `<SKILL XMLID="COMBAT_LEVELS" ID="${id}" BASECOST="0.0" LEVELS="3" ALIAS="Combat Skill Levels" POSITION="${position}" OPTION="ALL" OPTIONID="ALL" OPTION_ALIAS="with all attacks" NAME="Inspire" CHARACTERISTIC="GENERAL" FAMILIARITY="No" PROFICIENCY="No" LEVELSONLY="No" EVERYMAN="No">
      <MODIFIER XMLID="UOO" ID="${id}1" BASECOST="0.25" LEVELS="0" ALIAS="Usable On Others" OPTION="UBO" OPTIONID="UBO" />
      <MODIFIER XMLID="FOCUS" ID="${id}2" BASECOST="-1.0" LEVELS="0" ALIAS="Focus" OPTION="OAF" OPTIONID="OAF" />
    </SKILL>`;

describe('skills with advantages', () => {
  const file = blankHdc()
    .replace('<SKILLS />', `<SKILLS>\n    ${CSL('9400', 0)}\n  </SKILLS>`)
    .replace(
      '<EQUIPMENT />',
      `<EQUIPMENT>
    <POWER XMLID="COMPOUNDPOWER" ID="9410" BASECOST="0.0" LEVELS="0" ALIAS="Compound Power" POSITION="0" NAME="Banner">
      ${CSL('9411', 1)}
    </POWER>
  </EQUIPMENT>`,
    );

  it('adds advantages to the Active Points and takes limitations from there, as Hero Designer does', () => {
    const character = parseHdcFile(file);
    const skill = character.skills.find((s) => s.id === '9400')!;
    expect(skill.activeCost).toBe(37); // 30 × 1¼ = 37.5, rounded half down as Hero Designer does
    expect(skill.realCost).toBe(18); // 37 / 2
    const banner = character.equipment!.find((e) => e.id === '9410')!;
    expect(banner.activeCost).toBe(37);
    expect(banner.realCost).toBe(18);
  });
});

describe('equipment that is one power', () => {
  it('prices a Barrier from its size and defenses, as the powers section does', () => {
    const character = parseHdcFile(FILE);
    const power = character.powers.find((p) => p.id === '9300')!;
    const gear = character.equipment!.find((e) => e.id === '9310')!;
    expect(power.activeCost).toBe(82);
    expect(gear.activeCost).toBe(82);
    expect(gear.realCost).toBe(power.realCost);
  });

  it('gives no points back for a negative characteristic', () => {
    const gear = parseHdcFile(FILE).equipment!.find((e) => e.id === '9320')!;
    expect(gear.activeCost).toBe(0);
    expect(gear.realCost).toBe(0);
  });
});
