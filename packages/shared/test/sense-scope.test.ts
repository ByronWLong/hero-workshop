import { describe, expect, it } from 'vitest';
import { HdcDocument, blankHdc, parseHdcFile, powerDraft, powerFormView, savePowerDraft, updateHdc } from '../src/index.js';

// Sense modifiers are priced by what they apply to (Main6E.hdt ALLCOST / GROUPCOST / SENSECOST)
const XML = blankHdc().replace(
  '<POWERS />',
  `<POWERS>
    <POWER XMLID="ENHANCEDPERCEPTION" ID="9300" BASECOST="0.0" LEVELS="1" ALIAS="Enhanced Perception" POSITION="0" OPTION="ALL" OPTIONID="ALL" OPTION_ALIAS="all Sense Groups but Sight" NAME="More Heads Better" />
    <POWER XMLID="INCREASEDARC360" ID="9301" BASECOST="10.0" LEVELS="0" ALIAS="Increased Arc Of Perception (360 Degrees)" POSITION="1" OPTION="SIGHTGROUP" OPTIONID="SIGHTGROUP" OPTION_ALIAS="Sight Group" NAME="More Eyes Better" />
    <POWER XMLID="TELESCOPIC" ID="9302" BASECOST="0.0" LEVELS="4" ALIAS="Telescopic" POSITION="2" OPTION="SIGHTGROUP" OPTIONID="SIGHTGROUP" OPTION_ALIAS="Sight Group" NAME="Eagle Eyes" />
  </POWERS>`,
);

describe('sense modifiers priced by scope', () => {
  it('costs Enhanced Perception per +1 by scope, and offers the scopes in the form', () => {
    const character = parseHdcFile(XML);
    expect(character.powers.find((p) => p.id === '9300')!.realCost).toBe(3);
    const draft = powerDraft(character, 'powers', '9300');
    const view = powerFormView(character, 'powers', draft, '9300');
    expect(view.definition.hasLevels).toBe(true);
    expect(view.definition.options?.find((o) => o.selected)?.value).toBe('ALL');
    expect(view.definition.options?.map((o) => o.value)).toEqual(expect.arrayContaining(['SIGHTGROUP', 'NORMALSMELL']));
    // One sense group: 2 points per +1
    expect(powerFormView(character, 'powers', { ...draft, option: 'HEARINGGROUP', levels: 2 }, '9300').costs.real).toBe(4);
  });

  it('costs Increased Arc and Telescopic (per +2) by scope', () => {
    const character = parseHdcFile(XML);
    expect(character.powers.find((p) => p.id === '9301')!.realCost).toBe(10);
    expect(character.powers.find((p) => p.id === '9302')!.realCost).toBe(6);
  });

  it('keeps a custom scope label, and stores a new scope\'s price', () => {
    const character = parseHdcFile(XML);
    const resaved = savePowerDraft(character, 'powers', '9300', { ...powerDraft(character, 'powers', '9300'), levels: 2 });
    let doc = HdcDocument.parse(updateHdc(XML, resaved).xml);
    expect(doc.findById('9300')!.getAttr('OPTION_ALIAS')).toBe('all Sense Groups but Sight');

    const widened = savePowerDraft(character, 'powers', '9301', { ...powerDraft(character, 'powers', '9301'), option: 'ALL' });
    doc = HdcDocument.parse(updateHdc(XML, widened).xml);
    const arc = doc.findById('9301')!;
    expect(arc.getAttr('OPTIONID')).toBe('ALL');
    expect(arc.getAttr('BASECOST')).toBe('25.0');
    expect(parseHdcFile(doc.toString()).powers.find((p) => p.id === '9301')!.realCost).toBe(25);
  });
});
