/**
 * Order placement against Robinhood, and the rules that constrain it.
 *
 * Kept apart from the read path deliberately. Reading a portfolio is
 * idempotent and safe to retry; placing an order spends real money and is not.
 * The separation makes it obvious at a glance which file can move money.
 *
 * ## The agentic-account rule
 *
 * Robinhood only permits an agent to trade in accounts flagged
 * `agentic_allowed`. That is usually a small, ring-fenced account and
 * emphatically *not* the account holding the real book — so a request that
 * names the wrong account is a likely mistake rather than an edge case.
 *
 * Robinhood rejects those server-side. We reject them first, because the check
 * is cheap and the failure mode it prevents — quietly sending an order against
 * the wrong account and relying on a remote party to say no — is the kind you
 * only want to have once.
 */

import { MAX_SELECTED_LOTS, lotSelectionBlocker } from '@inktrade/client';
import type {
  OrderRequest,
  OrderReceipt,
  OrderReview,
  OrderSide,
  OrderStatus,
  OrderType,
} from '@inktrade/client/broker';
import type { TaxLot } from '@inktrade/client';
import { asRecord, num, str } from './shapes.js';

/**
 * Normalize a Robinhood tax lot.
 *
 * Two fields decide whether a lot is usable and both are easy to fumble:
 *
 *   - `is_selectable` is false while a lot is still syncing, typically because
 *     it was acquired today. Offering it produces an order the broker rejects
 *     at submit.
 *   - `cost_per_share` is absent while the basis is pending. Robinhood's own
 *     guidance is to say so rather than treat it as zero — a zero basis would
 *     report the entire proceeds as gain.
 */
export function normalizeTaxLot(raw: Record<string, unknown>): TaxLot | null {
  const id = str(raw, 'open_lot_id');
  const quantity = num(raw, 'quantity_available', 'quantity');
  const openDate = str(raw, 'open_date');
  if (!id || quantity === undefined || !openDate) return null;

  return {
    id,
    quantity,
    costPerShare: num(raw, 'cost_per_share') ?? null,
    openDate: openDate.slice(0, 10),
    term: str(raw, 'term')?.toLowerCase() === 'lt' ? 'LONG' : 'SHORT',
    selectable: raw.is_selectable === true,
    origin: originOf(str(raw, 'open_tran_type')),
  };
}

/**
 * Where a lot came from.
 *
 * Assignment lots are worth distinguishing: they arrive at a basis nobody
 * chose, which is exactly the case specified-lot selling is for.
 */
function originOf(tranType: string | undefined): TaxLot['origin'] {
  const value = tranType?.toLowerCase() ?? '';
  if (value.includes('assign')) return 'ASSIGNMENT';
  if (value.includes('buy')) return 'BUY';
  return 'OTHER';
}

/** Thrown before anything is sent. Never means "the broker refused". */
export class OrderRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrderRejectedError';
  }
}

/** Robinhood's wire spelling for an order type. */
export function toRobinhoodType(type: OrderType): string {
  switch (type) {
    case 'MARKET':
      return 'market';
    case 'LIMIT':
      return 'limit';
    case 'STOP':
      return 'stop_market';
    case 'STOP_LIMIT':
      return 'stop_limit';
  }
}

/**
 * Validate a request and render it as tool arguments.
 *
 * Every rule here is one Robinhood enforces anyway. Checking locally turns a
 * remote rejection — which costs a round trip and arrives as prose — into an
 * immediate, specific error, and keeps a malformed order from ever being sent.
 */
