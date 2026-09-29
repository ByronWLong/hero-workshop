/**
 * Base class for Hero Workshop windows: Foundry's own ApplicationV2 + Handlebars, so the
 * UI uses Foundry's markup, form styles and theme (light/dark, theme modules).
 */

import { MODULE_ID } from '../sync/session';

export const TEMPLATE_ROOT = `modules/${MODULE_ID}/templates`;
export const template = (path: string) => `${TEMPLATE_ROOT}/${path}`;

/** Partials used across templates; preloaded at init so `{{> path}}` resolves */
export const PARTIALS = [
  'templates/generic/tab-navigation.hbs',
  ...[
  'editor/item-row.hbs',
  'editor/tab-characteristics.hbs',
  'editor/tab-info.hbs',
  'editor/tab-list.hbs',
  'editor/summary.hbs',
  ].map(template),
];

export interface RenderOptions {
  force?: boolean;
  parts?: string[];
}

/** The subset of ApplicationV2 our windows use */
export interface FoundryApplication {
  readonly id: string;
  readonly element: HTMLElement;
  readonly rendered: boolean;
  readonly options: Record<string, unknown>;
  tabGroups: Record<string, string>;
  render(options?: RenderOptions | boolean): Promise<unknown>;
  close(options?: Record<string, unknown>): Promise<unknown>;
  changeTab(tab: string, group: string, options?: Record<string, unknown>): void;
  bringToFront(): void;
  _onRender?(context: unknown, options: unknown): void;
  _onClose?(options: unknown): void;
  _prepareContext?(options: unknown): Promise<Record<string, unknown>>;
}

type ApplicationClass = new (options?: Record<string, unknown>) => FoundryApplication;

const api = foundry.applications.api as unknown as {
  ApplicationV2: ApplicationClass;
  HandlebarsApplicationMixin(base: ApplicationClass): ApplicationClass;
};

export class HeroWorkshopApplication extends api.HandlebarsApplicationMixin(api.ApplicationV2) {
  static DEFAULT_OPTIONS: Record<string, unknown> = {
    classes: ['hero-workshop'],
    window: { resizable: true },
  };

  #listening = false;
  /** Mouse button held down inside this window (a click in progress) */
  #pointerDown = false;
  #renderPending = false;
  #listeners?: AbortController;

  /**
   * Re-rendering replaces the window's markup. If that happens between mouse-down and
   * mouse-up (a field's change event fires as the user clicks Save), the click lands on a
   * button that no longer exists and is lost. So renders requested mid-click wait until it
   * has gone through.
   */
  render(options?: RenderOptions | boolean): Promise<unknown> {
    if (this.#pointerDown && this.rendered) {
      this.#renderPending = true;
      return Promise.resolve(this);
    }
    return super.render(options);
  }

  #pointerReleased() {
    if (!this.#pointerDown) return;
    this.#pointerDown = false;
    if (!this.#renderPending) return;
    this.#renderPending = false;
    // After the click (dispatched right after mouse-up) has been handled
    setTimeout(() => {
      if (this.rendered && !this.#closing) void this.render();
    }, 0);
  }

  #closing = false;

  /** A form saved by the click closes; a render still waiting on that click must not reopen it */
  close(options?: Record<string, unknown>): Promise<unknown> {
    this.#closing = true;
    this.#renderPending = false;
    return super.close(options);
  }

  _onClose(options: unknown): void {
    (super._onClose as ((o: unknown) => void) | undefined)?.call(this, options);
    this.#listeners?.abort();
    // A reopened window gets a new element, which needs its listeners again
    this.#listening = false;
    this.#closing = false;
    this.#pointerDown = false;
    this.#renderPending = false;
  }

  /** Called with each changed form control that has a `data-field` attribute */
  protected onFieldChange(_field: string, _value: string, _target: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): void {}

  _onRender(context: unknown, options: unknown): void {
    (super._onRender as ((c: unknown, o: unknown) => void) | undefined)?.call(this, context, options);
    addSteppers(this.element);
    if (this.#listening) return;
    this.#listening = true;
    this.#listeners = new AbortController();
    const { signal } = this.#listeners;
    this.element.addEventListener('pointerdown', () => (this.#pointerDown = true), { capture: true, signal });
    document.addEventListener('pointerup', () => this.#pointerReleased(), { capture: true, signal });
    document.addEventListener('pointercancel', () => this.#pointerReleased(), { capture: true, signal });
    // Delegated once on the window element, which survives re-renders
    this.element.addEventListener('change', (event) => {
      const target = event.target as HTMLInputElement;
      const field = target?.dataset?.field;
      if (!field) return;
      const value = target.type === 'checkbox' ? String(target.checked) : target.value;
      this.onFieldChange(field, value, target);
    });
    // Rows marked role="button" open like a click on Enter/Space
    this.element.addEventListener('keydown', (event) => {
      const target = event.target as HTMLElement;
      if ((event.key === 'Enter' || event.key === ' ') && target.getAttribute?.('role') === 'button' && target.dataset.action) {
        event.preventDefault();
        target.click();
      }
    });
  }
}

/** Opens Foundry's file picker for an image; resolves with the chosen path */
export function pickImage(current: string): Promise<string> {
  const FilePicker = (foundry.applications as unknown as {
    apps: { FilePicker: { implementation: new (options: Record<string, unknown>) => { render(force?: boolean): unknown } } };
  }).apps.FilePicker.implementation;
  return new Promise((resolve) => {
    void new FilePicker({ type: 'image', current, callback: (path: string) => resolve(path) }).render(true);
  });
}

/**
 * Puts - and + buttons around every number field, for quick increments (and decrements into
 * negatives, e.g. a GM-given item's -2 DEX). They step the field and fire its change event,
 * so the window reacts exactly as if the value had been typed.
 */
function addSteppers(root: HTMLElement): void {
  for (const input of root.querySelectorAll<HTMLInputElement>('input[type="number"]:not([data-stepper])')) {
    // Dense grids (the race library) keep plain fields
    if (input.closest('[data-no-steppers]')) continue;
    if (input.disabled || input.readOnly) continue;
    input.dataset.stepper = '';
    const wrap = document.createElement('span');
    wrap.className = 'hw-stepper';
    input.replaceWith(wrap);
    const button = (label: string, direction: 1 | -1) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'hw-step';
      b.tabIndex = -1;
      b.textContent = label;
      b.setAttribute('aria-label', direction > 0 ? 'Increase' : 'Decrease');
      b.addEventListener('click', () => {
        if (direction > 0) input.stepUp();
        else input.stepDown();
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
      return b;
    };
    wrap.append(button('−', -1), input, button('+', 1));
  }
}

/** Renders a template to an HTML string (for dialogs) */
export function renderTemplate(path: string, data: Record<string, unknown>): Promise<string> {
  const handlebars = (foundry.applications as unknown as {
    handlebars: { renderTemplate(path: string, data: Record<string, unknown>): Promise<string> };
  }).handlebars;
  return handlebars.renderTemplate(template(path), data);
}

export function preloadTemplates(): Promise<unknown> {
  const handlebars = (foundry.applications as unknown as {
    handlebars: { loadTemplates(paths: string[]): Promise<unknown> };
  }).handlebars;
  return handlebars.loadTemplates(PARTIALS);
}
