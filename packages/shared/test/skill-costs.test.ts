import { describe, expect, it } from 'vitest';
import { blankHdc, parseHdcFile, saveItemForm, updateHdc } from '../src/index.js';

// Skill costs as Hero Designer prices them (Skill.getTotalCost, Main6E.hdt)
const XML = blankHdc().replace('<SKILLS />', `<SKILLS>
    <SKILL XMLID="STEALTH" ID="9100" BASECOST="3.0" LEVELS="2" ALIAS="Stealth" CHARACTERISTIC="DEX" FAMILIARITY="No" PROFICIENCY="No" />
    <SKILL XMLID="LOCKPICKING" ID="9110" BASECOST="3.0" LEVELS="0" ALIAS="Lockpicking" CHARACTERISTIC="DEX" FAMILIARITY="Yes" PROFICIENCY="No" />
    <SKILL XMLID="KNOWLEDGE_SKILL" ID="9120" BASECOST="2.0" LEVELS="3" ALIAS="KS" INPUT="Arcana" CHARACTERISTIC="GENERAL" FAMILIARITY="No" PROFICIENCY="No" />
    <SKILL XMLID="POWERSKILL" ID="9130" BASECOST="3.0" LEVELS="5" ALIAS="Power" NAME="Earth Magic Casting" INPUT="Earth Magic" CHARACTERISTIC="INT" FAMILIARITY="No" PROFICIENCY="No" />
    <SKILL XMLID="LANGUAGES" ID="9140" BASECOST="2.0" LEVELS="0" ALIAS="Language" OPTION="FLUENT" OPTIONID="FLUENT" OPTION_ALIAS="fluent conversation" INPUT="Common" FAMILIARITY="No" PROFICIENCY="No" NATIVE_TONGUE="No">
      <ADDER XMLID="LITERACY" ID="9141" BASECOST="1.0" LEVELS="0" ALIAS="literate" INCLUDEINBASE="No" />
    </SKILL>
    <SKILL XMLID="WEAPON_FAMILIARITY" ID="9150" BASECOST="0.0" LEVELS="0" ALIAS="WF" CHARACTERISTIC="GENERAL" FAMILIARITY="No" PROFICIENCY="No">
      <ADDER XMLID="COMMONMELEE" ID="9151" BASECOST="2.0" LEVELS="0" ALIAS="Common Melee Weapons" INCLUDEINBASE="No" />
      <ADDER XMLID="BLADES" ID="9152" BASECOST="1.0" LEVELS="0" ALIAS="Blades" INCLUDEINBASE="No" />
    </SKILL>
  </SKILLS>`);

describe('skill costs', () => {
  it("prices levels at the skill's own cost per level, and familiarities at their familiarity cost", () => {
    const c = parseHdcFile(XML);
    const cost = (id: string) => c.skills.find((s) => s.id === id)?.realCost;
    expect(cost('9100')).toBe(7); // 3 + 2 x 2
    expect(cost('9110')).toBe(1);
    expect(cost('9120')).toBe(5); // 2 + 3 x 1
    expect(cost('9130')).toBe(13); // 3 + 5 x 2
    expect(cost('9140')).toBe(3); // fluent + literate
    expect(cost('9150')).toBe(3);
  });

  it("prices Combat, Skill, Mental and Penalty Skill Levels at the template's cost for their breadth", () => {
    const xml = blankHdc().replace('<SKILLS />', `<SKILLS>
    <SKILL XMLID="COMBAT_LEVELS" ID="9200" BASECOST="0.0" LEVELS="2" ALIAS="Combat Skill Levels" OPTION="HTH" OPTIONID="HTH" OPTION_ALIAS="with HTH Combat" />
    <SKILL XMLID="COMBAT_LEVELS" ID="9201" BASECOST="0.0" LEVELS="1" ALIAS="Combat Skill Levels" OPTION="ALL" OPTIONID="ALL" OPTION_ALIAS="with All Attacks" />
    <SKILL XMLID="SKILL_LEVELS" ID="9202" BASECOST="0.0" LEVELS="1" ALIAS="Skill Levels" OPTION="OVERALL" OPTIONID="OVERALL" />
    <SKILL XMLID="MENTAL_COMBAT_LEVELS" ID="9203" BASECOST="0.0" LEVELS="3" ALIAS="Mental Combat Skill Levels" OPTION="SINGLE" OPTIONID="SINGLE" />
    <SKILL XMLID="PENALTY_SKILL_LEVELS" ID="9204" BASECOST="0.0" LEVELS="10" ALIAS="Penalty Skill Levels" OPTION="SINGLE" OPTIONID="SINGLE" />
  </SKILLS>`);
    const c = parseHdcFile(xml);
    const cost = (id: string) => c.skills.find((s) => s.id === id)?.realCost;
    expect(cost('9200')).toBe(16); // 8 per level with HTH Combat
    expect(cost('9201')).toBe(10);
    expect(cost('9202')).toBe(12);
    expect(cost('9203')).toBe(3);
    expect(cost('9204')).toBe(10);
  });

  it("writes a new language at Hero Designer's price for its fluency", () => {
    const xml = blankHdc();
    const c = saveItemForm(parseHdcFile(xml), 'skills', undefined, { xmlid: 'LANGUAGES', input: 'Elven', option: 'IDIOMATIC', literate: false });
    const written = updateHdc(xml, c).xml;
    expect(written).toMatch(/XMLID="LANGUAGES"[^>]*BASECOST="4\.0"/);
    expect(written).toMatch(/OPTION_ALIAS="idiomatic"/);
    expect(parseHdcFile(written).skills[0]!.realCost).toBe(4);
  });
});
