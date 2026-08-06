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

import type {
  OrderRequest,
  OrderReceipt,
  OrderReview,
  OrderSide,
  OrderStatus,
  OrderType,
} from '@inktrade/client/broker';
import { asRecord, num, str } from './shapes.js';

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
