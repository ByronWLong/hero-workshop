import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  HdcDocument,
  ICON_ATTR,
  getIcon,
  setIcon,
  decodeHdcBytes,
  itemFormValues,
  parseHdcFile,
  powerDraft,
  saveItemForm,
  savePowerDraft,
  selectPower,
  updateHdc,
} from '../src/index.js';

const SKRALK = decodeHdcBytes(readFileSync(resolve(__dirname, '../../../samples/SkralkSkekMal.hdc')));
const ICON = 'icons/weapons/swords/sword-guard-flanged.webp';

describe('custom icons', () => {
  it('round-trips an icon set on an existing item, and removes it again', () => {
    const character = parseHdcFile(SKRALK);
    const skill = character.skills.find((s) => !s.isGroup)!;
    const withIcon = saveItemForm(character, 'skills', skill.id, { ...itemFormValues(character, 'skills', skill.id), icon: ICON });
    const { xml, report } = updateHdc(SKRALK, withIcon);
    expect(report.changes).toHaveLength(1);
    const el = HdcDocument.parse(xml).findById(skill.id)!;
    expect(getIcon(el)).toBe(ICON);
    // Kept in a child element: hero6e reports unknown attributes on the item element
    expect(el.hasAttr(ICON_ATTR)).toBe(false);
    expect(el.firstElement(ICON_ATTR)!.getAttr('SRC')).toBe(ICON);

    const reread = parseHdcFile(xml);
    expect(reread.skills.find((s) => s.id === skill.id)!.icon).toBe(ICON);
    expect(itemFormValues(reread, 'skills', skill.id).icon).toBe(ICON);

    const cleared = saveItemForm(reread, 'skills', skill.id, { ...itemFormValues(reread, 'skills', skill.id), icon: '' });
    expect(getIcon(HdcDocument.parse(updateHdc(xml, cleared).xml).findById(skill.id)!)).toBeUndefined();
  });

  it('writes the icon of new powers and of compound equipment parts', () => {
    const character = parseHdcFile(SKRALK);
    const draft = { ...selectPower(powerDraft(character, 'equipment'), 'HKA'), name: 'Dagger', icon: ICON };
    const edited = savePowerDraft(character, 'equipment', undefined, draft);
    const { xml, report } = updateHdc(SKRALK, edited);
    const id = report.idMap[edited.equipment!.at(-1)!.id]!;
    expect(getIcon(HdcDocument.parse(xml).findById(id)!)).toBe(ICON);
    // Unchanged items keep no icon attribute, and a no-op save changes nothing
    const reread = parseHdcFile(xml);
    expect(reread.equipment!.find((e) => e.name === 'Flame Glass')!.icon).toBeUndefined();
    expect(updateHdc(xml, reread).report.changes).toEqual([]);
  });

  it('reads the attribute older files used, and moves it to the child element when written', () => {
    const doc = HdcDocument.parse('<CHARACTER><SKILLS><SKILL XMLID="CLIMBING" ID="5" FOUNDRY_ICON="icons/old.webp" /></SKILLS></CHARACTER>');
    const el = doc.findById('5')!;
    expect(getIcon(el)).toBe('icons/old.webp');
    setIcon(el, 'icons/new.webp');
    expect(el.hasAttr(ICON_ATTR)).toBe(false);
    expect(getIcon(el)).toBe('icons/new.webp');
  });
});
