/**
 * Creating world items (the Items sidebar) with the Hero Workshop item and power dialogs.
 *
 * The dialog edits a blank scratch character; on save the new item's HDC is handed to
 * hero6e's parser, which builds the world item as an upload would.
 */

import {
  HdcDocument,
  blankHdc,
  hdcSectionFor,
  parseHdcFile,
  updateHdc,
  type Character,
  type PowerKind,
  type SectionId,
} from '@hero-workshop/shared';
import { createWorldItems } from '../sync/worldItems';
import { ItemDialog } from './item-dialog';
import { PowerDialog } from './power-dialog';

interface DialogApi {
  prompt(options: Record<string, unknown>): Promise<unknown>;
}

export interface NewItemKind {
  id: string;
  label: string;
  section: SectionId;
  kind?: PowerKind;
}

export const NEW_ITEM_KINDS: NewItemKind[] = [
  { id: 'equipment', label: 'Equipment', section: 'equipment' },
  { id: 'power', label: 'Power', section: 'powers' },
  { id: 'compound', label: 'Compound power', section: 'powers', kind: 'compound' },
  { id: 'skill', label: 'Skill', section: 'skills' },
  { id: 'perk', label: 'Perk', section: 'perks' },
  { id: 'talent', label: 'Talent', section: 'talents' },
  { id: 'maneuver', label: 'Martial arts maneuver', section: 'martialarts' },
  { id: 'complication', label: 'Complication', section: 'disadvantages' },
];

/** Asks what kind of item to create */
async function chooseKind(): Promise<NewItemKind | undefined> {
  const options = NEW_ITEM_KINDS.map((k) => `<option value="${k.id}">${k.label}</option>`).join('');
  const DialogV2 = (foundry.applications.api as unknown as { DialogV2: DialogApi }).DialogV2;
  const id = await DialogV2.prompt({
    window: { title: 'New Hero Workshop item', icon: 'fa-solid fa-suitcase' },
    position: { width: 360 },
    content: `<div class="form-group"><label>Kind</label><div class="form-fields"><select name="kind" autofocus>${options}</select></div></div>`,
    rejectClose: false,
    ok: {
      label: 'Next',
      icon: 'fa-solid fa-arrow-right',
      callback: (_event: Event, button: HTMLButtonElement) => (button.form!.elements.namedItem('kind') as HTMLSelectElement).value,
    },
  });
  return NEW_ITEM_KINDS.find((k) => k.id === id);
}

/** Opens the dialog for a new world item; `kind` skips the kind prompt */
export async function openNewItem(kindId?: string, folderId?: string): Promise<void> {
  const kind = kindId ? NEW_ITEM_KINDS.find((k) => k.id === kindId) : await chooseKind();
  if (!kind) return;

  const base = blankHdc();
  const blank = parseHdcFile(base);
  const onSave = (character: Character) => void createFromScratch(base, character, kind.section, folderId);
  const common = { itemId: undefined, character: () => blank, onSave };
  if (kind.section === 'powers' || kind.section === 'equipment') {
    await new PowerDialog({ ...common, section: kind.section, kind: kind.kind }).render({ force: true });
  } else {
    await new ItemDialog({ ...common, section: kind.section }).render({ force: true });
  }
}

async function createFromScratch(base: string, character: Character, section: SectionId, folderId?: string): Promise<void> {
  try {
    const { xml, report } = updateHdc(base, character);
    for (const issue of report.foundryIssues.filter((i) => i.severity === 'error')) ui.notifications.warn(issue.message);
    const hdcSection = hdcSectionFor(section);
    const elements = HdcDocument.parse(xml).section(hdcSection)?.elements() ?? [];
    if (!elements.length) return;
    const created = await createWorldItems({ section: hdcSection, fragments: elements.map((el) => el.toString()) }, folderId);
    const first = created[0];
    if (first) {
      ui.notifications.info(game.i18n.format('HERO_WORKSHOP.ItemCreated', { name: first.name }));
      void first.sheet?.render(true);
    }
  } catch (e) {
    console.error(e);
    ui.notifications.error(`Hero Workshop could not create the item: ${e instanceof Error ? e.message : String(e)}`);
  }
}
