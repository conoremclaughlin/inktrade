/**
 * An OAuthClientProvider for a server-side, local-first MCP client.
 *
 * The SDK drives the whole OAuth 2.1 flow — RFC 9728 discovery, dynamic client
 * registration, PKCE, RFC 9207 issuer validation — and calls into this class
 * for storage and for the one thing it cannot do on a server: send the user to
 * the authorization page.
 *
 * `redirectToAuthorization` therefore *captures* the URL instead of navigating.
 * The HTTP route that started the flow reads it back and answers the browser
 * with a redirect, which is how a server-side client participates in a flow
 * designed around a user agent.
 */

import type {
  OAuthClientMetadata,
  OAuthClientProvider,
  OAuthDiscoveryState,
  StoredOAuthClientInformation,
  StoredOAuthTokens,
} from '@modelcontextprotocol/client';
import { randomBytes } from 'node:crypto';
import type { McpCredentialStore } from './credentials.js';

export interface McpOAuthProviderOptions {
  store: McpCredentialStore;
  /** Where the authorization server sends the user back. */
  redirectUrl: string;
  clientName: string;
  /** Public homepage for the client, shown on some consent screens. */
  clientUri?: string;
  scope?: string;
}

export class McpOAuthProvider implements OAuthClientProvider {
  private readonly options: McpOAuthProviderOptions;
  private capturedAuthorizationUrl: URL | null = null;

  constructor(options: McpOAuthProviderOptions) {
    this.options = options;
  }

  get redirectUrl(): string {
    return this.options.redirectUrl;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: this.options.clientName,
      redirect_uris: [this.options.redirectUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      // No client secret: a local-first client cannot keep one, and PKCE is
      // what actually protects the exchange.
      token_endpoint_auth_method: 'none',
      ...(this.options.clientUri ? { client_uri: this.options.clientUri } : {}),
      ...(this.options.scope ? { scope: this.options.scope } : {}),
    };
  }

  /**
   * The URL the user must visit, available after the SDK has decided that
   * authorization is needed. Null before that point.
   */
  get authorizationUrl(): URL | null {
    return this.capturedAuthorizationUrl;
  }

  redirectToAuthorization(authorizationUrl: URL): void {
    this.capturedAuthorizationUrl = authorizationUrl;
  }

  async state(): Promise<string> {
    const state = base64Url(randomBytes(16));
    await this.options.store.update({ state });
    return state;
  }

  /** The state most recently issued, for the callback to compare against. */
  async lastState(): Promise<string | undefined> {
    return (await this.options.store.load()).state;
  }

  async clientInformation(ctx?: { issuer?: string }): Promise<StoredOAuthClientInformation | undefined> {
    const { clients } = await this.options.store.load();
    if (!clients) return undefined;
    if (ctx?.issuer) return clients[ctx.issuer];
    // No issuer context means "whatever you have" — only safe when there is
    // exactly one registration to be unambiguous about.
    const entries = Object.values(clients);
    return entries.length === 1 ? entries[0] : undefined;
  }

  async saveClientInformation(
    clientInformation: StoredOAuthClientInformation,
    ctx?: { issuer?: string },
  ): Promise<void> {
    const issuer = ctx?.issuer ?? clientInformation.issuer;
    if (!issuer) throw new Error('Cannot store a client registration without an issuer');
    const record = await this.options.store.load();
    await this.options.store.update({
      clients: { ...record.clients, [issuer]: clientInformation },
    });
  }

  async tokens(ctx?: { issuer?: string }): Promise<StoredOAuthTokens | undefined> {
    const record = await this.options.store.load();
    if (!record.tokens) return undefined;
    // Per the SDK contract, a call with no context is the transport asking for
    // the current bearer token and must return the most recent set.
    const issuer = ctx?.issuer ?? record.lastIssuer;
    return issuer ? record.tokens[issuer] : undefined;
  }

  async saveTokens(tokens: StoredOAuthTokens, ctx?: { issuer?: string }): Promise<void> {
    const issuer = ctx?.issuer ?? tokens.issuer;
    if (!issuer) throw new Error('Cannot store tokens without an issuer');
    const record = await this.options.store.load();
    await this.options.store.update({
      tokens: { ...record.tokens, [issuer]: tokens },
      lastIssuer: issuer,
    });
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    await this.options.store.update({ codeVerifier });
  }

  async codeVerifier(): Promise<string> {
    const { codeVerifier } = await this.options.store.load();
    if (!codeVerifier) {
      throw new Error(
        'No PKCE code verifier is stored — start the link again rather than completing this one.',
      );
    }
    return codeVerifier;
  }

  async saveDiscoveryState(discovery: OAuthDiscoveryState): Promise<void> {
    await this.options.store.update({ discovery });
  }

  async discoveryState(): Promise<OAuthDiscoveryState | undefined> {
    return (await this.options.store.load()).discovery;
  }

  /**
   * Drop credentials the server has told us are dead, so the next attempt
   * re-links instead of retrying with something known to be invalid.
   */
  async invalidateCredentials(
    scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery',
  ): Promise<void> {
    if (scope === 'all') {
      await this.options.store.clear();
      return;
    }
    const patch: Record<string, undefined> = {
      client: { clients: undefined },
      tokens: { tokens: undefined, lastIssuer: undefined },
      verifier: { codeVerifier: undefined },
      discovery: { discovery: undefined },
    }[scope] as Record<string, undefined>;
    await this.options.store.update(patch);
  }
}

function base64Url(buf: Buffer): string {
  return buf.toString('base64url');
}
