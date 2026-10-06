/**
 * Hero Workshop for Foundry VTT: entry point.
 *
 * Adds "Edit in Hero Workshop" and "Inspect HDC" to hero6e actor sheets (header controls)
 * and to the Actors sidebar context menu, and exposes the same actions to macros via
 * `game.modules.get('hero-workshop').api`.
 */

import './styles/hero-workshop.css';
import { HdcDocument } from '@hero-workshop/shared';
import {
  openEditor,
  openInspector,
  openItemEditor,
  openNewCharacter,
  openRaceLibrary,
  refreshOpenWindows,
} from './apps';
import { preloadTemplates } from './apps/base';
import { queueCreatedItem, recordIconChange } from './sync/actorItems';
import { openNewItem } from './apps/new-item';
import {
  DRAG_TYPE,
  createItemsFromXml,
  createWorldItems,
  dragData,
  OWN_CREATION,
  transferFromItem,
  type HeroWorkshopDragData,
} from './sync/worldItems';
import { getRaceLibrary, registerRaceSettings } from './races/library';
import { MODULE_ID, createActorSession } from './sync/session';

/** Lists Foundry-side edits not yet in an actor's stored HDC (for macros and debugging) */
function driftReport(actor: FoundryActor): { item: string; kind: string; summary: string }[] {
  const session = createActorSession(actor);
  return session
    .detectDrift(HdcDocument.parse(session.hdcXml))
    .map((c) => ({ item: c.itemName, kind: c.kind, summary: c.summary }));
}

const HERO_SYSTEM_ID = 'hero6efoundryvttv2';

const isHeroSystem = () => game.system.id === HERO_SYSTEM_ID;

Hooks.once('init', () => {
  if (!isHeroSystem()) {
    console.warn(`${MODULE_ID} | requires the ${HERO_SYSTEM_ID} system; not activating.`);
    return;
  }
  const module = game.modules.get(MODULE_ID);
  if (module) {
    module.api = {
      openEditor,
      openItemEditor,
      openInspector,
      createCharacter: openNewCharacter,
      createItem: openNewItem,
      openRaceLibrary,
      races: getRaceLibrary,
      driftReport,
      createItemsFromXml,
    };
  }
  registerRaceSettings(openRaceLibrary);
  void preloadTemplates();
});

// ApplicationV2 fires getHeaderControls<ClassName> for every class in the sheet's hierarchy
Hooks.on('getHeaderControlsApplicationV2', ((app: { document?: unknown }, controls: HeaderControl[]) => {
  if (!isHeroSystem()) return;
  const document = app.document;

  if (document instanceof foundry.documents.Item) {
    const item = document as FoundryItem;
    if (!item.isOwner || !item.system._hdcXml) return;
    controls.push({
      action: 'heroWorkshopEditItem',
      icon: 'fa-solid fa-user-pen',
      label: game.i18n.localize('HERO_WORKSHOP.EditItem'),
      onClick: () => openItemEditor(item),
    });
    return;
  }

  if (!(document instanceof foundry.documents.Actor)) return;
  const actor = document as FoundryActor;
  if (!actor.isOwner) return;
  controls.push(
    {
      action: 'heroWorkshopEdit',
      icon: 'fa-solid fa-user-pen',
      label: game.i18n.localize('HERO_WORKSHOP.EditCharacter'),
      onClick: () => openEditor(actor),
    },
    {
      action: 'heroWorkshopInspect',
      icon: 'fa-solid fa-file-code',
      label: game.i18n.localize('HERO_WORKSHOP.InspectHdc'),
      onClick: () => openInspector(actor),
    },
  );
}) as (...args: never[]) => unknown);

/**
 * The Actors/Items sidebars and compendium windows fire the same context-menu hooks; entries
 * come from the world collection or the compendium being shown
 */
interface EntryDirectory {
  collection?: CompendiumPack;
}

function entryOf<T>(directory: EntryDirectory, li: HTMLElement, world: { get(id: string): T | undefined }) {
  const id = li.dataset.entryId ?? li.dataset.documentId ?? '';
  const pack = directory.collection?.metadata ? directory.collection : undefined;
  return {
    /** Compendium entries are offered to whoever may edit the pack (opening checks the lock) */
    pack,
    world: pack ? undefined : world.get(id),
    load: async () => (pack ? ((await pack.getDocument(id)) as T | undefined) : world.get(id)),
  };
}

Hooks.on('getActorContextOptions', ((directory: EntryDirectory, options: ContextMenuEntry[]) => {
  if (!isHeroSystem()) return;
  const actorFrom = (li: HTMLElement) => entryOf<FoundryActor>(directory, li, game.actors);

  options.push(
    {
      name: 'HERO_WORKSHOP.EditCharacter',
      icon: '<i class="fa-solid fa-user-pen"></i>',
      condition: (li) => {
        const entry = actorFrom(li);
        return entry.pack ? game.user.isGM : !!entry.world?.isOwner;
      },
      callback: async (li) => {
        const actor = await actorFrom(li).load();
        if (actor) openEditor(actor);
      },
    },
    {
      name: 'HERO_WORKSHOP.InspectHdc',
      icon: '<i class="fa-solid fa-file-code"></i>',
      condition: (li) => {
        const entry = actorFrom(li);
        return entry.pack ? game.user.isGM : !!entry.world?.system._hdcXml;
      },
      callback: async (li) => {
        const actor = await actorFrom(li).load();
        if (actor) openInspector(actor);
      },
    },
  );
}) as (...args: never[]) => unknown);

