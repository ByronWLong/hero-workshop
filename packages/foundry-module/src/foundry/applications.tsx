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
import { createActorSession, downloadHdc } from '../sync/session';
import { EditorRoot } from '../ui/EditorRoot';
import { Inspector } from '../ui/Inspector';
import { NewCharacterFlow } from '../ui/NewCharacterFlow';

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
  Editor: new (actor: FoundryActor) => ReactApplication;
  Inspector: new (actor: FoundryActor) => ReactApplication;
  NewCharacter: new () => ReactApplication;
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

    readonly #session;

    constructor(readonly actor: FoundryActor) {
      super({ id: `hero-workshop-editor-${actor.id}`, window: { title: `Hero Workshop: ${actor.name}` } });
      this.#session = createActorSession(actor);
    }

    protected renderReact() {
      return (
        <EditorRoot
          session={this.#session}
          onApplied={() => {
            ui.notifications.info(game.i18n.format('HERO_WORKSHOP.Applied', { name: this.actor.name }));
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
        <NewCharacterFlow
          onCreated={(actor) => {
            ui.notifications.info(game.i18n.format('HERO_WORKSHOP.Created', { name: actor.name }));
            void this.close();
            void actor.sheet?.render(true);
          }}
        />
      );
    }
  }

  classes = { Editor: EditorApplication, Inspector: InspectorApplication, NewCharacter: NewCharacterApplication };
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

export function openEditor(actor: FoundryActor): void {
  const target = editableActor(actor);
  if (target) void new (applicationClasses().Editor)(target).render({ force: true });
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
