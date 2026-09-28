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

  /** Called with each changed form control that has a `data-field` attribute */
  protected onFieldChange(_field: string, _value: string, _target: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): void {}

  _onRender(context: unknown, options: unknown): void {
    (super._onRender as ((c: unknown, o: unknown) => void) | undefined)?.call(this, context, options);
    if (this.#listening) return;
    this.#listening = true;
    // Delegated once on the window element, which survives re-renders
    this.element.addEventListener('change', (event) => {
      const target = event.target as HTMLInputElement;
      const field = target?.dataset?.field;
      if (!field) return;
      const value = target.type === 'checkbox' ? String(target.checked) : target.value;
      this.onFieldChange(field, value, target);
    });
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
