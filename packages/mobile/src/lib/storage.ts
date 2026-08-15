import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createLocalWatchlistStore,
  type KeyValueStorage,
  type WatchlistStore,
} from '@inktrade/client';

const asyncStorageAdapter: KeyValueStorage = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
};

/**
 * Mobile keeps the watchlist on-device for now.
 *
 * Web persists to /api/watchlist behind Supabase auth; mobile has no auth yet,
 * so it uses the local implementation of the same WatchlistStore interface.
 * When mobile auth lands, swapping this for createServerWatchlistStore(api)
 * is the only change screens should need.
 */
export const watchlistStore: WatchlistStore = createLocalWatchlistStore(asyncStorageAdapter);
