import { readdirSync, readFileSync } from 'node:fs';
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
  saveItemForm,
  updateHdc,
  type Character,
  type FormValues,
} from '../src/index.js';

// Perk and talent forms price from the template, as Hero Designer does (perkTalentCosts.ts)

const samples = resolve(__dirname, '../../../samples');

/** Adds an item through its form, then writes and re-reads the file */
function add(section: 'perks' | 'talents', type: string, change: FormValues = {}) {
  const xml = blankHdc();
  const character = parseHdcFile(xml);
  const values = { ...newItemFormValues(character, section, type), ...change };
  const formCost = itemForm(section, values, true, character).cost;
  const edited = saveItemForm(character, section, undefined, values);
  const written = updateHdc(xml, edited);
  const item = edited[section].at(-1)!;
  const el = HdcDocument.parse(written.xml).findById(written.report.idMap[item.id]!)!;
  const reread = parseHdcFile(written.xml)[section].at(-1)!;
  return { formCost, item, el, reread };
}

/** Edits an existing item through its form */
function edit(xml: string, section: 'perks' | 'talents', id: string, change: FormValues) {
  const character = parseHdcFile(xml);
  const values = { ...itemFormValues(character, section, id), ...change };
  const formCost = itemForm(section, values, false, character).cost;
  const written = updateHdc(xml, saveItemForm(character, section, id, values));
  return { formCost, el: HdcDocument.parse(written.xml).findById(id)!, reread: parseHdcFile(written.xml)[section].find((i) => i.id === id)! };
}

describe('talent forms', () => {
  it('prices levels at the template cost per level and writes the base cost once', () => {
    const { formCost, el, reread } = add('talents', 'COMBAT_LUCK', { levels: 3 });
    expect(formCost).toBe(18);
    expect(el.getAttr('BASECOST')).toBe('0.0');
    expect(el.getAttr('LEVELS')).toBe('3');
    expect(reread.realCost).toBe(18);
  });

  it("prices levels at the option's cost per level", () => {
    expect(add('talents', 'LIGHTNING_REFLEXES_ALL', { option: 'ALL', levels: 3 }).formCost).toBe(3);
    const single = add('talents', 'LIGHTNING_REFLEXES_ALL', { option: 'SINGLE', levels: 5 });
    expect(single.formCost).toBe(1);
    expect(single.el.getAttr('OPTIONID')).toBe('SINGLE');
    expect(single.reread.realCost).toBe(1);
    expect(add('talents', 'DEADLYBLOW', { option: 'LIMITED', levels: 1 }).formCost).toBe(16);
  });

  it('adds adders, with any they require', () => {
    const { formCost, reread } = add('talents', 'DANGER_SENSE', { adder_SENSITIVITY: 'ANY_DANGER', adder_ANALYZE: true });
    // 15, any danger +10, Analyze +5 and the Discriminatory it needs +5
    expect(formCost).toBe(35);
    expect(reread.adders?.map((a) => a.xmlId).sort()).toEqual(['ANALYZE', 'DISCRIMINATORY', 'SENSITIVITY']);
    expect(reread.realCost).toBe(35);
  });

  it('keeps a cost within the range the template allows', () => {
    expect(add('talents', 'ENVIRONMENTAL_MOVEMENT', { cost: 4 }).reread.realCost).toBe(4);
    expect(add('talents', 'ENVIRONMENTAL_MOVEMENT', { cost: 9 }).formCost).toBe(6);
  });

  it('writes a custom talent as Hero Designer does (its cost in LEVELS)', () => {
    const { el, reread } = add('talents', 'CUSTOMTALENT', { name: 'Grimoire Manipulation', cost: 5 });
    expect(el.getAttr('BASECOST')).toBe('0.0');
    expect(el.getAttr('LEVELS')).toBe('5');
    expect(reread.realCost).toBe(5);
  });

  it("saves an existing talent's levels", () => {
    const { xml } = updateHdc(blankHdc(), saveItemForm(parseHdcFile(blankHdc()), 'talents', undefined, newItemFormValues(parseHdcFile(blankHdc()), 'talents', 'COMBAT_LUCK')));
    const id = parseHdcFile(xml).talents[0]!.id;
    const { formCost, el, reread } = edit(xml, 'talents', id, { levels: 4 });
    expect(formCost).toBe(24);
    expect(el.getAttr('LEVELS')).toBe('4');
    expect(reread.realCost).toBe(24);
  });
});

