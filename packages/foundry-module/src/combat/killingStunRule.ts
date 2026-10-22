/**
 * Optional house rule for killing attack STUN (see killingStun.ts for the math).
 *
 * hero6e 5.x computes damage in a function modules can't reach, so the rule is applied around
 * it. When Apply Damage is clicked for a killing attack, each target is marked; hero6e's actor
 * update for that target has its STUN loss held back (before hero6e's own Knocked Out logic
 * runs on it); the apply-damage card hero6e posts next supplies the defenses and BODY, and the
 * house-rule STUN is then applied in one update and written onto the card. BODY, knockback and
 * everything else stay hero6e's.
 */

import {
  houseKillingStun,
  readKillingCard,
  rollStunMultiplier,
  stunMultiplierFor,
  type StunMultiplier,
  type StunMultiplierDice,
  type StunMultiplierMode,
} from './killingStun';
import { MODULE_ID } from '../sync/session';

const ENABLED = 'killingStun';
const MODE = 'killingStunMultiplier';
const FIXED = 'killingStunFixed';
const BONUS = 'killingStunBonus';
const BODYX = 'killingStunIncludesBodyMultiplier';

/** How long a marked target waits for hero6e's card (conditional defense dialogs included) */
const TARGET_TIMEOUT_MS = 5 * 60_000;
/** How long held STUN waits for the card before hero6e's own value is applied */
const HOLD_TIMEOUT_MS = 5_000;

interface HeroActor {
  uuid: string;
  type: string;
  statuses: Set<string>;
  system: { characteristics: { stun?: { value: number }; con?: { value: number } } };
  update(data: Record<string, unknown>): Promise<unknown>;
  toggleStatusEffect(id: string, options: { active: boolean; overlay?: boolean }): Promise<unknown>;
  hasCharacteristic?(key: string): boolean;
  getAutomatonSpecialPowers?(): { cannotBeStunned?: boolean };
}

interface TokenDocument {
  uuid: string;
  actor: HeroActor | null;
}

/** hero6e's damage roller, as serialized onto the Apply Damage button */
interface RollerData {
  _type?: string;
  _is5eRoll?: boolean;
  _useHitLocation?: boolean;
  _killingAdditionalStunMultiplier?: number | string;
}

interface Target {
  actorUuid: string;
  wasStunned: boolean;
  /** The click's own STUNx roll, when the setting rolls but hero6e used a hit location */
  rolled?: StunMultiplier;
  additional: number;
  expires: number;
  /** STUN loss hero6e tried to apply, held until its card arrives */
  held?: { stun: number; timer: ReturnType<typeof setTimeout> };
}

/** Marked targets by token UUID */
const targets = new Map<string, Target>();

const setting = <T>(key: string) => game.settings.get(MODULE_ID, key) as T;

export function registerKillingStunSettings(): void {
  game.settings.register(MODULE_ID, ENABLED, {
    name: 'HERO_WORKSHOP.KillingStun',
    hint: 'HERO_WORKSHOP.KillingStunHint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false,
  });
  game.settings.register(MODULE_ID, MODE, {
    name: 'HERO_WORKSHOP.KillingStunMultiplier',
    hint: 'HERO_WORKSHOP.KillingStunMultiplierHint',
    scope: 'world',
    config: true,
    type: String,
    choices: {
      hero6e: 'HERO_WORKSHOP.KillingStunMultiplierHero6e',
      locationOrFixed: 'HERO_WORKSHOP.KillingStunMultiplierLocationOrFixed',
      rolled: 'HERO_WORKSHOP.KillingStunMultiplierRolled',
      fixed: 'HERO_WORKSHOP.KillingStunMultiplierFixed',
    },
    default: 'hero6e',
  });
  game.settings.register(MODULE_ID, FIXED, {
    name: 'HERO_WORKSHOP.KillingStunFixed',
    hint: 'HERO_WORKSHOP.KillingStunFixedHint',
    scope: 'world',
    config: true,
    type: Number,
    range: { min: 1, max: 6, step: 0.5 },
    default: 2,
  });
  game.settings.register(MODULE_ID, BONUS, {
    name: 'HERO_WORKSHOP.KillingStunBonus',
    hint: 'HERO_WORKSHOP.KillingStunBonusHint',
    scope: 'world',
    config: true,
    type: Number,
    range: { min: 0, max: 10, step: 0.5 },
    default: 0,
  });
  game.settings.register(MODULE_ID, BODYX, {
    name: 'HERO_WORKSHOP.KillingStunIncludesBodyMultiplier',
    hint: 'HERO_WORKSHOP.KillingStunIncludesBodyMultiplierHint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false,
  });
}

