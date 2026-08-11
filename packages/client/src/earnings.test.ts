import { describe, it, expect } from 'vitest';
import {
  countdownLabel,
  daysUntil,
  describeEarnings,
  earningsBeforeExpiration,
  earningsExposure,
  earningsProximity,
  exposedSymbols,
  nextEarnings,
  upcomingEarnings,
  withinHorizon,
  type EarningsDate,
} from './earnings.js';
import type { Position } from './broker/types.js';

const TODAY = '2026-08-10';

function on(symbol: string, date: string, extra: Partial<EarningsDate> = {}): EarningsDate {
  return {
    symbol,
    date,
    timestamp: `${date}T20:00:00.000Z`,
    timing: 'after-close',
    isEstimate: false,
    windowEnd: null,
    ...extra,
  };
}

describe('daysUntil', () => {
  it('counts whole calendar days', () => {
    expect(daysUntil('2026-08-26', TODAY)).toBe(16);
    expect(daysUntil('2026-08-10', TODAY)).toBe(0);
    expect(daysUntil('2026-08-06', TODAY)).toBe(-4);
  });

  it('is unaffected by the daylight-saving boundary', () => {
    // 2026-11-01 is the US fall-back. Naive local-time arithmetic across it
    // produces a 24.04-day gap that floors to the wrong answer.
    expect(daysUntil('2026-11-09', '2026-10-16')).toBe(24);
  });
});

describe('earningsProximity', () => {
  it('buckets by distance', () => {
    expect(earningsProximity(-1)).toBe('past');
    expect(earningsProximity(0)).toBe('today');
    expect(earningsProximity(7)).toBe('imminent');
    expect(earningsProximity(8)).toBe('near');
    expect(earningsProximity(30)).toBe('near');
    expect(earningsProximity(60)).toBe('horizon');
    expect(earningsProximity(61)).toBe('distant');
  });
});

describe('withinHorizon', () => {
  it('includes today and excludes yesterday', () => {
    expect(withinHorizon(on('RKLB', TODAY), TODAY)).toBe(true);
    expect(withinHorizon(on('CEG', '2026-08-09'), TODAY)).toBe(false);
  });

  it('stops at two months out', () => {
    expect(withinHorizon(on('BSX', '2026-10-09'), TODAY)).toBe(true);
    expect(withinHorizon(on('BSX', '2026-10-10'), TODAY)).toBe(false);
  });
});

describe('earningsBeforeExpiration', () => {
  it('clears an expiration that lands before the report', () => {
    // GOOG reports 2026-10-28; a September spread never sees it.
    expect(earningsBeforeExpiration(on('GOOG', '2026-10-28'), '2026-09-18', TODAY)).toBe(false);
  });

  it('flags an expiration that holds through the report', () => {
    expect(earningsBeforeExpiration(on('GOOG', '2026-10-28'), '2026-11-20', TODAY)).toBe(true);
  });

  it('counts a report on expiration day as inside', () => {
    // The number still moves the settlement price. Excluding it would call the
    // single most dangerous case safe.
    expect(earningsBeforeExpiration(on('NVDA', '2026-08-26'), '2026-08-26', TODAY)).toBe(true);
  });

  it('counts a report today as inside a trade you are still holding', () => {
    expect(earningsBeforeExpiration(on('RKLB', TODAY), '2026-09-18', TODAY)).toBe(true);
  });

  it('says null, not false, when there is no known date', () => {
    // "No earnings between here and expiry" and "we have no idea" must not
    // render as the same all-clear.
    expect(earningsBeforeExpiration(null, '2026-09-18', TODAY)).toBeNull();
    expect(earningsBeforeExpiration(undefined, '2026-09-18', TODAY)).toBeNull();
  });

  it('says null when the only date we hold has already passed', () => {
    expect(earningsBeforeExpiration(on('CEG', '2026-08-06'), '2026-09-18', TODAY)).toBeNull();
  });
});

describe('nextEarnings', () => {
  it('takes the soonest report still ahead', () => {
    const next = nextEarnings(
      [on('A', '2026-10-28'), on('A', '2026-08-26'), on('A', '2026-07-22')],
      TODAY,
    );
    expect(next!.date).toBe('2026-08-26');
  });

  it('ignores reports that have already happened', () => {
    expect(nextEarnings([on('CEG', '2026-08-06')], TODAY)).toBeNull();
  });

  it('keeps a report landing today', () => {
    expect(nextEarnings([on('RKLB', TODAY)], TODAY)!.date).toBe(TODAY);
  });
});

describe('upcomingEarnings', () => {
  it('orders by date and drops what falls outside the window', () => {
    const rows = upcomingEarnings(
      [
        on('BSX', '2026-10-28'), // 79 days — past the horizon
        on('NVDA', '2026-08-26'),
        on('RKLB', TODAY),
        on('CEG', '2026-08-06'), // already reported
        on('KO', '2026-10-20'), // 71 days — past the horizon
      ],
      TODAY,
    );
    expect(rows.map((r) => r.symbol)).toEqual(['RKLB', 'NVDA']);
  });

  it('breaks ties on the same day alphabetically, so the order is stable', () => {
    const rows = upcomingEarnings([on('RKLB', TODAY), on('ASTS', TODAY)], TODAY);
    expect(rows.map((r) => r.symbol)).toEqual(['ASTS', 'RKLB']);
  });

  it('honours a caller-supplied horizon', () => {
    const rows = upcomingEarnings([on('NVDA', '2026-08-26')], TODAY, 7);
    expect(rows).toHaveLength(0);
  });
});