describe('perk forms', () => {
  it("prices Money by its option and saves it", () => {
    const { formCost, el, reread } = add('perks', 'MONEY', { option: 'WEALTHY' });
    expect(formCost).toBe(10);
    expect(el.getAttr('BASECOST')).toBe('10.0');
    expect(el.getAttr('OPTIONID')).toBe('WEALTHY');
    expect(reread.realCost).toBe(10);
  });

  it('prices a Contact from its roll and adders, with exclusive adders as one choice', () => {
    const { formCost, reread } = add('perks', 'CONTACT', { name: 'Harbor Master', levels: 2, adder_USEFUL: 'VERYUSEFUL', adder_GOODRELATIONSHIP: 'VERYGOODRELATIONSHIP' });
    expect(formCost).toBe(6);
    expect(reread.realCost).toBe(6);
    const character = parseHdcFile(blankHdc());
    const form = itemForm('perks', newItemFormValues(character, 'perks', 'CONTACT'), true, character);
    expect(form.fields.find((f) => f.name === 'adder_GOODRELATIONSHIP')?.options?.map((o) => o.value)).toEqual(['', 'GOODRELATIONSHIP', 'VERYGOODRELATIONSHIP']);
  });

  it('starts a Positive Reputation at 11- with a small group', () => {
    const { formCost, reread } = add('perks', 'REPUTATION', { name: 'Hero of the Harbor', levels: 3, adder_HOWWIDE: 'LARGEGROUP' });
    expect(formCost).toBe(6);
    expect(reread.adders?.find((a) => a.xmlId === 'HOWWELL')?.optionId).toBe('11');
    expect(reread.realCost).toBe(6);
  });

  it('chooses one Fringe Benefit, or a cost for one not listed', () => {
    const { formCost, reread } = add('perks', 'FRINGE_BENEFIT', { benefit: 'LORDSHIP:BARON' });
    expect(formCost).toBe(4);
    expect(reread.realCost).toBe(4);
    expect(add('perks', 'FRINGE_BENEFIT', { benefit: '', cost: 2 }).reread.realCost).toBe(2);
  });

  it("prices a Follower from its points and number", () => {
    const { formCost, el, reread } = add('perks', 'FOLLOWER', { basePoints: 100, number: 4 });
    expect(formCost).toBe(30);
    expect(el.getAttr('BASEPOINTS')).toBe('100');
    expect(el.getAttr('NUMBER')).toBe('4');
    expect(reread.realCost).toBe(30);
  });

  it("saves a Favor's cost and an option change", () => {
    const { xml } = updateHdc(blankHdc(), saveItemForm(parseHdcFile(blankHdc()), 'perks', undefined, { ...newItemFormValues(parseHdcFile(blankHdc()), 'perks', 'MONEY') }));
    const id = parseHdcFile(xml).perks[0]!.id;
    const money = edit(xml, 'perks', id, { option: 'FILTHY_RICH' });
    expect(money.formCost).toBe(15);
    expect(money.el.getAttr('BASECOST')).toBe('15.0');
    expect(money.reread.realCost).toBe(15);

    const favor = add('perks', 'FAVOR', { cost: 7 });
    expect(favor.reread.realCost).toBe(7);
  });
});

describe('unchanged forms', () => {
  it("leave every sample's perks and talents as they are", () => {
    for (const file of readdirSync(samples).filter((f) => f.endsWith('.hdc'))) {
      const xml = decodeHdcBytes(readFileSync(resolve(samples, file)));
      const character = parseHdcFile(xml);
      let edited: Character = character;
      for (const section of ['perks', 'talents'] as const) {
        for (const item of character[section].filter((i) => !i.isGroup)) {
          const values = itemFormValues(edited, section, item.id);
          // A free item's form costs nothing
          expect(itemForm(section, values, false, edited).cost, `${file}: ${item.name}`).toBe(item.multiplier === 0 ? 0 : item.realCost);
          edited = saveItemForm(edited, section, item.id, values);
        }
      }
      const { report } = updateHdc(xml, edited);
      expect(report.changes.filter((c) => !c.startsWith("Foundry")).concat(report.warnings ?? []), file).toEqual([]);
    }
  });
});
