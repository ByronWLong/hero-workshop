import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  HdcDocument,
  decodeHdcBytes,
  parseHdcDocument,
  parseHdcFile,
  parseXml,
  updateHdc,
  createHdc,
  validateForFoundry,
} from '../src/index.js';
import type { Character, Power, Skill } from '../src/types.js';

// -----------------------------------------------------------------------------
// Corpus: every real character file in the repo
// -----------------------------------------------------------------------------

const repoRoot = resolve(__dirname, '../../..');
const corpus = [join(repoRoot, 'samples'), repoRoot]
  .filter(existsSync)
  .flatMap((dir) => readdirSync(dir).filter((f) => f.endsWith('.hdc')).map((f) => join(dir, f)))
  .map((path) => ({ path, text: decodeHdcBytes(readFileSync(path)) }))
  // Campaign rules files share the extension but aren't characters
  .filter(({ text }) => /<CHARACTER[\s>]/.test(text));

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('HDC corpus round-trip', () => {
  it('has sample files to test against', () => {
    expect(corpus.length).toBeGreaterThan(0);
  });

  for (const { path, text } of corpus) {
    const name = path.slice(repoRoot.length + 1);

    it(`${name}: XML serializes back byte-for-byte`, () => {
      expect(parseXml(text).toString()).toBe(text);
    });

    it(`${name}: saving an unedited character changes nothing`, () => {
      const doc = HdcDocument.parse(text);
      doc.ensureIds();
      const withIds = doc.toString();
      const character = parseHdcDocument(doc);

      // JSON round-trip mimics the web app's HTTP transport (drops undefined, etc.)
      const { xml, report } = updateHdc(text, clone(character));
      expect(report.warnings).toEqual([]);
      expect(report.changes).toEqual([]);
      expect(xml).toBe(withIds);
    });

    it(`${name}: ID assignment is deterministic`, () => {
      const a = HdcDocument.parse(text);
      const b = HdcDocument.parse(text);
      a.ensureIds();
      b.ensureIds();
      expect(a.toString()).toBe(b.toString());
    });
  }
});

// -----------------------------------------------------------------------------
// Targeted edits against a fixture shaped like real Hero Designer output
// -----------------------------------------------------------------------------

const G = 'MULTIPLIER="1.0" GRAPHIC="Burst" COLOR="255 255 255" SFX="Default" SHOW_ACTIVE_COST="Yes" INCLUDE_NOTES_IN_PRINTOUT="Yes"';
const FIXTURE = `<?xml version="1.0" encoding="UTF-16"?>
<CHARACTER version="6.0" TEMPLATE="builtIn.Heroic6E.hdt">
  <BASIC_CONFIGURATION BASE_POINTS="175" DISAD_POINTS="50" EXPERIENCE="0" />
  <CHARACTER_INFO CHARACTER_NAME="Test Hero" PLAYER_NAME="" HEIGHT="72" WEIGHT="180" GENRE="Fantasy Hero">
    <BACKGROUND>Born in a test.</BACKGROUND>
    <NOTES1 />
  </CHARACTER_INFO>
  <CHARACTERISTICS>
    <STR XMLID="STR" ID="100" BASECOST="0.0" LEVELS="5" ALIAS="STR" POSITION="1" ${G} NAME="" AFFECTS_PRIMARY="Yes" AFFECTS_TOTAL="Yes">
      <NOTES />
    </STR>
    <DEX XMLID="DEX" ID="101" BASECOST="0.0" LEVELS="3" ALIAS="DEX" POSITION="2" ${G} NAME="" AFFECTS_PRIMARY="Yes" AFFECTS_TOTAL="Yes">
      <NOTES />
    </DEX>
  </CHARACTERISTICS>
  <SKILLS>
    <SKILL XMLID="PROFESSIONAL_SKILL" ID="200" BASECOST="2.0" LEVELS="0" ALIAS="PS" POSITION="0" ${G} NAME="Magic Skill" INPUT="Wizardry" CHARACTERISTIC="INT" FAMILIARITY="No" PROFICIENCY="No" LEVELSONLY="No">
      <NOTES />
    </SKILL>
    <SKILL XMLID="STEALTH" ID="201" BASECOST="3.0" LEVELS="1" ALIAS="Stealth" POSITION="1" ${G} NAME="" CHARACTERISTIC="DEX" FAMILIARITY="No" PROFICIENCY="No" LEVELSONLY="No" EVERYMAN="No">
      <NOTES />
    </SKILL>
  </SKILLS>
  <PERKS />
  <TALENTS />
  <MARTIALARTS />
  <POWERS>
    <POWER XMLID="ENERGYBLAST" ID="300" BASECOST="0.0" LEVELS="8" ALIAS="Blast" POSITION="0" ${G} NAME="Firebolt" INPUT="ED" USESTANDARDEFFECT="No" QUANTITY="1" AFFECTS_PRIMARY="No" AFFECTS_TOTAL="Yes">
      <NOTES />
      <MODIFIER XMLID="REQUIRESASKILLROLL" ID="301" BASECOST="-0.5" LEVELS="0" ALIAS="Requires A Roll" POSITION="-1" ${G} OPTION="PS" OPTIONID="PS" OPTION_ALIAS="Wizardry" NAME="" COMMENTS="Magic Skill" PRIVATE="No" FORCEALLOW="No">
        <NOTES />
      </MODIFIER>
      <MODIFIER XMLID="ARMORPIERCING" ID="302" BASECOST="0.0" LEVELS="1" ALIAS="Armor Piercing" POSITION="-1" ${G} NAME="" COMMENTS="" PRIVATE="No" FORCEALLOW="Yes" CUSTOMATTR="keep-me">
        <NOTES />
      </MODIFIER>
    </POWER>
    <POWER XMLID="DRAIN" ID="310" BASECOST="0.0" LEVELS="2" ALIAS="Drain" POSITION="1" ${G} NAME="Sap" INPUT="BODY" USESTANDARDEFFECT="No" QUANTITY="1" AFFECTS_PRIMARY="No" AFFECTS_TOTAL="Yes">
      <NOTES />
    </POWER>
  </POWERS>
  <DISADVANTAGES />
  <EQUIPMENT />
</CHARACTER>
`;

