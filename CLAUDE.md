# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Hero Workshop is a TypeScript monorepo for a HERO System 6e character editor. The focus is the Foundry VTT module (`packages/foundry-module`), which edits the Hero Designer `.hdc` data stored on hero6e actors. The original Google Drive web app (`packages/frontend` + `packages/backend`) is deprecated: no new features; keep it building until it is removed.

## Commands

### Development
```bash
npm run dev              # Start frontend (5173) and backend (3001) concurrently
npm run dev:frontend     # Frontend only
npm run dev:backend      # Backend only
```

### Build
```bash
npm run build            # Build all (shared → backend → frontend)
npm run build:shared     # Build shared package only (required after changing shared types)
```

### Code Quality
```bash
npm run lint             # Run ESLint on all packages
npm run lint:fix         # ESLint with auto-fix
npm run format           # Format with Prettier
npm run typecheck        # TypeScript type checking across workspaces
npm test                 # Vitest (shared HDC round-trip/edit tests, foundry-module drift tests)
npm run build:foundry    # Build the Foundry module into packages/foundry-module/dist
```

## Architecture

### Monorepo Structure (npm workspaces)
- **packages/shared** - TypeScript types, HERO System utilities, and the lossless HDC reader/writer (no runtime dependencies)
- **packages/backend** - (deprecated) Express 5 REST API server with Google OAuth2 and Drive integration
- **packages/frontend** - (deprecated) React 19 + Vite 7 SPA with React Router and TanStack Query
- **packages/foundry-module** - Foundry VTT (v14) add-on for the hero6e system that reuses the frontend editor

### Build Dependency Order
Shared must build first as it provides type definitions consumed by both backend and frontend. After modifying shared types, run `npm run build:shared` to update the dist folder.

### Data Flow
1. Frontend makes API calls to `/api/*` endpoints (proxied to backend via Vite in dev)
2. Backend authenticates via Google OAuth2 and stores sessions server-side
3. Backend reads/writes `.hdc` XML files from user's Google Drive
4. Shared types ensure consistency between frontend and backend

### Key Backend Files
- `src/routes/auth.ts` - Google OAuth2 login/callback/logout
- `src/routes/characters.ts` - Character CRUD via Google Drive API (saves patch the current Drive file with `updateHdc`)

### Key Frontend Files
- `src/hooks/useAuth.ts` - Authentication state (React Query)
- `src/hooks/useCharacter.ts` - Character data management (React Query)
- `src/services/api.ts` - HTTP client wrapper
- `src/components/PowersTab.tsx` - Most complex component (power editing)

### Key Shared Exports
- `hdc/` - Lossless HDC handling: `xml.ts` (byte-preserving XML tree), `parse.ts` (HDC → Character), `write.ts` (`updateHdc`/`createHdc`), `foundry.ts` (hero6e compatibility rules + `validateForFoundry`)
- `generated/` - Catalogs generated from `java/.../template/Main6E.hdt` (`npm run generate:catalog -w @hero-workshop/shared`): skills, powers, modifiers, perks, talents, complications. `powerDefinitions.ts`/`modifierDefinitions.ts` merge in any template entries their hand-written definitions lack (hand-written entries win)
- `types.ts` - Character, Power, Skill, Perk, Talent, Disadvantage, Equipment types
- `powerDefinitions.ts` - HERO System 6th Edition power catalog
- `modifierDefinitions.ts` - Power advantages and limitations
- `utils.ts` - Point calculation utilities

### Key Foundry Module Files
- `src/main.ts` - Hooks: sheet header controls, Actors sidebar context menu, `game.modules.get('hero-workshop').api`
- `src/apps/` - Native ApplicationV2 + Handlebars windows (editor, item/power dialogs, inspector, new character, race library); templates in `templates/`
- The module has no React. UI rules (costs, forms, item operations) come from `packages/shared/src/editor/` so the Foundry UI and the web app share them; the module's CSS uses only Foundry theme variables
- `src/sync/drift.ts` - Detects edits made on hero6e's own sheets that aren't in the actor's stored HDC
- `src/sync/worldItems.ts` - World items ↔ HDC fragments (drag and drop, new items); world items are built with hero6e's own `parseItemsFromHeroJsonToItemDataArray`. Shared `hdc/transfer.ts` extracts/inserts items with fresh IDs
- `src/sync/session.ts` - Applies edited HDC through hero6e's `actor.uploadFromXml` (keeps damage, charges, item IDs)

## HDC Writing Rules

The `Character` model is a view model (display names are composed, costs are derived), so HDC is never regenerated from it. `updateHdc(originalXml, editedCharacter)` diffs the edited model against a parse of the same XML and patches only changed attributes/elements; untouched content stays byte-for-byte identical. Consequences:
- Model ids must be the element's HDC `ID` (`HdcDocument.ensureIds` fills gaps deterministically). Editors must preserve ids of existing objects, including modifiers and adders.
- New objects get numeric HDC IDs (hero6e coerces `system.ID` to a number).
- Foundry compatibility rules from `.agents/skills/sheet-to-hdc/references/hdc-format.md` are enforced on touched items only (no top-level `LVLCOST`, no `ISLIMITATION`, Requires A Roll bound via `COMMENTS`, etc.).
- `packages/shared/test/hdc.test.ts` asserts every `.hdc` in `samples/` and the repo root round-trips unchanged.

## Foundry Testing

A portable Foundry (git-ignored) lives in `foundry/`, with the module's `dist/` junction-linked into `foundry/Data/modules/hero-workshop`. The Electron exe doesn't start from an agent shell; run the server headless instead:
```bash
node foundry/App/resources/app/main.js --dataPath="<repo>/foundry" --port=30000 --noupnp
```
World `test-hero-system`, user `Gamemaster`, no passwords.

## .hdc File Format

Hero Designer Character files are UTF-16 encoded XML. Key parsing considerations:
- `decodeHdcBytes` handles UTF-16 LE/BE (with or without BOM) and UTF-8; the backend writes files back in their original encoding
- Character data includes: characteristics, powers, skills, perks, talents, disadvantages, equipment
- Powers have nested modifiers (advantages/limitations) that affect point costs

## Environment Setup

Requires Node.js 24+ and Google OAuth2 credentials. Backend needs these environment variables:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `SESSION_SECRET`

## Tech Stack

- **Frontend**: React 19, Vite 7, React Router 7, TanStack Query 5
- **Backend**: Express 5, googleapis, express-session, fast-xml-parser, zod
- **Shared**: TypeScript 5.8, Vitest
- **Foundry module**: Foundry VTT v14, hero6e system 5.x, Vite library build
- **Tooling**: ESLint 9 (flat config), Prettier, TypeScript strict mode