/** Installs the rule's hooks (call once hero6e has set up CONFIG) */
export function wrapKillingStunRule(): void {
  const proto = (
    CONFIG as unknown as { Actor?: { documentClass?: { prototype: PreUpdateTarget } } }
  ).Actor?.documentClass?.prototype;
  const preUpdate = proto?._preUpdate;
  if (!proto || !preUpdate) {
    console.warn(
      `${MODULE_ID} | hero6e's actor class wasn't found; the killing STUN house rule is off.`
    );
    return;
  }
  proto._preUpdate = function (this: HeroActor, changed, options, user) {
    holdStun(this, changed);
    return preUpdate.call(this, changed, options, user);
  };

  // Capture phase: runs before hero6e's own (jQuery) handler on the chat card. Unmarked targets
  // simply take hero6e's STUN, so a failure here never blocks the damage.
  document.addEventListener(
    'click',
    (event) => {
      try {
        onApplyDamageClick(event);
      } catch (err) {
        console.error(
          `${MODULE_ID} | Couldn't set up the killing STUN house rule; hero6e's STUN will be used.`,
          err
        );
      }
    },
    true
  );
  Hooks.on('preCreateChatMessage', onPreCreateChatMessage as (...args: never[]) => unknown);
}

interface PreUpdateTarget {
  _preUpdate?: (
    this: HeroActor,
    changed: ActorChanges,
    options: unknown,
    user: unknown
  ) => Promise<unknown>;
}

interface ActorChanges {
  system?: { characteristics?: { stun?: { value?: unknown } } };
}

function onApplyDamageClick(event: MouseEvent): void {
  const button = (event.target as Element | null)?.closest?.(
    'button.apply-damage'
  ) as HTMLButtonElement | null;
  if (!button || !setting<boolean>(ENABLED)) return;

  let roller: RollerData;
  try {
    roller = JSON.parse(button.dataset.roller ?? '{}') as RollerData;
  } catch {
    return;
  }
  if (roller._type !== 'killing') return;

  const additional = Number(roller._killingAdditionalStunMultiplier) || 0;
  const rolled =
    setting<StunMultiplierMode>(MODE) === 'rolled' && roller._useHitLocation
      ? rollStunMultiplier(heroStunDice(), !!roller._is5eRoll, additional, rollD6)
      : undefined;

  const now = Date.now();
  for (const [uuid, target] of targets) if (target.expires < now) targets.delete(uuid);
  for (const token of clickedTargets(button)) {
    if (!token.actor) continue;
    targets.set(token.uuid, {
      actorUuid: token.actor.uuid,
      wasStunned: token.actor.statuses.has('stunned'),
      rolled,
      additional,
      expires: now + TARGET_TIMEOUT_MS,
    });
  }
}

/** The tokens hero6e will apply this button's damage to */
function clickedTargets(button: HTMLButtonElement): TokenDocument[] {
  const canvas = (
    globalThis as unknown as {
      canvas?: {
        scene?: { tokens: { get(id: string): TokenDocument | undefined } };
        tokens?: { controlled: { document: TokenDocument }[] };
      };
    }
  ).canvas;
  let listed: { tokenId?: string; tokenUuid?: string; targetTokenUuid?: string }[] = [];
  try {
    listed = JSON.parse(button.dataset.targetTokens ?? '[]');
  } catch {
    // hero6e then uses the selected tokens
  }
  if (!listed.length) return (canvas?.tokens?.controlled ?? []).map((t) => t.document);
  return listed
    .map((t) => {
      const uuid = t.targetTokenUuid ?? t.tokenUuid;
      return (
        (uuid ? (fromUuidSync(uuid) as TokenDocument | null) : null) ??
        (t.tokenId ? canvas?.scene?.tokens.get(t.tokenId) : undefined)
      );
    })
    .filter((t): t is TokenDocument => !!t);
}