export function buildOrderArgs(request: OrderRequest): Record<string, unknown> {
  const { quantity, notional, type } = request;

  if (!request.accountId) throw new OrderRejectedError('An account is required');
  if (!request.symbol) throw new OrderRejectedError('A symbol is required');

  const hasQuantity = quantity !== undefined;
  const hasNotional = notional !== undefined;

  if (hasQuantity === hasNotional) {
    throw new OrderRejectedError('Specify exactly one of quantity or notional');
  }
  if (hasQuantity && !(quantity! > 0)) {
    throw new OrderRejectedError('Quantity must be greater than zero');
  }
  if (hasNotional && !(notional! > 0)) {
    throw new OrderRejectedError('Notional must be greater than zero');
  }
  // Robinhood computes shares from the last trade price, which it can only do
  // for a market order.
  if (hasNotional && type !== 'MARKET') {
    throw new OrderRejectedError('A dollar-notional order must be a market order');
  }

  const needsLimit = type === 'LIMIT' || type === 'STOP_LIMIT';
  if (needsLimit && !(request.limitPrice! > 0)) {
    throw new OrderRejectedError(`A ${type} order requires a limit price`);
  }

  const needsStop = type === 'STOP' || type === 'STOP_LIMIT';
  if (needsStop && !(request.stopPrice! > 0)) {
    throw new OrderRejectedError(`A ${type} order requires a stop price`);
  }

  const session = request.session ?? 'REGULAR';
  // Only limit orders execute outside regular hours; anything else tagged to
  // another session is rejected rather than queued.
  if (session !== 'REGULAR' && type !== 'LIMIT') {
    throw new OrderRejectedError(
      `Outside regular hours only limit orders execute — ${type} is regular-hours only`,
    );
  }
  if (session !== 'REGULAR' && hasNotional) {
    throw new OrderRejectedError('Dollar-notional orders only place during regular hours');
  }
  if (session !== 'REGULAR' && hasQuantity && !Number.isInteger(quantity)) {
    throw new OrderRejectedError('Fractional orders only place during regular hours');
  }

  return {
    account_number: request.accountId,
    symbol: request.symbol.toUpperCase(),
    side: request.side.toLowerCase(),
    type: toRobinhoodType(type),
    ...(hasQuantity ? { quantity: String(quantity) } : {}),
    ...(hasNotional ? { dollar_amount: notional!.toFixed(2) } : {}),
    ...(request.limitPrice !== undefined ? { limit_price: String(request.limitPrice) } : {}),
    ...(request.stopPrice !== undefined ? { stop_price: String(request.stopPrice) } : {}),
    time_in_force: request.timeInForce === 'GTC' ? 'gtc' : 'gfd',
    market_hours: toMarketHours(session),
    ...(request.clientOrderId ? { ref_id: request.clientOrderId } : {}),
    ...taxLotArgs(request),
  };
}

/**
 * Specified-lot selling, when the caller chose lots.
 *
 * Validated here rather than left to the broker, because a rejection at submit
 * after the user reviewed a realized-gain figure is the worst possible moment
 * to discover the selection was never going to be accepted.
 */
function taxLotArgs(request: OrderRequest): Record<string, unknown> {
  const lots = request.taxLots;
  if (!lots || lots.length === 0) return {};

  const blocker = lotSelectionBlocker({
    side: request.side,
    type: request.type,
    notional: request.notional,
    session: request.session,
    quantity: request.quantity,
  });
  if (blocker) throw new OrderRejectedError(blocker);

  if (lots.length > MAX_SELECTED_LOTS) {
    throw new OrderRejectedError(
      `At most ${MAX_SELECTED_LOTS} lots can be specified on one order; ${lots.length} were chosen.`,
    );
  }

  const total = lots.reduce((sum, lot) => sum + lot.quantity, 0);
  // The broker requires the lot quantities to sum to the order quantity. A
  // mismatch means the selection is stale — shares moved since it was made.
  if (request.quantity !== undefined && Math.abs(total - request.quantity) > 1e-6) {
    throw new OrderRejectedError(
      `Selected lots total ${total} shares but the order is for ${request.quantity}.`,
    );
  }

  return {
    tax_lots: lots.map((lot) => ({
      open_lot_id: lot.lotId,
      quantity: String(lot.quantity),
    })),
  };
}

