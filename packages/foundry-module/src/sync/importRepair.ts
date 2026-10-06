/**
 * Runs Hero Workshop's hero6e repairs (`repairForFoundry`) on every HDC hero6e imports: an
 * actor sheet's Upload, a Hero Designer file uploaded as a compendium, and Hero Workshop's own
 * applies. Combat Skill Levels get linked to the attacks they name, adjustment targets are
 * comma-separated, and so on, so imported characters work without hand fixes.
 *
 * The repairs are idempotent, so hero6e's own rebuilds from stored XML pass through unchanged
 * once a character has been repaired. A repair failure never blocks the import.
 */

import { repairForFoundry } from '@hero-workshop/shared';
import { MODULE_ID } from './session';

const SETTING = 'repairImports';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Upload = (this: unknown, xml: unknown, ...rest: any[]) => Promise<unknown>;

interface UploadOptions {
  file?: unknown;
  fileName?: string;
  silent?: boolean;
  quenchUpload?: boolean;
}

export function registerImportRepair(): void {
  game.settings.register(MODULE_ID, SETTING, {
    name: 'HERO_WORKSHOP.RepairImports',
    hint: 'HERO_WORKSHOP.RepairImportsHint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
  });
}

/** Wraps hero6e's upload entry points (call once hero6e has set up CONFIG) */
export function wrapHeroUploads(): void {
  const config = CONFIG as unknown as {
    Actor?: { documentClass?: { prototype: { uploadFromXml?: Upload } } };
    ui?: { compendium?: { uploadFromXml?: Upload } };
  };

  const actorProto = config.Actor?.documentClass?.prototype;
  const uploadActor = actorProto?.uploadFromXml;
  if (actorProto && uploadActor) {
    actorProto.uploadFromXml = async function (this: unknown, xml: unknown, options: UploadOptions = {}) {
      const name = (this as { name?: string }).name ?? 'the character';
      // Only a file the user just uploaded reports what couldn't be repaired
      const fromUser = !!options.file && !options.silent && !options.quenchUpload;
      return uploadActor.call(this, repaired(xml, name, fromUser), options);
    };
  } else {
    console.warn(`${MODULE_ID} | hero6e's actor upload wasn't found; imported HDC won't be repaired.`);
  }

  const directory = config.ui?.compendium;
  const uploadPack = directory?.uploadFromXml;
  if (directory && uploadPack) {
    directory.uploadFromXml = async function (this: unknown, xml: unknown, folderId?: unknown, options: UploadOptions = {}) {
      return uploadPack.call(this, repaired(xml, options.fileName ?? 'the file', !options.quenchUpload), folderId, options);
    };
  }
}

/** The XML with hero6e repairs applied; the original (string or XMLDocument) when nothing changed */
function repaired(xml: unknown, name: string, report: boolean): unknown {
  try {
    if (!game.settings.get(MODULE_ID, SETTING)) return xml;
    const text = typeof xml === 'string' ? xml : xml instanceof Document ? new XMLSerializer().serializeToString(xml) : undefined;
    if (!text?.trim() || (typeof xml !== 'string' && (xml as Document).getElementsByTagName('parsererror').length)) return xml;

    const result = repairForFoundry(text.trim());
    if (result.changes.length) {
      console.info(`${MODULE_ID} | Repaired ${name} for hero6e:\n- ${result.changes.join('\n- ')}`);
    }
    if (result.unresolved.length) {
      console.warn(`${MODULE_ID} | Couldn't repair in ${name}:\n- ${result.unresolved.join('\n- ')}`);
    }
    if (report && (result.changes.length || result.unresolved.length)) {
      const message = game.i18n.format('HERO_WORKSHOP.ImportRepaired', {
        name,
        changes: String(result.changes.length),
        unresolved: String(result.unresolved.length),
      });
      if (result.unresolved.length) ui.notifications.warn(message);
      else ui.notifications.info(message);
    }
    return result.changes.length ? result.xml : xml;
  } catch (err) {
    console.error(`${MODULE_ID} | Couldn't repair ${name}; importing it as is.`, err);
    return xml;
  }
}
