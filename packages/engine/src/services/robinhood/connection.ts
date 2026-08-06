/**
 * Linking to Robinhood and staying linked.
 *
 * Split from the broker so the provider stays about *reading a portfolio* and
 * this file stays about *being authorized*. The OAuth protocol itself is the
 * SDK's job; what's here is the two-request shape a web app needs — start the
 * flow on one request, finish it on the callback — plus the loopback guard.
 */

import { Client, StreamableHTTPClientTransport, UnauthorizedError } from '@modelcontextprotocol/client';
import { McpOAuthProvider } from '../mcp/provider.js';
import type { McpCredentialStore } from '../mcp/credentials.js';

export const ROBINHOOD_MCP_URL = 'https://agent.robinhood.com/mcp/trading';

const CLIENT_NAME = 'Inktrade';
const CLIENT_VERSION = '0.1.0';

export interface RobinhoodConnectionOptions {
  store: McpCredentialStore;
  /** Where Robinhood sends the user back. Must be loopback — see {@link assertLoopback}. */
  redirectUri: string;
  url?: string;
}

/** True when the URI points at the machine running this code. */
export function isLoopbackRedirect(redirectUri: string): boolean {
  try {
    const { hostname } = new URL(redirectUri);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    return false;
  }
}

/**
 * Robinhood's authorization server honours only the loopback redirect special
 * case that exists for native and desktop apps, and rejects hosted HTTPS
 * callbacks outright.
 *
 * This is a hard architectural limit, not a configuration detail: a deployed
 * Inktrade can never link a Robinhood account, no matter how it is set up.
 * Failing here with the reason beats sending someone to a consent screen that
 * dead-ends after they press Allow.
 */
export function assertLoopback(redirectUri: string): void {
  if (isLoopbackRedirect(redirectUri)) return;
  throw new Error(
    `Robinhood only accepts loopback redirect URIs, and ${redirectUri} is not one. ` +
      'Linking a brokerage has to happen against a locally-running Inktrade.',
  );
}

export class RobinhoodConnection {
  private readonly url: URL;
  private readonly provider: McpOAuthProvider;

  constructor(options: RobinhoodConnectionOptions) {
    assertLoopback(options.redirectUri);
    this.url = new URL(options.url ?? ROBINHOOD_MCP_URL);
    this.provider = new McpOAuthProvider({
      store: options.store,
      redirectUrl: options.redirectUri,
      clientName: CLIENT_NAME,
    });
  }

  /**
   * Step one: where to send the user.
   *
   * Connecting is how the flow is started — the SDK runs discovery and
   * registration, decides authorization is needed, hands us the URL through
   * the provider, and then throws. The throw is the success path here.
   */
  async beginLink(): Promise<string> {
    const transport = this.createTransport();
    try {
      await new Client({ name: CLIENT_NAME, version: CLIENT_VERSION }).connect(transport);
    } catch (error) {
      if (!(error instanceof UnauthorizedError)) throw error;
    }

    const url = this.provider.authorizationUrl;
    if (!url) {
      throw new Error('Robinhood did not ask for authorization — the stored link may already work.');
    }
    return url.toString();
  }

  /**
   * Step two: finish the exchange from the callback's query parameters.
   *
   * The `state` check is ours to make: it ties this callback to the redirect we
   * issued, and without it a forged callback could plant an attacker's
   * authorization code in the user's session.
   */
  async completeLink(callbackParams: URLSearchParams): Promise<void> {
    const expected = await this.provider.lastState();
    const received = callbackParams.get('state');
    if (!expected || received !== expected) {
      throw new Error('Authorization state did not match — start the link again.');
    }

    await this.createTransport().finishAuth(callbackParams);
  }

  /**
   * A connected client. Throws {@link UnauthorizedError} when there is no
   * usable link, which callers should surface as "connect Robinhood" rather
   * than as an error.
   */
  async connect(): Promise<Client> {
    const client = new Client({ name: CLIENT_NAME, version: CLIENT_VERSION });
    await client.connect(this.createTransport());
    return client;
  }

  async isLinked(): Promise<boolean> {
    return (await this.provider.tokens()) !== undefined;
  }

  async unlink(): Promise<void> {
    await this.provider.invalidateCredentials('all');
  }

  private createTransport(): StreamableHTTPClientTransport {
    return new StreamableHTTPClientTransport(this.url, { authProvider: this.provider });
  }
}
