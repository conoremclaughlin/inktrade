/**
 * Cost-basis strategy — choosing which tax lots a sale consumes.
 *
 * Brokers default to FIFO, which sells the oldest shares first. That is rarely
 * what anyone wants and nobody is asked: a long-held low-basis lot gets closed
 * for a large gain while a recent underwater lot sits there. Specified-lot
 * selling fixes it, but only if something picks the lots deliberately.
 *
 * Everything here is pure. Given lots, a quantity and a strategy it returns the
 * selection and what it would realize, so the number can be shown before the
 * order is placed rather than discovered on a 1099.
 *
 * Nothing here is tax advice. It reports what a selection realizes; whether
 * that is wise is not a question this module answers.
 */

export type CostBasisStrategy =
  /** Oldest first. The broker default, offered so choosing it is deliberate. */
  | 'FIFO'
  /** Newest first. */
  | 'LIFO'
  /** Highest cost first — realizes the largest loss or smallest gain. */
  | 'HIGHEST_COST'
  /** Lowest cost first — realizes the largest gain, e.g. to use up a carryforward. */
  | 'LOWEST_COST'
  /** Long-term lots first, for the lower rate; highest cost breaks ties. */
  | 'LONG_TERM_FIRST';

export const COST_BASIS_STRATEGIES: readonly CostBasisStrategy[] = [
  'HIGHEST_COST',
  'LIFO',
  'LONG_TERM_FIRST',
  'LOWEST_COST',
  'FIFO',
];

export const COST_BASIS_LABELS: Record<CostBasisStrategy, string> = {
  HIGHEST_COST: 'Highest cost (tax-loss harvesting)',
  LIFO: 'Newest first (LIFO)',
  LONG_TERM_FIRST: 'Long-term first',
  LOWEST_COST: 'Lowest cost',
  FIFO: 'Oldest first (FIFO)',
};

/** How a lot came to exist. Assignment lots are worth calling out. */
export type LotOrigin = 'BUY' | 'ASSIGNMENT' | 'OTHER';

export interface TaxLot {
  id: string;
  /** Shares still available to sell from this lot. */
  quantity: number;
  /** Null when the broker has not settled the basis yet. Never treat as zero. */
  costPerShare: number | null;
  /** ISO date the lot was opened. */
  openDate: string;
  term: 'SHORT' | 'LONG';
  /**
   * False when the broker won't accept this lot for a specified-lot sale —
   * typically because it was acquired today and is still syncing.
   */
  selectable: boolean;
  origin: LotOrigin;
}

export interface SelectedLot {
  lotId: string;
  quantity: number;
  costPerShare: number | null;
  term: 'SHORT' | 'LONG';
  origin: LotOrigin;
  /** Null when the lot's basis is still pending. */
  realizedGain: number | null;
}

export interface LotSelection {
  lots: SelectedLot[];
  /**
   * Total realized gain, or null when any chosen lot has a pending basis —
   * a partial total presented as complete would be worse than none.
   */
  realizedGain: number | null;
  shortTermGain: number | null;
  longTermGain: number | null;
  /**
   * Shares the strategy could not cover from selectable lots.
   *
   * Non-zero means the order cannot be placed as specified. Callers must
   * surface it: falling back to FIFO silently is the exact failure this
   * module exists to prevent.
   */
  shortfall: number;
  /** Why lots were unavailable, when some were. */
  unselectableQuantity: number;
}

/** Robinhood accepts at most 30 lots on one order. */
export const MAX_SELECTED_LOTS = 30;

/**
 * Choose lots to satisfy `quantity`, in the strategy's preferred order.
 *
 * Only selectable lots are considered. Lots with a pending basis are still
 * eligible to sell — the broker allows it — but they make the realized total
 * unknowable, which is reported rather than guessed.
 */
