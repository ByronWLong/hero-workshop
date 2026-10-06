# Hero Workshop for Foundry VTT

A Foundry VTT v14 module for the [Hero System 6e (Unofficial) v2](https://github.com/dmdorman/hero6e-foundryvtt) system (`hero6efoundryvttv2`, 5.x). It opens Hero Workshop's character editor on any actor that has Hero Designer data.

## How it works

hero6e keeps the actor's source HDC in `actor.system._hdcXml`. When you open the editor:

1. **Foundry changes are checked.** Edits made on hero6e's own sheets, such as changed levels or added and removed adders, are compared with the stored HDC. You choose which ones to keep before editing.
2. **You edit in Hero Workshop.** Every section of the character is editable: characteristics, skills, perks, talents, martial arts, powers, complications and equipment.
3. **The changes are reviewed and applied.** The HDC is patched rather than regenerated, and the actor is re-imported with hero6e's own `uploadFromXml`. Damage, used charges, and Foundry item IDs are preserved.

## Built on Foundry's framework

Every window is a native ApplicationV2 + Handlebars application, like hero6e's own sheets:
- **Styling:** it uses Foundry's form markup and CSS variables, so light and dark themes and theme modules apply.
- **Where the logic lives:** all character rules (costs, maxima, item forms, HDC writing) live in `@hero-workshop/shared` as framework-independent functions. The module's code only renders them (`src/apps`, `templates/`).

## Install

In Foundry: **Add-on Modules → Install Module**, paste this manifest URL, and install:

```
https://github.com/ByronWLong/hero-workshop/releases/latest/download/module.json
```

Foundry offers updates when a new release is published.

## Releasing

Push a tag named `module-v<version>` (e.g. `module-v0.4.0`). The **Release Foundry module** workflow builds the module, stamps the version into `module.json`, and publishes a GitHub release with `module.json` and `hero-workshop.zip`.

## Build from source

```bash
npm run build:foundry            # from the repo root; output in packages/foundry-module/dist
```

`dist/` is the module folder. Link or copy it to `<Foundry data>/Data/modules/hero-workshop` and enable **Hero Workshop** in your world.

## Using it

- On a hero6e actor sheet, open the header menu (⋮) and choose **Edit in Hero Workshop** or **Inspect HDC**.
- You can also right-click an actor in the Actors sidebar for the same options.
- **New characters:** use the Actors sidebar's **Hero Workshop Character** button.
  - Heroic and Superheroic create a PC or NPC.
  - Vehicle, Base, Computer, Automaton and AI create hero6e's matching actor type, with only that template's characteristics.
- **Items:** "Edit in Hero Workshop" on an item owned by an actor opens that actor's editor with the item's edit form already open.
- **New world items:** the Items sidebar's **Hero Workshop Item** button creates equipment, powers, skills, perks, talents, maneuvers or complications with the same forms. A new equipment or power form starts by choosing **One power** or **Compound** (or **List**, for powers); a compound's form lists its powers, and **Add power** opens the power form for another part.
- **Requires A Roll:** a skill-based Requires A Roll (Skill/PS/KS/SS roll) has a **Skill rolled** picker listing the character's skills by the name hero6e matches on. Choosing a skill also sets the matching roll type (a PS casting skill needs a PS roll); if a limitation's type doesn't suit its skill, the form offers to fix it. PS/KS/SS and Power skills have a **Label** (e.g. Magic Skill Roll) and an optional **Name**; spells stay linked when either changes.
  - The standard roll (plain "Skill roll" / "PS roll") already carries the usual -1 per 10 Active Points penalty; Hero Designer only names the -1 per 5 and -1 per 20 variants.
  - A spellcaster's magic skill should be a **Power** skill (rolled as a Skill roll, -1/2), not a Professional Skill (only a PS roll, -1/4). Changing a skill's type retargets every Requires A Roll bound to it, and the Requires A Roll form offers the conversion when a roll is bound to a Professional Skill.
- **Combat Skill Levels:** CSLs (and Mental CSLs, Penalty Skill Levels, Weapon Master) that apply to chosen attacks have an **Attacks it applies to** checklist of the character's attacks, grouped as lists/frameworks (everything in them), powers, equipment and martial maneuvers, plus a box for anything else (e.g. a standard maneuver like Strike). Each link is a cost-free custom adder named after the attack, which is how hero6e links a CSL to its attacks.
- **Free items (GM-given):** item and power forms have **Free (given by the GM)**. It uses Hero Designer's own Cost Multiplier (`MULTIPLIER="0.0"`), which applies to the Real Cost only, so Active Points, END and roll penalties stay right; items in a free list or compound are free too, and a free item's penalties (e.g. -2 DEX) give no points back. Hero Workshop's totals leave free items out and rows show them tagged Free. Desktop Hero Designer applies multipliers only when the campaign rules allow them: Hero Workshop turns that on in the character's embedded rules, or reminds you to if the file has none. (hero6e ignores the multiplier in its own totals.)
- **Number fields** have - / + steppers (except in the dense race library grid), and levels can go negative for penalties.
- **Icons:** item rows show each item's icon, and every item form has an icon picker (**Use default** clears a custom one). Custom icons are stored in the item's Hero Designer data (a `FOUNDRY_ICON` attribute), so they survive editing, dragging items to and from the Items sidebar, and HDC downloads. An icon changed on a hero6e sheet is recorded straight away. Desktop Hero Designer opens files with the attribute but drops it when it saves.
- **Dropped items:** items dropped onto a character's sheet (from the Items sidebar, a compendium or another character) are written into its Hero Designer data straight away, so the editor doesn't report them as changes made in Foundry. hero6e's own parser builds the item, so it matches an uploaded one.
- **Drag and drop:**
  - Drag a row out of the editor onto the Items sidebar (or one of its folders) to make a world item. Lists and frameworks become a folder holding the parent item and its members, as in hero6e's compendiums.
  - Compound powers (most equipment) stay a single world item, with their parts kept in the item's Hero Designer data. Compounds dragged from a hero6e actor sheet to the sidebar are handled the same way. When one is dropped onto an actor, Hero Workshop adds its parts as child items, which is how hero6e shows compounds.
  - Drag a world, compendium or actor item onto the editor to add it to the character, or onto a list or framework row to put it inside. Edits made on the item's hero6e sheet come along. Rows can also be dragged between two open editors.
  - Copied items get fresh HDC IDs; the rest of the item's Hero Designer data is kept as is.
- **Characteristic maxima:** each character's maxima are derived from its original race or races.
  - A race's maxima are its listed stats +10 (+1 SPD, +2 OCV/DCV/OMCV/DMCV).
  - Mixed races average their races' maxima, rounded up.
  - Levels above a maximum cost double.
  - Choose races from the Characteristics tab's **Choose races** window: a searchable list of the library's races, with a **Race library** button and a field for races not in the library. Each maximum can still be adjusted afterwards. Maxima are stored in the character's own HDC rules, as desktop Hero Designer does.
  - The GM manages the **race library** under Module Settings → Hero Workshop → Manage races, or from the Choose races window. Races can be imported from a creature actor (**Import from actor…** opens a searchable actor list), a creature's `.hdc` (its characteristics) or a Hero Designer rules file (its maxima).
- Macro access:
  ```js
  const api = game.modules.get('hero-workshop').api;
  api.openEditor(actor);
  api.openInspector(actor);
  api.driftReport(actor); // Foundry-side changes not yet in the HDC
  api.createCharacter();
  api.createItem('equipment'); // or power, skill, perk, talent, maneuver, complication
  api.openItemEditor(item);
  api.openRaceLibrary();
  // Items from a whole .hdc/.hdp, compounds kept as single items; optionally into a compendium pack
  await api.createItemsFromXml(xml, { pack: 'my-module.equipment', folder: folderId, icon: (item) => undefined });
  ```

Unlinked token actors are edited through their base actor.
