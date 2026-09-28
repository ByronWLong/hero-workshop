/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

/** dist/ is the installable module folder: copy the manifest and translations next to the bundle */
function foundryManifest(): Plugin {
  return {
    name: 'foundry-manifest',
    writeBundle() {
      const dist = resolve(__dirname, 'dist');
      mkdirSync(resolve(dist, 'lang'), { recursive: true });
      copyFileSync(resolve(__dirname, 'module.json'), resolve(dist, 'module.json'));
      copyFileSync(resolve(__dirname, 'lang/en.json'), resolve(dist, 'lang/en.json'));
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), foundryManifest()],
  resolve: {
    alias: {
      '@hero-workshop/shared': resolve(__dirname, '../shared/src/index.ts'),
      '@frontend': resolve(__dirname, '../frontend/src'),
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode === 'development' ? 'development' : 'production'),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    minify: mode !== 'development',
    lib: {
      entry: resolve(__dirname, 'src/main.ts'),
      formats: ['es'],
      fileName: () => 'hero-workshop.js',
      cssFileName: 'hero-workshop',
    },
  },
  test: {
    environment: 'node',
  },
}));
