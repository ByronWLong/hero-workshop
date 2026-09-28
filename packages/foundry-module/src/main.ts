/**
 * Hero Workshop for Foundry VTT: entry point.
 *
 * Adds "Edit in Hero Workshop" and "Inspect HDC" to hero6e actor sheets (header controls)
 * and to the Actors sidebar context menu, and exposes the same actions to macros via
 * `game.modules.get('hero-workshop').api`.
 */

import './styles/window.css';
import { HdcDocument } from '@hero-workshop/shared';
import { openEditor, openInspector, openItemEditor, openNewCharacter, openRaceLibrary } from './foundry/applications';
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
      openRaceLibrary,
      races: getRaceLibrary,
      driftReport,
    };
  }
  registerRaceSettings(openRaceLibrary);
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
