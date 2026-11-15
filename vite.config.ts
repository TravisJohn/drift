/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
  },
  test: {
    // jsdom everywhere: UI tests need it, and pure-logic tests are unaffected.
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
