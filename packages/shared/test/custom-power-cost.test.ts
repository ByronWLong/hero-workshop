import { describe, expect, it } from 'vitest';
import {
  blankHdc,
  buildItemTree,
  compoundPartsCharacter,
  parseHdcFile,
  powerDraft,
  powerFormView,
  savePowerDraft,
  selectPower,
  setSubPowers,
  updateHdc,
} from '../src/index.js';

/** A compound in `section` holding one custom power part, made through the forms */
function compoundWithCustomPart(section: 'powers' | 'equipment', pick: 'CUSTOM' | 'CUSTOMPOWER') {
  const base = blankHdc();
  const character = parseHdcFile(base);
  let compound = { ...powerDraft(character, section, undefined, 'compound'), name: 'Thing' };
  const scratch = compoundPartsCharacter(character, compound);
  const part = { ...selectPower(powerDraft(scratch, 'powers', undefined, 'power'), pick), name: 'Odd', alias: 'Odd effect', customCost: 5 };
  compound = setSubPowers(compound, savePowerDraft(scratch, 'powers', undefined, part).powers);
  return updateHdc(base, savePowerDraft(character, section, undefined, compound)).xml;
}

describe('custom powers', () => {
  for (const section of ['powers', 'equipment'] as const) {
    for (const pick of ['CUSTOM', 'CUSTOMPOWER'] as const) {
      it(`in a compound (${section}, chosen as ${pick}) keep their cost when reopened and saved again`, () => {
        const xml = compoundWithCustomPart(section, pick);
        // Hero Designer's own form: the cost in BASECOST, LEVELS that cost rounded up
        expect(/<POWER XMLID="CUSTOMPOWER"[^>]*BASECOST="5.0" LEVELS="5"/.test(xml)).toBe(true);
        const again = parseHdcFile(xml);
        const top = buildItemTree(again, section).find((r) => r.name === 'Thing')!;
        expect([top.cost, top.children.map((c) => c.cost)]).toEqual([5, [5]]);

        const draft = powerDraft(again, section, top.id);
        const parts = compoundPartsCharacter(again, draft);
        const partId = draft.subPowers[0]!.id;
        const partDraft = powerDraft(parts, 'powers', partId);
        expect(partDraft.customCost).toBe(5);
        expect(powerFormView(parts, 'powers', partDraft, partId).costs.real).toBe(5);

        const resaved = savePowerDraft(again, section, top.id, setSubPowers(draft, savePowerDraft(parts, 'powers', partId, partDraft).powers));
        expect(updateHdc(xml, resaved).xml).toBe(xml);
      });
    }
  }

  it("read from Hero Designer's files cost their BASECOST, not BASECOST plus LEVELS", () => {
    const xml = blankHdc().replace(
      '<POWERS />',
      '<POWERS>\n    <POWER XMLID="CUSTOMPOWER" ID="900" BASECOST="5.0" LEVELS="5" ALIAS="Custom Power" POSITION="0" NAME="Odd" />\n  </POWERS>',
    );
    expect(buildItemTree(parseHdcFile(xml), 'powers').map((r) => r.cost)).toEqual([5]);
  });
});