function load(xml = FIXTURE) {
  const character = parseHdcFile(xml);
  return { character, edited: clone(character) };
}

/** Lines that differ between two serializations */
function diffLines(a: string, b: string): string[] {
  const left = a.split('\n');
  const right = b.split('\n');
  return right.filter((line, i) => line !== left[i]);
}

function element(xml: string, id: string) {
  const doc = HdcDocument.parse(xml);
  const el = doc.findById(id);
  if (!el) throw new Error(`No element with ID ${id}`);
  return el;
}

describe('updateHdc edits', () => {
  it('changes only LEVELS when a characteristic is raised', () => {
    const { edited } = load();
    const str = edited.characteristics.find((c) => c.type === 'STR')!;
    Object.assign(str, { levels: 10, totalValue: 20, baseCost: 10, realCost: 10 });

    const { xml, report } = updateHdc(FIXTURE, edited);
    expect(report.warnings).toEqual([]);
    const changed = diffLines(FIXTURE, xml);
    expect(changed).toHaveLength(1);
    expect(changed[0]).toContain('LEVELS="10"');
    expect(changed[0]).toContain(G); // untouched attributes survive
  });

  it('writes character info text children and metric conversions', () => {
    const { edited } = load();
    edited.characterInfo.background = 'Rewritten <history> & more';
    edited.characterInfo.notes1 = 'A note';
    const { xml } = updateHdc(FIXTURE, edited);
    expect(xml).toContain('<BACKGROUND>Rewritten &lt;history&gt; &amp; more</BACKGROUND>');
    expect(xml).toContain('<NOTES1>A note</NOTES1>');
    expect(parseHdcFile(xml).characterInfo.background).toBe('Rewritten <history> & more');
  });

  it('rebinds Requires A Roll when the bound skill is renamed', () => {
    const { edited } = load();
    const ps = edited.skills.find((s) => s.id === '200')!;
    expect(ps.name).toBe('Magic Skill: PS');
    ps.name = 'Arcane Lore: PS';

    const { xml, report } = updateHdc(FIXTURE, edited);
    const skill = element(xml, '200');
    expect(skill.getAttr('NAME')).toBe('Arcane Lore');
    expect(skill.getAttr('INPUT')).toBe('Wizardry');
    const modifier = element(xml, '301');
    expect(modifier.getAttr('COMMENTS')).toBe('Arcane Lore');
    expect(modifier.getAttr('OPTIONID')).toBe('PS');
    expect(report.changes.some((c) => c.includes('rebound'))).toBe(true);
  });

  it('creates new skills from the Hero Designer catalog', () => {
    const { edited } = load();
    // The web editor's common-skill picker leaves xmlid empty and defaults to INT
    const newSkill: Skill = {
      id: 'tmp-1', name: 'Climbing', type: 'CHARACTERISTIC_BASED', position: 5,
      levels: 2, baseCost: 7, characteristic: 'INT',
    };
    const ks: Skill = { id: 'tmp-2', name: 'KS: Dragon Lore', type: 'KNOWLEDGE', position: 6, levels: 1, baseCost: 3 };
    edited.skills.push(newSkill, ks);

    const { xml, report } = updateHdc(FIXTURE, edited);
    const climbing = element(xml, report.idMap['tmp-1']!);
    expect(climbing.getAttr('XMLID')).toBe('CLIMBING');
    expect(climbing.getAttr('CHARACTERISTIC')).toBe('DEX');
    expect(climbing.getAttr('BASECOST')).toBe('3.0');
    expect(Number(climbing.getAttr('ID'))).toBeGreaterThan(302);

    const lore = element(xml, report.idMap['tmp-2']!);
    expect(lore.getAttr('XMLID')).toBe('KNOWLEDGE_SKILL');
    expect(lore.getAttr('ALIAS')).toBe('KS');
    expect(lore.getAttr('INPUT')).toBe('Dragon Lore');

    // And it reads back as the same skill
    expect(parseHdcFile(xml).skills.find((s) => s.id === report.idMap['tmp-2'])?.name).toBe('KS: Dragon Lore');
  });

  it('keeps unknown modifier attributes when the editor regenerates modifier ids', () => {
    const { edited } = load();
    const blast = edited.powers.find((p) => p.id === '300')!;
    // PowersTab rebuilds every modifier with a fresh id on save
    blast.modifiers = blast.modifiers!.map((m) => ({ ...m, id: `regen-${m.xmlId}` }));
    blast.modifiers.find((m) => m.xmlId === 'ARMORPIERCING')!.levels = 2;

    const { xml } = updateHdc(FIXTURE, edited);
    const ap = element(xml, '302');
    expect(ap.getAttr('LEVELS')).toBe('2');
    expect(ap.getAttr('CUSTOMATTR')).toBe('keep-me');
    expect(ap.getAttr('FORCEALLOW')).toBe('Yes');
    expect(element(xml, '301').getAttr('COMMENTS')).toBe('Magic Skill');
  });

  it('adds a power with Foundry-safe structure', () => {
    const { edited } = load();
    const power: Power = {
      id: 'tmp-p', name: 'Frost Ray', type: 'ENERGYBLAST' as Power['type'], position: 9, levels: 6, baseCost: 30,
      modifiers: [
        { id: 'tmp-m', xmlId: 'NORANGE', name: 'No Range', value: -0.5, isAdvantage: false, isLimitation: true },
      ],
    };
    edited.powers.push(power);

    const { xml, report } = updateHdc(FIXTURE, edited);
    const el = element(xml, report.idMap['tmp-p']!);
    expect(el.name).toBe('POWER');
    expect(el.getAttr('XMLID')).toBe('ENERGYBLAST');
    expect(el.getAttr('NAME')).toBe('Frost Ray');
    expect(el.getAttr('INPUT')).toBe('ED');
    for (const flag of ['DOESBODY', 'DOESDAMAGE', 'DOESKNOCKBACK', 'KILLING']) expect(el.hasAttr(flag)).toBe(true);
    expect(el.hasAttr('LVLCOST')).toBe(false);
    const modifier = el.elements('MODIFIER')[0]!;
    expect(modifier.getAttr('BASECOST')).toBe('-0.5');
    expect(modifier.hasAttr('ISLIMITATION')).toBe(false);
    expect(validateForFoundry(HdcDocument.parse(xml)).filter((i) => i.itemId === el.getAttr('ID'))).toEqual([]);
  });

  it('removes a deleted power and leaves its neighbours intact', () => {
    const { edited } = load();
    edited.powers = edited.powers.filter((p) => p.id !== '310');
    const { xml } = updateHdc(FIXTURE, edited);
    expect(xml).not.toContain('ID="310"');
    expect(xml).toContain('ID="300"');
    // No blank line left behind
    expect(xml).not.toMatch(/\n\s*\n\s*<\/POWERS>/);
  });

  it('creates a complete file for a character with no source', () => {
    const { character } = load();
    const { xml } = createHdc({ ...character, characterInfo: { ...character.characterInfo, characterName: 'Fresh' } });
    const reparsed = parseHdcFile(xml);
    expect(reparsed.characterInfo.characterName).toBe('Fresh');
    expect(reparsed.skills.map((s) => s.name)).toEqual(character.skills.map((s) => s.name));
    expect(reparsed.powers.map((p) => p.name)).toEqual(character.powers.map((p) => p.name));
    expect(reparsed.characteristics.find((c) => c.type === 'STR')?.levels).toBe(5);
  });
});

