# Hero Workshop - Development Instructions

## Project Overview

This is a TypeScript monorepo for Hero Workshop, a web-based character sheet editor for the HERO System RPG with Google Drive integration.

## Architecture

- **Frontend**: React + Vite + TypeScript + React Query
- **Backend**: Node.js + Express + TypeScript + Google APIs
- **Shared**: Common TypeScript types and utilities

## Key Files

### Shared Package
- `packages/shared/src/types.ts` - All type definitions for Character, Powers, Skills, etc.
- `packages/shared/src/utils.ts` - Point calculation utilities

### Backend Package
- `packages/backend/src/index.ts` - Express server entry point
- `packages/backend/src/routes/auth.ts` - Google OAuth2 authentication
- `packages/backend/src/routes/characters.ts` - Character CRUD operations
- `packages/backend/src/services/hdcParser.ts` - XML parsing/serialization

### Frontend Package
- `packages/frontend/src/App.tsx` - Main app with routing
- `packages/frontend/src/hooks/useCharacter.ts` - Character data hooks
- `packages/frontend/src/components/` - React components

## Coding Standards

- Use TypeScript strict mode
- Follow ESLint and Prettier configurations
- Use React Query for data fetching
- Keep components small and focused
- Use custom hooks for reusable logic

## File Format

.hdc files are XML documents with this structure:
- `CHARACTER` - Root element with version
- `BASIC_CONFIGURATION` - Points and settings
- `CHARACTER_INFO` - Name, player, background
- `CHARACTERISTICS` - STR, DEX, CON, etc.
- `SKILLS`, `PERKS`, `TALENTS`, `POWERS`, `DISADVANTAGES`
- `IMAGE` - Base64 encoded character image
- `RULES` - Campaign rules configuration
