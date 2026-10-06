/**
 * Choose-an-actor window: a searchable list of the world's actors and the actors in the
 * compendiums the user can see; clicking one picks it (a compendium actor is loaded then).
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
    const world = [...game.actors.contents].sort((a, b) => a.name.localeCompare(b.name)).map((actor) => {
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
    });
    // Compendium actors, from each pack's index (only the chosen one is loaded)
    const compendiums = [];
    for (const pack of game.packs.contents.filter((p) => p.documentName === 'Actor' && p.visible !== false)) {
      const index = await pack.getIndex({ fields: ['img', 'type', 'folder'] });
      const entries = [...index.values()].sort((a, b) => a.name.localeCompare(b.name));
      if (!entries.length) continue;
      compendiums.push({
        label: pack.metadata.label,
        actors: entries.map((e) => {
          const folder = e.folder ? pack.folders.get(e.folder)?.name : undefined;
          return {
            id: `${pack.collection}|${e._id}`,
            name: e.name,
            img: e.img,
            detail: [pack.metadata.label, folder].filter(Boolean).join(' · '),
            searchText: [e.name, pack.metadata.label, folder].filter(Boolean).join(' '),
            hasHdc: true,
          };
        }),
      });
    }
    return { hint: this.choice.hint, actors: world, compendiums, any: world.length > 0 || compendiums.length > 0 };
  }

  static async #onChoose(this: ActorChooserWindow, _event: Event, target: HTMLElement) {
    const id = target.dataset.actorId!;
    const [packId, entryId] = id.includes('|') ? id.split('|') : [undefined, id];
    const actor = packId
      ? ((await game.packs.get(packId)?.getDocument(entryId!)) as FoundryActor | undefined)
      : game.actors.get(entryId!);
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
