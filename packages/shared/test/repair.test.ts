import { describe, expect, it } from 'vitest';
import { HdcDocument, blankHdc, repairForFoundry } from '../src/index.js';

const CSL = (id: string, option: string, alias: string) =>
  `<SKILL XMLID="COMBAT_LEVELS" ID="${id}" BASECOST="0.0" LEVELS="2" ALIAS="Combat Skill Levels" POSITION="0" OPTION="${option}" OPTIONID="${option}" OPTION_ALIAS="${alias}" NAME="" CHARACTERISTIC="GENERAL" FAMILIARITY="No" PROFICIENCY="No" LEVELSONLY="No" EVERYMAN="No" NATIVE_TONGUE="No" />`;

const CREATURE = blankHdc()
  .replace('<SKILLS />', `<SKILLS>
    ${CSL('9700', 'SINGLE', 'with Fire Breath')}
    ${CSL('9701', 'HTH', 'with HTH Combat')}
    ${CSL('9702', 'TIGHT', 'OCV with Bite, Punch, and Tail Bash')}
    ${CSL('9703', 'SINGLE', 'with Haunting Melody')}
  </SKILLS>`)
  .replace('<POWERS />', `<POWERS>
    <POWER XMLID="HKA" ID="9710" BASECOST="0.0" LEVELS="1" ALIAS="Killing Attack - Hand-To-Hand" POSITION="0" NAME="Bite" INPUT="PD" QUANTITY="1" />
    <POWER XMLID="HANDTOHANDATTACK" ID="9711" BASECOST="0.0" LEVELS="2" ALIAS="Hand-To-Hand Attack" POSITION="1" NAME="Tail Bash" INPUT="PD" QUANTITY="1" />
    <POWER XMLID="RKA" ID="9712" BASECOST="0.0" LEVELS="2" ALIAS="Killing Attack - Ranged" POSITION="2" NAME="Fire Breath" INPUT="ED" QUANTITY="1" />
    <POWER XMLID="DRAIN" ID="9713" BASECOST="0.0" LEVELS="2" ALIAS="Drain" POSITION="3" NAME="Life Sap" INPUT="BODY and STUN" QUANTITY="1" />
    <POWER XMLID="HEALING" ID="9716" BASECOST="0.0" LEVELS="1" ALIAS="Healing" POSITION="5" NAME="Touch" INPUT="BODY or STUN" QUANTITY="1" />
    <POWER XMLID="FLIGHT" ID="9714" BASECOST="0.0" LEVELS="10" ALIAS="Flight" POSITION="4" NAME="Water Walking" QUANTITY="1">
      <MODIFIER XMLID="USABLEAS" ID="9715" BASECOST="0.25" LEVELS="0" ALIAS="Usable Underwater" POSITION="-1" NAME="" />
    </POWER>
  </POWERS>`);

const links = (doc: HdcDocument, id: string) =>
  doc.findById(id)!.elements().filter((e) => e.name === 'ADDER' && e.getAttr('XMLID') === 'ADDER').map((e) => e.getAttr('ALIAS'));

describe('repairForFoundry', () => {
  it('links Combat Skill Levels to the attacks their text names', () => {
    const result = repairForFoundry(CREATURE);
    const doc = HdcDocument.parse(result.xml);
    expect(links(doc, '9700')).toEqual(['Fire Breath']);
    // All hand-to-hand attacks, not the ranged breath
    expect(links(doc, '9701')).toEqual(['Bite', 'Tail Bash']);
    // "Punch" is the Strike maneuver
    expect(links(doc, '9702')).toEqual(['Bite', 'Strike', 'Tail Bash']);
    // Nothing to link: reported, left alone
    expect(links(doc, '9703')).toEqual([]);
    expect(result.unresolved.join('\n')).toContain('Haunting Melody');
    // Links cost nothing
    for (const adder of doc.findById('9700')!.elements().filter((e) => e.name === 'ADDER')) expect(adder.getAttr('BASECOST')).toBe('0.0');
  });

  it('lists adjustment targets comma-separated and names Usable As movement', () => {
    const doc = HdcDocument.parse(repairForFoundry(CREATURE).xml);
    expect(doc.findById('9713')!.getAttr('INPUT')).toBe('BODY, STUN');
    // "BODY or STUN" is Simplified Healing
    expect(doc.findById('9716')!.getAttr('INPUT')).toBe('SIMPLIFIED');
    const usable = doc.findById('9715')!;
    expect(usable.getAttr('COMMENTS')).toBe('swimming');
    expect(usable.getAttr('ALIAS')).toBe('Usable Underwater');
  });

  it('changes nothing the second time (hero6e rebuilds re-run it)', () => {
    const once = repairForFoundry(CREATURE).xml;
    const twice = repairForFoundry(once);
    expect(twice.changes).toEqual([]);
    expect(twice.xml).toBe(once);
  });

  it('leaves a character with nothing to repair untouched', () => {
    const xml = blankHdc();
    const result = repairForFoundry(xml);
    expect(result.changes).toEqual([]);
    expect(result.xml).toBe(xml);
  });
});
