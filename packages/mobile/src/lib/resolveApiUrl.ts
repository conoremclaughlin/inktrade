/**
 * API base URL resolution, kept pure so it can be tested without Expo or a
 * React Native runtime. The wiring to expo-constants lives in ./api.ts.
 */

export type ApiUrlSource =
  /** EXPO_PUBLIC_API_URL was set explicitly. */
  | 'env'
  /** Derived from the Metro host serving the bundle. */
  | 'metro'
  /** Production URL configured in app.json under extra.productionApiUrl. */
  | 'config'
  /** Nothing else applied — loopback, which only works in a simulator. */
  | 'fallback';

export interface ResolveApiUrlInput {
  /** Raw EXPO_PUBLIC_API_URL, inlined at build time. */
  explicit?: string;
  /** Constants.expoConfig?.hostUri — e.g. "192.168.86.60:8081". */
  metroHostUri?: string;
  /** Production API URL from app config, used only when nothing else applies. */
  productionApiUrl?: string;
  /** React Native's __DEV__ — false in release builds. */
  isDev: boolean;
  /** Port the Inktrade web API listens on. */
  port: number;
}

export interface ResolvedApiUrl {
  url: string;
  source: ApiUrlSource;
}

/** Strip any port/path from a Metro host URI, leaving just the hostname. */
function hostnameFrom(hostUri: string | undefined): string | undefined {
  const host = hostUri?.split('/')[0]?.split(':')[0]?.trim();
  return host || undefined;
}

/**
 * Resolve the API base URL. Precedence:
 *
 *   1. EXPO_PUBLIC_API_URL — an explicit override always wins, so pointing a
 *      build at a remote API is a one-line change.
 *   2. Metro's host — in a dev build the phone is already talking to the dev
 *      machine, and the API is on that same machine at `port`. This makes the
 *      app follow a changing LAN IP with no rebuild and no .env edit.
 *   3. extra.productionApiUrl — release builds have no Metro host, so this is
 *      the sensible default once dev autodiscovery is out of the picture.
 *   4. Loopback — last resort. Correct for the iOS simulator, useless on a
 *      physical device, which is why callers surface `source` in errors.
 *
 * Metro is checked before the production URL rather than after, so a dev build
 * keeps autodiscovering even when a production URL is configured.
 */
export function resolveApiUrl(input: ResolveApiUrlInput): ResolvedApiUrl {
  const explicit = input.explicit?.trim();
  if (explicit) return { url: stripTrailingSlash(explicit), source: 'env' };

  const host = hostnameFrom(input.metroHostUri);
  if (host) return { url: `http://${host}:${input.port}`, source: 'metro' };

  const production = input.productionApiUrl?.trim();
  if (production) return { url: stripTrailingSlash(production), source: 'config' };

  return { url: `http://127.0.0.1:${input.port}`, source: 'fallback' };
}

function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

/** True when the URL points at the device itself — never right on hardware. */
export function isLoopback(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(url);
}

/**
 * Human-readable explanation of why a request to `url` might have failed,
 * given how the URL was chosen. Generic "network error" text sends people
 * hunting in the wrong place.
 */
export function describeApiUrlProblem(
  resolved: ResolvedApiUrl,
  isDev: boolean,
): string | undefined {
  if (resolved.source === 'fallback' && !isDev) {
    return 'No production API URL is configured. Set extra.productionApiUrl in app.json, or EXPO_PUBLIC_API_URL for this build.';
  }
  if (isLoopback(resolved.url)) {
    return 'On a physical device localhost is the phone itself. Start Metro so the host can be detected, or set EXPO_PUBLIC_API_URL to your machine’s LAN address.';
  }
  if (resolved.source === 'metro') {
    return 'Auto-detected from the Metro host. Check the web dev server is running and on the same network.';
  }
  return undefined;
}
