import { describe, it, expect } from 'vitest';
import { findPutCreditSpread, perRisk, rankByRealCredit } from './premium.js';
import type { OptionChain, OptionContract } from './broker/types.js';

function put(strike: number, mark: number, bid: number | null, ask: number | null, extra: Partial<OptionContract> = {}): OptionContract {
  return {
    id: `p${strike}`,
    underlyingSymbol: 'TEST',
    putCall: 'PUT',
    strike,
    expiration: '2026-09-18',
    multiplier: 100,
    bid,
    ask,
    mark,
    previousClose: mark,
    ...extra,
  };
}

function chain(contracts: OptionContract[], underlyingPrice: number | null = 100): OptionChain {
  return {
    symbol: 'TEST',
    expiration: '2026-09-18',
    expirations: ['2026-09-18'],
    underlyingPrice,
    contracts,
  };
}

describe('findPutCreditSpread', () => {
  it('sells the strike nearest the money and buys the target width below', () => {
    const s = findPutCreditSpread(
      chain([put(90, 1.0, 0.9, 1.1), put(95, 2.0, 1.9, 2.1), put(100, 4.0, 3.9, 4.1)]),
      { targetWidth: 5 },
    );
    expect(s).not.toBeNull();
    expect(s!.shortStrike).toBe(100);
    expect(s!.longStrike).toBe(95);
    expect(s!.width).toBe(5);
    expect(s!.creditMid).toBeCloseTo(2.0, 5);
  });

  it('prices the realistic credit by crossing the book both ways', () => {
    // Sell the short at its bid (3.9), buy the long at its ask (2.1).
    const s = findPutCreditSpread(
      chain([put(95, 2.0, 1.9, 2.1), put(100, 4.0, 3.9, 4.1)]),
      { targetWidth: 5 },
    );
    expect(s!.creditReal).toBeCloseTo(1.8, 5);
    expect(s!.retention).toBeCloseTo(0.9, 5);
  });

  it('normalises to a fixed capital budget so widths compare', () => {
    // $5 wide, $2 credit -> max loss $3 -> 2/3 of $500 = $333.33
    const narrow = findPutCreditSpread(
      chain([put(95, 2.0, 2.0, 2.0), put(100, 4.0, 4.0, 4.0)]),
      { targetWidth: 5 },
    );
    // $10 wide, $4 credit -> max loss $6 -> 4/6 of $500 = $333.33. Same trade,
    // twice the size; the per-risk figure must not care.
    const wide = findPutCreditSpread(
      chain([put(90, 2.0, 2.0, 2.0), put(100, 6.0, 6.0, 6.0)]),
      { targetWidth: 10 },
    );
    expect(narrow!.creditPerRiskMid).toBeCloseTo(333.33, 1);
    expect(wide!.creditPerRiskMid).toBeCloseTo(333.33, 1);
  });

  it('measures cushion to the breakeven, not to the short strike', () => {
    // Short 100 taking 2.00 -> breakeven 98. Spot 100 -> 2% of room.
    const s = findPutCreditSpread(
      chain([put(95, 2.0, 2.0, 2.0), put(100, 4.0, 4.0, 4.0)], 100),
      { targetWidth: 5 },
    );
    expect(s!.breakeven).toBeCloseTo(98, 5);
    expect(s!.cushionPercent).toBeCloseTo(2, 5);
  });

  it('reports the win rate the payoff demands', () => {
    // 2 credit on a 5 wide: you keep 2, you can lose 3, so you need 60%.
    const s = findPutCreditSpread(
      chain([put(95, 2.0, 2.0, 2.0), put(100, 4.0, 4.0, 4.0)]),
      { targetWidth: 5 },
    );
    expect(s!.breakevenWinRate).toBeCloseTo(0.6, 5);
  });

  it('widens rather than failing when the ladder has no $5 rung', () => {
    // RCL and CEG list $10 strikes near $300, so a 5-wide is unbuildable.
    // Returning the 10-wide with its real width beats returning nothing.
    const s = findPutCreditSpread(
      chain([put(290, 3.0, 2.9, 3.1), put(300, 6.0, 5.9, 6.1)], 302),
      { targetWidth: 5 },
    );
    expect(s!.width).toBe(10);
    expect(s!.longStrike).toBe(290);
  });

  it('honours an offset for selling further out of the money', () => {
    const ladder = chain(
      [put(80, 0.5, 0.4, 0.6), put(85, 1.0, 0.9, 1.1), put(90, 2.0, 1.9, 2.1), put(100, 4.0, 3.9, 4.1)],
      100,
    );
    const otm = findPutCreditSpread(ladder, { targetWidth: 5, offsetPercent: -10 });
    expect(otm!.shortStrike).toBe(90);
    expect(otm!.longStrike).toBe(85);
  });

  it('still quotes a mid credit when one leg has no book', () => {
    // Overnight, or on a thin strike. The mid survives; the realistic price
    // does not, and saying so is the point.
    const s = findPutCreditSpread(
      chain([put(95, 2.0, null, null), put(100, 4.0, 3.9, 4.1)]),
      { targetWidth: 5 },
    );
    expect(s!.creditMid).toBeCloseTo(2.0, 5);
    expect(s!.creditReal).toBeNull();
    expect(s!.retention).toBeNull();
    expect(s!.creditPerRiskReal).toBeNull();
  });

  it('refuses a credit that exceeds the width', () => {
    // Not free money — bad marks. A $5 spread cannot pay $6.
    const s = findPutCreditSpread(
      chain([put(95, 1.0, 1.0, 1.0), put(100, 7.0, 7.0, 7.0)]),
      { targetWidth: 5 },
    );
    expect(s).toBeNull();
  });

  it('returns null when the spot is unknown', () => {
    const s = findPutCreditSpread(
      chain([put(95, 2.0, 2.0, 2.0), put(100, 4.0, 4.0, 4.0)], null),
      { targetWidth: 5 },
    );
    expect(s).toBeNull();
  });

  it('returns null when there is no strike below the short leg', () => {
    const s = findPutCreditSpread(chain([put(100, 4.0, 3.9, 4.1)]), { targetWidth: 5 });
    expect(s).toBeNull();
  });

  it('ignores calls sitting in the same chain', () => {
    const call = { ...put(100, 4.0, 3.9, 4.1), putCall: 'CALL' as const, id: 'c100' };
    const s = findPutCreditSpread(
      chain([call, put(95, 2.0, 1.9, 2.1), put(100, 4.0, 3.9, 4.1)]),
      { targetWidth: 5 },
    );
    expect(s!.shortStrike).toBe(100);
    expect(s!.creditMid).toBeCloseTo(2.0, 5);
  });
});

