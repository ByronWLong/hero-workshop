import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  HdcDocument,
  blankHdc,
  decodeHdcBytes,
  itemForm,
  itemFormValues,
  newItemFormValues,
  parseHdcFile,
  repairForFoundry,
  saveItemForm,
  updateHdc,
  validateForFoundry,
} from '../src/index.js';
import { pslOptionAlias, pslPenalty, pslPenaltyInName } from '../src/skillLevels.js';

const SKRALK = decodeHdcBytes(readFileSync(resolve(__dirname, '../../../samples/SkralkSkekMal.hdc')));

const PSL = (id: string, attrs: string, name = '') =>
  `<SKILL XMLID="PENALTY_SKILL_LEVELS" ID="${id}" BASECOST="0.0" LEVELS="6" ALIAS="Penalty Skill Levels" POSITION="0" NAME="${name}" FAMILIARITY="No" PROFICIENCY="No" LEVELSONLY="No" ${attrs} />`;

const SINGLE = 'OPTION="SINGLE" OPTIONID="SINGLE" OPTION_ALIAS="to offset a specific negative OCV modifier with any single attack"';

/** Adds a PSL through the skill form, as the editor does */
function addPsl(values: Record<string, unknown> = {}) {
  const character = parseHdcFile(SKRALK);
  const form = { ...newItemFormValues(character, 'skills', 'PENALTY_SKILL_LEVELS'), levels: 2, ...values };
  const { xml, report } = updateHdc(SKRALK, saveItemForm(character, 'skills', undefined, form));
  const doc = HdcDocument.parse(xml);
  const el = doc.section('SKILLS')!.elements().filter((e) => e.getAttr('XMLID') === 'PENALTY_SKILL_LEVELS').at(-1)!;
  return { xml, el, report };
}

describe('Penalty Skill Levels', () => {
  it('reads the penalty as hero6e does, from the option text', () => {
    expect(pslPenalty('to offset the Range OCV modifier with any single attack')).toBe('range');
    expect(pslPenalty('to offset the Hit Location OCV modifier with all attacks')).toBe('location');
    expect(pslPenalty('to offset a specific negative OCV modifier with any single attack')).toBe('');
    expect(pslPenalty(undefined, undefined)).toBe('');
    expect(pslPenaltyInName('+6 vs Range Modifier with Crossbows')).toBe('range');
    expect(pslPenaltyInName('+2 vs called shots')).toBe('location');
    expect(pslPenaltyInName('+3 vs range and hit locations')).toBe('');
  });

  it('writes the penalty in Hero Designer wording that hero6e recognizes', () => {
    expect(pslOptionAlias('SINGLE', 'range')).toBe('to offset the Range OCV modifier with any single attack');
    expect(pslOptionAlias('GROUPDCV', 'encumbrance')).toBe('to offset the Encumbrance DCV modifier imposed by a group of conditions');
    expect(pslOptionAlias('ALL', '')).toBe('to offset a specific negative OCV modifier with all attacks');
    for (const option of ['SINGLE', 'THREE', 'ALL']) {
      for (const penalty of ['range', 'location', 'throwing', 'underwater'] as const) {
        expect(pslPenalty(pslOptionAlias(option, penalty))).toBe(penalty);
      }
    }
    for (const penalty of ['encumbrance', 'armor', 'groundfighting', 'underwater'] as const) {
      expect(pslPenalty(pslOptionAlias('SINGLEDCV', penalty))).toBe(penalty);
    }
  });

  it('saves a new PSL with the option the form shows, so its sheet opens in hero6e', () => {
    // The form's option select shows the first option without a value until it is changed
    const { xml, el } = addPsl();
    expect(el.getAttr('OPTIONID')).toBe('SINGLE');
    expect(el.getAttr('OPTION_ALIAS')).toBe('to offset a specific negative OCV modifier with any single attack');
    expect(validateForFoundry(HdcDocument.parse(xml)).some((i) => /Penalty Skill Level/.test(i.message))).toBe(false);
  });

  it('chooses the penalty in the form, and reads it back', () => {
    const { xml, el } = addPsl({ option: 'ALL', penalty: 'location' });
    expect(el.getAttr('OPTION_ALIAS')).toBe('to offset the Hit Location OCV modifier with all attacks');

    const character = parseHdcFile(xml);
    const id = el.getAttr('ID')!;
    const values = itemFormValues(character, 'skills', id);
    expect(values.penalty).toBe('location');
    const field = itemForm('skills', values, false, character).fields.find((f) => f.name === 'penalty')!;
    expect(field.options!.map((o) => o.value)).toEqual(['range', 'location', 'throwing', 'underwater', '']);

    // A DCV option offers DCV penalties; one the option can't take is dropped
    const dcv = itemForm('skills', { ...values, option: 'SINGLEDCV' }, false, character).fields.find((f) => f.name === 'penalty')!;
    expect(dcv.options!.map((o) => o.value)).toEqual(['encumbrance', 'armor', 'groundfighting', 'underwater', '']);
    const switched = updateHdc(xml, saveItemForm(character, 'skills', id, { ...values, option: 'SINGLEDCV' })).xml;
    expect(HdcDocument.parse(switched).findById(id)!.getAttr('OPTION_ALIAS'))
      .toBe('to offset a specific negative DCV modifier imposed by any single specific condition');
  });

  it("keeps a PSL's own wording until its penalty or option changes", () => {
    const own = blankHdc().replace('<SKILLS />', `<SKILLS>${PSL('9801', 'OPTION="SINGLE" OPTIONID="SINGLE" OPTION_ALIAS="vs Range with the Longbow"')}</SKILLS>`);
    const character = parseHdcFile(own);
    const values = itemFormValues(character, 'skills', '9801');
    expect(values.penalty).toBe('range');
    const saved = updateHdc(own, saveItemForm(character, 'skills', '9801', { ...values, levels: 4 })).xml;
    expect(HdcDocument.parse(saved).findById('9801')!.getAttr('OPTION_ALIAS')).toBe('vs Range with the Longbow');
  });

  it('writes a penalty only the name states when the PSL is saved', () => {
    const named = blankHdc().replace('<SKILLS />', `<SKILLS>${PSL('9802', SINGLE, '+6 vs Range Modifier with Crossbows')}</SKILLS>`);
    const character = parseHdcFile(named);
    const values = itemFormValues(character, 'skills', '9802');
    expect(values.penalty).toBe('range');
    const saved = updateHdc(named, saveItemForm(character, 'skills', '9802', values)).xml;
    expect(HdcDocument.parse(saved).findById('9802')!.getAttr('OPTION_ALIAS')).toBe('to offset the Range OCV modifier with any single attack');
  });
});

