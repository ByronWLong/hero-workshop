import { describe, expect, it } from 'vitest';
import { addModifier, blankHdc, modifierBookNotes, parseHdcFile, powerBookNotes, powerDraft, powerFormView, setModifierOption } from '../src/index.js';

const pages = (notes: { page: number }[]) => notes.map((n) => n.page);
const mod = (xmlId: string, extra: { optionId?: string; levels?: number } = {}) => ({ xmlId, value: 0, ...extra });
const on = (power: string, ...mods: ReturnType<typeof mod>[]) => ({ xmlId: power, modifiers: mods });

describe('Chapter Five rules for particular powers', () => {
  it("notes modifiers a power's description rules out", () => {
    const darkness = on('DARKNESS', mod('AOE', { optionId: 'RADIUS' }));
    expect(pages(modifierBookNotes(darkness.modifiers[0]!, darkness))).toEqual([187]);
    const cone = on('DARKNESS', mod('AOE', { optionId: 'CONE' }));
    expect(pages(modifierBookNotes(cone.modifiers[0]!, cone))).toEqual([]);
    const entangle = on('ENTANGLE', mod('PERSONALIMMUNITY'));
    expect(pages(modifierBookNotes(entangle.modifiers[0]!, entangle))).toEqual([219]);
    const healing = on('HEALING', mod('PERSISTENT'));
    expect(pages(modifierBookNotes(healing.modifiers[0]!, healing))).toEqual([235]);
    // Boost: Aid that Costs END to maintain
    const boost = on('AID', mod('COSTSENDTOMAINTAIN'), mod('COSTSENDONLYTOACTIVATE'));
    expect(pages(modifierBookNotes(boost.modifiers[1]!, boost))).toEqual([168]);
    const aid = on('AID', mod('COSTSENDONLYTOACTIVATE'));
    expect(pages(modifierBookNotes(aid.modifiers[0]!, aid))).toEqual([]);
  });

  it('notes what the power itself needs', () => {
    expect(pages(powerBookNotes({ xmlId: 'DRAIN', modifiers: [] }))).toEqual([195]);
    expect(pages(powerBookNotes({ xmlId: 'DRAIN', modifiers: [], input: 'STR' }))).toEqual([]);
    expect(pages(powerBookNotes({ xmlId: 'DRAIN', modifiers: [mod('AVAD')], input: 'BODY' }))).toEqual([196]);
    expect(pages(powerBookNotes({ xmlId: 'DISPEL', modifiers: [], input: 'STR' }))).toEqual([193]);
    expect(pages(powerBookNotes({ xmlId: 'TELEKINESIS', modifiers: [], levels: 1 }))).toEqual([294]);
    expect(pages(powerBookNotes({ xmlId: 'CHANGEENVIRONMENT', modifiers: [], adders: ['LONG'] }))).toEqual([174]);
    expect(pages(powerBookNotes({ xmlId: 'CHANGEENVIRONMENT', modifiers: [], adders: ['PERROLL'] }))).toEqual([]);
    expect(pages(powerBookNotes({ xmlId: 'LUCK', modifiers: [], framework: 'VPP' }))).toEqual([161]);
    expect(pages(powerBookNotes({ xmlId: 'LUCK', modifiers: [] }))).toEqual([]);
  });

  it('shows them in the power dialog', () => {
    const xml = blankHdc().replace('<POWERS />', `<POWERS>
      <POWER XMLID="DARKNESS" ID="9200" BASECOST="0.0" LEVELS="2" ALIAS="Darkness" POSITION="0" NAME="Gloom" OPTIONID="SIGHTGROUP" QUANTITY="1" />
      <POWER XMLID="DRAIN" ID="9201" BASECOST="0.0" LEVELS="2" ALIAS="Drain" POSITION="1" NAME="Sap" QUANTITY="1" />
    </POWERS>`);
    const c = parseHdcFile(xml);
    let gloom = addModifier(powerDraft(c, 'powers', '9200'), 'AOE');
    gloom = setModifierOption(gloom, gloom.modifiers[0]!.id, 'RADIUS');
    expect(powerFormView(c, 'powers', gloom, '9200').modifiers[0]!.bookNotes[0]).toMatch(/\(6E1 187\)$/);
    expect(powerFormView(c, 'powers', powerDraft(c, 'powers', '9201'), '9201').powerNotes).toEqual([
      'Name the Characteristic or Power the Drain affects. (6E1 195)',
    ]);
  });
});
