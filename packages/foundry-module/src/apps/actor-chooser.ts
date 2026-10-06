/**
 * Choose-an-actor window: a searchable list of the world's actors; clicking one picks it.
 * Resolves with the actor, or undefined if closed.
 */

import { MODULE_ID } from '../sync/session';
import { HeroWorkshopApplication, template } from './base';

export interface ActorChoiceOptions {
  title: string;
  /** Explains what happens to the chosen actor */
  hint?: string;
}

export function chooseActor(options: ActorChoiceOptions): Promise<FoundryActor | undefined> {
  return new Promise((resolve) => void new ActorChooserWindow(options, resolve).render({ force: true }));
}

class ActorChooserWindow extends HeroWorkshopApplication {
  static DEFAULT_OPTIONS = {
    classes: ['hero-workshop', 'hero-workshop-actor-chooser'],
    position: { width: 420, height: 560 },
    window: { icon: 'fa-solid fa-user', resizable: true },
    actions: { choose: ActorChooserWindow.#onChoose },
  };

  static PARTS = {
    body: { template: template('dialogs/actor-chooser.hbs'), scrollable: ['.hw-pick-list'] },
  };

  #resolve?: (actor: FoundryActor | undefined) => void;

  constructor(
    readonly choice: ActorChoiceOptions,
    resolve: (actor: FoundryActor | undefined) => void,
  ) {
    super({ id: `${MODULE_ID}-actor-chooser-${foundry.utils.randomID()}`, window: { title: choice.title } });
    this.#resolve = resolve;
  }

  async _prepareContext() {
    const actors = [...game.actors.contents].sort((a, b) => a.name.localeCompare(b.name));
    return {
      hint: this.choice.hint,
      actors: actors.map((actor) => {
        const folder = (actor as FoundryActor & { folder?: { name?: string } }).folder?.name;
        const type = actor.type.toUpperCase();
        return {
          id: actor.id,
          name: actor.name,
          img: actor.img,
          detail: [type, folder].filter(Boolean).join(' · '),
          searchText: [actor.name, type, folder].filter(Boolean).join(' '),
          hasHdc: Boolean(actor.system._hdcXml),
        };
      }),
    };
  }

  static #onChoose(this: ActorChooserWindow, _event: Event, target: HTMLElement) {
    const actor = game.actors.get(target.dataset.actorId!);
    if (!actor) return;
    this.#resolve?.(actor);
    this.#resolve = undefined;
    void this.close();
  }

  _onClose(options: unknown): void {
    super._onClose(options);
    this.#resolve?.(undefined);
    this.#resolve = undefined;
  }
}
