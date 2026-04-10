# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Hero Workshop is a TypeScript monorepo for a web-based HERO System RPG character sheet editor with Google Drive integration. Characters are stored as `.hdc` XML files in the user's Google Drive.

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
```

## Architecture

### Monorepo Structure (npm workspaces)
- **packages/shared** - TypeScript types and HERO System utilities (no runtime dependencies)
- **packages/backend** - Express 5 REST API server with Google OAuth2 and Drive integration
- **packages/frontend** - React 19 + Vite 7 SPA with React Router and TanStack Query

### Build Dependency Order
Shared must build first as it provides type definitions consumed by both backend and frontend. After modifying shared types, run `npm run build:shared` to update the dist folder.

### Data Flow
1. Frontend makes API calls to `/api/*` endpoints (proxied to backend via Vite in dev)
2. Backend authenticates via Google OAuth2 and stores sessions server-side
3. Backend reads/writes `.hdc` XML files from user's Google Drive
4. Shared types ensure consistency between frontend and backend

### Key Backend Files
- `src/routes/auth.ts` - Google OAuth2 login/callback/logout
- `src/routes/characters.ts` - Character CRUD via Google Drive API
- `src/services/hdcParser.ts` - XML ↔ Character object conversion

### Key Frontend Files
- `src/hooks/useAuth.ts` - Authentication state (React Query)
- `src/hooks/useCharacter.ts` - Character data management (React Query)
- `src/services/api.ts` - HTTP client wrapper
- `src/components/PowersTab.tsx` - Most complex component (power editing)

### Key Shared Exports
- `types.ts` - Character, Power, Skill, Perk, Talent, Disadvantage, Equipment types
- `powerDefinitions.ts` - HERO System 6th Edition power catalog
- `modifierDefinitions.ts` - Power advantages and limitations
- `utils.ts` - Point calculation utilities

## .hdc File Format

Hero Designer Character files are UTF-16 encoded XML. Key parsing considerations:
- Backend uses `fast-xml-parser` with UTF-16 handling
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
- **Shared**: TypeScript 5.8 (types only)
- **Tooling**: ESLint 9 (flat config), Prettier, TypeScript strict mode
