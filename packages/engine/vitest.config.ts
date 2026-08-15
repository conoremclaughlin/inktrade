import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Live tests hit a real brokerage with real credentials, so they are never
    // part of the default run — see vitest.live.config.ts.
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.live.test.ts'],
  },
});
