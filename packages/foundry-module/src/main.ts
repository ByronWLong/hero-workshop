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
import { openNewItem } from './apps/new-item';
import {
  DRAG_TYPE,
  createWorldItems,
  dragData,
  expandCompound,
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

Hooks.on('getActorContextOptions', ((_directory: unknown, options: ContextMenuEntry[]) => {
  if (!isHeroSystem()) return;
  const actorFrom = (li: HTMLElement) => game.actors.get(li.dataset.entryId ?? li.dataset.documentId ?? '');

  options.push(
    {
      name: 'HERO_WORKSHOP.EditCharacter',
      icon: '<i class="fa-solid fa-user-pen"></i>',
      condition: (li) => !!actorFrom(li)?.isOwner,
      callback: (li) => {
        const actor = actorFrom(li);
        if (actor) openEditor(actor);
      },
    },
    {
      name: 'HERO_WORKSHOP.InspectHdc',
      icon: '<i class="fa-solid fa-file-code"></i>',
      condition: (li) => !!actorFrom(li)?.system._hdcXml,
      callback: (li) => {
        const actor = actorFrom(li);
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

Hooks.on('getItemContextOptions', ((_directory: unknown, options: ContextMenuEntry[]) => {
  if (!isHeroSystem()) return;
  const itemFrom = (li: HTMLElement) => game.items.get(li.dataset.entryId ?? li.dataset.documentId ?? '');
  options.push({
    name: 'HERO_WORKSHOP.EditItem',
    icon: '<i class="fa-solid fa-user-pen"></i>',
    condition: (li) => {
      const item = itemFrom(li);
      return !!item?.isOwner && !!item.system._hdcXml;
    },
    callback: (li) => {
      const item = itemFrom(li);
      if (item) openItemEditor(item);
    },
  });
}) as (...args: never[]) => unknown);

// Open editors pick up race library changes
Hooks.on('updateSetting', ((setting: { key: string }) => {
  if (setting.key === `${MODULE_ID}.races`) refreshOpenWindows();
}) as (...args: never[]) => unknown);

// A compound dropped onto an actor without its parts (a Hero Workshop world item) gets them as
// child items, which is how hero6e shows compounds. Uploads create parts themselves (render: false).
Hooks.on('createItem', ((item: FoundryItem, options: { render?: boolean }, userId: string) => {
  if (!isHeroSystem() || userId !== game.user.id || !item.actor || options?.render === false) return;
  if (item.system.XMLID !== 'COMPOUNDPOWER') return;
  const hasParts = item.actor.items.contents.some((i) => i.system.PARENTID === item.system.ID);
  if (!hasParts) void expandCompound(item).catch((e: unknown) => console.error(`${MODULE_ID} | expanding ${item.name}`, e));
}) as (...args: never[]) => unknown);
