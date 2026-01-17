# Hero Workshop

A modern web-based character sheet editor for the HERO System tabletop RPG. This application allows you to create and manage character files (.hdc) stored directly in Google Drive.

## Features

- 🦸 Full HERO System 6th Edition character creation
- ☁️ Google Drive integration for cloud storage
- 📱 Responsive design for desktop and mobile
- 🔐 Secure Google OAuth2 authentication
- 📄 Full .hdc file compatibility with desktop Hero Designer

## Project Structure

This is a TypeScript monorepo with three packages:

```
hero-workshop/
├── packages/
│   ├── shared/      # Shared types and utilities
│   ├── backend/     # Express.js API server
│   └── frontend/    # React + Vite frontend
├── package.json     # Root workspace configuration
└── README.md
```

## Prerequisites

- Node.js 18+ 
- npm 9+
- Google Cloud Project with OAuth2 credentials

## Setup

### 1. Install Dependencies

```bash
cd hero-workshop
npm install
```

### 2. Configure Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Drive API
4. Go to **APIs & Services > Credentials**
5. Click **Create Credentials > OAuth client ID**
6. Select **Web application**
7. Add authorized redirect URI: `http://localhost:3001/api/auth/callback`
8. Copy the Client ID and Client Secret

### 3. Configure Environment Variables

```bash
cd packages/backend
cp .env.example .env
```

Edit `.env` with your credentials:

```env
PORT=3001
NODE_ENV=development
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
SESSION_SECRET=generate-a-random-secret-here
FRONTEND_URL=http://localhost:5173
```

### 4. Build Shared Types

```bash
npm run build:shared
```

### 5. Run Development Servers

```bash
npm run dev
```

This starts both the backend (port 3001) and frontend (port 5173).

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both frontend and backend in development mode |
| `npm run dev:frontend` | Start only the frontend |
| `npm run dev:backend` | Start only the backend |
| `npm run build` | Build all packages for production |
| `npm run lint` | Run ESLint on all packages |
| `npm run format` | Format code with Prettier |
| `npm run typecheck` | Run TypeScript type checking |

## API Endpoints

### Authentication
- `GET /api/auth/login` - Redirect to Google OAuth
- `GET /api/auth/callback` - OAuth callback
- `GET /api/auth/status` - Check authentication status
- `GET /api/auth/user` - Get current user info
- `POST /api/auth/logout` - Logout

### Characters
- `GET /api/characters` - List all .hdc files
- `GET /api/characters/:fileId` - Load a character
- `PUT /api/characters/:fileId` - Save a character
- `POST /api/characters` - Create a new character
- `DELETE /api/characters/:fileId` - Delete a character

### Templates
- `GET /api/templates` - List available templates
- `GET /api/templates/:id` - Get a specific template

## Technology Stack

### Frontend
- React 18
- TypeScript
- Vite
- React Query (TanStack Query)
- React Router

### Backend
- Node.js
- Express
- TypeScript
- Google APIs (Drive, OAuth2)
- fast-xml-parser

### Shared
- TypeScript interfaces for .hdc file format
- Utility functions for point calculations

## .hdc File Format

Hero Designer character files are XML documents containing:
- Character info (name, player, background)
- Characteristics (STR, DEX, CON, etc.)
- Skills, Perks, Talents
- Powers with modifiers and adders
- Complications (disadvantages)
- Equipment
- Rules configuration
- Character images (Base64 encoded)

## Development

### Adding New Features

1. Define types in `packages/shared/src/types.ts`
2. Add API endpoint in `packages/backend/src/routes/`
3. Create React component in `packages/frontend/src/components/`
4. Add hook in `packages/frontend/src/hooks/`

### Parsing .hdc Files

The HDC parser in `packages/backend/src/services/hdcParser.ts` handles conversion between XML and TypeScript objects. It supports:
- Full character data parsing
- Modifier and adder extraction
- Rules configuration
- Base64 image handling

## License

Copyright (c) Byron Long. All rights reserved.

Based on the HERO System, which is a trademark of Hero Games.
