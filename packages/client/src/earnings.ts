/**
 * When a company next reports, and whether that lands inside your trade.
 *
 * An earnings report is the most reliable way to break a short option
 * position: it resets the price distribution overnight, so a spread that looks
 * safe on Greeks alone can gap straight through both strikes at the open. The
 * question every view showing a symbol should be able to answer is therefore
 * "is there a report between now and when this position ends?"
 *
 * Dates arrive here already normalised to a US market calendar day by the
 * server. That is deliberate: `Intl` time zone support is patchy on React
 * Native's engine, and a phone in Lisbon must not decide that a report lands
 * on a different day than the same account viewed on a desktop in Denver. The
 * server resolves the day; everything below compares plain YYYY-MM-DD strings.
 */

import { optionLabel, type Position } from './broker/types.js';

/**
 * How far out an earnings date is worth surfacing.
 *
 * Two months: far enough to cover the monthly expirations people actually
 * sell, close enough that a date this side of the line is genuinely a thing
 * you have to plan around rather than trivia.
 */
export const EARNINGS_HORIZON_DAYS = 60;

/**
 * When in the trading day the report lands.
 *
 * Worth distinguishing because it decides which session absorbs the move: a
 * before-open report is priced into today's open, an after-close report into
 * tomorrow's. Inferred from the release time, which some sources fill with a
 * placeholder — so treat it as a strong hint, not a guarantee.
 */
export type EarningsTiming = 'before-open' | 'after-close' | 'during-session' | 'unknown';

export interface EarningsDate {
  symbol: string;
  /** US market calendar day of the report, YYYY-MM-DD. */
  date: string;
  /** The underlying instant, when the source gives one. */
  timestamp: string | null;
  timing: EarningsTiming;
  /**
   * The source is guessing from the reporting cadence rather than repeating a
   * date the company announced. Treat as ± a few days, and never let it be the
   * only thing standing between you and an assignment.
   */
  isEstimate: boolean;
  /** Last day of the range, when the source gives a window instead of a day. */
  windowEnd: string | null;
}

export interface EarningsResponse {
  earnings: EarningsDate[];
  /**
   * Asked about, no date found. Named rather than dropped: an ETF has no
   * earnings and an unrecognised ticker has none *that we can see*, and a
   * screen that silently omits both teaches you to trust a blank space.
   */
  unknown: string[];
  /** The market calendar day the server resolved "now" to, YYYY-MM-DD. */
  asOf: string;
}

/**
 * How close the report is, bucketed for display.
 *
 * `past` exists because the day of a report stays interesting after the bell —
 * the number is out and the stock is moving on it.
 */
export type EarningsProximity = 'past' | 'today' | 'imminent' | 'near' | 'horizon' | 'distant';

/** 9:30am ET, in minutes past midnight. */
export const MARKET_OPEN_MINUTES = 9 * 60 + 30;

/**
 * 3:00pm ET, not 4:00 — deliberately an hour early.
 *
 * Providers project an *estimated* future report by carrying forward the UTC
 * instant of the last one, which silently shifts the market-local time by an
 * hour across a daylight-saving boundary. Measured on 2026-08-11: RKLB
 * reported at 20:00Z, 4:00pm EDT and safely after the close, and its estimated
 * next date carried the same 20:00Z into November — where it reads as 3:00pm
 * EST and lands mid-session.
 *
 * Widening the window by exactly the size of the artifact absorbs it. The cost
 * is calling a genuine 3:30pm release "after close", which is a label being
 * slightly wrong about a company that essentially does not exist; the benefit
 * is not telling anyone their earnings land mid-session when they don't.
 */
export const MARKET_CLOSE_MINUTES = 15 * 60;

/**
 * Which session absorbs the report, from its market-local release time.
 *
 * Worth knowing because it decides which open you are exposed to: a
 * before-open report is in today's price, an after-close one in tomorrow's.
 */
export function classifyTiming(minutesPastMidnightET: number): EarningsTiming {
  // Midnight is a placeholder for "no time given", not a real release time.
  if (minutesPastMidnightET <= 0) return 'unknown';
  if (minutesPastMidnightET < MARKET_OPEN_MINUTES) return 'before-open';
  if (minutesPastMidnightET >= MARKET_CLOSE_MINUTES) return 'after-close';
  return 'during-session';
}

/** Whole calendar days between two YYYY-MM-DD days. Negative once past. */
export function daysUntil(date: string, asOf: string): number {
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
  return Math.round((b - a) / 86_400_000);
}

export function earningsProximity(days: number): EarningsProximity {
  if (Number.isNaN(days)) return 'distant';
  if (days < 0) return 'past';
  if (days === 0) return 'today';
  if (days <= 7) return 'imminent';
  if (days <= 30) return 'near';
  if (days <= EARNINGS_HORIZON_DAYS) return 'horizon';
  return 'distant';
}

/** Inside the window worth showing. Today counts; yesterday does not. */
export function withinHorizon(earnings: EarningsDate, asOf: string): boolean {
  const days = daysUntil(earnings.date, asOf);
  return days >= 0 && days <= EARNINGS_HORIZON_DAYS;
}

/**
 * Does a report land on or before this contract expires?
 *
 * The comparison is inclusive at both ends. A report the morning of
 * expiration still moves the settlement price, and one today still moves a
 * position you are holding through it — neither is safely "outside".
 *
 * Returns null when there is no known date, which is not the same answer as
 * false and must not be rendered as an all-clear.
 */