function toMarketHours(session: NonNullable<OrderRequest['session']>): string {
  switch (session) {
    case 'EXTENDED':
      return 'extended_hours';
    case 'ALL_DAY':
      return 'all_day_hours';
    default:
      return 'regular_hours';
  }
}

export function normalizeReview(payload: unknown): OrderReview {
  const data = asRecord(payload);
  const quote = asRecord(data.quote);

  const warnings = collectWarnings(data);

  return {
    estimatedCost: num(data, 'estimated_cost', 'estimated_total', 'total_cost') ?? null,
    quotePrice:
      num(quote, 'last_trade_price', 'price', 'ask_price') ??
      num(data, 'price', 'last_trade_price') ??
      null,
    warnings,
    // Absent an explicit refusal, an alert is information rather than a block —
    // "you are using margin" should not stop an order the user meant to place.
    acceptable: data.acceptable !== false && data.rejected !== true,
  };
}

function collectWarnings(data: Record<string, unknown>): string[] {
  const raw = data.alerts ?? data.warnings ?? data.pre_trade_alerts;
  if (!Array.isArray(raw)) return [];

  return raw
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      const record = asRecord(entry);
      return str(record, 'message', 'text', 'title', 'reason', 'code');
    })
    .filter((message): message is string => Boolean(message));
}

export function normalizeReceipt(payload: unknown, request: OrderRequest): OrderReceipt {
  const data = asRecord(payload);
  const order = Object.keys(asRecord(data.order)).length > 0 ? asRecord(data.order) : data;

  const id = str(order, 'id', 'order_id', 'ref_id');
  if (!id) {
    // Without an id we cannot cancel or track it, and reporting success would
    // leave a live order the user can't see.
    throw new OrderRejectedError(
      'Robinhood accepted the order but returned no id, so it cannot be tracked',
    );
  }

  return {
    id,
    status: normalizeOrderStatus(str(order, 'state', 'status')),
    symbol: str(order, 'symbol', 'chain_symbol')?.toUpperCase() ?? request.symbol.toUpperCase(),
    side: normalizeOrderSide(str(order, 'side'), request.side),
    quantity: num(order, 'quantity', 'filled_quantity') ?? request.quantity ?? 0,
    ...(str(order, 'ref_id') ? { clientOrderId: str(order, 'ref_id') } : {}),
  };
}

function normalizeOrderSide(value: string | undefined, fallback: OrderSide): OrderSide {
  if (!value) return fallback;
  return value.toLowerCase().startsWith('s') ? 'SELL' : 'BUY';
}

function normalizeOrderStatus(value: string | undefined): OrderStatus {
  switch (value?.toLowerCase()) {
    case 'filled':
      return 'FILLED';
    case 'partially_filled':
    case 'partial':
      return 'PARTIAL';
    case 'cancelled':
    case 'canceled':
      return 'CANCELLED';
    case 'rejected':
    case 'failed':
      return 'REJECTED';
    default:
      return 'OPEN';
  }
}

/** True when Robinhood has flagged this account as agent-tradable. */
export function isAgenticAccount(raw: Record<string, unknown>): boolean {
  return raw.agentic_allowed === true;
}

/**
 * Fail unless the account is one this agent may trade in.
 *
 * `tradable` is the set discovered from get_accounts. Naming the accounts in
 * the message matters: the usual mistake is reaching for the main account,
 * and "not permitted" alone doesn't tell anyone what to do instead.
 */
export function assertTradable(accountId: string, tradable: string[]): void {
  if (tradable.includes(accountId)) return;

  throw new OrderRejectedError(
    tradable.length === 0
      ? `No Robinhood account is enabled for agent trading, so ${accountId} cannot be traded. ` +
        'Enable an Agentic account in the Robinhood app first.'
      : `Account ${accountId} is not enabled for agent trading. Permitted: ${tradable.join(', ')}.`,
  );
}
