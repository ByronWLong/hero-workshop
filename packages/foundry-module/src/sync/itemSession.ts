/**
 * Editing a single world item (one not owned by an actor).
 *
 * hero6e keeps the item's source XML in system._hdcXml. The fragment is wrapped in a
 * skeleton character so the normal editor and writer can work on it, then the edited
 * element is written back and hero6e rebuilds the item from it (item.restoreFromHdc).
 */

import { HdcDocument, blankHdc, parseXml, type HdcSection } from '@hero-workshop/shared';
import type { TabId } from '@frontend/components/CharacterEditor';
import { detectDrift } from './drift';
import { MODULE_ID, downloadHdc, itemSource, type ActorSession } from './session';

const SECTION_BY_ITEM_TYPE: Record<string, { section: HdcSection; tab: TabId }> = {
  skill: { section: 'SKILLS', tab: 'skills' },
  perk: { section: 'PERKS', tab: 'perks' },
  talent: { section: 'TALENTS', tab: 'talents' },
  martialart: { section: 'MARTIALARTS', tab: 'martialarts' },
  maneuver: { section: 'MARTIALARTS', tab: 'martialarts' },
  power: { section: 'POWERS', tab: 'powers' },
  disadvantage: { section: 'DISADVANTAGES', tab: 'disadvantages' },
  complication: { section: 'DISADVANTAGES', tab: 'disadvantages' },
  equipment: { section: 'EQUIPMENT', tab: 'equipment' },
};

/** The editor tab that shows items of this type, if Hero Workshop can edit them */
export function tabForItem(item: FoundryItem): TabId | undefined {
  return SECTION_BY_ITEM_TYPE[item.type]?.tab;
}

export function createItemSession(item: FoundryItem): ActorSession {
  const fragment = item.system._hdcXml;
  const placement = SECTION_BY_ITEM_TYPE[item.type];
  if (typeof fragment !== 'string' || !fragment.trim() || !placement) {
    throw new Error(`${item.name} has no Hero Designer data Hero Workshop can edit`);
  }

  const doc = HdcDocument.parse(blankHdc());
  const element = parseXml(fragment.trim()).root;
  element.parent = null;
  doc.ensureSection(placement.section).appendElement(element);
  doc.ensureIds();
  const hdcId = element.getAttr('ID')!;
  const hdcXml = doc.toString();

  return {
    actorName: item.name,
    isNew: false,
    hdcXml,
    view: { visibleTabs: [placement.tab], initialTab: placement.tab, hideSidebar: true, applyLabel: 'Apply to item' },

    detectDrift(target) {
      // The item's own sheet may have changed it since its XML was stored
      const source = itemSource(item);
      source.system = { ...source.system, ID: hdcId };
      const syncedName = item.getFlag(MODULE_ID, 'syncedName') as string | undefined;
      return detectDrift(target, {
        items: [source],
        actorSystem: {},
        syncedNames: syncedName === undefined ? undefined : { [hdcId]: syncedName },
      });
    },

    async apply(xml) {
      const edited = HdcDocument.parse(xml);
      const updated = edited.findById(hdcId);
      if (!updated) throw new Error(`${item.name} was removed in the editor; nothing was saved.`);
      const others = (edited.section(placement.section)?.elements() ?? []).filter((el) => el !== updated);
      if (others.length) {
        ui.notifications.warn(`Only ${item.name} was saved; items added alongside it were discarded.`);
      }
      await item.update({ 'system._hdcXml': updated.toString() });
      await item.restoreFromHdc();
      await item.setFlag(MODULE_ID, 'syncedName', item.name);
      return item;
    },

    download(xml, fileName) {
      downloadHdc(xml, fileName);
    },
  };
}
