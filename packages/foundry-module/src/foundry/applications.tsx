/**
 * Foundry ApplicationV2 windows that host the React UI.
 *
 * React renders into a shadow root inside the window so the web app's global styles
 * (":root", "body", "*" resets) can't leak into Foundry and Foundry's can't leak in.
 * Classes are created lazily because `foundry.applications.api` is a runtime global.
 */

import type { ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import frontendCss from '@frontend/index.css?inline';
import appCss from '../styles/app.css?inline';
import { createActorSession, downloadHdc, type ActorSession, type SessionView } from '../sync/session';
import { createItemSession, tabForItem } from '../sync/itemSession';
import { EditorRoot } from '../ui/EditorRoot';
import { Inspector } from '../ui/Inspector';
import { NewCharacterFlow } from '../ui/NewCharacterFlow';
import { RaceLibraryManager } from '../ui/RaceLibraryManager';
import { canManageRaces, getRaceLibrary, saveRaceLibrary, useRaceLibrary } from '../races/library';
import type { ComponentProps } from 'react';

type WithoutRaces<T> = Omit<T, 'raceLibrary' | 'onManageRaces'>;

/** Supplies the live race library to the editor */
function EditorWithRaces(props: WithoutRaces<ComponentProps<typeof EditorRoot>>) {
  const races = useRaceLibrary();
  return <EditorRoot {...props} raceLibrary={races} onManageRaces={canManageRaces() ? openRaceLibrary : undefined} />;
}

function NewCharacterWithRaces(props: WithoutRaces<ComponentProps<typeof NewCharacterFlow>>) {
  const races = useRaceLibrary();
  return (
    <NewCharacterFlow {...props} raceLibrary={races} onManageRaces={canManageRaces() ? openRaceLibrary : undefined} />
  );
}

/** Rewrites document-level selectors so the SPA stylesheet applies inside a shadow root */
function scopeForShadowRoot(css: string): string {
  return css
    .replace(/:root\b/g, ':host')
    .replace(/(^|[\s,{}>])(html|body)(?=[\s,{.:>[])/g, '$1.hw-body');
}

const SHADOW_CSS = scopeForShadowRoot(frontendCss) + '\n' + appCss;

type ApplicationBase = new (options?: Record<string, unknown>) => {
  render(options?: boolean | Record<string, unknown>): Promise<unknown>;
  close(options?: Record<string, unknown>): Promise<unknown>;
};

interface ReactApplication {
  render(options?: boolean | Record<string, unknown>): Promise<unknown>;
  close(options?: Record<string, unknown>): Promise<unknown>;
}

let classes: {
  Editor: new (session: ActorSession, windowId: string) => ReactApplication;
  Inspector: new (actor: FoundryActor) => ReactApplication;
  NewCharacter: new () => ReactApplication;
  RaceLibrary: new () => ReactApplication;
} | undefined;

function applicationClasses() {
  if (classes) return classes;
  const ApplicationV2 = foundry.applications.api.ApplicationV2 as unknown as ApplicationBase;

  abstract class ReactHostApplication extends ApplicationV2 {
    #root?: Root;

    protected abstract renderReact(): ReactNode;

    async _renderHTML(): Promise<null> {
      return null;
    }

    _replaceHTML(_result: unknown, content: HTMLElement): void {
      if (!this.#root) {
        const host = document.createElement('div');
        host.className = 'hero-workshop-host';
        // Shadow DOM retargets key events to the host, so Foundry's keybinding handler would
        // think no input has focus and fire shortcuts (e.g. Delete removing a token) while typing
        for (const type of ['keydown', 'keyup', 'keypress']) {
          host.addEventListener(type, (event) => event.stopPropagation());
        }
        const shadow = host.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = SHADOW_CSS;
        const mount = document.createElement('div');
        mount.className = 'hw-body';
        shadow.append(style, mount);
        content.replaceChildren(host);
        this.#root = createRoot(mount);
      }
      this.#root.render(this.renderReact());
    }

    _onClose(): void {
      this.#root?.unmount();
      this.#root = undefined;
    }
  }

  class EditorApplication extends ReactHostApplication {
    static DEFAULT_OPTIONS = {
      classes: ['hero-workshop-window'],
      window: { title: 'Hero Workshop', icon: 'fa-solid fa-user-pen', resizable: true },
      position: { width: 1200, height: 820 },
    };

    constructor(
      readonly session: ActorSession,
      windowId: string,
    ) {
      super({ id: `hero-workshop-editor-${windowId}`, window: { title: `Hero Workshop: ${session.actorName}` } });
    }

    protected renderReact() {
      return (
        <EditorWithRaces
          session={this.session}
          onApplied={(applied) => {
            ui.notifications.info(game.i18n.format('HERO_WORKSHOP.Applied', { name: applied.name }));
            void this.close();
          }}
        />
      );
    }
  }

  class InspectorApplication extends ReactHostApplication {
    static DEFAULT_OPTIONS = {
      classes: ['hero-workshop-window'],
      window: { title: 'HDC Inspector', icon: 'fa-solid fa-file-code', resizable: true },
      position: { width: 900, height: 720 },
    };

    constructor(readonly actor: FoundryActor) {
      super({ id: `hero-workshop-inspector-${actor.id}`, window: { title: `HDC: ${actor.name}` } });
    }

    protected renderReact() {
      const xml = this.actor.system._hdcXml ?? '';
      return <Inspector name={this.actor.name} xml={xml} onDownload={() => downloadHdc(xml, this.actor.name)} />;
    }
  }

  class NewCharacterApplication extends ReactHostApplication {
    static DEFAULT_OPTIONS = {
      id: 'hero-workshop-new-character',
      classes: ['hero-workshop-window'],
      window: { title: 'Hero Workshop: New Character', icon: 'fa-solid fa-user-plus', resizable: true },
      position: { width: 1200, height: 820 },
    };

    protected renderReact() {
      return (
        <NewCharacterWithRaces
          onCreated={(actor) => {
            ui.notifications.info(game.i18n.format('HERO_WORKSHOP.Created', { name: actor.name }));
            void this.close();
            void actor.sheet?.render(true);
          }}
        />
      );
    }
  }

  class RaceLibraryApplication extends ReactHostApplication {
    static DEFAULT_OPTIONS = {
      id: 'hero-workshop-race-library',
      classes: ['hero-workshop-window'],
      window: { title: 'Hero Workshop: Race Library', icon: 'fa-solid fa-dna', resizable: true },
      position: { width: 1300, height: 640 },
    };

    protected renderReact() {
      return (
        <RaceLibraryManager
          races={getRaceLibrary()}
          editable={canManageRaces()}
          actors={game.actors.contents}
          onSave={async (races) => {
            await saveRaceLibrary(races);
            ui.notifications.info(game.i18n.format('HERO_WORKSHOP.RacesSaved', { count: races.length }));
            void this.render();
          }}
        />
      );
    }
  }

  classes = {
    Editor: EditorApplication,
    Inspector: InspectorApplication,
    NewCharacter: NewCharacterApplication,
    RaceLibrary: RaceLibraryApplication,
  };
  return classes;
}

/** Checks the actor can be edited, explaining why not if it can't */
function editableActor(actor: FoundryActor): FoundryActor | undefined {
  if (actor.token) {
    ui.notifications.warn(game.i18n.format('HERO_WORKSHOP.TokenActor', { name: actor.name }));
    return undefined;
  }
  if (!actor.isOwner) {
    ui.notifications.warn(game.i18n.format('HERO_WORKSHOP.NotOwner', { name: actor.name }));
    return undefined;
  }
  if (!actor.system._hdcXml) {
    ui.notifications.warn(game.i18n.format('HERO_WORKSHOP.NoHdc', { name: actor.name }));
    return undefined;
  }
  return actor;
}

export function openEditor(actor: FoundryActor, view?: SessionView): void {
  const target = editableActor(actor);
  if (target) void new (applicationClasses().Editor)(createActorSession(target, view), target.id).render({ force: true });
}

/**
 * Items owned by an actor are part of the actor's HDC, so they open the actor's editor on
 * the item's tab; world items are edited on their own.
 */
export function openItemEditor(item: FoundryItem): void {
  const tab = tabForItem(item);
  if (!tab) {
    ui.notifications.warn(game.i18n.format('HERO_WORKSHOP.ItemNotEditable', { name: item.name }));
    return;
  }
  if (item.actor) {
    openEditor(item.actor, { initialTab: tab });
    return;
  }
  if (!item.isOwner) {
    ui.notifications.warn(game.i18n.format('HERO_WORKSHOP.NotOwner', { name: item.name }));
    return;
  }
  try {
    void new (applicationClasses().Editor)(createItemSession(item), `item-${item.id}`).render({ force: true });
  } catch (e) {
    ui.notifications.warn(e instanceof Error ? e.message : String(e));
  }
}

export function openRaceLibrary(): void {
  void new (applicationClasses().RaceLibrary)().render({ force: true });
}

export function openNewCharacter(): void {
  void new (applicationClasses().NewCharacter)().render({ force: true });
}

export function openInspector(actor: FoundryActor): void {
  if (!actor.system._hdcXml) {
    ui.notifications.warn(game.i18n.format('HERO_WORKSHOP.NoHdc', { name: actor.name }));
    return;
  }
  void new (applicationClasses().Inspector)(actor).render({ force: true });
}
