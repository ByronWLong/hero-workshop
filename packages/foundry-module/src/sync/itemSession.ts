/**
 * Editing a world or compendium item (one not owned by an actor).
 *
 * hero6e keeps each item's source XML in system._hdcXml. The fragment is wrapped in a
 * skeleton character so the normal editor and writer can work on it, then the edited
 * elements are written back and hero6e rebuilds each item from its XML (item.restoreFromHdc).
 * A list or framework (e.g. a Multipower shield) is edited with its members, which hero6e
 * keeps as separate items linked by PARENTID.
 */

import { HdcDocument, blankHdc, getIcon, parseXml, type HdcSection, type XmlElement } from '@hero-workshop/shared';
import type { TabId } from './tabs';
import { detectDrift } from './drift';
import { MODULE_ID, downloadHdc, itemSource, type ActorSession } from './session';
import { createItemsFromXml } from './worldItems';

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

interface EditableItem extends FoundryItem {
  folder?: { id: string } | null;
  delete(): Promise<unknown>;
}

/**
 * @param members the item followed by its list or framework members (`itemFamily`); just the
 *   item for anything else
 */
export function createItemSession(item: FoundryItem, members: FoundryItem[] = [item]): ActorSession {
  const placement = SECTION_BY_ITEM_TYPE[item.type];
  if (typeof item.system._hdcXml !== 'string' || !item.system._hdcXml.trim() || !placement) {
    throw new Error(`${item.name} has no Hero Designer data Hero Workshop can edit`);
  }

  const doc = HdcDocument.parse(blankHdc());
  const section = doc.ensureSection(placement.section);
  const family: { item: FoundryItem; element: XmlElement }[] = [];
  for (const member of members) {
    const fragment = member.system._hdcXml;
    if (typeof fragment !== 'string' || !fragment.trim()) continue;
    const element = parseXml(fragment.trim()).root;
    element.parent = null;
    section.appendElement(element);
    family.push({ item: member, element });
  }
  doc.ensureIds();
  const hdcXml = doc.toString();
  const original = new Map(family.map(({ item: member, element }) => [element.getAttr('ID')!, { item: member, xml: element.toString() }]));
  const hdcId = family[0]!.element.getAttr('ID')!;

  return {
    actorName: item.name,
    isNew: false,
    hdcXml,
    view: { visibleTabs: [placement.tab], initialTab: placement.tab, hideSidebar: true, applyLabel: 'Apply to item' },

    detectDrift(target) {
      // The items' own sheets may have changed them since their XML was stored
      const sources = family.map(({ item: member, element }) => {
        const source = itemSource(member);
        source.system = { ...source.system, ID: element.getAttr('ID') };
        return source;
      });
      const syncedNames = Object.fromEntries(
        family.flatMap(({ item: member, element }) => {
          const name = member.getFlag(MODULE_ID, 'syncedName') as string | undefined;
          return name === undefined ? [] : [[element.getAttr('ID')!, name]];
        }),
      );
      return detectDrift(target, { items: sources, actorSystem: {}, syncedNames: Object.keys(syncedNames).length ? syncedNames : undefined });
    },

    async apply(xml) {
      const edited = HdcDocument.parse(xml);
      if (!edited.findById(hdcId)) throw new Error(`${item.name} was removed in the editor; nothing was saved.`);
      const elements = edited.section(placement.section)?.elements() ?? [];

      // Members that changed are rebuilt from their XML; removed ones are deleted
      for (const [id, { item: member, xml: before }] of original) {
        const updated = edited.findById(id);
        if (!updated) {
          if (member !== item) await (member as EditableItem).delete();
          continue;
        }
        if (updated.toString() === before) continue;
        await member.update({ 'system._hdcXml': updated.toString() });
        await member.restoreFromHdc();
        const icon = getIcon(updated);
        if (icon && member.img !== icon) await member.update({ img: icon });
        await member.setFlag(MODULE_ID, 'syncedName', member.name);
      }

      // New members (e.g. a slot added to a Multipower) join the family's folder
      const added = elements.filter((el) => !original.has(el.getAttr('ID') ?? ''));
      if (added.length) {
        const scratch = HdcDocument.parse(blankHdc());
        const target = scratch.ensureSection(placement.section);
        for (const el of added) {
          el.parent = null;
          target.appendElement(el);
        }
        scratch.invalidateIndex();
        await createItemsFromXml(scratch.toString(), {
          pack: item.pack ?? undefined,
          folder: (item as EditableItem).folder?.id,
        });
      }
      return item;
    },

    download(xml, fileName) {
      downloadHdc(xml, fileName);
    },

    itemImage: () => item.img,
  };
}
