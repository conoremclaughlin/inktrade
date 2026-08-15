import { defineConfig } from 'vitest/config';

/**
 * The live suite. Talks to a real brokerage over the network using the
 * credentials stored on this machine, so it is opt-in twice over: it only runs
 * from this config, and each test additionally checks an environment flag.
 */
export default defineConfig({
  test: {
    include: ['**/*.live.test.ts'],
    // Real network calls, and the read path fans out across accounts.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Sequential: these share one brokerage session, and an order test must
    // not race a portfolio read.
    fileParallelism: false,
  },
});
