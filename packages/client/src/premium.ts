import type { OptionChain, OptionContract } from './broker/types.js';
import { earningsBeforeExpiration, type EarningsDate } from './earnings.js';

/**
 * What a put credit spread actually pays, per dollar of collateral.
 *
 * The question this answers is "if I put $500 at risk, how much cash do I
 * collect?" — which is comparable across a $356 stock and an $87 one, where
 * neither the premium nor the strike width is.
 *
 * Deliberately built on the *broker* chain rather than the modelled grid. The
 * number that decides this is the bid/ask, and a mid-price screen is a screen
 * for illiquidity: measured on live 39-day spreads, CEG showed the second
 * fattest credit on the board at the midpoint and the thinnest after crossing
 * the book, because only 41% of its mid credit survives the spread. Anything
 * priced off marks alone would have ranked it a find.
 */

/** Capital at risk the credit is quoted against, so widths compare. */
export const DEFAULT_RISK_BUDGET = 500;

export interface PutCreditSpread {
  underlying: string;
  expiration: string;
  shortStrike: number;
  longStrike: number;
  /** Actual width, which may not be the width asked for — strike ladders vary. */
  width: number;

  /** Credit at the midpoint. Optimistic: nobody crosses at the mid on both legs. */
  creditMid: number;
  /**
   * Credit selling the short at its bid and buying the long at its ask.
   * Pessimistic, and the honest bound — a real fill lands between the two.
   */
  creditReal: number | null;
  /** creditReal / creditMid. How much of the quoted premium survives the book. */
  retention: number | null;

  /** Cash collected per DEFAULT_RISK_BUDGET of collateral, at the mid. */
  creditPerRiskMid: number;
  /** The same, crossing the book. The number to rank on. */
  creditPerRiskReal: number | null;

  /** Price at expiry below which the trade starts losing. */
  breakeven: number;
  /** How far the underlying can fall before that, as a percent of spot. */
  cushionPercent: number | null;
  /** Win rate needed just to break even: 1 − credit/width. */
  breakevenWinRate: number;

  shortDelta: number | null;
  /** Thin open interest is why a book is wide; carried so the rank can explain itself. */
  shortOpenInterest: number | null;
  longOpenInterest: number | null;

  /**
   * A report the spread has to survive, when one falls on or before expiry.
   *
   * Not folded into the ranking. An earnings spread pays more precisely
   * because it is more dangerous, so demoting it would hide the trade rather
   * than describe it — but a fat credit and a report inside the window are the
   * same fact seen twice, and the table has to say so.
   *
   * Null means no report between here and expiry *or* no date known. The
   * screener distinguishes those in `skipped`; a row alone cannot.
   */
  earnings: SpreadEarnings | null;
}

export interface SpreadEarnings {
  /** Market calendar day, YYYY-MM-DD. */
  date: string;
  isEstimate: boolean;
}

export interface SpreadSearchOptions {
  /** Preferred distance between strikes. The ladder decides what's possible. */
  targetWidth?: number;
  riskBudget?: number;
  /**
   * Where to put the short leg, as a percentage move from spot. 0 is at the
   * money; -10 sells a strike 10% below, for more cushion and less credit.
   */
  offsetPercent?: number;
  /** A known report for this underlying, so the row can flag one inside the window. */
  earnings?: EarningsDate | null;
  /** Market calendar day the earnings date is measured against, YYYY-MM-DD. */
  asOf?: string;
}

/** Puts only, quotable, sorted ascending by strike. */
function quotablePuts(chain: OptionChain): OptionContract[] {
  return chain.contracts
    .filter((c) => c.putCall === 'PUT' && c.mark !== null && c.mark > 0)
    .sort((a, b) => a.strike - b.strike);
}

/**
 * Build the spread a seller would actually put on.
 *
 * Returns null rather than a degenerate row when the chain can't support one —
 * no quotable puts, no strike below the short leg, or a credit that exceeds the
 * width (which is not free money, it's bad data).
 */