describe('findPutCreditSpread with earnings', () => {
  const ladder = () => chain([put(95, 2.0, 1.9, 2.1), put(100, 4.0, 3.9, 4.1)], 100);
  const report = (date: string, isEstimate = false) => ({
    symbol: 'TEST',
    date,
    timestamp: `${date}T20:00:00.000Z`,
    timing: 'after-close' as const,
    isEstimate,
    windowEnd: null,
  });

  it('flags a report the spread has to live through', () => {
    // The chain expires 2026-09-18; the report lands eleven days before it.
    const s = findPutCreditSpread(ladder(), {
      targetWidth: 5,
      earnings: report('2026-09-07'),
      asOf: '2026-08-10',
    });
    expect(s!.earnings).toEqual({ date: '2026-09-07', isEstimate: false });
  });

  it('leaves the flag off when the report lands after expiry', () => {
    const s = findPutCreditSpread(ladder(), {
      targetWidth: 5,
      earnings: report('2026-10-28'),
      asOf: '2026-08-10',
    });
    expect(s!.earnings).toBeNull();
  });

  it('keeps the estimate marker, because a guessed date is a weaker warning', () => {
    const s = findPutCreditSpread(ladder(), {
      targetWidth: 5,
      earnings: report('2026-09-07', true),
      asOf: '2026-08-10',
    });
    expect(s!.earnings!.isEstimate).toBe(true);
  });

  it('does not change the ranking metric', () => {
    // An earnings spread pays more because it is more dangerous. Demoting it
    // would hide the trade rather than describe it — the flag annotates, the
    // credit still ranks.
    const withReport = findPutCreditSpread(ladder(), {
      targetWidth: 5,
      earnings: report('2026-09-07'),
      asOf: '2026-08-10',
    })!;
    const without = findPutCreditSpread(ladder(), { targetWidth: 5 })!;
    expect(withReport.creditPerRiskReal).toBe(without.creditPerRiskReal);
    expect(without.earnings).toBeNull();
  });
});

describe('perRisk', () => {
  it('scales credit to the collateral it ties up', () => {
    expect(perRisk(2, 5, 500)).toBeCloseTo(333.33, 1);
  });

  it('rejects a credit at or above the width rather than dividing by zero', () => {
    expect(perRisk(5, 5)).toBeNull();
    expect(perRisk(6, 5)).toBeNull();
  });

  it('has nothing to say about an absent credit', () => {
    expect(perRisk(null, 5)).toBeNull();
    expect(perRisk(0, 5)).toBeNull();
  });
});

describe('rankByRealCredit', () => {
  it('ranks on what survives the book, and that inverts the mid ordering', () => {
    // Both measured live on 2026-08-10, 39 DTE. CEG's book is wide and its
    // open interest thin; GOOG's is neither. CEG leads on the midpoint and
    // trails badly once you cross — which is the whole reason to rank on the
    // realistic credit rather than the quoted one.
    const ceg = findPutCreditSpread(
      chain([put(260, 9.6, 8.5, 10.7), put(270, 14.25, 12.6, 15.9)], 270.44),
      { targetWidth: 10 },
    )!;
    const goog = findPutCreditSpread(
      chain([put(350, 10.5, 9.95, 11.05), put(355, 12.8, 12.2, 13.4)], 355.89),
      { targetWidth: 5 },
    )!;

    // Ahead at the midpoint...
    expect(ceg.creditPerRiskMid).toBeGreaterThan(goog.creditPerRiskMid);
    // ...behind once the spread is paid.
    expect(ceg.creditPerRiskReal!).toBeLessThan(goog.creditPerRiskReal!);
    expect(ceg.retention!).toBeLessThan(0.5);

    const ranked = rankByRealCredit([ceg, goog]);
    expect(ranked[0].underlying).toBe('TEST');
    expect(ranked[0].shortStrike).toBe(355);
  });

  it('sorts unpriceable spreads last instead of dropping them', () => {
    const priced = findPutCreditSpread(
      chain([put(95, 2.0, 1.9, 2.1), put(100, 4.0, 3.9, 4.1)]),
      { targetWidth: 5 },
    )!;
    const noBook = findPutCreditSpread(
      chain([put(95, 2.0, null, null), put(100, 4.0, 3.9, 4.1)]),
      { targetWidth: 5 },
    )!;
    const ranked = rankByRealCredit([noBook, priced]);
    expect(ranked[0].creditPerRiskReal).not.toBeNull();
    expect(ranked[1].creditPerRiskReal).toBeNull();
  });
});
