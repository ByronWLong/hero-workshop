import { describe, expect, it } from 'vitest';
import { HdcDocument, blankHdc, convertCustomSpells, convertSpellModifier, parseHdcFile, powerDraft, powerFormView, updateHdc } from '../src/index.js';

// Spells built with a custom "Spell" modifier (-1/2), which is Fantasy Hero's Spell limitation
const spell = (id: string) =>
  `<MODIFIER XMLID="MODIFIER" ID="${id}" BASECOST="-0.5" LEVELS="0" ALIAS="Spell" POSITION="-1" MULTIPLIER="1.0" GRAPHIC="Burst" COLOR="255 255 255" SFX="Default" SHOW_ACTIVE_COST="Yes" INCLUDE_NOTES_IN_PRINTOUT="Yes" NAME="" COMMENTS="" PRIVATE="No" FORCEALLOW="No"><NOTES /></MODIFIER>`;
const XML = blankHdc().replace('<POWERS />', `<POWERS>
    <POWER XMLID="RKA" ID="9600" BASECOST="0.0" LEVELS="1" ALIAS="Killing Attack - Ranged" POSITION="0" NAME="Mystic Bolt" INPUT="ED" QUANTITY="1">
      <NOTES />
      <MODIFIER XMLID="FOCUS" ID="9601" BASECOST="-1.0" LEVELS="0" ALIAS="Focus" POSITION="-1" OPTION="OAF" OPTIONID="OAF" OPTION_ALIAS="OAF" />
      ${spell('9602')}
    </POWER>
    <POWER XMLID="ENERGYBLAST" ID="9610" BASECOST="0.0" LEVELS="6" ALIAS="Blast" POSITION="1" NAME="Fire Bolt" INPUT="ED" QUANTITY="1">
      <NOTES />
      ${spell('9611')}
    </POWER>
  </POWERS>`);

describe('custom Spell modifiers', () => {
  it('offers to convert one, or all of them, keeping costs', () => {
    const c = parseHdcFile(XML);
    const draft = powerDraft(c, 'powers', '9600');
    const view = powerFormView(c, 'powers', draft, '9600');
    const row = view.modifiers.find((m) => m.toSpell)!;
    expect(row.id).toBe('9602');
    expect(view.otherCustomSpells).toBe(1);

    expect(convertSpellModifier(draft, '9602').modifiers.find((m) => m.id === '9602')).toMatchObject({ xmlId: 'SPELL', value: -0.5 });

    const { character, count } = convertCustomSpells(c);
    expect(count).toBe(2);
    const xml = updateHdc(XML, character).xml;
    const doc = HdcDocument.parse(xml);
    for (const id of ['9602', '9611']) {
      const el = doc.findById(id)!;
      expect([el.getAttr('XMLID'), el.getAttr('BASECOST'), el.getAttr('ALIAS')]).toEqual(['SPELL', '-0.5', 'Spell']);
    }

    // Every power costs what it did, and nothing custom named Spell is left
    const after = parseHdcFile(xml);
    expect(after.powers.map((p) => [p.name, p.realCost])).toEqual(c.powers.map((p) => [p.name, p.realCost]));
    expect(convertCustomSpells(after).count).toBe(0);
  });

  it("reads a power's notes (Hero Designer's NOTES text), not its name", () => {
    const note = 'A bolt of mystic force.\n\n(The HERO System Grimoire)';
    const c = parseHdcFile(XML.replace('<NOTES />', `<NOTES>${note}</NOTES>`));
    expect(c.powers.find((p) => p.id === '9600')!.notes).toBe(note);
    expect(powerDraft(c, 'powers', '9600').notes).toBe(note);
    expect(c.powers.find((p) => p.id === '9610')!.notes).toBeUndefined();
  });
});
