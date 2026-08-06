import { createApiClient } from '@inktrade/client';

/**
 * The shared API client, pointed at our own origin.
 *
 * Web passes an empty base URL so requests stay relative; mobile passes an
 * absolute LAN address because a device has no origin to be relative to. That
 * is the only difference between the two platforms' data layers.
 */
export const brokerApi = createApiClient({ baseUrl: '' });
