import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HdcDocument, blankHdc, decodeHdcBytes, extractItems, insertItems, parseHdcFile, updateHdc, withInsertedItems } from '../src/index.js';

const sample = (name: string) => decodeHdcBytes(readFileSync(resolve(__dirname, '../../../samples', name)));

describe('item transfer', () => {
  const source = HdcDocument.parse(
    blankHdc().replace(
      /<POWERS\s*\/>|<POWERS>\s*<\/POWERS>/,
      `<POWERS>
    <LIST XMLID="GENERIC_OBJECT" ID="9010" ALIAS="Spells" NAME="" />
    <POWER XMLID="DRAIN" ID="9011" PARENTID="9010" LEVELS="3" INPUT="BODY" NAME="Life Sap">
      <MODIFIER XMLID="DELAYEDRETURNRATE" ID="9012" OPTIONID="FIVEMINUTES" />
    </POWER>
    <POWER XMLID="FLIGHT" ID="9013" LEVELS="10" NAME="Wings" />
  </POWERS>`,
    ),
  ).toString();

  it('carries a list with its members and re-links them under fresh IDs', () => {
    const transfer = extractItems(source, '9010')!;
    expect(transfer.section).toBe('POWERS');
    expect(transfer.fragments).toHaveLength(2);

    const target = blankHdc();
    const { xml, id, ids } = insertItems(target, transfer, { minId: 50000 });
    const doc = HdcDocument.parse(xml);
    const list = doc.findById(id!)!;
    expect(Number(id)).toBeGreaterThan(50000);
    const drain = doc.findById(ids[1]!)!;
    expect(drain.getAttr('PARENTID')).toBe(id);
    expect(drain.getAttr('INPUT')).toBe('BODY');
    expect(drain.firstElement('MODIFIER')!.getAttr('ID')).not.toBe('9012');
    expect(list.getAttr('ALIAS')).toBe('Spells');
  });

  it('drops links to parents outside the copy, or points them at a new parent', () => {
    const transfer = extractItems(source, '9011')!;
    expect(transfer.fragments).toHaveLength(1);
    const loose = HdcDocument.parse(insertItems(source, transfer).xml);
    const copies = loose.section('POWERS')!.elements().filter((el) => el.getAttr('XMLID') === 'DRAIN');
    expect(copies).toHaveLength(2);
    expect(copies[1]!.hasAttr('PARENTID')).toBe(false);
    const placed = insertItems(source, transfer, { parentId: '9010' });
    expect(HdcDocument.parse(placed.xml).findById(placed.id!)!.getAttr('PARENTID')).toBe('9010');
  });

  it('merges inserted items into an edited character without disturbing its edits', () => {
    const base = sample('EliVokSkekMal Actual.hdc');
    const before = parseHdcFile(base);
    const edited = { ...before, characterInfo: { ...before.characterInfo, characterName: 'Renamed' } };
    const { xml } = insertItems(base, extractItems(source, '9013')!);
    const after = parseHdcFile(xml);
    const merged = withInsertedItems(edited, before, after, 'powers');
    expect(merged.powers.length).toBe(before.powers.length + 1);
    expect(merged.characterInfo.characterName).toBe('Renamed');
    // The copy is already in the stored HDC, so only the rename is a change
    const { report } = updateHdc(xml, merged);
    expect(report.changes.some((c) => c.includes('Wings'))).toBe(false);
  });
});
