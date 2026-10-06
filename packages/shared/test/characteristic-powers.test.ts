import { describe, expect, it } from 'vitest';
import { HdcDocument, blankHdc, buildItemTree, parseHdcFile, powerDraft, savePowerDraft, updateHdc } from '../src/index.js';

// A template package lists characteristics bought as powers (and as gear) by their own tag
const TEMPLATE = blankHdc()
  .replace(
    '<POWERS />',
    `<POWERS>
    <DEX XMLID="DEX" ID="9201" BASECOST="0.0" LEVELS="1" ALIAS="DEX" POSITION="1" NAME="Quick" />
    <POWER XMLID="FLIGHT" ID="9202" BASECOST="0.0" LEVELS="10" ALIAS="Flight" POSITION="2" NAME="Wings" />
    <INT XMLID="INT" ID="9200" BASECOST="0.0" LEVELS="2" ALIAS="INT" POSITION="0" NAME="Clever" />
  </POWERS>`,
  )
  .replace('<EQUIPMENT />', `<EQUIPMENT>
    <STR XMLID="STR" ID="9210" BASECOST="0.0" LEVELS="5" ALIAS="STR" POSITION="0" NAME="Belt of Might" />
  </EQUIPMENT>`);

describe('characteristics bought as powers', () => {
  it('reads <INT>/<DEX> in POWERS and <STR> in EQUIPMENT, in Hero Designer order', () => {
    const character = parseHdcFile(TEMPLATE);
    expect(character.powers.map((p) => p.name)).toEqual(['Clever', 'Quick', 'Wings']);
    const clever = character.powers.find((p) => p.id === '9200')!;
    expect(clever.type).toBe('INT');
    expect(clever.levels).toBe(2);
    expect(clever.realCost).toBe(2);
    expect(buildItemTree(character, 'powers').map((r) => r.name)).toContain('Clever');
    expect(character.equipment?.map((e) => e.name)).toContain('Belt of Might');
  });

  it('edits them in place', () => {
    const character = parseHdcFile(TEMPLATE);
    const edited = savePowerDraft(character, 'powers', '9200', { ...powerDraft(character, 'powers', '9200'), levels: 3 });
    const doc = HdcDocument.parse(updateHdc(TEMPLATE, edited).xml);
    const el = doc.findById('9200')!;
    expect(el.name).toBe('INT');
    expect(el.getAttr('LEVELS')).toBe('3');
  });
});