function shares(symbol: string, quantity: number): Position {
  return {
    symbol,
    assetType: 'EQUITY',
    quantity,
    averagePrice: 10,
    marketValue: 10 * quantity,
    dayChange: 0,
    dayChangePercent: 0,
  };
}

function contract(
  underlyingSymbol: string,
  expiration: string,
  quantity: number,
  strike = 50,
  putCall: 'PUT' | 'CALL' = 'PUT',
): Position {
  return {
    symbol: `${underlyingSymbol} ${strike}${putCall === 'PUT' ? 'P' : 'C'}`,
    assetType: 'OPTION',
    quantity,
    averagePrice: 1,
    marketValue: 100 * quantity,
    dayChange: 0,
    dayChangePercent: 0,
    option: { underlyingSymbol, putCall, strike, expiration, multiplier: 100 },
  };
}

describe('exposedSymbols', () => {
  it('resolves options to their underlying and dedupes', () => {
    expect(
      exposedSymbols([shares('RKLB', 100), contract('RKLB', '2026-09-18', -2), shares('KO', 50)]),
    ).toEqual(['KO', 'RKLB']);
  });
});

describe('earningsExposure', () => {
  it('joins a report to the contracts that have to live through it', () => {
    const rows = earningsExposure(
      [contract('RKLB', '2026-09-18', -2), contract('RKLB', '2026-08-07', -1)],
      [on('RKLB', TODAY)],
      TODAY,
    );
    expect(rows).toHaveLength(1);
    // The August contract expired before the report; only September is exposed.
    expect(rows[0].optionsThrough.map((o) => o.expiration)).toEqual(['2026-09-18']);
    expect(rows[0].optionsThrough[0].isShort).toBe(true);
  });

  it('counts a contract expiring on the report date as exposed', () => {
    const rows = earningsExposure(
      [contract('NVDA', '2026-08-26', -1)],
      [on('NVDA', '2026-08-26')],
      TODAY,
    );
    expect(rows[0].optionsThrough).toHaveLength(1);
  });

  it('keeps a share position with no options at all', () => {
    const rows = earningsExposure([shares('ASTS', 300)], [on('ASTS', TODAY)], TODAY);
    expect(rows[0].shares).toBe(300);
    expect(rows[0].optionsThrough).toEqual([]);
  });

  it('drops reports for things you do not hold', () => {
    // The portfolio widget answers "what am I exposed to", not "what is the
    // market doing this month".
    const rows = earningsExposure([shares('KO', 10)], [on('KO', TODAY), on('NVDA', TODAY)], TODAY);
    expect(rows.map((r) => r.symbol)).toEqual(['KO']);
  });

  it('drops a closed position that still has a row', () => {
    // Brokers report flat positions; a zero-quantity holding is not exposure.
    expect(earningsExposure([shares('KO', 0)], [on('KO', TODAY)], TODAY)).toEqual([]);
  });

  it('nets share lots in the same symbol', () => {
    const rows = earningsExposure(
      [shares('RKLB', 100), shares('RKLB', -40)],
      [on('RKLB', TODAY)],
      TODAY,
    );
    expect(rows[0].shares).toBe(60);
  });

  it('orders by how soon the report lands', () => {
    const rows = earningsExposure(
      [shares('NVDA', 10), shares('RKLB', 10), shares('KO', 10)],
      [on('NVDA', '2026-08-26'), on('RKLB', TODAY), on('KO', '2026-09-15')],
      TODAY,
    );
    expect(rows.map((r) => r.symbol)).toEqual(['RKLB', 'NVDA', 'KO']);
  });

  it('ignores reports beyond the horizon', () => {
    expect(earningsExposure([shares('BSX', 10)], [on('BSX', '2026-10-28')], TODAY)).toEqual([]);
  });
});

describe('countdownLabel', () => {
  it('reads as a distance, not a date', () => {
    expect(countdownLabel(0)).toBe('today');
    expect(countdownLabel(1)).toBe('tomorrow');
    expect(countdownLabel(16)).toBe('in 16 days');
    expect(countdownLabel(-1)).toBe('yesterday');
    expect(countdownLabel(-4)).toBe('4 days ago');
  });
});

describe('describeEarnings', () => {
  it('says when and in which session', () => {
    expect(describeEarnings(on('RKLB', TODAY), TODAY)).toBe('Reports today after close');
    expect(
      describeEarnings(on('KO', '2026-08-20', { timing: 'before-open' }), TODAY),
    ).toBe('Reports in 10 days before open');
  });

  it('never drops the estimate marker', () => {
    // An announced date and a guessed one look identical once rendered, and
    // only one is safe to pick an expiration around.
    //
    // The session survives the estimate on purpose: sources guess the *day*
    // from the reporting cadence but carry the company's habitual release
    // time, and "after close" is right for GOOG whichever Tuesday it lands on.
    expect(describeEarnings(on('GOOG', '2026-09-01', { isEstimate: true }), TODAY)).toBe(
      'Reports in 22 days after close (est.)',
    );
  });

  it('switches to the past tense once the day is done', () => {
    expect(describeEarnings(on('CEG', '2026-08-06'), TODAY)).toBe('Reported 4 days ago after close');
  });

  it('omits the session when the source did not give one', () => {
    expect(describeEarnings(on('X', '2026-08-12', { timing: 'unknown' }), TODAY)).toBe(
      'Reports in 2 days',
    );
  });
});
