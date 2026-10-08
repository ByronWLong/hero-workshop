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
  'partials/typeahead.hbs',
  'partials/identity.hbs',
  ].map(template),
];

/** A read-only window's own actions that still work: opening an item or part to view it, downloading */
const READ_ONLY_ACTIONS = new Set(['editItem', 'editPart', 'download']);

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
  _preSyncPartState?(partId: string, newElement: HTMLElement, priorElement: HTMLElement, state: unknown): void;
  _syncPartState?(partId: string, newElement: HTMLElement, priorElement: HTMLElement, state: unknown): void;
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
  /** Text typed in each search box (by its data-search name), kept across re-renders */
  #searches = new Map<string, string>();
  /** Scroll positions Foundry restored on the last render, put back once the steppers are in */
  #scrolls: [HTMLElement, number][] = [];
  /** The focused field's data-field, for fields Foundry can't find again (it uses id or name) */
  #focusField?: string;

  _preSyncPartState(partId: string, newElement: HTMLElement, priorElement: HTMLElement, state: unknown): void {
    (super._preSyncPartState as ((...args: unknown[]) => void) | undefined)?.call(this, partId, newElement, priorElement, state);
    const field = priorElement.querySelector<HTMLElement>(':focus')?.dataset.field;
    if (field) this.#focusField = field;
  }

  /**
   * Foundry restores each part's scroll position before `_onRender`, but the steppers added
   * there make the form taller, so a position near the bottom would be cut short.
   */
  _syncPartState(partId: string, newElement: HTMLElement, priorElement: HTMLElement, state: { scrollPositions?: [string, number, number][] }): void {
    (super._syncPartState as ((...args: unknown[]) => void) | undefined)?.call(this, partId, newElement, priorElement, state);
    for (const [selector, top] of state.scrollPositions ?? []) {
      const el = selector === '' ? newElement : newElement.querySelector<HTMLElement>(selector);
      if (el) this.#scrolls.push([el, top]);
    }
  }

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

  /**
   * Type-to-search pickers: `<input list="…" data-field="…" data-pick>` over a datalist whose
   * options show a label and carry the chosen value in `data-value`. Once the text matches an
   * option's label, the field changes to that value and the box empties.
   */
  #pick(field: string, input: HTMLInputElement, loose = false): void {
    const typed = input.value.trim().toLowerCase();
    if (!typed) return;
    const options = [...(input.list?.options ?? [])];
    let option = options.find((o) => o.value.toLowerCase() === typed);
    // On Enter, part of a name will do when only one option contains it
    if (!option && loose) {
      const words = typed.split(/\s+/);
      const matches = options.filter((o) => words.every((w) => o.value.toLowerCase().includes(w)));
      if (matches.length === 1) option = matches[0];
    }
    if (!option?.dataset.value) return;
    input.value = '';
    this.onFieldChange(field, option.dataset.value, input);
  }

  /** Called with each changed form control that has a `data-field` attribute */
  protected onFieldChange(_field: string, _value: string, _target: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): void {}

  /** Shown but not edited (e.g. an item in a locked compendium) */
  protected readOnly = false;

  /**
   * Makes the window view-only: its fields are disabled, and of its own actions only those
   * that open or download something still work (Foundry's own, like Close and tabs, stay).
   */
  protected makeReadOnly(): void {
    this.readOnly = true;
    const own = (this.constructor as { DEFAULT_OPTIONS?: { actions?: Record<string, unknown> } }).DEFAULT_OPTIONS?.actions ?? {};
    const actions = this.options.actions as Record<string, unknown>;
    for (const name of Object.keys(own)) if (!READ_ONLY_ACTIONS.has(name)) delete actions[name];
  }

  _onRender(context: unknown, options: unknown): void {
    (super._onRender as ((c: unknown, o: unknown) => void) | undefined)?.call(this, context, options);
    if (this.readOnly) {
      this.element.classList.add('hw-read-only');
      // Search boxes still filter; the footer's Close still closes
      const fields = this.element.querySelectorAll<HTMLInputElement>(
        '.window-content :is(input, select, textarea, button):not([data-search], [data-action="close"], [data-action="download"])',
      );
      for (const field of fields) field.disabled = true;
    }
    // Wrapping a number field in its steppers moves it, which loses its focus
    const active = document.activeElement;
    const focused =
      active instanceof HTMLElement && this.element.contains(active)
        ? active
        : this.#focusField
          ? this.element.querySelector<HTMLElement>(`[data-field="${CSS.escape(this.#focusField)}"]`)
          : null;
    this.#focusField = undefined;
    addSteppers(this.element);
    if (focused && document.activeElement !== focused) focused.focus({ preventScroll: true });
    for (const [el, top] of this.#scrolls) el.scrollTop = top;
    this.#scrolls = [];
    for (const input of this.element.querySelectorAll<HTMLInputElement>('input[data-search]')) {
      const query = this.#searches.get(input.dataset.search!);
      if (query !== undefined) input.value = query;
      filterSearchList(this.element, input);
    }
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
      if (!field || this.readOnly) return;
      if (target.dataset.pick !== undefined) return this.#pick(field, target);
      const value = target.type === 'checkbox' ? String(target.checked) : target.value;
      this.onFieldChange(field, value, target);
    });
    // Search boxes filter their list as you type, without a re-render (which would lose focus)
    this.element.addEventListener('input', (event) => {
      const input = event.target as HTMLInputElement;
      // Choosing a suggestion fills the box with its whole label: that's the pick
      if (input?.dataset?.pick !== undefined && input.dataset.field) return this.#pick(input.dataset.field, input);
      if (!input?.dataset?.search) return;
      this.#searches.set(input.dataset.search, input.value);
      filterSearchList(this.element, input);
    });
    // Rows marked role="button" open like a click on Enter/Space
    this.element.addEventListener('keydown', (event) => {
      const target = event.target as HTMLElement;
      // Enter in a picker chooses its suggestion; it never submits the form
      if (event.key === 'Enter' && target.dataset?.pick !== undefined) {
        event.preventDefault();
        if (target.dataset.field) this.#pick(target.dataset.field, target as HTMLInputElement, true);
        return;
      }
      if ((event.key === 'Enter' || event.key === ' ') && target.getAttribute?.('role') === 'button' && target.dataset.action) {
        event.preventDefault();
        target.click();
      }
    });
    this.#listenForTypeaheads(signal);
  }

  /**
   * Type-ahead choices (templates/partials/typeahead.hbs): focusing shows every choice under
   * its heading; typing narrows them to those containing every word (in the name or its
   * heading), with the best match highlighted; arrows move, Enter, Tab or a click chooses,
   * Escape puts the previous choice back.
   */
  #listenForTypeaheads(signal: AbortSignal): void {
    const inputOf = (target: EventTarget | null) =>
      (target as HTMLElement | null)?.matches?.('input.hw-typeahead-input') ? (target as HTMLInputElement) : undefined;
    const choose = (input: HTMLInputElement, option: HTMLElement | null | undefined) => {
      const field = input.dataset.typeahead;
      if (!option?.dataset.value || !field) return;
      input.value = input.dataset.typeaheadClear !== undefined ? '' : (option.textContent ?? '');
      input.dataset.original = input.value;
      closeTypeahead(input);
      this.onFieldChange(field, option.dataset.value, input);
    };

    this.element.addEventListener(
      'focusin',
      (event) => {
        const input = inputOf(event.target);
        if (!input) return;
        input.dataset.original = input.value;
        const list = typeaheadList(input);
        filterTypeahead(list, '');
        openTypeahead(input);
        const current = [...list.querySelectorAll<HTMLElement>('.hw-typeahead-option')].find((o) => o.textContent === input.value);
        setActiveOption(list, current ?? visibleOptions(list)[0]);
        // After the click that focused it, so the click doesn't undo the selection
        setTimeout(() => input.select(), 0);
      },
      { signal },
    );
    this.element.addEventListener(
      'input',
      (event) => {
        const input = inputOf(event.target);
        if (!input) return;
        const list = typeaheadList(input);
        openTypeahead(input);
        setActiveOption(list, filterTypeahead(list, input.value));
      },
      { signal },
    );
    this.element.addEventListener(
      'keydown',
      (event) => {
        const input = inputOf(event.target);
        if (!input) return;
        const list = typeaheadList(input);
        const options = visibleOptions(list);
        const active = list.querySelector<HTMLElement>('.hw-typeahead-option.active:not([hidden])');
        switch (event.key) {
          case 'ArrowDown':
          case 'ArrowUp': {
            event.preventDefault();
            if (list.hidden) openTypeahead(input);
            const step = event.key === 'ArrowDown' ? 1 : -1;
            const at = active ? options.indexOf(active) : -1;
            setActiveOption(list, options[Math.min(options.length - 1, Math.max(0, at + step))]);
            return;
          }
          case 'Enter':
            // Never submits the form
            event.preventDefault();
            event.stopPropagation();
            if (!list.hidden) choose(input, active);
            return;
          case 'Tab':
            if (!list.hidden && input.value !== input.dataset.original) choose(input, active);
            return;
          case 'Escape':
            if (list.hidden) return;
            // Closes the list, not the window
            event.preventDefault();
            event.stopPropagation();
            input.value = input.dataset.original ?? '';
            closeTypeahead(input);
            return;
        }
      },
      { signal },
    );
    this.element.addEventListener(
      'mousedown',
      (event) => {
        const option = (event.target as HTMLElement | null)?.closest?.<HTMLElement>('.hw-typeahead-option');
        if (!option) return;
        // Keeps the focus in the box (so it doesn't close first)
        event.preventDefault();
        const input = option.closest('.hw-typeahead')?.querySelector<HTMLInputElement>('input.hw-typeahead-input');
        if (input) choose(input, option);
      },
      { signal },
    );
    this.element.addEventListener(
      'focusout',
      (event) => {
        const input = inputOf(event.target);
        if (!input) return;
        // Leaving without choosing keeps the previous choice
        input.value = input.dataset.original ?? '';
        closeTypeahead(input);
      },
      { signal },
    );
  }
}