export function findPutCreditSpread(
  chain: OptionChain,
  options: SpreadSearchOptions = {},
): PutCreditSpread | null {
  const {
    targetWidth = 5,
    riskBudget = DEFAULT_RISK_BUDGET,
    offsetPercent = 0,
    earnings = null,
    asOf = '',
  } = options;

  const spot = chain.underlyingPrice;
  if (spot === null || spot <= 0) return null;

  const puts = quotablePuts(chain);
  if (puts.length < 2) return null;

  const target = spot * (1 + offsetPercent / 100);

  // The short leg: nearest listed strike to the target.
  let short = puts[0];
  for (const c of puts) {
    if (Math.abs(c.strike - target) < Math.abs(short.strike - target)) short = c;
  }

  // The long leg: nearest strike to (short − targetWidth), and strictly below
  // the short. Asking for $5 on a ladder that only lists $10 should widen the
  // spread, not fail — but the width it returns is the real one.
  const below = puts.filter((c) => c.strike < short.strike);
  if (below.length === 0) return null;

  const wanted = short.strike - targetWidth;
  let long = below[0];
  for (const c of below) {
    if (Math.abs(c.strike - wanted) < Math.abs(long.strike - wanted)) long = c;
  }

  const width = short.strike - long.strike;
  const creditMid = round2(short.mark! - long.mark!);
  if (creditMid <= 0 || creditMid >= width) return null;

  const creditReal =
    short.bid !== null && long.ask !== null ? round2(short.bid - long.ask) : null;

  const breakeven = round2(short.strike - creditMid);

  return {
    underlying: chain.symbol,
    expiration: chain.expiration,
    shortStrike: short.strike,
    longStrike: long.strike,
    width,
    creditMid,
    creditReal,
    retention: creditReal === null ? null : creditReal / creditMid,
    creditPerRiskMid: perRisk(creditMid, width, riskBudget)!,
    creditPerRiskReal: perRisk(creditReal, width, riskBudget),
    breakeven,
    cushionPercent: ((spot - breakeven) / spot) * 100,
    breakevenWinRate: 1 - creditMid / width,
    shortDelta: short.delta ?? null,
    shortOpenInterest: short.openInterest ?? null,
    longOpenInterest: long.openInterest ?? null,
    earnings:
      earningsBeforeExpiration(earnings, chain.expiration, asOf) === true
        ? { date: earnings!.date, isEstimate: earnings!.isEstimate }
        : null,
  };
}

/**
 * Cash collected per `budget` of collateral.
 *
 * Max loss on one spread is (width − credit) × 100, so this scales the credit
 * to a fixed amount of capital and makes a $5-wide spread on a $50 stock
 * directly comparable to a $10-wide on a $300 one.
 *
 * A credit at or above the width would divide by zero or flip sign; that's
 * unquotable data rather than an infinite return, so it yields null.
 */
export function perRisk(
  credit: number | null,
  width: number,
  budget = DEFAULT_RISK_BUDGET,
): number | null {
  if (credit === null || credit <= 0) return null;
  const maxLoss = width - credit;
  if (maxLoss <= 0) return null;
  return (credit / maxLoss) * budget;
}

/**
 * Rank by what you'd actually collect, not by what's quoted.
 *
 * Spreads with no live book sort last rather than being dropped: "we couldn't
 * price this" and "this pays badly" are different answers, and only one of them
 * is about the trade.
 */
export function rankByRealCredit(spreads: PutCreditSpread[]): PutCreditSpread[] {
  return [...spreads].sort((a, b) => {
    if (a.creditPerRiskReal === null && b.creditPerRiskReal === null) return 0;
    if (a.creditPerRiskReal === null) return 1;
    if (b.creditPerRiskReal === null) return -1;
    return b.creditPerRiskReal - a.creditPerRiskReal;
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
