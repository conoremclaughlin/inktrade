/**
 * Credential storage for MCP OAuth.
 *
 * The SDK owns the protocol; it does not own where secrets live. It calls back
 * into an {@link McpCredentialStore} for the pieces that must outlive a single
 * request: the dynamic client registration, the tokens, the PKCE verifier and
 * the discovery state.
 *
 * That persistence matters more than it looks. The authorization redirect and
 * the callback are two separate HTTP requests, so a verifier held in memory on
 * one of them is gone by the time the other arrives.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type {
  OAuthDiscoveryState,
  StoredOAuthClientInformation,
  StoredOAuthTokens,
} from '@modelcontextprotocol/client';

export interface McpCredentialRecord {
  /**
   * Registrations keyed by authorization-server issuer.
   *
   * Keyed rather than singular because a `client_id` registered with one
   * authorization server must never be presented to another — that is the
   * mix-up attack the SDK's issuer context exists to prevent.
   */
  clients?: Record<string, StoredOAuthClientInformation>;
  tokens?: Record<string, StoredOAuthTokens>;
  /** Most recently saved token set, for the transport's per-request read. */
  lastIssuer?: string;
  codeVerifier?: string;
  state?: string;
  discovery?: OAuthDiscoveryState;
}

export interface McpCredentialStore {
  load(): Promise<McpCredentialRecord>;
  /** Merge a patch into the stored record. */
  update(patch: Partial<McpCredentialRecord>): Promise<void>;
  clear(): Promise<void>;
}

export function createMemoryCredentialStore(
  initial: McpCredentialRecord = {},
): McpCredentialStore {
  let record: McpCredentialRecord = { ...initial };
  return {
    async load() {
      return { ...record };
    },
    async update(patch) {
      record = { ...record, ...patch };
    },
    async clear() {
      record = {};
    },
  };
}

/**
 * A JSON file on disk.
 *
 * Written 0600 and replaced atomically, because a half-written credentials
 * file is indistinguishable from a corrupted one and would silently log the
 * user out. This is adequate for the local-first setup Robinhood forces on us;
 * a hosted deployment would want the OS keychain or a managed secret store.
 */
export function createFileCredentialStore(path: string): McpCredentialStore {
  const read = async (): Promise<McpCredentialRecord> => {
    try {
      return JSON.parse(await readFile(path, 'utf8')) as McpCredentialRecord;
    } catch {
      // Missing or unreadable is the same as unlinked, as far as callers care.
      return {};
    }
  };

  const write = async (record: McpCredentialRecord): Promise<void> => {
    await mkdir(dirname(path), { recursive: true });
    const temp = `${path}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(record, null, 2), { mode: 0o600 });
    await rename(temp, path);
  };

  return {
    load: read,
    async update(patch) {
      await write({ ...(await read()), ...patch });
    },
    async clear() {
      await write({});
    },
  };
}
