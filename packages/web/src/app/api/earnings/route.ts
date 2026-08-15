import { NextRequest, NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';
import { classifyTiming, type EarningsDate, type EarningsResponse } from '@inktrade/client';

/**
 * Next earnings date for many symbols in one upstream call.
 *
 * Batched because the caller is usually a portfolio or a watchlist — twenty
 * symbols at once, from a phone. The existing /api/fundamentals route already
 * exposes an earnings date, but it costs three upstream requests including
 * three years of quarterly financials to get it, which is the wrong shape for
 * "put a badge on every row".
 *
 * Days are resolved to the US market calendar here rather than on the client:
 * `Intl` time zone support is unreliable on React Native's engine, and the day
 * a report lands must not depend on where the reader is standing.
 */

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

/** Matches /api/quotes, so a page can ask both about the same symbol list. */
const MAX_SYMBOLS = 100;

const MARKET_TZ = 'America/New_York';

const marketTime = new Intl.DateTimeFormat('en-US', {
  timeZone: MARKET_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

interface MarketMoment {
  /** YYYY-MM-DD in market time. */
  day: string;
  minutes: number;
}

function toMarketMoment(instant: Date): MarketMoment {
  const parts = marketTime.formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  // `hour12: false` renders midnight as "24" in some ICU versions.
  const hour = Number(get('hour')) % 24;
  return {
    day: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: hour * 60 + Number(get('minute')),
  };
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') return new Date(value * 1000);
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

interface EarningsFields {
  earningsTimestamp?: unknown;
  earningsTimestampStart?: unknown;
  earningsTimestampEnd?: unknown;
  isEarningsDateEstimate?: unknown;
}

/**
 * Pick the report that hasn't happened yet.
 *
 * The trap this exists to avoid: `earningsTimestamp` is frequently the *last*
 * report, not the next one, while `earningsTimestampStart` holds the upcoming
 * date. Measured on 2026-08-10, GOOG carried a timestamp of 2026-07-22 — three
 * weeks past — alongside a start of 2026-10-28. Reading the obvious field
 * would have put a date in the past on the badge and called it "next".
 *
 * When a report is imminent or confirmed the three fields collapse to the same
 * instant, so taking the soonest day that hasn't passed is correct in both
 * regimes. A day that is passing right now still counts: the number is out and
 * the stock is moving on it, which is exactly when you want to see it.
 */
function nextReport(quote: EarningsFields, today: string): EarningsDate | null {
  const instants = [
    asDate(quote.earningsTimestampStart),
    asDate(quote.earningsTimestamp),
    asDate(quote.earningsTimestampEnd),
  ].filter((d): d is Date => d !== null);

  if (instants.length === 0) return null;

  let chosen: { moment: MarketMoment; instant: Date } | null = null;
  for (const instant of instants) {
    const moment = toMarketMoment(instant);
    if (moment.day < today) continue;
    if (chosen === null || moment.day < chosen.moment.day) chosen = { moment, instant };
  }
  if (chosen === null) return null;

  // A genuine range — some sources give "reports the week of the 27th" rather
  // than a day. Only a later end date makes it a window; the common case has
  // start and end on the same instant.
  const end = asDate(quote.earningsTimestampEnd);
  const endDay = end ? toMarketMoment(end).day : null;
  const windowEnd = endDay && endDay > chosen.moment.day ? endDay : null;

  return {
    symbol: '',
    date: chosen.moment.day,
    timestamp: chosen.instant.toISOString(),
    timing: classifyTiming(chosen.moment.minutes),
    isEstimate: quote.isEarningsDateEstimate === true || windowEnd !== null,
    windowEnd,
  };
}

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('symbols');
  if (!raw) {
    return NextResponse.json({ error: 'symbols is required' }, { status: 400 });
  }

  const symbols = [
    ...new Set(
      raw
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
    ),
  ];

  if (symbols.length === 0) {
    return NextResponse.json({ error: 'at least one symbol is required' }, { status: 400 });
  }
  if (symbols.length > MAX_SYMBOLS) {
    return NextResponse.json({ error: `max ${MAX_SYMBOLS} symbols` }, { status: 400 });
  }

  const asOf = toMarketMoment(new Date()).day;

  try {
    const result = await yf.quote(symbols);
    const quotes = Array.isArray(result) ? result : [result];

    const earnings: EarningsDate[] = [];
    const found = new Set<string>();

    for (const quote of quotes) {
      const symbol = quote?.symbol?.toUpperCase();
      if (!symbol) continue;
      const report = nextReport(quote as EarningsFields, asOf);
      if (!report) continue;
      earnings.push({ ...report, symbol });
      found.add(symbol);
    }

    /*
     * Named, not dropped.
     *
     * An ETF has no earnings and a misspelled ticker has none that we can see,
     * and those are different answers. A screen that renders both as an empty
     * cell teaches you to read a blank space as "nothing coming" — which is
     * how you hold a position through a report you were never shown.
     */
    const unknown = symbols.filter((s) => !found.has(s));

    const body: EarningsResponse = { earnings, unknown, asOf };
    return NextResponse.json(body, {
      // Reporting dates move on the order of days. A half hour of shared cache
      // costs nothing and spares the upstream a request per page view.
      headers: { 'Cache-Control': 'public, max-age=0, s-maxage=1800' },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
