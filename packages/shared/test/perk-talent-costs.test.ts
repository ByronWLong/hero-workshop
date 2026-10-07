import { describe, expect, it } from 'vitest';
import { blankHdc, contactRollFor, parseHdcFile } from '../src/index.js';

// Costs as Hero Designer prices them (Contact.java, Main6E.hdt)
const XML = blankHdc()
  .replace('<PERKS />', `<PERKS>
    <PERK XMLID="CONTACT" ID="9700" BASECOST="0.0" LEVELS="1" ALIAS="Contact" NAME="Etok" INPUT="Skaven Diplomat">
      <ADDER XMLID="USEFUL" ID="9701" BASECOST="2.0" LEVELS="0" ALIAS="Contact has" OPTION="VERYUSEFUL" OPTIONID="VERYUSEFUL" OPTION_ALIAS="very useful Skills or resources" INCLUDEINBASE="No" />
      <ADDER XMLID="CONTACTHASCONTACTS" ID="9702" BASECOST="1.0" LEVELS="0" ALIAS="Contact has significant Contacts of his own" INCLUDEINBASE="No" />
      <ADDER XMLID="SLAVISHLYLOYAL" ID="9703" BASECOST="3.0" LEVELS="0" ALIAS="Contact is slavishly loyal to character" INCLUDEINBASE="No" />
    </PERK>
    <PERK XMLID="CONTACT" ID="9710" BASECOST="0.0" LEVELS="2" ALIAS="Contact" NAME="" INPUT="Harbor Master" />
    <PERK XMLID="CONTACT" ID="9720" BASECOST="0.0" LEVELS="4" ALIAS="Contact" NAME="" INPUT="The Guild" />
    <PERK XMLID="REPUTATION" ID="9730" BASECOST="0.0" LEVELS="3" ALIAS="Positive Reputation" NAME="Saviors of the Empire">
      <ADDER XMLID="HOWWIDE" ID="9731" BASECOST="2.0" LEVELS="0" ALIAS="How Widely Known" OPTION="LARGEGROUP" OPTIONID="LARGEGROUP" OPTION_ALIAS="A large group" REQUIRED="Yes" INCLUDEINBASE="Yes" />
      <ADDER XMLID="HOWWELL" ID="9732" BASECOST="0.0" LEVELS="0" ALIAS="How Well Known" OPTION="11" OPTIONID="11" OPTION_ALIAS="11-" REQUIRED="Yes" INCLUDEINBASE="Yes" />
    </PERK>
    <PERK XMLID="REPUTATION" ID="9740" BASECOST="0.0" LEVELS="2" ALIAS="Positive Reputation" NAME="Known in the village">
      <ADDER XMLID="HOWWIDE" ID="9741" BASECOST="0.0" LEVELS="0" ALIAS="How Widely Known" OPTION="SMALLGROUP" OPTIONID="SMALLGROUP" OPTION_ALIAS="A small to medium sized group" REQUIRED="Yes" INCLUDEINBASE="Yes" />
      <ADDER XMLID="HOWWELL" ID="9742" BASECOST="-1.0" LEVELS="0" ALIAS="How Well Known" OPTION="8" OPTIONID="8" OPTION_ALIAS="8-" REQUIRED="Yes" INCLUDEINBASE="Yes" />
    </PERK>
  </PERKS>`)
  .replace('<TALENTS />', `<TALENTS>
    <TALENT XMLID="COMBAT_LUCK" ID="9800" BASECOST="0.0" LEVELS="2" ALIAS="Combat Luck" NAME="" />
    <TALENT XMLID="DANGER_SENSE" ID="9810" BASECOST="15.0" LEVELS="2" ALIAS="Danger Sense" NAME="" />
    <TALENT XMLID="LIGHTSLEEP" ID="9820" BASECOST="3.0" LEVELS="0" ALIAS="Lightsleep" NAME="" />
  </TALENTS>`);

describe('perk and talent costs', () => {
  it("prices a Contact from its levels and adders, with Hero Designer's roll", () => {
    const c = parseHdcFile(XML);
    const cost = (id: string) => c.perks.find((p) => p.id === id)?.realCost;
    expect(cost('9700')).toBe(7);
    expect(cost('9710')).toBe(2);
    expect(cost('9720')).toBe(4);
    expect([1, 2, 3, 4].map(contactRollFor)).toEqual([8, 11, 12, 13]);
    expect(c.perks.find((p) => p.id === '9710')?.name).toMatch(/11-$/);
  });

  it('prices a Positive Reputation per level, as Hero Designer does', () => {
    const c = parseHdcFile(XML);
    const cost = (id: string) => c.perks.find((p) => p.id === id)?.realCost;
    expect(cost('9730')).toBe(6);
    expect(cost('9740')).toBe(2);
  });

  it("prices talent levels at the template's cost per level", () => {
    const c = parseHdcFile(XML);
    const cost = (id: string) => c.talents.find((t) => t.id === id)?.realCost;
    expect(cost('9800')).toBe(12);
    expect(cost('9810')).toBe(17);
    expect(cost('9820')).toBe(3);
  });
});

describe('followers and familiarities', () => {
  it("prices a Follower from its base points, and writes them as Hero Designer does", async () => {
    const { saveItemForm, updateHdc } = await import('../src/index.js');
    const xml = blankHdc();
    const c = saveItemForm(parseHdcFile(xml), 'perks', undefined, { type: 'FOLLOWER', name: 'Bearman Bodyguard', levels: 0, cost: 20 });
    const written = updateHdc(xml, c).xml;
    expect(written).toMatch(/XMLID="FOLLOWER"[^>]*BASEPOINTS="100"/);
    expect(parseHdcFile(written).perks[0]!.realCost).toBe(20);
  });

  it('writes a familiarity with no base cost', async () => {
    const { saveItemForm, updateHdc } = await import('../src/index.js');
    const xml = blankHdc();
    const c = saveItemForm(parseHdcFile(xml), 'skills', undefined, { xmlid: 'CLIMBING', familiarity: true });
    const written = updateHdc(xml, c).xml;
    expect(written).toMatch(/XMLID="CLIMBING"[^>]*BASECOST="0\.0"/);
    expect(parseHdcFile(written).skills[0]!.realCost).toBe(1);
  });
});
