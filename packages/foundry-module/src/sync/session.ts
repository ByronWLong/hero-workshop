/**
 * ActorSession: everything the editor UI needs from an actor, without Foundry globals.
 *
 * The UI works on HDC text: it pulls Foundry-side drift into the stored HDC, lets the
 * user edit, then hands the resulting XML back to `apply`, which re-imports it through
 * hero6e's own uploader. That keeps hero6e the single authority on HDC -> Foundry mapping,
 * and its ID-based item merge preserves damage, charges and item identity.
 */

import { HdcDocument, blankHdc, type Character } from '@hero-workshop/shared';
import { detectDrift, type DriftChange, type DriftItemSource } from './drift';

export const MODULE_ID = 'hero-workshop';

export interface ActorSession {
  actorName: string;
  /** True when applying creates a new actor rather than updating one */
  isNew: boolean;
  /** The actor's stored HDC (hero6e keeps it at system._hdcXml, minus the portrait) */
  hdcXml: string;
  /** Foundry-side edits not yet in the stored HDC */
  detectDrift(doc: HdcDocument): DriftChange[];
  /** Re-imports the actor from edited HDC XML */
  apply(xml: string, options: { characterName?: string }): Promise<FoundryActor>;
  /** Saves the HDC as a file desktop Hero Designer can open */
  download(xml: string, fileName: string): void;
}

export function createActorSession(actor: FoundryActor): ActorSession {
  const hdcXml = actor.system._hdcXml;
  if (!hdcXml) throw new Error(`${actor.name} has no stored HDC`);

  return {
    actorName: actor.name,
    isNew: false,
    hdcXml,

    detectDrift(doc) {
      return detectDrift(doc, {
        items: actor.items.contents.map(itemSource),
        actorSystem: actor.toObject().system,
        syncedIds: actor.getFlag(MODULE_ID, 'syncedIds') as string[] | undefined,
      });
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
  actorType: 'pc' | 'npc';
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

  const imported = actor.items.contents
    .map((item) => item.system.ID)
    .filter((id) => id !== undefined && id !== null && id !== '' && id !== 0)
    .map(String);
  await actor.setFlag(MODULE_ID, 'syncedIds', imported);
}

function itemSource(item: FoundryItem): DriftItemSource {
  // Source data, not prepared data: prepared values include derived fields
  return {
    id: item.id,
    name: item.name,
    type: item.type,
    system: item.toObject().system,
    isFreeStuff: !!item.isFreeStuff,
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
