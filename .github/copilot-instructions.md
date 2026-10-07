# Hero Workshop - Development Instructions

## Project Overview

This is a TypeScript monorepo for Hero Workshop, a HERO System 6e character editor built as a Foundry VTT module for the hero6e system. It edits the Hero Designer `.hdc` data stored on hero6e actors. See `CLAUDE.md` for commands and architecture.

## Architecture

- **Shared** (`packages/shared`): types, catalogs, point costs, the lossless HDC reader/writer (`src/hdc`) and the editor rules (`src/editor`)
- **Foundry module** (`packages/foundry-module`): ApplicationV2 + Handlebars windows and the sync with hero6e actors and items

## Coding Standards

- Use TypeScript strict mode
- Follow ESLint and Prettier configurations
- Put rules (costs, forms, item operations) in `packages/shared/src/editor`; the module only renders them
- Never regenerate HDC from the view model; patch it with `updateHdc`

## File Format

.hdc files are XML documents with this structure:
- `CHARACTER` - Root element with version
- `BASIC_CONFIGURATION` - Points and settings
- `CHARACTER_INFO` - Name, player, background
- `CHARACTERISTICS` - STR, DEX, CON, etc.
- `SKILLS`, `PERKS`, `TALENTS`, `POWERS`, `DISADVANTAGES`
- `IMAGE` - Base64 encoded character image
- `RULES` - Campaign rules configuration
