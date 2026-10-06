import { describe, expect, it } from 'vitest';
import {
  HdcDocument,
  blankHdc,
  buildItemTree,
  calculateCostBreakdown,
  parseHdcFile,
  powerDraft,
  powerFormView,
  savePowerDraft,
  selectPower,
  updateHdc,
} from '../src/index.js';

// A Fantasy Hero shield: a Multipower (reserve 5, OAF) with fixed slots for DCV and a hand attack
const SHIELD = blankHdc().replace(
  '<EQUIPMENT />',
  `<EQUIPMENT>
    <MULTIPOWER XMLID="GENERIC_OBJECT" ID="9400" BASECOST="5.0" LEVELS="0" ALIAS="Multipower" POSITION="0" PRICE="8.0" WEIGHT="2.2" CARRIED="Yes" NAME="Buckler, Wooden" QUANTITY="1">
      <MODIFIER XMLID="FOCUS" ID="9401" BASECOST="-1.0" LEVELS="0" ALIAS="Focus" POSITION="-1" OPTION="OAF" OPTIONID="OAF" OPTION_ALIAS="OAF" NAME="" />
    </MULTIPOWER>
    <DCV XMLID="DCV" ID="9402" BASECOST="0.0" LEVELS="1" ALIAS="DCV" POSITION="1" PARENTID="9400" ULTRA_SLOT="Yes" NAME="" AFFECTS_PRIMARY="Yes" AFFECTS_TOTAL="Yes" />
    <POWER XMLID="HANDTOHANDATTACK" ID="9403" BASECOST="0.0" LEVELS="2" ALIAS="Hand-To-Hand Attack" POSITION="2" PARENTID="9400" ULTRA_SLOT="No" NAME="Shield Bash" QUANTITY="1" />
  </EQUIPMENT>`,
);

// A Multipower and a Variable Power Pool in Powers
const POWERS = blankHdc().replace(
  '<POWERS />',
  `<POWERS>
    <MULTIPOWER XMLID="GENERIC_OBJECT" ID="9500" BASECOST="40.0" LEVELS="0" ALIAS="Multipower" POSITION="0" NAME="Elemental Blasts" />
    <POWER XMLID="ENERGYBLAST" ID="9501" BASECOST="0.0" LEVELS="8" ALIAS="Blast" POSITION="1" PARENTID="9500" ULTRA_SLOT="Yes" NAME="Fire Bolt" INPUT="ED" QUANTITY="1" />
    <POWER XMLID="ENERGYBLAST" ID="9502" BASECOST="0.0" LEVELS="8" ALIAS="Blast" POSITION="2" PARENTID="9500" ULTRA_SLOT="No" NAME="Ice Bolt" INPUT="ED" QUANTITY="1" />
    <VPP XMLID="GENERIC_OBJECT" ID="9510" BASECOST="0.0" LEVELS="30" ALIAS="Variable Power Pool" POSITION="3" NAME="Spellbook" />
    <POWER XMLID="FLIGHT" ID="9511" BASECOST="0.0" LEVELS="10" ALIAS="Flight" POSITION="4" PARENTID="9510" NAME="Levitate" QUANTITY="1" />
  </POWERS>`,
);

const row = (rows: ReturnType<typeof buildItemTree>, name: string) => rows.find((r) => r.name === name)!;

