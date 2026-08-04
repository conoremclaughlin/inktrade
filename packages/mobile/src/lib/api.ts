import Constants from 'expo-constants';
import { createApiClient } from '@inktrade/client';
import { describeApiUrlProblem, resolveApiUrl, type ResolvedApiUrl } from './resolveApiUrl';

/** Port the Inktrade web API listens on — see packages/web/package.json. */
const WEB_API_PORT = 6001;

/**
 * In a dev build the phone is already connected to Metro, so expo-constants
 * exposes the dev machine's host (e.g. "192.168.86.60:8081"). The web API runs
 * on that same machine, so reusing the host means the app follows a changing
 * LAN IP with no rebuild and no .env edit.
 *
 * `hostUri` is absent in standalone/TestFlight builds, where the explicit env
 * override or the configured production URL applies instead.
 */
const resolved: ResolvedApiUrl = resolveApiUrl({
  explicit: process.env.EXPO_PUBLIC_API_URL,
  metroHostUri: Constants.expoConfig?.hostUri,
  productionApiUrl: Constants.expoConfig?.extra?.productionApiUrl as string | undefined,
  isDev: __DEV__,
  port: WEB_API_PORT,
});

export const API_BASE_URL = resolved.url;
export const API_URL_SOURCE = resolved.source;

/** Hint explaining a connection failure, or undefined if the setup looks sound. */
export const API_URL_HINT = describeApiUrlProblem(resolved, __DEV__);

export const api = createApiClient({ baseUrl: API_BASE_URL });
