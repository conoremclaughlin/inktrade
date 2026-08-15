import { describe, it, expect } from 'vitest';
import { idsToQuote } from './broker.js';
import {
  chainExpirations,
  chainIdFor,
  nearestExpiration,
  normalizeContract,
  normalizeQuote,
  normalizeWatchlist,
  pickLatestPrice,
  watchlistSymbols,
} from './market-data.js';

/** Trimmed from live responses. */
const CHAINS = {
  data: {
    chains: [
      {
        id: 'chain-mu',
        symbol: 'MU',
        can_open_position: true,
        expiration_dates: ['2026-08-07', '2026-09-18', '2026-08-21'],
        trade_value_multiplier: '100.0000',
      },
    ],
  },
  guide: '',
};

describe('normalizeQuote', () => {
  const entry = {
    quote: {
      symbol: 'mu',
      last_trade_price: '892.820000',
      venue_last_trade_time: '2026-08-05T19:59:59Z',
      last_non_reg_trade_price: '874.690000',
      venue_last_non_reg_trade_time: '2026-08-06T00:57:31Z',
      adjusted_previous_close: '893.190000',
    },
    close: { symbol: 'MU', price: '893.19' },
  };

  it('uses the more recent print and the settled close', () => {
    const quote = normalizeQuote(entry)!;
    expect(quote.symbol).toBe('MU');
    expect(quote.price).toBe(874.69);
    expect(quote.previousClose).toBe(893.19);
    expect(quote.change).toBeCloseTo(-18.5, 6);
    expect(quote.changePercent).toBeCloseTo(-2.0713, 3);
  });

  it('returns null rather than a zero-filled quote when unpriced', () => {
    // A $0.00 row showing 0% reads as a real, flat instrument.
    expect(normalizeQuote({ quote: { symbol: 'MU' } })).toBeNull();
    expect(normalizeQuote({})).toBeNull();
  });
});

describe('pickLatestPrice', () => {
  it('falls back when only one print exists', () => {
    expect(pickLatestPrice({ last_trade_price: '10' })).toBe(10);
    expect(pickLatestPrice({ last_non_reg_trade_price: '11' })).toBe(11);
    expect(pickLatestPrice({})).toBeUndefined();
  });
});

describe('normalizeContract', () => {
  const instrument = {
    id: 'opt-1',
    chain_symbol: 'GOOG',
    expiration_date: '2026-09-11',
    strike_price: '360.0000',
    type: 'put',
    trade_value_multiplier: '100.0000',
  };
  const quote = {
    instrument_id: 'opt-1',
    bid_price: '12.950000',
    ask_price: '15.150000',
    adjusted_mark_price: '14.050000',
    previous_close_price: '8.580000',
    implied_volatility: '0.323281',
    delta: '-0.466784',
    gamma: '0.010892',
    theta: '-0.182356',
    vega: '0.454302',
    open_interest: 7,
    volume: 82,
  };

  it('merges the instrument with its quote and greeks', () => {
    const c = normalizeContract(instrument, quote, { price: '8.58' })!;
    expect(c).toMatchObject({
      id: 'opt-1',
      underlyingSymbol: 'GOOG',
      putCall: 'PUT',
      strike: 360,
      expiration: '2026-09-11',
      multiplier: 100,
      bid: 12.95,
      ask: 15.15,
      mark: 14.05,
      previousClose: 8.58,
      delta: -0.466784,
      openInterest: 7,
      volume: 82,
    });
  });

  it('omits greeks entirely when absent rather than sending zeros', () => {
    // A zero delta is a real, meaningful value — it must not stand in for
    // "unknown".
    const c = normalizeContract(instrument, undefined, undefined)!;
    expect('delta' in c).toBe(false);
    expect('impliedVolatility' in c).toBe(false);
    expect(c.mark).toBeNull();
  });

  it('keeps a genuine zero greek', () => {
    const c = normalizeContract(instrument, { ...quote, delta: '0' }, undefined)!;
    expect(c.delta).toBe(0);
  });

  it('drops a contract missing strike or right', () => {
    expect(normalizeContract({ id: 'x', expiration_date: '2026-09-11' }, quote, undefined)).toBeNull();
  });
});

describe('chain helpers', () => {
  it('sorts expirations ascending', () => {
    expect(chainExpirations(CHAINS, 'MU')).toEqual(['2026-08-07', '2026-08-21', '2026-09-18']);
  });

  it('matches the underlying case-insensitively', () => {
    expect(chainExpirations(CHAINS, 'mu')).toHaveLength(3);
    expect(chainExpirations(CHAINS, 'NVDA')).toEqual([]);
  });

  it('prefers a tradable chain when an underlying has several', () => {
    const multi = {
      data: {
        chains: [
          { id: 'closed', symbol: 'MU', can_open_position: false, expiration_dates: [] },
          { id: 'open', symbol: 'MU', can_open_position: true, expiration_dates: [] },
        ],
      },
      guide: '',
    };
    expect(chainIdFor(multi, 'MU')).toBe('open');
  });

  it('finds the chain id', () => {
    expect(chainIdFor(CHAINS, 'MU')).toBe('chain-mu');
    expect(chainIdFor(CHAINS, 'NVDA')).toBeUndefined();
  });
});

