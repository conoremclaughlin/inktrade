import { createApiClient } from '@inktrade/client';

/**
 * React Native has no page origin, so the API base URL must be absolute and
 * reachable from the device. `localhost` resolves to the phone itself, not the
 * dev machine — use the LAN address shown when the Next dev server starts.
 *
 * Set EXPO_PUBLIC_API_URL in packages/mobile/.env.local. Expo inlines any
 * EXPO_PUBLIC_-prefixed var at build time.
 */
const DEFAULT_DEV_API_URL = 'http://localhost:6001';

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL?.trim() || DEFAULT_DEV_API_URL;

/** True when the base URL points at the device itself, which never works on hardware. */
export const isLoopbackApiUrl = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(API_BASE_URL);

export const api = createApiClient({ baseUrl: API_BASE_URL });
