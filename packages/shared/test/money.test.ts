import { describe, expect, it } from 'vitest';
import { CURRENCY_PRESETS, HdcDocument, getIcon, blankHdc, powerDraft, savePowerDraft, equipmentLoad, moneyView, parseHdcFile, setMoney, updateHdc } from '../src/index.js';

// A character's money, set in the editor: coins are equipment named after the currency, the
// count in QUANTITY, possibly in several stacks

const coins = CURRENCY_PRESETS.coins.currencies;
const gold = coins.find((c) => c.abbreviation === 'gp')!;
const silver = coins.find((c) => c.abbreviation === 'sp')!;
const coin = (id: string, name: string, count: number, extra = '') =>
  `<POWER XMLID="CUSTOMPOWER" ID="${id}" BASECOST="0.0" LEVELS="0" ALIAS="${name}" POSITION="0" NAME="${name}" PRICE="1" WEIGHT="0.0440924" CARRIED="Yes" QUANTITY="${count}" ${extra}/>`;
const xml = blankHdc().replace(
  '<EQUIPMENT />',
  '<EQUIPMENT>' +
    `<LIST XMLID="GENERIC_OBJECT" ID="9801" BASECOST="0.0" LEVELS="0" ALIAS="Strongbox" POSITION="0" PRICE="0.0" WEIGHT="0.0" CARRIED="No" NAME="Strongbox" />` +
    coin('9802', 'Gold piece', 100, 'PARENTID="9801"').replace('CARRIED="Yes"', 'CARRIED="No"') +
    coin('9803', 'Gold piece', 30) +
    '</EQUIPMENT>',
);
const character = parseHdcFile(xml);
const quantity = (c: typeof character, id: string) => c.equipment!.find((e) => e.id === id)?.quantity ?? 1;

describe('money', () => {
  it('counts every stack, and what it is all worth', () => {
    const view = moneyView(character, coins);
    expect(view.rows.map((r) => [r.currency.abbreviation, r.count, r.stacks])).toEqual([
      ['pp', 0, 0],
      ['gp', 130, 2],
      ['ep', 0, 0],
      ['sp', 0, 0],
      ['cp', 0, 0],
    ]);
    expect([view.total, view.primary?.abbreviation]).toEqual([130, 'gp']);
  });

  it('adds to the purse at hand, and spends from it first', () => {
    const more = setMoney(character, gold, 150);
    expect([quantity(more, '9803'), quantity(more, '9802')]).toEqual([50, 100]);
    const spent = setMoney(character, gold, 110);
    expect([quantity(spent, '9803'), quantity(spent, '9802')]).toEqual([10, 100]);
    // More than the purse holds empties it, and the rest comes out of the strongbox
    const most = setMoney(character, gold, 20);
    expect(most.equipment!.map((e) => e.id)).not.toContain('9803');
    expect(quantity(most, '9802')).toBe(20);
  });

  it('makes a new stack for a currency the character has none of, priced and weighed per coin', () => {
    const rich = setMoney(character, silver, 40);
    const written = updateHdc(xml, rich).xml;
    const el = [...HdcDocument.parse(written).root.firstElement('EQUIPMENT')!.elements()].find((e) => e.getAttr('NAME') === 'Silver piece')!;
    expect([el.getAttr('XMLID'), el.getAttr('QUANTITY'), Number(el.getAttr('PRICE')), el.getAttr('CARRIED'), getIcon(el)]).toEqual(['CUSTOMPOWER', '40', 0.1, 'Yes', silver.img]);
    expect(moneyView(parseHdcFile(written), coins).rows.find((r) => r.currency === silver)!.count).toBe(40);
    // 40 coins of 10 g: 0.4 kg carried
    expect(equipmentLoad(parseHdcFile(written)).carried - equipmentLoad(character).carried).toBeCloseTo(0.4, 1);
  });

  it('writes a changed count, and reads none left as none', () => {
    const written = updateHdc(xml, setMoney(character, gold, 80)).xml;
    expect(HdcDocument.parse(written).findById('9802')!.getAttr('QUANTITY')).toBe('80');
    expect(HdcDocument.parse(written).findById('9803')).toBeUndefined();
    expect(parseHdcFile(xml.replace('QUANTITY="30"', 'QUANTITY="0"')).equipment!.find((e) => e.id === '9803')!.quantity).toBe(0);
  });

  it("edits a coin's stack in its form: a weight in grams, a price in cents, how many", () => {
    const draft = powerDraft(character, 'equipment', '9803');
    expect([draft.weight, draft.price, draft.quantity]).toEqual([0.02, 1, 30]);
    const saved = savePowerDraft(character, 'equipment', '9803', { ...draft, quantity: 45 });
    const el = HdcDocument.parse(updateHdc(xml, saved).xml).findById('9803')!;
    expect([el.getAttr('QUANTITY'), el.getAttr('WEIGHT'), el.getAttr('PRICE')]).toEqual(['45', '0.0440924', '1']);
  });
});
