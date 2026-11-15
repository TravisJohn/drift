/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { audioLibraryPlugin } from './tools/audioLibraryPlugin.ts';

export default defineConfig({
  plugins: [audioLibraryPlugin()],
  server: {
    port: 5173,
  },
  test: {
    // jsdom everywhere: UI tests need it, and pure-logic tests are unaffected.
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