const typeaheadList = (input: HTMLInputElement) =>
  input.closest('.hw-typeahead')!.querySelector<HTMLElement>('.hw-typeahead-list')!;

const visibleOptions = (list: HTMLElement) => [...list.querySelectorAll<HTMLElement>('.hw-typeahead-option:not([hidden])')];

function openTypeahead(input: HTMLInputElement): void {
  typeaheadList(input).hidden = false;
  input.setAttribute('aria-expanded', 'true');
}

function closeTypeahead(input: HTMLInputElement): void {
  typeaheadList(input).hidden = true;
  input.setAttribute('aria-expanded', 'false');
}

function setActiveOption(list: HTMLElement, option: HTMLElement | undefined): void {
  for (const other of list.querySelectorAll('.hw-typeahead-option.active')) other.classList.remove('active');
  if (!option) return;
  option.classList.add('active');
  option.scrollIntoView({ block: 'nearest' });
}

/**
 * Shows the choices containing every typed word (in the name, its other names or its heading) and the headings
 * that still have some. Returns the best match: the first name that starts with the text typed,
 * else the first shown.
 */
function filterTypeahead(list: HTMLElement, query: string): HTMLElement | undefined {
  const typed = query.trim().toLowerCase();
  const words = typed.split(/\s+/).filter(Boolean);
  const groups = new Set<string>();
  let first: HTMLElement | undefined;
  let prefix: HTMLElement | undefined;
  for (const option of list.querySelectorAll<HTMLElement>('.hw-typeahead-option')) {
    const name = (option.textContent ?? '').toLowerCase();
    const other = `${option.dataset.group ?? ''} ${option.dataset.keywords ?? ''}`.toLowerCase();
    const match = words.every((w) => name.includes(w) || other.includes(w));
    option.hidden = !match;
    if (!match) continue;
    groups.add(option.dataset.group ?? '');
    first ??= option;
    if (!prefix && typed && name.startsWith(typed)) prefix = option;
  }
  for (const heading of list.querySelectorAll<HTMLElement>('.hw-typeahead-group')) heading.hidden = !groups.has(heading.dataset.group ?? '');
  const empty = list.querySelector<HTMLElement>('.hw-typeahead-empty');
  if (empty) empty.hidden = !!first;
  return prefix ?? first;
}

/**
 * Shows the rows of a search box's list (`data-search-list` with the same name) whose
 * `data-search-text` contains every word typed, and its `data-search-empty` note when none do.
 */
function filterSearchList(root: HTMLElement, input: HTMLInputElement): void {
  const name = input.dataset.search!;
  const words = input.value.toLowerCase().split(/\s+/).filter(Boolean);
  let shown = 0;
  for (const row of root.querySelectorAll<HTMLElement>(`[data-search-list="${name}"] [data-search-text]`)) {
    const text = row.dataset.searchText!.toLowerCase();
    const match = words.every((w) => text.includes(w));
    row.hidden = !match;
    if (match) shown++;
  }
  const empty = root.querySelector<HTMLElement>(`[data-search-empty="${name}"]`);
  if (empty) empty.hidden = shown > 0;
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
