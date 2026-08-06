import { join } from 'node:path';
import { homedir } from 'node:os';
import {
  RobinhoodBroker,
  RobinhoodConnection,
  createFileCredentialStore,
} from '@inktrade/engine/services';

/** Alongside the Schwab tokens, under the same config directory. */
const CREDENTIALS_PATH = join(homedir(), '.inktrade', 'robinhood-mcp.json');

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

/**
 * A broker bound to the stored link.
 *
 * Returns null when Robinhood has never been linked, so callers can answer
 * "connect your brokerage" rather than surfacing an auth error.
 */
export async function robinhoodBroker(requestUrl: string): Promise<RobinhoodBroker | null> {
  const connection = robinhoodConnection(requestUrl);
  if (!(await connection.isLinked())) return null;
  return new RobinhoodBroker({ client: await connection.connect() });
}
