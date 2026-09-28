import { describe, expect, it } from 'vitest';
import { HdcDocument } from '@hero-workshop/shared';
import { applyDrift, detectDrift, type DriftItemSource } from '../src/sync/drift';

const XML = `<?xml version="1.0" encoding="UTF-16"?>
<CHARACTER version="6.0">
  <CHARACTERISTICS>
    <STR XMLID="STR" ID="1" BASECOST="0.0" LEVELS="5" ALIAS="STR" POSITION="1" NAME="" />
  </CHARACTERISTICS>
  <POWERS>
    <POWER XMLID="ENERGYBLAST" ID="10" BASECOST="0.0" LEVELS="8" ALIAS="Blast" NAME="Firebolt" INPUT="ED" DOESBODY="No" SHOW_ACTIVE_COST="Yes">
      <NOTES />
      <ADDER XMLID="PLUSONEPIP" ID="11" BASECOST="3.0" LEVELS="0" ALIAS="+1 pip" SELECTED="YES">
        <NOTES />
      </ADDER>
    </POWER>
    <POWER XMLID="FLIGHT" ID="20" BASECOST="0.0" LEVELS="10" ALIAS="Flight" NAME="" />
  </POWERS>
</CHARACTER>
`;

/** Item data shaped the way hero6e imports it (booleans coerced, numbers typed) */
function blast(overrides: Record<string, unknown> = {}): DriftItemSource {
  return {
    id: 'a', name: 'Firebolt', type: 'power',
    system: {
      XMLID: 'ENERGYBLAST', ID: 10, BASECOST: 0, LEVELS: 8, ALIAS: 'Blast', NAME: 'Firebolt', INPUT: 'ED',
      DOESBODY: 'false', SHOW_ACTIVE_COST: true, xmlTag: 'POWER',
      ADDER: [{ XMLID: 'PLUSONEPIP', ID: 11, BASECOST: 3, LEVELS: 0, ALIAS: '+1 pip', SELECTED: true }],
      ...overrides,
    },
  };
}
const flight: DriftItemSource = {
  id: 'b', name: 'Flight', type: 'power',
  system: { XMLID: 'FLIGHT', ID: 20, BASECOST: 0, LEVELS: 10, ALIAS: 'Flight', NAME: '' },
};
const actorSystem = { STR: { LEVELS: 5 } };

describe('detectDrift', () => {
  it('finds nothing when Foundry matches the HDC (including hero6e coercions)', () => {
    const doc = HdcDocument.parse(XML);
    expect(detectDrift(doc, { items: [blast(), flight], actorSystem })).toEqual([]);
  });

  it('pulls a Foundry-side LEVELS edit and characteristic change into the HDC', () => {
    const doc = HdcDocument.parse(XML);
    const changes = detectDrift(doc, { items: [blast({ LEVELS: 10 }), flight], actorSystem: { STR: { LEVELS: 7 } } });
    expect(changes.map((c) => c.summary)).toEqual(['LEVELS 5 → 7', 'LEVELS "8" → "10"']);
    applyDrift(doc, changes);
    expect(doc.findById('10')!.getAttr('LEVELS')).toBe('10');
    expect(doc.findById('1')!.getAttr('LEVELS')).toBe('7');
  });

  it('removes adders deleted in Foundry and keeps the rest of the file intact', () => {
    const doc = HdcDocument.parse(XML);
    const changes = detectDrift(doc, { items: [blast({ ADDER: [] }), flight], actorSystem });
    expect(changes).toHaveLength(1);
    applyDrift(doc, changes);
    expect(doc.toString()).not.toContain('PLUSONEPIP');
    expect(doc.toString()).toContain('SHOW_ACTIVE_COST="Yes"');
  });

  it('only recommends deleting items Foundry is known to have imported', () => {
    const doc = HdcDocument.parse(XML);
    const unknown = detectDrift(doc, { items: [blast()], actorSystem });
    expect(unknown).toHaveLength(1);
    expect(unknown[0]!.recommended).toBe(false);

    const known = detectDrift(doc, { items: [blast()], actorSystem, syncedIds: ['10', '20'] });
    expect(known[0]!.summary).toBe('Deleted in Foundry');
    expect(known[0]!.recommended).toBe(true);
  });

  it('adds items created in Foundry from their stored XML fragment', () => {
    const doc = HdcDocument.parse(XML);
    const added: DriftItemSource = {
      id: 'c', name: 'Armor', type: 'power',
      system: {
        XMLID: 'ARMOR', ID: 30, LEVELS: 0, ALIAS: 'Resistant Protection', PDLEVELS: undefined,
        _hdcXml: '<POWER XMLID="ARMOR" ID="30" BASECOST="0.0" LEVELS="0" ALIAS="Resistant Protection" PDLEVELS="4" EDLEVELS="4" />',
      },
    };
    const changes = detectDrift(doc, { items: [blast(), flight, added], actorSystem });
    expect(changes.map((c) => c.kind)).toEqual(['added']);
    applyDrift(doc, changes);
    const el = doc.findById('30')!;
    expect(el.parent?.name).toBe('POWERS');
    expect(el.getAttr('PDLEVELS')).toBe('4');
  });
});
