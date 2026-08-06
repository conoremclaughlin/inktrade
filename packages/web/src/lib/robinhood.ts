import { join } from 'node:path';
import { homedir } from 'node:os';
import {
  RobinhoodBroker,
  RobinhoodConnection,
  ToolCache,
  createFileCredentialStore,
} from '@inktrade/engine/services';
import type { Client } from '@modelcontextprotocol/client';

/** Alongside the Schwab tokens, under the same config directory. */
const CREDENTIALS_PATH = join(homedir(), '.inktrade', 'robinhood-mcp.json');

/**
 * The MCP session and response cache, shared across requests.
 *
 * Both are expensive and both are per-process rather than per-request. A cache
 * built inside the request handler is discarded before anything can hit it —
 * which is exactly the bug this replaced: an option chain cost six seconds
 * every single time, despite the underlying cache serving a warm read in 264ms.
 *
 * Held on globalThis because Next's dev server re-evaluates modules on hot
 * reload, and module-level state would be reset on every edit.
 */
interface RobinhoodRuntime {
  cache: ToolCache;
  client?: Promise<Client>;
}

const runtime: RobinhoodRuntime = ((globalThis as Record<string, unknown>).__inktradeRobinhood ??= {
  cache: new ToolCache(),
}) as RobinhoodRuntime;

/**
 * The redirect Robinhood sends the user back to.
 *
 * Derived from the incoming request rather than hardcoded, so it follows the
 * dev port. It must resolve to loopback — Robinhood rejects hosted HTTPS
 * callbacks outright — which {@link RobinhoodConnection} enforces.
 */
export function redirectUriFor(requestUrl: string): string {
  return new URL('/api/auth/robinhood/callback', new URL(requestUrl).origin).toString();
}

export function robinhoodConnection(requestUrl: string): RobinhoodConnection {
  return new RobinhoodConnection({
    store: createFileCredentialStore(CREDENTIALS_PATH),
    redirectUri: redirectUriFor(requestUrl),
  });
}

/** Drop the shared session and cached responses — used when a link changes. */
export function resetRobinhoodRuntime(): void {
  runtime.client = undefined;
  runtime.cache.invalidate();
}

/**
 * A broker bound to the stored link, reusing the process-wide session.
 *
 * Returns null when Robinhood has never been linked, so callers can answer
 * "connect your brokerage" rather than surfacing an auth error.
 */
export async function robinhoodBroker(requestUrl: string): Promise<RobinhoodBroker | null> {
  const connection = robinhoodConnection(requestUrl);
  if (!(await connection.isLinked())) return null;

  // Cached as a promise so concurrent first requests share one handshake
  // rather than racing to open several sessions.
  runtime.client ??= connection.connect().catch((err) => {
    runtime.client = undefined;
    throw err;
  });

  try {
    return new RobinhoodBroker({ client: await runtime.client, cache: runtime.cache });
  } catch (err) {
    // A dead session must not be reused; the next request re-handshakes.
    runtime.client = undefined;
    throw err;
  }
}