const targetForActor = (actor: HeroActor) =>
  [...targets.values()].find((t) => t.actorUuid === actor.uuid);

/** Holds back the STUN loss of hero6e's damage update for a marked target */
function holdStun(actor: HeroActor, changed: ActorChanges): void {
  const target = targets.size ? targetForActor(actor) : undefined;
  const stun = changed?.system?.characteristics?.stun;
  const current = actor.system?.characteristics?.stun?.value;
  // A value that goes up is a recovery or a heal, not this damage
  if (
    !target ||
    target.held ||
    typeof stun?.value !== 'number' ||
    current === undefined ||
    stun.value > current
  )
    return;

  const value = stun.value;
  delete stun.value;
  target.held = {
    stun: current - value,
    // No card came (hero6e changed, or the card failed): apply hero6e's own STUN
    timer: setTimeout(() => {
      if (targetForActor(actor) !== target) return;
      deleteTarget(target);
      console.warn(`${MODULE_ID} | No damage card for ${actor.uuid}; applied hero6e's STUN.`);
      void loseStun(actor, target.held!.stun);
    }, HOLD_TIMEOUT_MS),
  };
}

const loseStun = (actor: HeroActor, stun: number) =>
  actor.update({
    'system.characteristics.stun.value': (actor.system.characteristics.stun?.value ?? 0) - stun,
  });

function deleteTarget(target: Target): void {
  for (const [uuid, t] of targets) if (t === target) targets.delete(uuid);
}

interface ChatMessageLike {
  updateSource(data: Record<string, unknown>): unknown;
}

interface ChatMessageData {
  content?: string;
  speaker?: { scene?: string | null; token?: string | null };
}

function onPreCreateChatMessage(
  message: ChatMessageLike,
  data: ChatMessageData,
  _options: unknown,
  userId: string
): void {
  if (userId !== game.user.id || !data.content?.includes('apply-damage-card')) return;
  // hero6e's speaker names the target token; its scene is often null
  const { scene, token } = data.speaker ?? {};
  const uuid = token
    ? [...targets.keys()].find(
        (u) => u.endsWith(`.Token.${token}`) && (!scene || u.startsWith(`Scene.${scene}.`))
      )
    : undefined;
  const target = uuid ? targets.get(uuid) : undefined;
  if (!target) return;
  deleteTarget(target);

  const actor = fromUuidSync(target.actorUuid) as HeroActor | null;
  if (target.held) clearTimeout(target.held.timer);
  try {
    const result = applyToCard(data.content, target, actor);
    if (result) {
      message.updateSource({ content: result.content });
      if (actor)
        void applyStun(actor, target, result.stun, result.wasRawStunned, result.inflictsStunned);
      return;
    }
  } catch (err) {
    console.error(
      `${MODULE_ID} | Couldn't apply the killing STUN house rule; hero6e's STUN was used.`,
      err
    );
  }
  // Not a killing card after all: give hero6e's STUN back
  if (actor && target.held) void applyStun(actor, target, target.held.stun, false, false);
}

