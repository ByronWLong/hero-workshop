/**
 * Hero Workshop's shared package (packages/shared): catalogs, editor operations, costs and the
 * lossless HDC writer the Foundry module uses. Build it first: npm run build:shared.
 * HERO_WORKSHOP_SHARED overrides the path to its dist/index.js.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const path = process.env.HERO_WORKSHOP_SHARED ?? fileURLToPath(new URL('../../../../../packages/shared/dist/index.js', import.meta.url));
if (!existsSync(path)) {
  throw new Error(`Hero Workshop's shared package isn't built (${path}). Run "npm run build:shared" in the repo, or set HERO_WORKSHOP_SHARED.`);
}

export const hw = await import(pathToFileURL(path).href);
