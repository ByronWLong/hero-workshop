/**
 * Minimal ambient declarations for the Foundry VTT (v14) globals this module uses.
 * Only the members we touch are typed; everything else stays `unknown`.
 */

interface FoundryItem {
  id: string;
  name: string;
  type: string;
  system: Record<string, unknown>;
  isFreeStuff?: boolean;
  toObject(): { system: Record<string, unknown> };
}

interface FoundryActor {
  id: string;
  name: string;
  type: string;
  img: string;
  isOwner: boolean;
  /** Set on synthetic (unlinked token) actors */
  token: unknown;
  system: Record<string, unknown> & { _hdcXml?: string };
  items: { contents: FoundryItem[] };
  toObject(): { system: Record<string, unknown> };
  getFlag(scope: string, key: string): unknown;
  setFlag(scope: string, key: string, value: unknown): Promise<unknown>;
  update(data: Record<string, unknown>): Promise<unknown>;
  /** hero6e: re-imports the actor from HDC XML, merging items by HDC ID */
  uploadFromXml(xml: string, options?: Record<string, unknown>): Promise<void>;
}

interface HeaderControl {
  action: string;
  icon: string;
  label: string;
  onClick?: (event: Event) => void;
  visible?: boolean;
  ownership?: string | number;
}

interface ContextMenuEntry {
  name: string;
  icon: string;
  condition?: (li: HTMLElement) => boolean;
  callback: (li: HTMLElement) => void;
}

declare const game: {
  system: { id: string; version: string };
  user: { isGM: boolean };
  actors: { get(id: string): FoundryActor | undefined };
  modules: Map<string, { api?: unknown }> & { get(id: string): { api?: unknown } | undefined };
  i18n: { localize(key: string): string; format(key: string, data: Record<string, unknown>): string };
};

declare const ui: {
  notifications: {
    info(message: string): void;
    warn(message: string): void;
    error(message: string, options?: { permanent?: boolean }): void;
  };
};

declare const Hooks: {
  once(hook: string, fn: (...args: never[]) => unknown): number;
  on(hook: string, fn: (...args: never[]) => unknown): number;
};

declare const foundry: {
  applications: {
    api: { ApplicationV2: new (options?: Record<string, unknown>) => unknown };
  };
  documents: { Actor: abstract new (...args: never[]) => FoundryActor };
  utils: { saveDataToFile?: (data: BlobPart, type: string, filename: string) => void };
};
