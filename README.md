# Hero Workshop

A character editor for HERO System 6th Edition, built as a module for [Foundry VTT](https://foundryvtt.com/). It works with the [Hero System 6e (Unofficial) v2](https://github.com/dmdorman/hero6e-foundryvtt) system and edits each character's Hero Designer data (`.hdc`) inside Foundry. Characters stay fully compatible with desktop Hero Designer.

## Install

Requirements: Foundry VTT v14 with the Hero System 6e (Unofficial) v2 system (`hero6efoundryvttv2`, 5.x).

1. In Foundry's setup screen, go to **Add-on Modules → Install Module**.
2. Paste this manifest URL and click **Install**:
   ```
   https://github.com/ByronWLong/hero-workshop/releases/latest/download/module.json
   ```
3. Enable **Hero Workshop** in your world's module settings.

Foundry offers updates when a new release is published.

## What it does

- **Edit characters:** open the editor from an actor sheet's header menu (⋮) or by right-clicking an actor in the Actors sidebar. It covers characteristics, skills, perks, talents, martial arts, powers, complications and equipment, with Hero Designer's costs.
- **Keep Hero Designer data intact:** changes patch the character's stored `.hdc` rather than regenerating it, so anything Hero Workshop doesn't touch stays exactly as Hero Designer wrote it. Damage, used charges and Foundry item IDs are preserved.
- **Pick up changes made in Foundry:** edits made on hero6e's own sheets are detected when the editor opens, and you choose which to keep.
- **Create characters and items:** new characters, vehicles, bases, computers, automatons and AIs from Hero Designer templates, and new world items (equipment, powers, skills and more).
- **Edit items directly:** opening an item in the Items sidebar or a compendium edits it in Hero Workshop (hero6e's sheet stays in the item's right-click menu, and a setting turns this off). Items and characters in a locked compendium open read-only, with just a Close button. Single items open straight into their edit dialog; equipment shows its price and weight.
- **Hero Designer's modifiers:** advantages, limitations and adders are searched by typing, including power-specific ones, the Heroic weapon and armor limitations (Real Weapon, Real Armor, STR Minimum, Required Hands), Fantasy Hero's Spell, and No Normal Defense as a shortcut for AVAD with All Or Nothing.
- **Drag and drop:** move items between the editor, the Items sidebar, compendiums and other characters. Compound equipment stays a single item, and custom icons travel with it. A list or framework (e.g. a Multipower) dropped from a compendium onto a character sheet brings its slots. Drag a power onto a compound (or onto a piece of equipment, which becomes a compound) to copy it in as a part; compound forms take dropped powers too, and their parts drag out as copies.
- **Repair imported files:** when hero6e imports an `.hdc` or `.hdp` (an actor's Upload, or a Hero Designer file uploaded as a compendium), Combat Skill Levels are linked to the attacks they name and other fixes hero6e needs are made, without changing the build. It can be turned off in the module settings.
- **Campaign rules:** characteristic maxima from a character's races (via a GM-managed race library), free GM-given items, Requires A Roll linked to a chosen skill, and Combat Skill Levels linked to the attacks they apply to.

The [module README](packages/foundry-module/README.md) describes each feature in detail and lists the macro API.

## Development

Requires Node.js 24+ and npm 11+.

```bash
npm install
npm run build:shared     # build the shared package first
npm run build:foundry    # build the module into packages/foundry-module/dist
npm test                 # run the shared and module test suites
```

To try a local build, link or copy `packages/foundry-module/dist` to `<Foundry data>/Data/modules/hero-workshop` and enable the module in a world.

| Command | Description |
|---------|-------------|
| `npm run build:shared` | Build the shared package (required after changing shared types) |
| `npm run build:foundry` | Build the Foundry module |
| `npm test` | Run Vitest: HDC round-trip and editing tests, and module tests |
| `npm run typecheck` | Type-check all packages |
| `npm run lint` | Run ESLint |
| `npm run format` | Format with Prettier |

### Project structure

```
hero-workshop/
├── packages/
│   ├── shared/          # HDC reader/writer, catalogs, costs and editor rules
│   └── foundry-module/  # The Foundry VTT module
└── samples/             # Sample .hdc files used by the tests
```

- **`packages/shared`** holds everything that isn't Foundry-specific:
  - the lossless HDC reader and writer (`src/hdc`);
  - catalogs generated from Hero Designer's 6E template;
  - point-cost calculations;
  - the editor rules, such as item forms and costs (`src/editor`).

  The module only renders these rules. The tests check that every sample `.hdc` round-trips byte for byte.
- **`packages/foundry-module`** contains the module's windows (ApplicationV2 + Handlebars, styled with Foundry's theme variables) and its sync with hero6e actors and items.

### Releasing

Push a tag named `module-v<version>` (for example `module-v0.4.0`). The **Release Foundry module** workflow runs the tests and builds the module. It then publishes a GitHub release with `module.json` and `hero-workshop.zip`, which is what the manifest URL points to.

## History

Hero Workshop started as a React web app with an Express backend that edited `.hdc` files in Google Drive. The Foundry module replaced it, and the web app was removed after 0.4.6.

## License

Copyright (c) Byron Long. All rights reserved.

Based on the HERO System, which is a trademark of Hero Games.