export function earningsBeforeExpiration(
  earnings: EarningsDate | null | undefined,
  expiration: string,
  asOf: string,
): boolean | null {
  if (!earnings) return null;
  if (daysUntil(earnings.date, asOf) < 0) return null;
  return earnings.date <= expiration;
}

/** The soonest report among these, ignoring any that have already passed. */
export function nextEarnings(
  earnings: EarningsDate[],
  asOf: string,
): EarningsDate | null {
  let best: EarningsDate | null = null;
  for (const e of earnings) {
    if (daysUntil(e.date, asOf) < 0) continue;
    if (best === null || e.date < best.date) best = e;
  }
  return best;
}

/**
 * Everything reporting inside the horizon, soonest first.
 *
 * This is the portfolio widget's whole job: of the things you hold, which have
 * a report coming, and in what order do they arrive.
 */
export function upcomingEarnings(
  earnings: EarningsDate[],
  asOf: string,
  horizonDays = EARNINGS_HORIZON_DAYS,
): EarningsDate[] {
  return earnings
    .filter((e) => {
      const days = daysUntil(e.date, asOf);
      return days >= 0 && days <= horizonDays;
    })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.symbol.localeCompare(b.symbol)));
}

/** Every underlying you have exposure to, options resolved to the stock. */
export function exposedSymbols(positions: Position[]): string[] {
  const symbols = new Set<string>();
  for (const p of positions) {
    const symbol = p.option?.underlyingSymbol ?? p.symbol;
    if (symbol) symbols.add(symbol.toUpperCase());
  }
  return [...symbols].sort();
}

export interface EarningsExposure {
  symbol: string;
  earnings: EarningsDate;
  /** Shares held (or shorted) in the underlying itself. */
  shares: number;
  /**
   * Contracts whose life spans the report — the ones that carry the risk.
   *
   * An option expiring before the date is unaffected; one expiring after has
   * to survive the gap. That distinction is the entire reason this exists, so
   * it is computed rather than left to the reader to work out from two lists.
   */
  optionsThrough: {
    label: string;
    expiration: string;
    quantity: number;
    /** Short positions are the exposed side: the gap is the loss. */
    isShort: boolean;
  }[];
}

/**
 * What's reporting, and what you're holding into it.
 *
 * "RKLB reports today" is a fact. "RKLB reports today and you are short two
 * puts expiring in September" is the thing you needed to know last week — so
 * the position is joined here rather than shown in a separate list that the
 * reader has to cross-reference under time pressure.
 *
 * Sorted soonest first. Ties break on symbol so the order doesn't shuffle
 * between renders.
 */
export function earningsExposure(
  positions: Position[],
  earnings: EarningsDate[],
  asOf: string,
  horizonDays = EARNINGS_HORIZON_DAYS,
): EarningsExposure[] {
  const upcoming = upcomingEarnings(earnings, asOf, horizonDays);

  return upcoming
    .map((report) => {
      const held = positions.filter(
        (p) => (p.option?.underlyingSymbol ?? p.symbol).toUpperCase() === report.symbol,
      );

      const shares = held
        .filter((p) => p.assetType !== 'OPTION')
        .reduce((sum, p) => sum + p.quantity, 0);

      const optionsThrough = held
        .filter((p) => p.option && p.option.expiration >= report.date)
        .map((p) => ({
          label: optionLabel(p.option!),
          expiration: p.option!.expiration,
          quantity: p.quantity,
          isShort: p.quantity < 0,
        }))
        .sort((a, b) => (a.expiration < b.expiration ? -1 : a.expiration > b.expiration ? 1 : 0));

      return { symbol: report.symbol, earnings: report, shares, optionsThrough };
    })
    .filter((e) => e.shares !== 0 || e.optionsThrough.length > 0);
}

const TIMING_LABEL: Record<EarningsTiming, string> = {
  'before-open': 'before open',
  'after-close': 'after close',
  'during-session': 'during the session',
  unknown: '',
};

/** "after close", "before open", or nothing when the source didn't say. */
export function timingLabel(timing: EarningsTiming): string {
  return TIMING_LABEL[timing];
}

/**
 * A short phrase for how far off the report is: "today", "tomorrow", "in 9
 * days". Days rather than a date because the distance is the decision input —
 * whether it clears an expiration, not which Tuesday it falls on.
 */
export function countdownLabel(days: number): string {
  if (Number.isNaN(days)) return '';
  if (days < -1) return `${Math.abs(days)} days ago`;
  if (days === -1) return 'yesterday';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

/**
 * The countdown with the words squeezed out: "today", "tomorrow", "12d".
 *
 * For badges pinned beside a symbol, where the full phrase would push the
 * price off a phone screen. The unit stays — a bare "12" beside a ticker reads
 * as a price.
 */
export function compactCountdown(days: number): string {
  if (Number.isNaN(days)) return '';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 0) return `${Math.abs(days)}d ago`;
  return `${days}d`;
}

/**
 * One line combining all of it: "Reports today after close", "Reports in 12
 * days (est.)".
 *
 * The estimate marker is never dropped. A date the source guessed and a date
 * the company announced look identical once rendered, and only one of them is
 * safe to plan an expiration around.
 */
export function describeEarnings(earnings: EarningsDate, asOf: string): string {
  const days = daysUntil(earnings.date, asOf);
  const when = countdownLabel(days);
  const timing = timingLabel(earnings.timing);
  const verb = days < 0 ? 'Reported' : 'Reports';
  const parts = [verb, when, timing].filter(Boolean);
  const suffix = earnings.isEstimate ? ' (est.)' : '';
  return `${parts.join(' ')}${suffix}`;
}