export function selectLots(
  lots: TaxLot[],
  quantity: number,
  strategy: CostBasisStrategy,
  salePrice: number,
): LotSelection {
  const selectable = lots.filter((lot) => lot.selectable && lot.quantity > 0);
  const unselectableQuantity = lots
    .filter((lot) => !lot.selectable)
    .reduce((sum, lot) => sum + lot.quantity, 0);

  const ordered = [...selectable].sort(comparatorFor(strategy));

  const chosen: SelectedLot[] = [];
  let remaining = quantity;

  for (const lot of ordered) {
    if (remaining <= 0 || chosen.length >= MAX_SELECTED_LOTS) break;

    const take = Math.min(lot.quantity, remaining);
    remaining -= take;

    chosen.push({
      lotId: lot.id,
      quantity: take,
      costPerShare: lot.costPerShare,
      term: lot.term,
      origin: lot.origin,
      realizedGain:
        lot.costPerShare === null ? null : (salePrice - lot.costPerShare) * take,
    });
  }

  return {
    lots: chosen,
    ...totals(chosen),
    // Rounded because share quantities are fractional and float subtraction
    // leaves dust that would read as an unfillable remainder.
    shortfall: Math.max(0, round(remaining)),
    unselectableQuantity,
  };
}

function totals(chosen: SelectedLot[]) {
  const anyPending = chosen.some((lot) => lot.realizedGain === null);
  if (anyPending) return { realizedGain: null, shortTermGain: null, longTermGain: null };

  const sum = (term: 'SHORT' | 'LONG') =>
    chosen
      .filter((lot) => lot.term === term)
      .reduce((total, lot) => total + (lot.realizedGain ?? 0), 0);

  const shortTermGain = sum('SHORT');
  const longTermGain = sum('LONG');

  return { realizedGain: shortTermGain + longTermGain, shortTermGain, longTermGain };
}

/**
 * Ordering for each strategy.
 *
 * Lots with a pending basis sort last within cost-ordered strategies: with no
 * cost there is no way to know whether they belong at the front, and putting
 * them there would silently defeat the strategy the user chose.
 */
function comparatorFor(strategy: CostBasisStrategy): (a: TaxLot, b: TaxLot) => number {
  switch (strategy) {
    case 'FIFO':
      return (a, b) => a.openDate.localeCompare(b.openDate);
    case 'LIFO':
      return (a, b) => b.openDate.localeCompare(a.openDate);
    case 'HIGHEST_COST':
      return byCost((a, b) => b - a);
    case 'LOWEST_COST':
      return byCost((a, b) => a - b);
    case 'LONG_TERM_FIRST':
      return (a, b) => {
        if (a.term !== b.term) return a.term === 'LONG' ? -1 : 1;
        return byCost((x, y) => y - x)(a, b);
      };
  }
}

function byCost(compare: (a: number, b: number) => number) {
  return (a: TaxLot, b: TaxLot): number => {
    if (a.costPerShare === null && b.costPerShare === null) return 0;
    if (a.costPerShare === null) return 1;
    if (b.costPerShare === null) return -1;
    const result = compare(a.costPerShare, b.costPerShare);
    // Deterministic order for equal costs, so a selection is reproducible.
    return result !== 0 ? result : a.openDate.localeCompare(b.openDate);
  };
}

/**
 * Unrealized gain per lot at the current price.
 *
 * Used to show which lots are underwater before choosing — the assignment lot
 * that nobody picked is usually the one worth closing.
 */
export function unrealizedGain(lot: TaxLot, price: number): number | null {
  return lot.costPerShare === null ? null : (price - lot.costPerShare) * lot.quantity;
}

/** Total shares available for a specified-lot sale. */
export function selectableQuantity(lots: TaxLot[]): number {
  return round(lots.filter((lot) => lot.selectable).reduce((sum, lot) => sum + lot.quantity, 0));
}

/**
 * Why a specified-lot sale isn't possible, or undefined when it is.
 *
 * Robinhood rejects tax_lots alongside several order shapes, and it rejects
 * them at submit — so the reason belongs in front of the user while they are
 * still choosing, not in an error afterwards.
 */
export function lotSelectionBlocker(order: {
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT';
  notional?: number;
  session?: 'REGULAR' | 'EXTENDED' | 'ALL_DAY';
  quantity?: number;
}): string | undefined {
  if (order.side !== 'SELL') return 'Lot selection applies to sells only.';
  if (order.notional !== undefined) {
    return 'Lot selection is not available on dollar-amount orders — enter a share quantity instead.';
  }
  if (order.type === 'STOP' || order.type === 'STOP_LIMIT') {
    return 'Lot selection is not available on stop orders.';
  }
  if (order.session === 'ALL_DAY') {
    return 'Lot selection is not available in the overnight session.';
  }
  if (
    order.type === 'LIMIT' &&
    order.quantity !== undefined &&
    !Number.isInteger(order.quantity)
  ) {
    return 'Lot selection is not available on fractional limit orders.';
  }
  return undefined;
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
