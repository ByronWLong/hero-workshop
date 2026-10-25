import { describe, expect, it } from 'vitest';
import {
  HdcDocument,
  addAdder,
  availableAdders,
  blankHdc,
  parseHdcFile,
  powerCosts,
  powerDraft,
  powerFormView,
  savePowerDraft,
  selectPower,
  setAdderAlias,
  setDetects,
  setPowerOption,
  setSenseGroup,
  updateHdc,
} from '../src/index.js';

// Enhanced senses and their sense modifiers, as Hero Designer's template defines them

const base = blankHdc();
const character = parseHdcFile(base);
const detect = () => selectPower(powerDraft(character, 'powers'), 'DETECT');
const offered = (draft: ReturnType<typeof detect>) => Object.fromEntries(availableAdders(draft).map((a) => [a.xmlId, a.lvlCost ?? a.baseCost]));

describe('enhanced senses', () => {
  it("offers Detect the sense modifiers, priced for one sense, except those it has built in", () => {
    const choices = offered(detect());
    expect(choices).toMatchObject({ EXTRA: 5, MAKEASENSE: 2, RANGE: 5, DISCRIMINATORY: 5, TARGETINGSENSE: 10, TRACKINGSENSE: 5, INCREASEDARC360: 5 });
    // Its levels are its PER bonus; Analyze needs Discriminatory
    expect(choices).not.toHaveProperty('ENHANCEDPERCEPTION');
    expect(choices).not.toHaveProperty('ANALYZESENSE');
    expect(offered(addAdder(detect(), 'DISCRIMINATORY'))).toHaveProperty('ANALYZESENSE', 5);
    // One arc or the other
    expect(offered(addAdder(detect(), 'INCREASEDARC360'))).not.toHaveProperty('INCREASEDARC240');
  });

  it('has a sense group, whose built-in sense modifiers it no longer pays for', () => {
    const ranged = addAdder(detect(), 'RANGE');
    const sight = setSenseGroup(ranged, 'SIGHTGROUP');
    expect(sight.adders).toHaveLength(0);
    expect(offered(sight)).not.toHaveProperty('RANGE');
    expect(offered(sight)).not.toHaveProperty('TARGETINGSENSE');
    const view = powerFormView(character, 'powers', sight);
    expect(view.sense?.groups?.find((g) => g.selected)?.value).toBe('SIGHTGROUP');
    expect(view.sense?.builtIn).toContain('Range');
  });

  it('writes what Detect detects, its group and its sense modifiers', () => {
    let draft = setPowerOption(setDetects(detect(), 'Magic'), 'CLASS');
    for (const id of ['MAKEASENSE', 'RANGE', 'DISCRIMINATORY', 'EXTRA']) draft = addAdder(draft, id);
    draft = setAdderAlias(draft, draft.adders.find((a) => a.xmlId === 'EXTRA')!.id, 'Gold');
    // A Class Of Things 5, Sense 2, Range 5, Discriminatory 5, another thing 5
    expect(powerCosts(draft).real).toBe(22);
    const { xml } = updateHdc(base, savePowerDraft(character, 'powers', undefined, draft));
    const el = HdcDocument.parse(xml).section('POWERS')!.elements()[0]!;
    expect(['OPTIONID', 'OPTION_ALIAS', 'GROUP', 'ACTIVE', 'BASECOST'].map((a) => el.getAttr(a))).toEqual(['CLASS', 'Magic', 'UNUSUALGROUP', 'Yes', '5.0']);
    expect(el.elements('ADDER').map((a) => [a.getAttr('XMLID'), a.getAttr('ALIAS'), a.getAttr('BASECOST')])).toEqual([
      ['MAKEASENSE', 'Sense', '2.0'],
      ['RANGE', 'Range', '5.0'],
      ['DISCRIMINATORY', 'Discriminatory', '5.0'],
      ['EXTRA', 'Gold', '5.0'],
    ]);

    // Reopened: the same text, group and cost
    const reparsed = parseHdcFile(xml);
    const reopened = powerDraft(reparsed, 'powers', reparsed.powers[0]!.id);
    const view = powerFormView(reparsed, 'powers', reopened, reparsed.powers[0]!.id);
    expect(view.detects?.value).toBe('Magic');
    expect(view.adders.find((a) => a.rename)?.rename?.value).toBe('Gold');
    expect(reparsed.powers[0]!.realCost).toBe(22);
  });

  it('keeps what Detect detects when its breadth changes', () => {
    expect(setPowerOption(setDetects(detect(), 'Gold'), 'LARGECLASS').optionAlias).toBe('Gold');
    expect(setPowerOption(detect(), 'LARGECLASS').optionAlias).toBe('');
  });
});
