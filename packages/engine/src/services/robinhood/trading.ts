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
import { asRecord, isRecord, nested, num, str } from './shapes.js';

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

/**
 * Read a review response.
 *
 * Shaped against live responses, because the first version of this function was
 * written from the tool description and every field name in it was wrong. What
 * Robinhood actually returns is:
 *
 *   {
 *     symbol, side, type, quantity, limit_price,   // echo of the request
 *     order_checks: {},                            // {} when nothing is wrong
 *     quote_data: { last_trade_price, bid_price, ask_price, previous_close },
 *     market_data_disclosure: "Bid $13.78 × 3100 Q · …"
 *   }
 *
 * Two consequences worth stating plainly:
 *
 *   - **There is no cost figure.** Not under any name. The number a person
 *     reads before committing money has to be computed here, from the quote and
 *     the order — see {@link estimateCost}.
 *   - **`order_checks` is a single object, not a list.** One alert at a time,
 *     with its detail under a sibling key named after the alert.
 */
export function normalizeReview(payload: unknown, request: OrderRequest): OrderReview {
  const data = asRecord(payload);
  const quote = nested(data, 'quote_data');

  const bid = num(quote, 'bid_price') ?? null;
  const ask = num(quote, 'ask_price') ?? null;
  const last = num(quote, 'last_trade_price', 'last_non_reg_trade_price') ?? null;

  const { alertType, details } = readAlert(data);
  const { cost, basis } = estimateCost(request, { bid, ask, last });

  return {
    estimatedCost: cost,
    estimateBasis: basis,
    quotePrice: last,
    bid,
    ask,
    previousClose: num(quote, 'previous_close', 'adjusted_previous_close') ?? null,
    warnings: alertType ? [describeAlert(alertType, details)] : [],
    ...(alertType ? { alertType } : {}),
    ...(str(data, 'market_data_disclosure')
      ? { disclosure: str(data, 'market_data_disclosure') }
      : {}),
    acceptable: !alertType || !BLOCKING_ALERTS.has(alertType),
  };
}

/**
 * Alerts that mean the order cannot go through.
 *
 * Deliberately tiny, and it defaults the other way: an unrecognised alert is
 * surfaced as a warning but left acceptable. Refusing a legitimate order
 * because we didn't recognise a code is worse than letting the broker refuse
 * it at submit — this is a trading product, and the broker is the real gate.
 * A wrongly-blocked trade is a bug the user feels; a wrongly-allowed one costs
 * a round trip and a clear rejection message.
 */
const BLOCKING_ALERTS = new Set(['EQUITY_NOT_ENOUGH_BP']);

/**
 * Pull the alert and its details out of `order_checks`.
 *
 * The detail sits under a key named after the alert — `EQUITY_NOT_ENOUGH_BP`
 * pairs with `equityNotEnoughBpAlertDetails`. Rather than reconstruct that
 * spelling and get it wrong for an alert we've never seen, take whichever other
 * key is present.
 */
function readAlert(data: Record<string, unknown>): {
  alertType?: string;
  details: Record<string, unknown>;
} {
  const checks = nested(data, 'order_checks');
  const alertType = str(checks, 'alertType', 'alert_type');
  if (!alertType) return { details: {} };

  for (const [key, value] of Object.entries(checks)) {
    if (key === 'alertType' || key === 'alert_type') continue;
    if (isRecord(value)) return { alertType, details: value };
  }
  return { alertType, details: {} };
}

/** Readable text for alerts we've seen live. */
const ALERT_TEXT: Record<string, (d: Record<string, unknown>) => string> = {
  EQUITY_NOT_ENOUGH_BP: (d) => {
    const deposit = money(d.depositAmount);
    return deposit
      ? `Not enough buying power — this order needs about ${deposit} deposited first.`
      : 'Not enough buying power for this order.';
  },
  EQUITY_EXTREMELY_UNMARKETABLE_LIMIT_PRICE: (d) => {
    const entered = money(d.enteredPrice);
    const lastTrade = money(d.lastTradePrice);
    return entered && lastTrade
      ? `Your ${entered} limit is far from the last trade at ${lastTrade}, so this is unlikely to fill.`
      : 'Your limit price is far from the market, so this is unlikely to fill.';
  },
};

/**
 * Render an alert as something a person can act on.
 *
 * An unknown alert keeps its raw code and every value in its details. Dropping
 * a warning we can't phrase nicely would hide the one thing the broker went out
 * of its way to say.
 */
function describeAlert(alertType: string, details: Record<string, unknown>): string {
  const known = ALERT_TEXT[alertType];
  if (known) return known(details);

  const parts = Object.entries(details).map(([key, value]) => `${key} ${renderValue(value)}`);
  return parts.length > 0 ? `${alertType} (${parts.join(', ')})` : alertType;
}

function renderValue(value: unknown): string {
  return money(value) ?? (isRecord(value) ? JSON.stringify(value) : String(value));
}

/** Robinhood sends money as `{ amount: "13.79", currency: "USD" }`. */
function money(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const amount = num(value, 'amount');
  if (amount === undefined) return undefined;
  return `$${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * What the order would cost.
 *
 * Robinhood returns no cost, so this is ours to get right — it is the number
 * someone reads immediately before committing real money.
 *
 * A market order is priced at the side of the book it would actually cross:
 * a buy pays the ask, a sell hits the bid. Using the last trade for both would
 * understate every buy and overstate every sell, which is exactly the direction
 * that flatters an order and misleads the person placing it.
 */
function estimateCost(
  request: OrderRequest,
  quote: { bid: number | null; ask: number | null; last: number | null },
): { cost: number | null; basis: OrderReview['estimateBasis'] } {
  // A dollar-notional order is its own answer: the broker derives the shares.
  if (request.notional !== undefined) {
    return { cost: request.notional, basis: 'NOTIONAL' };
  }

  const quantity = request.quantity;
  if (quantity === undefined) return { cost: null, basis: null };

  let price: number | null | undefined;
  let basis: OrderReview['estimateBasis'];

  switch (request.type) {
    case 'LIMIT':
    case 'STOP_LIMIT':
      // The worst price a buy pays and the best a sell takes — the bound the
      // user actually chose.
      price = request.limitPrice;
      basis = 'LIMIT';
      break;
    case 'STOP':
      // A stop-market fills at whatever comes next, which can be worse. The
      // trigger is the only anchor available.
      price = request.stopPrice;
      basis = 'STOP';
      break;
    case 'MARKET':
      price = request.side === 'BUY' ? quote.ask : quote.bid;
      basis = request.side === 'BUY' ? 'ASK' : 'BID';
      if (price === null || price === undefined) {
        price = quote.last;
        basis = 'LAST';
      }
      break;
  }

  if (price === null || price === undefined || !Number.isFinite(price)) {
    return { cost: null, basis: null };
  }
  return { cost: price * quantity, basis };
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