describe('validateForFoundry', () => {
  it('flags the known Foundry import hazards', () => {
    const bad = FIXTURE
      .replace('ALIAS="Blast" POSITION="0"', 'ALIAS="Blast" LVLCOST="5" POSITION="0"')
      .replace('COMMENTS="Magic Skill"', 'COMMENTS="Nonexistent Skill"')
      .replace('INPUT="ED" USESTANDARDEFFECT', 'USESTANDARDEFFECT')
      .replace('CHARACTERISTIC="DEX" FAMILIARITY', 'CHARACTERISTIC="INT" FAMILIARITY');
    const messages = validateForFoundry(HdcDocument.parse(bad)).map((i) => i.message).join('\n');
    expect(messages).toMatch(/LVLCOST/);
    expect(messages).toMatch(/Nonexistent Skill/);
    expect(messages).toMatch(/INPUT="PD", "ED" or "MD"/);
    expect(messages).toMatch(/Stealth/);
  });
});

// Keep the Character import used for type-checking the fixtures
export type { Character };

describe('change reporting', () => {
  it('does not report items whose only changes are derived values', () => {
    const character = parseHdcFile(FIXTURE);
    const edited = clone(character);
    const blast = edited.powers.find((p) => p.id === '300')!;
    Object.assign(blast, { realCost: 999, activeCost: 999, endCost: 99 });
    const { xml, report } = updateHdc(FIXTURE, edited);
    expect(report.changes).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(xml).toBe(HdcDocument.parse(FIXTURE).toString());
  });
});
