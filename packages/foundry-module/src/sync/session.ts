/**
 * ActorSession: everything the editor UI needs from an actor, without Foundry globals.
 *
 * The UI works on HDC text: it pulls Foundry-side drift into the stored HDC, lets the
 * user edit, then hands the resulting XML back to `apply`, which re-imports it through
 * hero6e's own uploader. That keeps hero6e the single authority on HDC -> Foundry mapping,
 * and its ID-based item merge preserves damage, charges and item identity.
 */

import { HdcDocument, blankHdc, type Character } from '@hero-workshop/shared';
import type { TabId } from './tabs';
import { detectDrift, type DriftChange, type DriftItemSource } from './drift';
import { applyIcons } from './icons';

export const MODULE_ID = 'hero-workshop';

/** The Foundry document an editing session wrote to */
export interface AppliedDocument {
  name: string;
  sheet?: { render(force?: boolean): unknown };
}

/** How the editor should present a session */
export interface SessionView {
  visibleTabs?: TabId[];
  initialTab?: TabId;
  hideSidebar?: boolean;
  /** Label for the final apply button */
  applyLabel?: string;
  /** HDC ID of an item whose edit form opens on load */
  focusItemId?: string;
  /** Shown but not edited (e.g. in a locked compendium): no changes, just a Close button */
  readOnly?: boolean;
}

export interface ActorSession {
  actorName: string;
  /** True when applying creates a new actor rather than updating one */
  isNew: boolean;
  /** The actor's stored HDC (hero6e keeps it at system._hdcXml, minus the portrait) */
  hdcXml: string;
  /** Foundry-side edits not yet in the stored HDC */
  detectDrift(doc: HdcDocument): DriftChange[];
  /** Re-imports the actor from edited HDC XML */
  apply(xml: string, options: { characterName?: string }): Promise<AppliedDocument>;
  view?: SessionView;
  /** Saves the HDC as a file desktop Hero Designer can open */
  download(xml: string, fileName: string): void;
  /** The Foundry icon of the item with this HDC ID, if it's in Foundry */
  itemImage?(hdcId: string): string | undefined;
}

export function createActorSession(actor: FoundryActor, view?: SessionView): ActorSession {
  const hdcXml = actor.system._hdcXml;
  if (!hdcXml) throw new Error(`${actor.name} has no stored HDC`);

  return {
    actorName: actor.name,
    isNew: false,
    hdcXml,
    view,

    detectDrift(doc) {
      return detectDrift(doc, {
        items: actor.items.contents.map(itemSource),
        actorSystem: actor.toObject().system,
        syncedIds: actor.getFlag(MODULE_ID, 'syncedIds') as string[] | undefined,
        syncedNames: actor.getFlag(MODULE_ID, 'syncedNames') as Record<string, string> | undefined,
      });
    },

    itemImage(hdcId) {
      return actor.items.contents.find((i) => String(i.system.ID) === hdcId)?.img;
    },

    async apply(xml, { characterName }) {
      await importHdc(actor, xml, { keepExistingName: true, keepExistingImage: true });
      if (characterName && characterName !== actor.name) {
        await actor.update({ name: characterName });
      }
      return actor;
    },

    download(xml, fileName) {
      downloadHdc(xml, fileName);
    },
  };
}

export interface NewCharacterOptions {
  name: string;
  template: string;
  /** hero6e actor type: pc/npc for people, or the template's own type (vehicle, base2, ...) */
  actorType: string;
  basePoints: number;
  disadPoints: number;
}

/** A session for a character that doesn't exist yet: applying creates the actor */
export function createNewCharacterSession(options: NewCharacterOptions): ActorSession {
  const seed: Partial<Character> = {
    characterInfo: { characterName: options.name },
    basicConfiguration: { basePoints: options.basePoints, disadPoints: options.disadPoints, experience: 0 },
  };
  return {
    actorName: options.name,
    isNew: true,
    hdcXml: blankHdc(seed, options.template),
    detectDrift: () => [],

    async apply(xml, { characterName }) {
      const name = characterName || options.name;
      const created = await (foundry.documents.Actor as unknown as ActorFactory).create({ name, type: options.actorType });
      if (!created) throw new Error(`Could not create actor ${name}`);
      await importHdc(created, xml, { keepExistingImage: true });
      return created;
    },

    download(xml, fileName) {
      downloadHdc(xml, fileName);
    },
  };
}

interface ActorFactory {
  create(data: Record<string, unknown>): Promise<FoundryActor | undefined>;
}

/**
 * Imports HDC through hero6e and records which HDC items Foundry now holds, so later
 * deletions can be told apart from items hero6e never supported.
 */
async function importHdc(actor: FoundryActor, xml: string, options: Record<string, unknown>): Promise<void> {
  await actor.uploadFromXml(xml, options);
  // hero6e reports upload failures through a flag rather than by throwing
  const failure = actor.getFlag('hero6efoundryvttv2', 'uploadingError');
  if (failure) throw new Error(`hero6e could not import ${actor.name}: ${String(failure).split('\n')[0]}`);
  await fixItemNames(actor);

  const names: Record<string, string> = {};
  for (const item of actor.items.contents) {
    const id = item.system.ID;
    if (id !== undefined && id !== null && id !== '' && id !== 0) names[String(id)] = item.name;
  }
  await actor.setFlag(MODULE_ID, 'syncedIds', Object.keys(names));
  // Replace rather than merge, so deleted items don't linger in the flag
  await actor.unsetFlag(MODULE_ID, 'syncedNames');
  await actor.setFlag(MODULE_ID, 'syncedNames', names);
  await applyIcons(actor);
}

/**
 * hero6e's re-import names each updated item NAME or ALIAS, and its own naming rules
 * ("PS: Jeweler", "MSR: Sorcery: General") only win when the item's current name already
 * differs. So an unnamed skill's name flips between "MSR" and "MSR: Wizardry" on every save,
 * and spells bound to it by name (Requires A Roll) lose their skill every other save.
 * Puts back the names hero6e builds when it creates the items.
 */
async function fixItemNames(actor: FoundryActor): Promise<void> {
  const updates: { _id: string; name: string }[] = [];
  for (const item of actor.items.contents as (FoundryItem & { preBuildName?(system?: unknown): string })[]) {
    const built = item.preBuildName?.(item.system);
    if (built && built !== item.name) updates.push({ _id: item.id, name: built });
  }
  if (updates.length) await actor.updateEmbeddedDocuments('Item', updates);
}

export function itemSource(item: FoundryItem): DriftItemSource {
  // Source data, not prepared data: prepared values include derived fields
  return {
    id: item.id,
    name: item.name,
    type: item.type,
    system: item.toObject().system,
    isFreeStuff: !!item.isFreeStuff,
    img: item.img,
  };
}

export function downloadHdc(xml: string, fileName: string): void {
  // Plain UTF-8 with a matching declaration; desktop Hero Designer reads either encoding
  const text = xml.replace(/^(<\?xml[^>]*encoding=["'])UTF-16(["'])/i, '$1UTF-8$2');
  const blob = new Blob([text], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName.endsWith('.hdc') ? fileName : `${fileName}.hdc`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
