import { createMockBroker, type BrokerProvider } from '@inktrade/client';

/**
 * The brokerage the app reads from.
 *
 * Mock for now — Schwab credentials and our auth endpoints aren't live yet.
 * Because the mock implements the real BrokerProvider contract, switching to
 * Schwab means changing this one binding and nothing in any screen.
 *
 * Screens should check `broker.isMock` before presenting figures as real.
 */
export const broker: BrokerProvider = createMockBroker({
  // A little latency so loading states are exercised during development
  // rather than only appearing in production.
  latencyMs: 220,
});