// "New character" button in the Actors sidebar, for users allowed to create actors
Hooks.on('renderActorDirectory', ((_app: unknown, html: HTMLElement) => {
  if (!isHeroSystem() || !game.user.can('ACTOR_CREATE')) return;
  const actions = html.querySelector('.header-actions');
  if (!actions || actions.querySelector('.hero-workshop-create')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'hero-workshop-create';
  button.innerHTML = `<i class="fa-solid fa-user-plus"></i> ${game.i18n.localize('HERO_WORKSHOP.NewCharacter')}`;
  button.addEventListener('click', () => openNewCharacter());
  actions.append(button);
}) as (...args: never[]) => unknown);

// Items sidebar: "New item" button, and drops of rows dragged out of a Hero Workshop editor
Hooks.on('renderItemDirectory', ((_app: unknown, html: HTMLElement) => {
  if (!isHeroSystem() || !game.user.can('ITEM_CREATE')) return;
  const actions = html.querySelector('.header-actions');
  if (actions && !actions.querySelector('.hero-workshop-create')) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'hero-workshop-create';
    button.innerHTML = `<i class="fa-solid fa-suitcase"></i> ${game.i18n.localize('HERO_WORKSHOP.NewItem')}`;
    button.addEventListener('click', () => void openNewItem());
    actions.append(button);
  }
  if (html.dataset.heroWorkshopDrop) return;
  html.dataset.heroWorkshopDrop = 'true';
  // Capture phase, ahead of hero6e's directory handler (which only understands UUIDs)
  html.addEventListener(
    'drop',
    (event) => {
      const data = dragData(event);
      // Compounds dragged off an actor sheet become one world item too, rather than hero6e's folder
      const ownedCompound = (): FoundryItem | undefined => {
        if (data?.type !== 'Item' || typeof data.uuid !== 'string' || !data.uuid.startsWith('Actor.')) return undefined;
        const item = fromUuidSync(data.uuid) as FoundryItem | null;
        return item?.system.XMLID === 'COMPOUNDPOWER' ? item : undefined;
      };
      const compound = ownedCompound();
      if (data?.type !== DRAG_TYPE && !compound) return;
      event.preventDefault();
      event.stopPropagation();
      const folder = (event.target as HTMLElement).closest?.<HTMLElement>('.folder');
      const folderId = folder?.dataset.folderId ?? folder?.dataset.uuid?.split('.').pop();
      const drag = data as unknown as HeroWorkshopDragData;
      const name = compound?.name ?? drag.name;
      const transfer = compound ? transferFromItem(compound) : Promise.resolve(drag.transfer);
      transfer
        .then((t) => {
          if (!t) throw new Error('it has no Hero Designer data');
          return createWorldItems(t, folderId);
        })
        .then(
          (created) => ui.notifications.info(game.i18n.format('HERO_WORKSHOP.ItemsCopied', { name: created[0]?.name ?? name })),
          (e: unknown) => {
            console.error(e);
            ui.notifications.error(`Hero Workshop could not create ${name}: ${e instanceof Error ? e.message : String(e)}`);
          },
        );
    },
    { capture: true },
  );
}) as (...args: never[]) => unknown);

Hooks.on('getItemContextOptions', ((directory: EntryDirectory, options: ContextMenuEntry[]) => {
  if (!isHeroSystem()) return;
  const itemFrom = (li: HTMLElement) => entryOf<FoundryItem>(directory, li, game.items);
  options.push({
    name: 'HERO_WORKSHOP.EditItem',
    icon: '<i class="fa-solid fa-user-pen"></i>',
    condition: (li) => {
      const entry = itemFrom(li);
      return entry.pack ? game.user.isGM : !!entry.world?.isOwner && !!entry.world.system._hdcXml;
    },
    callback: async (li) => {
      const item = await itemFrom(li).load();
      if (item) openItemEditor(item);
    },
  });
}) as (...args: never[]) => unknown);

// Open editors pick up race library changes
Hooks.on('updateSetting', ((setting: { key: string }) => {
  if (setting.key === `${MODULE_ID}.races`) refreshOpenWindows();
}) as (...args: never[]) => unknown);

// Items dropped onto an actor are written into its stored HDC right away (and a compound that
// arrives without its parts gets them, the way hero6e shows compounds). Uploads are skipped:
// they create items with render: false and write the HDC themselves.
/**
 * Whether this browser should act on a document change made by this user. Every connected
 * browser gets the hook, including other windows logged in as the same user, so only the
 * visible one (where the user is working) writes, or they'd all make the same change.
 */
const actsForUser = (userId: string) => userId === game.user.id && document.visibilityState === 'visible';

Hooks.on('createItem', ((item: FoundryItem, options: Record<string, unknown>, userId: string) => {
  if (!isHeroSystem() || !actsForUser(userId) || !item.actor) return;
  if (options?.render === false || options?.[OWN_CREATION]) return;
  queueCreatedItem(item);
}) as (...args: never[]) => unknown);

// Icons changed on a Foundry sheet go into the item's Hero Designer data, so they show in the
// editor and travel with the item
Hooks.on('updateItem', ((item: FoundryItem, changes: Record<string, unknown>, _options: unknown, userId: string) => {
  if (!isHeroSystem() || !actsForUser(userId) || !('img' in changes)) return;
  // hero6e's own import sets items up (and we restore icons after it)
  if (item.actor?.getFlag(HERO_SYSTEM_ID, 'uploading')) return;
  recordIconChange(item);
}) as (...args: never[]) => unknown);