describe('frameworks (Multipower, Variable Power Pool)', () => {
  it('reads a Multipower shield in equipment with its slots, priced as Hero Designer prices them', () => {
    const character = parseHdcFile(SHIELD);
    const shield = character.equipment!.find((e) => e.id === '9400')!;
    expect(shield.xmlId).toBe('MULTIPOWER');
    expect(shield.name).toBe('Buckler, Wooden');
    // Reserve 5 with OAF (-1): 2.5, rounded down; fixed DCV slot 1 (minimum); variable 2d6 HA slot 10/5 = 2
    expect(shield.ownCost?.real).toBe(2);
    const tree = buildItemTree(character, 'equipment');
    const shieldRow = row(tree, 'Buckler, Wooden');
    expect(shieldRow.children.map((c) => [c.name, c.cost])).toEqual([['DCV', 1], ['Shield Bash', 2]]);
    expect(shieldRow.cost).toBe(5);
    expect(tree).toHaveLength(1);
  });

  it('edits the reserve and a slot, keeping the framework total right', () => {
    const character = parseHdcFile(SHIELD);
    const draft = powerDraft(character, 'equipment', '9400');
    expect(draft.kind).toBe('multipower');
    expect(draft.reserve).toBe(5);
    expect(powerFormView(character, 'equipment', draft, '9400').framework?.name).toBe('Multipower');

    // Reserve 10 with OAF: 5; slots unchanged (3)
    let edited = savePowerDraft(character, 'equipment', '9400', { ...draft, reserve: 10 });
    expect(row(buildItemTree(edited, 'equipment'), 'Buckler, Wooden').cost).toBe(8);

    // The bash becomes a fixed slot: 10/10 = 1
    const bash = powerDraft(edited, 'equipment', '9403');
    expect(powerFormView(edited, 'equipment', bash, '9403').slot?.isMultipower).toBe(true);
    edited = savePowerDraft(edited, 'equipment', '9403', { ...bash, slotFixed: true });
    expect(row(buildItemTree(edited, 'equipment'), 'Buckler, Wooden').cost).toBe(7);

    const doc = HdcDocument.parse(updateHdc(SHIELD, edited).xml);
    expect(doc.findById('9400')!.name).toBe('MULTIPOWER');
    expect(doc.findById('9400')!.getAttr('BASECOST')).toBe('10.0');
    expect(doc.findById('9400')!.getAttr('NAME')).toBe('Buckler, Wooden');
    expect(doc.findById('9403')!.getAttr('ULTRA_SLOT')).toBe('Yes');
    // Read back: the same figures
    expect(row(buildItemTree(parseHdcFile(doc.toString()), 'equipment'), 'Buckler, Wooden').cost).toBe(7);
  });

  it('prices Multipower and pool slots in Powers, and counts them in the totals', () => {
    const character = parseHdcFile(POWERS);
    const tree = buildItemTree(character, 'powers');
    // Reserve 40; 8d6 Blast (40) fixed = 4, variable = 8
    expect(row(tree, 'Elemental Blasts').children.map((c) => c.cost)).toEqual([4, 8]);
    expect(row(tree, 'Elemental Blasts').cost).toBe(52);
    // Pool 30 + control 15; powers in the pool cost nothing
    expect(row(tree, 'Spellbook').children[0]!.cost).toBe(0);
    expect(row(tree, 'Spellbook').cost).toBe(45);
    expect(calculateCostBreakdown(character).powers).toBe(97);
  });

  it('creates a Multipower and adds a fixed slot to it', () => {
    let character = parseHdcFile(blankHdc());
    character = savePowerDraft(character, 'powers', undefined, { ...powerDraft(character, 'powers', undefined, 'multipower'), name: 'Arcane Bolts', reserve: 30 });
    const mp = character.powers.find((p) => p.name === 'Arcane Bolts')!;
    const slot = { ...selectPower(powerDraft(character, 'powers'), 'ENERGYBLAST'), levels: 6, name: 'Bolt', parentId: mp.id };
    character = savePowerDraft(character, 'powers', undefined, slot);
    expect(row(buildItemTree(character, 'powers'), 'Arcane Bolts').cost).toBe(33);

    const { xml } = updateHdc(blankHdc(), character);
    const doc = HdcDocument.parse(xml);
    const framework = doc.root.firstElement('POWERS')!.elements().find((e) => e.name === 'MULTIPOWER')!;
    expect(framework.getAttr('BASECOST')).toBe('30.0');
    expect(framework.getAttr('NAME')).toBe('Arcane Bolts');
    const bolt = doc.root.firstElement('POWERS')!.elements().find((e) => e.getAttr('NAME') === 'Bolt')!;
    expect(bolt.getAttr('PARENTID')).toBe(framework.getAttr('ID'));
    expect(bolt.getAttr('ULTRA_SLOT')).toBe('Yes');
    expect(row(buildItemTree(parseHdcFile(xml), 'powers'), 'Arcane Bolts').cost).toBe(33);
  });
});

describe('a compound power as a Multipower slot', () => {
  it('costs its slot fraction when saved', () => {
    const xml = blankHdc().replace(
      '<EQUIPMENT />',
      `<EQUIPMENT>
    <MULTIPOWER XMLID="GENERIC_OBJECT" ID="9600" BASECOST="15.0" LEVELS="0" ALIAS="Multipower" POSITION="0" NAME="Spiked Buckler" />
    <POWER XMLID="COMPOUNDPOWER" ID="9601" BASECOST="0.0" LEVELS="0" ALIAS="Compound Power" POSITION="1" PARENTID="9600" ULTRA_SLOT="Yes" NAME="Spiked Bash">
      <POWER XMLID="HANDTOHANDATTACK" ID="9602" BASECOST="0.0" LEVELS="2" ALIAS="Hand-To-Hand Attack" POSITION="0" NAME="" QUANTITY="1" />
      <POWER XMLID="HKA" ID="9603" BASECOST="0.0" LEVELS="1" ALIAS="Killing Attack - Hand-To-Hand" POSITION="1" NAME="" QUANTITY="1" />
    </POWER>
  </EQUIPMENT>`,
    );
    const character = parseHdcFile(xml);
    const before = row(buildItemTree(character, 'equipment'), 'Spiked Buckler');
    const draft = powerDraft(character, 'equipment', '9601');
    expect(draft.kind).toBe('compound');
    expect(powerFormView(character, 'equipment', draft, '9601').slot?.isMultipower).toBe(true);
    const resaved = savePowerDraft(character, 'equipment', '9601', draft);
    expect(row(buildItemTree(resaved, 'equipment'), 'Spiked Buckler').cost).toBe(before.cost);
  });
});