describe('repairForFoundry: Penalty Skill Levels', () => {
  const XML = blankHdc().replace('<SKILLS />', `<SKILLS>
    ${PSL('9810', '', '+2 vs Range')}
    ${PSL('9811', SINGLE, '+6 vs Range Modifier with Crossbows')}
    ${PSL('9812', 'OPTION="ALL" OPTIONID="ALL" OPTION_ALIAS="with all bows"', '+1 vs called shots')}
    ${PSL('9813', 'OPTION="SINGLE" OPTIONID="SINGLE" OPTION_ALIAS="to offset the Hit Location OCV modifier with any single attack"', '+3 vs range')}
    ${PSL('9814', SINGLE, '+2 PSL')}
  </SKILLS>`);

  it('gives a PSL without its option one, so the sheet opens', () => {
    expect(validateForFoundry(HdcDocument.parse(XML)).some((i) => i.itemId === '9810' && /sheet can't open/.test(i.message))).toBe(true);
    const doc = HdcDocument.parse(repairForFoundry(XML).xml);
    const el = doc.findById('9810')!;
    expect(el.getAttr('OPTIONID')).toBe('SINGLE');
    expect(el.getAttr('OPTION_ALIAS')).toBe('to offset the Range OCV modifier with any single attack');
    expect(validateForFoundry(doc).some((i) => /Penalty Skill Level/.test(i.message))).toBe(false);
  });

  it('puts the penalty a PSL names into its option text', () => {
    const result = repairForFoundry(XML);
    const doc = HdcDocument.parse(result.xml);
    expect(doc.findById('9811')!.getAttr('OPTION_ALIAS')).toBe('to offset the Range OCV modifier with any single attack');
    // A writer's own wording gets the penalty added
    expect(doc.findById('9812')!.getAttr('OPTION_ALIAS')).toBe('with all bows (Hit Location)');
    expect(result.changes).toContain('+6 vs Range Modifier with Crossbows: offsets the Range penalty');
  });

  it("leaves a PSL alone when its text already names a penalty, or its name names none", () => {
    const doc = HdcDocument.parse(repairForFoundry(XML).xml);
    expect(doc.findById('9813')!.getAttr('OPTION_ALIAS')).toBe('to offset the Hit Location OCV modifier with any single attack');
    expect(doc.findById('9814')!.getAttr('OPTION_ALIAS')).toBe('to offset a specific negative OCV modifier with any single attack');
    // Idempotent
    const once = repairForFoundry(XML).xml;
    expect(repairForFoundry(once).changes).toEqual([]);
  });
});
