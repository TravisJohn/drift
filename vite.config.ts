/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { artLibraryPlugin } from './tools/artLibraryPlugin.ts';
import { audioLibraryPlugin } from './tools/audioLibraryPlugin.ts';

export default defineConfig({
  plugins: [audioLibraryPlugin(), artLibraryPlugin()],
  server: {
    port: 5173,
  },
  test: {
    // jsdom everywhere: UI tests need it, and pure-logic tests are unaffected.
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    // Building the whole ship (baked light, surface art) takes a few seconds
    // per test; with every file running in parallel on a busy machine that
    // can pass vitest's 5 s default. Those tests pass alone - they are slow,
    // not stuck.
    testTimeout: 15_000,
  },
});
