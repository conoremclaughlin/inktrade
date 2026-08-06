/**
 * Whether order placement is permitted, and who decided.
 *
 * Inktrade places real orders. That capability needs a switch that cannot be
 * routed around, for two different audiences:
 *
 *   - An operator running a build — a demo, a shared machine, CI — who needs
 *     placement off regardless of what any account setting says.
 *   - A user who wants the analysis without the ability to fat-finger a trade
 *     from it.
 *
 * The env var wins because it is the operator's, and an operator override that
 * a user setting could undo would not be an override.
 *
 * This resolver is pure so the same decision can be made on the server, where
 * it is enforced, and in the UI, where it is explained. The UI copy must never
 * be the only thing standing between a click and an order.
 */

export type TradingMode =
  /** Orders can be placed. */
  | 'ENABLED'
  /** Orders can be reviewed and priced, never submitted. */
  | 'REVIEW_ONLY';

export type TradingModeSource = 'env' | 'setting' | 'default';

export interface TradingModeDecision {
  mode: TradingMode;
  source: TradingModeSource;
  /** Why, in words a user can act on. Undefined when trading is enabled. */
  reason?: string;
}

export interface TradingModeInput {
  /** Raw INKTRADE_REVIEW_ONLY. Any truthy spelling blocks placement. */
  env?: string | null;
  /** The user's own preference, when they have expressed one. */
  setting?: TradingMode | null;
}

/**
 * Values that count as "on" for the env var.
 *
 * Deliberately generous: someone setting INKTRADE_REVIEW_ONLY=true and getting
 * live trading because we only accepted "1" would be a very bad surprise. The
 * failure mode of over-matching is a blocked order; the failure mode of
 * under-matching is an unblocked one.
 */
const TRUTHY = new Set(['1', 'true', 'yes', 'on', 'y', 'enabled']);

export function isReviewOnlyEnv(value: string | null | undefined): boolean {
  return value !== null && value !== undefined && TRUTHY.has(value.trim().toLowerCase());
}

export function resolveTradingMode(input: TradingModeInput = {}): TradingModeDecision {
  if (isReviewOnlyEnv(input.env)) {
    return {
      mode: 'REVIEW_ONLY',
      source: 'env',
      reason:
        'Order placement is disabled for this deployment (INKTRADE_REVIEW_ONLY). Reviews and ' +
        'pricing still work; nothing can be submitted.',
    };
  }

  if (input.setting === 'REVIEW_ONLY') {
    return {
      mode: 'REVIEW_ONLY',
      source: 'setting',
      reason:
        'Review-only mode is on in your settings. Orders are priced and checked but never ' +
        'submitted — turn it off in Settings to place trades.',
    };
  }

  return { mode: 'ENABLED', source: input.setting === 'ENABLED' ? 'setting' : 'default' };
}

/** True when this decision permits placing an order. */
export function canPlaceOrders(decision: TradingModeDecision): boolean {
  return decision.mode === 'ENABLED';
}

/**
 * Whether the user can change the mode themselves.
 *
 * False under an env override — showing a toggle that silently does nothing
 * would be worse than showing none, because it implies control that isn't
 * there.
 */
export function isModeUserControlled(decision: TradingModeDecision): boolean {
  return decision.source !== 'env';
}