/** Rewrites hero6e's card with the house-rule STUN; null when the card can't be read */
function applyToCard(
  content: string,
  target: Target,
  actor: HeroActor | null
): { content: string; stun: number; wasRawStunned: boolean; inflictsStunned: boolean } | null {
  const doc = new DOMParser().parseFromString(content, 'text/html');
  const card = doc.querySelector('.apply-damage-card');
  const defense = [...(card?.querySelectorAll('.description-tiny') ?? [])].find((el) =>
    /Defense:/.test(el.textContent ?? '')
  );
  const result = card?.querySelector('.description-medium');
  const [bodySpan, stunSpan] = [...(result?.querySelectorAll('span[title]') ?? [])];
  const effects = card?.querySelector('.effects');
  if (!card || !defense || !result || !bodySpan || !stunSpan) return null;

  const damage = readKillingCard({
    defense: defense.textContent ?? '',
    bodyBreakdown: bodySpan.getAttribute('title') ?? '',
    stunBreakdown: stunSpan.getAttribute('title') ?? '',
    effect: result.textContent ?? '',
    effects: effects?.textContent ?? '',
  });
  if (!damage) return null;

  const multiplier = stunMultiplierFor(setting<StunMultiplierMode>(MODE), damage, {
    fixed: setting<number>(FIXED),
    additional: target.additional,
    rolled: target.rolled,
  });
  const house = houseKillingStun(
    damage,
    multiplier,
    setting<number>(BONUS),
    setting<boolean>(BODYX)
  );
  const inflictsStunned =
    house.stun > 0 &&
    canBeStunned(actor) &&
    house.stun > (actor?.system.characteristics.con?.value ?? Infinity);

  stunSpan.textContent = `${house.stun} STUN`;
  stunSpan.setAttribute('title', house.breakdown.join('\n'));
  if (effects && damage.inflictsStunned !== inflictsStunned) {
    // Text nodes only: the minimum damage note carries an icon with an HTML tooltip
    if (inflictsStunned)
      effects.prepend(effects.childNodes.length ? 'inflicts Stunned; ' : 'inflicts Stunned');
    else {
      for (const node of [...effects.childNodes]) {
        if (node.nodeType === Node.TEXT_NODE)
          node.textContent = (node.textContent ?? '').replace(/inflicts Stunned(;\s*)?/, '');
      }
    }
  }
  const note = doc.createElement('div');
  note.className = 'description-tiny hero-workshop-house-rule';
  note.textContent = game.i18n.format('HERO_WORKSHOP.KillingStunCard', {
    summary: house.summary,
    stun: String(damage.stun),
  });
  result.after(note);

  return {
    content: doc.body.innerHTML,
    stun: house.stun,
    wasRawStunned: damage.inflictsStunned,
    inflictsStunned,
  };
}

/** hero6e's own conditions for a target being Stunned */
function canBeStunned(actor: HeroActor | null): boolean {
  if (!actor || !game.settings.get(game.system.id, 'stunned')) return false;
  if (actor.hasCharacteristic && !actor.hasCharacteristic('CON')) return false;
  return !actor.getAutomatonSpecialPowers?.().cannotBeStunned;
}

/** Applies the held STUN loss and corrects the Stunned status hero6e set from its own STUN */
async function applyStun(
  actor: HeroActor,
  target: Target,
  stun: number,
  wasRawStunned: boolean,
  inflictsStunned: boolean
): Promise<void> {
  if (!target.held) return; // hero6e's automation didn't apply damage to this target
  try {
    await loseStun(actor, stun);
    if (inflictsStunned && !wasRawStunned)
      await actor.toggleStatusEffect('stunned', { active: true, overlay: false });
    else if (wasRawStunned && !inflictsStunned && !target.wasStunned)
      await actor.toggleStatusEffect('stunned', { active: false });
  } catch (err) {
    console.error(`${MODULE_ID} | Couldn't apply house-rule STUN to ${actor.uuid}.`, err);
  }
}

function heroStunDice(): StunMultiplierDice | undefined {
  try {
    return game.settings.get(
      game.system.id,
      'NonStandardStunMultiplierForKillingAttackBackingSetting'
    ) as StunMultiplierDice;
  } catch {
    return undefined;
  }
}

/** Foundry's dice randomness (Roll can't evaluate dice synchronously) */
function rollD6(): number {
  const random =
    (CONFIG as unknown as { Dice?: { randomUniform?: () => number } }).Dice?.randomUniform ??
    Math.random;
  return Math.min(6, Math.floor(random() * 6) + 1);
}
