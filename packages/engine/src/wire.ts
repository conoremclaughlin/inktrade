import type { WireOptionContract } from '@inktrade/client';
import type { OptionContract } from './types/market.js';

/**
 * Give a wire contract its Date back so the maths can take it.
 *
 * The conversion lives here rather than in @inktrade/client because the arrow
 * points this way: engine already imports the client's wire types, and having
 * the client import the engine's would close a cycle.
 *
 * One place, so a screen can't get it subtly wrong on its own — and so that
 * every leverage and probability call is typed against a real Date rather
 * than a string that happens to survive `new Date()`.
 */
export function reviveContract(wire: WireOptionContract): OptionContract {
  return { ...wire, expiration: new Date(wire.expiration) };
}