describe('nearestExpiration', () => {
  const dates = ['2026-08-07', '2026-08-21', '2026-09-18'];

  it('picks the first expiry that has not passed', () => {
    expect(nearestExpiration(dates, '2026-08-10')).toBe('2026-08-21');
  });

  it('includes today', () => {
    expect(nearestExpiration(dates, '2026-08-07')).toBe('2026-08-07');
  });

  it('falls back to the last when all have passed', () => {
    // Better to render a stale chain than nothing at all.
    expect(nearestExpiration(dates, '2027-01-01')).toBe('2026-09-18');
  });

  it('is undefined with no expirations', () => {
    expect(nearestExpiration([], '2026-08-07')).toBeUndefined();
  });
});

describe('normalizeWatchlist', () => {
  it('reads a custom list as editable', () => {
    expect(
      normalizeWatchlist({
        id: 'w1',
        display_name: 'Put Credit Spreads',
        icon_emoji: '💡',
        owner_type: 'custom',
        item_count: 69,
      }),
    ).toEqual({ id: 'w1', name: 'Put Credit Spreads', emoji: '💡', symbolCount: 69, editable: true });
  });

  it('marks a curated list read-only', () => {
    // Robinhood lists can only be followed, not edited.
    expect(
      normalizeWatchlist({ id: 'w2', display_name: 'Top Movers', owner_type: 'robinhood' })?.editable,
    ).toBe(false);
  });

  it('drops a list with no id or name', () => {
    expect(normalizeWatchlist({ display_name: 'x' })).toBeNull();
  });
});

describe('watchlistSymbols', () => {
  it('keeps only equity instruments', () => {
    // Crypto pairs and futures share the shape but never quote as equities.
    expect(
      watchlistSymbols([
        { object_type: 'instrument', symbol: 'o' },
        { object_type: 'currency_pair', symbol: 'BTC-USD' },
        { object_type: 'futures', symbol: 'ESZ6' },
        { object_type: 'instrument', symbol: 'RITM' },
      ]),
    ).toEqual(['O', 'RITM']);
  });
});

describe('idsToQuote', () => {
  const ladder = (strikes: number[]) =>
    strikes.flatMap((strike) => [
      { id: `c${strike}`, strike_price: String(strike), type: 'call' },
      { id: `p${strike}`, strike_price: String(strike), type: 'put' },
    ]);

  it('keeps a window either side of spot', () => {
    // Quoting every contract is what makes a chain slow; a chain is read
    // around the money. The window counts strikes at-or-below spot and
    // strikes above it, so at n=1 that is the ATM strike and the one above.
    const ids = idsToQuote(ladder([80, 90, 100, 110, 120]), 100, 1);
    expect(new Set(ids)).toEqual(new Set(['c100', 'p100', 'c110', 'p110']));
  });

  it('widens symmetrically', () => {
    const ids = idsToQuote(ladder([80, 90, 100, 110, 120]), 100, 2);
    expect(new Set(ids)).toEqual(
      new Set(['c90', 'p90', 'c100', 'p100', 'c110', 'p110', 'c120', 'p120']),
    );
  });

  it('counts the window per side, so a skewed ladder keeps both directions', () => {
    const ids = idsToQuote(ladder([10, 20, 30, 40, 200]), 45, 1);
    // 40 is the only strike at or below spot; 200 the only one above.
    expect(new Set(ids)).toEqual(new Set(['c40', 'p40', 'c200', 'p200']));
  });

  it('centres on the ladder when there is no spot, rather than quoting all of it', () => {
    // This used to return everything, reasoning that any slice would drop
    // contracts arbitrarily. Measured on SPY, that reasoning cost 80 seconds
    // and returned ZERO priced contracts — quoting all 350 timed out and the
    // failure was swallowed. A bounded slice yields 100 in three seconds, and
    // nothing is lost: unpriced strikes fetch themselves on scroll.
    const ids = idsToQuote(ladder([10, 20, 30, 40, 50]), null, 1);
    // Middle strike is 30, so the window is 30 and the one above it.
    expect(new Set(ids)).toEqual(new Set(['c30', 'p30', 'c40', 'p40']));
  });

  it('still quotes a short ladder in full, because the window covers it', () => {
    expect(idsToQuote(ladder([10, 20]), null, 5)).toHaveLength(4);
  });

  it('returns nothing rather than throwing on an empty ladder', () => {
    expect(idsToQuote([], null, 25)).toEqual([]);
  });

  it('quotes everything when the window is disabled', () => {
    expect(idsToQuote(ladder([10, 20, 30]), 20, 0)).toHaveLength(6);
  });

  it('ignores contracts with no strike', () => {
    expect(idsToQuote([{ id: 'x' }], 100, 5)).toEqual([]);
  });
});
