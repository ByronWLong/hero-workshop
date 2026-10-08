/**
 * Opening Hero Workshop windows.
 */

import { MODULE_ID, createActorSession, createNewCharacterSession, type AppliedDocument, type ActorSession, type SessionView } from '../sync/session';
import { createItemSession, tabForItem } from '../sync/itemSession';
import type { TabId } from '../sync/tabs';
import { itemFamily } from '../sync/worldItems';
import { canManageRaces } from '../races/library';
import { HdcDocument, parseHdcFile, updateHdc, type Character } from '@hero-workshop/shared';
import { HeroWorkshopEditor } from './editor';
import { ItemDialog } from './item-dialog';
import { PowerDialog } from './power-dialog';
import { HdcInspector, NewCharacterWindow, RaceLibraryWindow } from './windows';
import { RACE_PICKER_ID } from './race-picker';

function openSession(session: ActorSession, windowId: string, onApplied: (document: AppliedDocument) => void) {
  // One editor per actor: reopening brings the existing window forward (on the requested item)
  const instances = (foundry.applications as unknown as { instances: Map<string, unknown> }).instances;
  const open = instances.get(`${MODULE_ID}-editor-${windowId}`);
  if (open instanceof HeroWorkshopEditor) {
    open.bringToFront();
    const { initialTab, focusItemId } = session.view ?? {};
    if (initialTab && focusItemId && initialTab !== 'info' && initialTab !== 'characteristics') {
      open.changeTab(initialTab, 'primary');
      void open.editItem(initialTab, focusItemId);
    }
    return;
  }
  void new HeroWorkshopEditor({ session, windowId, onApplied }).render({ force: true });
}

/** Checks the actor can be edited (or, read-only, shown), explaining why not if it can't */
function editableActor(actor: FoundryActor, readOnly = false): FoundryActor | undefined {
  if (actor.token && !readOnly) {
    ui.notifications.warn(game.i18n.format('HERO_WORKSHOP.TokenActor', { name: actor.name }));
    return undefined;
  }
  if (!actor.isOwner && !readOnly) {
    ui.notifications.warn(game.i18n.format('HERO_WORKSHOP.NotOwner', { name: actor.name }));
    return undefined;
  }
  if (!actor.system._hdcXml) {
    ui.notifications.warn(game.i18n.format('HERO_WORKSHOP.NoHdc', { name: actor.name }));
    return undefined;
  }
  return actor;
}

const notifyApplied = (applied: AppliedDocument) =>
  ui.notifications.info(game.i18n.format('HERO_WORKSHOP.Applied', { name: applied.name }));

/**
 * A compendium document that can't be changed (its compendium is locked, or the user doesn't
 * own it) opens read-only, with just a Close button
 */
function viewOnly(document: { pack?: string | null; isOwner: boolean }): boolean {
  const pack = document.pack ? game.packs.get(document.pack) : undefined;
  return !!pack && (pack.locked || !document.isOwner);
}

export function openEditor(actor: FoundryActor, view?: SessionView): void {
  const readOnly = viewOnly(actor);
  const target = editableActor(actor, readOnly);
  if (!target) return;
  const windowId = `${actor.pack ? `${actor.pack}-` : ''}${target.id}`;
  openSession(createActorSession(target, readOnly ? { ...view, readOnly } : view), windowId, notifyApplied);
}

/**
 * Items owned by an actor are part of the actor's HDC, so they open the actor's editor on
 * the item; world items are edited on their own.
 */
export function openItemEditor(item: FoundryItem): void {
  const tab = tabForItem(item);
  if (!tab) {
    ui.notifications.warn(game.i18n.format('HERO_WORKSHOP.ItemNotEditable', { name: item.name }));
    return;
  }
  if (item.actor) {
    const hdcId = item.system.ID;
    openEditor(item.actor, { initialTab: tab, focusItemId: hdcId ? String(hdcId) : undefined });
    return;
  }
  const readOnly = viewOnly(item);
  if (!item.isOwner && !readOnly) {
    ui.notifications.warn(game.i18n.format('HERO_WORKSHOP.NotOwner', { name: item.name }));
    return;
  }
  // A list or framework opens with its members (e.g. a Multipower shield's slots) in the
  // editor window; anything else goes straight to its own dialog
  void itemFamily(item).then((members) => {
    const windowId = `item-${item.pack ? `${item.pack}-` : ''}${item.id}`;
    try {
      const session = createItemSession(item, members);
      if (readOnly) session.view = { ...session.view, readOnly };
      if (members.length > 1 || !openItemDialog(session, windowId, tab)) openSession(session, windowId, notifyApplied);
    } catch (e) {
      ui.notifications.warn(e instanceof Error ? e.message : String(e));
    }
  });
}

/**
 * Edits a single world or compendium item in its own dialog, applying on Save. Returns false
 * (so the editor window opens instead) when hero6e's sheet has changed the item since its
 * XML was stored: those changes are reviewed in the window first.
 */
function openItemDialog(session: ActorSession, windowId: string, section: TabId): boolean {
  const itemId = session.view?.focusItemId;
  if (!itemId || section === 'info' || section === 'characteristics') return false;
  const readOnly = !!session.view?.readOnly;
  if (!readOnly && session.detectDrift(HdcDocument.parse(session.hdcXml)).some((c) => c.recommended)) return false;

  const base = parseHdcFile(session.hdcXml);
  const onSave = (edited: Character) => {
    void (async () => {
      try {
        const { xml } = updateHdc(session.hdcXml, edited);
        if (xml === session.hdcXml) return;
        notifyApplied(await session.apply(xml, {}));
      } catch (e) {
        console.error(e);
        ui.notifications.error(game.i18n.format('HERO_WORKSHOP.ApplyFailed', { name: session.actorName }));
      }
    })();
  };
  const common = {
    itemId,
    readOnly,
    idScope: windowId,
    defaultIcon: session.itemImage?.(itemId),
    character: () => base,
    onSave,
  };
  if (section === 'powers' || section === 'equipment') void new PowerDialog({ ...common, section }).render({ force: true });
  else void new ItemDialog({ ...common, section }).render({ force: true });
  return true;
}

export function openNewCharacter(): void {
  void new NewCharacterWindow((options) => {
    openSession(createNewCharacterSession(options), `new-${Date.now()}`, (created) => {
      ui.notifications.info(game.i18n.format('HERO_WORKSHOP.Created', { name: created.name }));
      void created.sheet?.render(true);
    });
  }).render({ force: true });
}

export function openInspector(actor: FoundryActor): void {
  if (!actor.system._hdcXml) {
    ui.notifications.warn(game.i18n.format('HERO_WORKSHOP.NoHdc', { name: actor.name }));
    return;
  }
  void new HdcInspector(actor).render({ force: true });
}

export function openRaceLibrary(): void {
  void new RaceLibraryWindow(canManageRaces()).render({ force: true });
}

/** Re-renders open Hero Workshop windows (e.g. after the race library changes) */
export function refreshOpenWindows(): void {
  const instances = (foundry.applications as unknown as { instances: Map<string, { id: string; render(): unknown }> }).instances;
  for (const app of instances.values()) {
    if (app.id?.startsWith(`${MODULE_ID}-editor`) || app.id?.startsWith(RACE_PICKER_ID)) void app.render();
  }
}
