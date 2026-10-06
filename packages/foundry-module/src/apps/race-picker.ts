/**
 * "Choose races" prompt: races from the world library plus free-text names for races that
 * aren't in it. Returns the chosen race names, or undefined if cancelled.
 */

import type { RaceDefinition } from '@hero-workshop/shared';
import { renderTemplate } from './base';

interface DialogApi {
  prompt(options: Record<string, unknown>): Promise<unknown>;
}

export async function chooseRaces(library: RaceDefinition[], current: string[]): Promise<string[] | undefined> {
  const known = new Set(library.map((r) => r.name.toLowerCase()));
  const content = await renderTemplate('dialogs/race-picker.hbs', {
    races: [...library]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((r) => ({ name: r.name, checked: current.some((c) => c.toLowerCase() === r.name.toLowerCase()) })),
    others: current.filter((c) => !known.has(c.toLowerCase())).join(', '),
    hasLibrary: library.length > 0,
  });

  const DialogV2 = (foundry.applications.api as unknown as { DialogV2: DialogApi }).DialogV2;
  const result = await DialogV2.prompt({
    window: { title: 'Choose races', icon: 'fa-solid fa-people-group' },
    position: { width: 480 },
    content,
    rejectClose: false,
    ok: {
      label: 'Apply',
      icon: 'fa-solid fa-check',
      callback: (_event: Event, button: HTMLButtonElement) => {
        const form = button.form!;
        const picked = [...form.querySelectorAll<HTMLInputElement>('input[name="race"]:checked')].map((i) => i.value);
        const typed = (form.elements.namedItem('others') as HTMLInputElement).value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        return [...picked, ...typed.filter((t) => !picked.some((p) => p.toLowerCase() === t.toLowerCase()))];
      },
    },
  });
  return Array.isArray(result) ? (result as string[]) : undefined;
}
