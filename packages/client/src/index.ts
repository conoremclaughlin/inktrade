export * from './types.js';
export * from './client.js';
export * from './queries.js';
export * from './watchlist-store.js';
export * from './indicators.js';
export * from './analytics.js';
export * from './letf.js';
export * from './macro.js';
export * from './lists.js';
export * from './broker/types.js';
export * from './broker/mock.js';
export * from './tax-lots.js';
export * from './trading-mode.js';
export * from './order-pricing.js';
export * from './broker/advisories.js';

/*
 * React hooks are deliberately NOT exported here.
 *
 * This barrel is imported by server code — Next.js route handlers and the
 * engine — and anything reachable from it must be safe there. Re-exporting a
 * hook pulled `useRef` into every React Server Component that touched the
 * package and 500'd every broker route at once.
 *
 * Hooks live behind `@inktrade/client/hooks`, which only client code imports.
 */
