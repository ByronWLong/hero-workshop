import { describe, expect, it } from 'vitest';
import { blankHdc, parseHdcFile, powerCosts, powerDraft } from '../src/index.js';

// Powers Hero Designer prices per step of levels (LVLVAL), and option-priced levels in equipment
const XML = blankHdc()
  .replace('<POWERS />', `<POWERS>
    <POWER XMLID="FORCEFIELD" ID="9800" BASECOST="0.0" LEVELS="14" ALIAS="Resistant Protection" POSITION="0" NAME="Armor" PDLEVELS="7" EDLEVELS="7" MDLEVELS="0" POWDLEVELS="0" QUANTITY="1" />
    <POWER XMLID="MULTIFORM" ID="9801" BASECOST="0.0" LEVELS="250" ALIAS="Multiform" POSITION="1" NAME="Shark Form" QUANTITY="1" />
    <POWER XMLID="LEAPING" ID="9802" BASECOST="0.0" LEVELS="6" ALIAS="Leaping" POSITION="2" NAME="Spring" QUANTITY="1" />
  </POWERS>`)
  .replace('<EQUIPMENT />', `<EQUIPMENT>
    <POWER XMLID="TRANSFORM" ID="9810" BASECOST="0.0" LEVELS="10" ALIAS="Transform" POSITION="0" OPTION="SEVERE" OPTIONID="SEVERE" OPTION_ALIAS="Severe" NAME="Awakening" QUANTITY="1" PRICE="0.0" WEIGHT="0.0" CARRIED="Yes" />
  </EQUIPMENT>`);

describe('level steps', () => {
  it('prices per step of levels, as Hero Designer does', () => {
    const c = parseHdcFile(XML);
    const cost = (id: string) => c.powers.find((p) => p.id === id)!.realCost;
    expect(cost('9800')).toBe(21); // 14 points of protection at 3 per 2
    expect(cost('9801')).toBe(50); // a 250-point form at 1 per 5
    expect(cost('9802')).toBe(3); // 6m at 1 per 2m
    expect(powerCosts(powerDraft(c, 'powers', '9800')).real).toBe(21);
  });

  it('prices an equipment power by its option (a Severe Transform is 15 per d6)', () => {
    expect(parseHdcFile(XML).equipment!.find((e) => e.id === '9810')!.realCost).toBe(150);
  });
});
