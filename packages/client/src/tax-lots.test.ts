import { describe, it, expect } from 'vitest';
import {
  MAX_SELECTED_LOTS,
  lotSelectionBlocker,
  planSale,
  resolveCostBasisStrategy,
  selectLots,
  selectableQuantity,
  unrealizedGain,
  type TaxLot,
} from './tax-lots.js';

function lot(over: Partial<TaxLot> & Pick<TaxLot, 'id'>): TaxLot {
  return {
    quantity: 100,
    costPerShare: 100,
    openDate: '2026-01-01',
    term: 'SHORT',
    selectable: true,
    origin: 'BUY',
    ...over,
  };
}

/**
 * Trimmed from a live SOXL position. The 300-share assignment lot at $176.68
 * is the case this whole module exists for: shares acquired at a basis nobody
 * chose, deeply underwater, that FIFO would leave untouched for years.
 */
const SOXL_LOTS: TaxLot[] = [
  // Acquired today — the broker won't accept it for a specified-lot sale yet,
  // and its basis hasn't settled.
  lot({ id: 'today', quantity: 6, costPerShare: null, openDate: '2026-08-05', selectable: false }),
  lot({ id: 'aug4', quantity: 6, costPerShare: 122.73, openDate: '2026-08-04' }),
  lot({ id: 'assigned', quantity: 300, costPerShare: 176.68, openDate: '2026-07-31', origin: 'ASSIGNMENT' }),
  lot({ id: 'jul30', quantity: 10, costPerShare: 93.16, openDate: '2026-07-30' }),
  lot({ id: 'mar9', quantity: 144, costPerShare: 49.31, openDate: '2026-03-09', term: 'LONG' }),
];

const PRICE = 131.6;

describe('selectLots', () => {
  it('sells the highest-cost lot first when harvesting losses', () => {
    // The assignment lot: 300 shares at $176.68 against a $131.60 price.
    const selection = selectLots(SOXL_LOTS, 100, 'HIGHEST_COST', PRICE);

    expect(selection.lots).toHaveLength(1);
    expect(selection.lots[0].lotId).toBe('assigned');
    expect(selection.realizedGain).toBeCloseTo((131.6 - 176.68) * 100, 4);
    expect(selection.realizedGain).toBeLessThan(0);
  });

  it('sells the oldest first under FIFO, which is the costly default', () => {
    // FIFO reaches for the March lot at $49.31 — a large realized GAIN on the
    // longest-held shares, which is the opposite of harvesting.
    const selection = selectLots(SOXL_LOTS, 100, 'FIFO', PRICE);

    expect(selection.lots[0].lotId).toBe('mar9');
    expect(selection.realizedGain).toBeGreaterThan(0);
  });

  it('produces a materially different outcome from FIFO on the same order', () => {
    const harvested = selectLots(SOXL_LOTS, 100, 'HIGHEST_COST', PRICE).realizedGain!;
    const fifo = selectLots(SOXL_LOTS, 100, 'FIFO', PRICE).realizedGain!;
    // ~$12,700 of difference on a 100-share sale. This is the whole point.
    expect(fifo - harvested).toBeGreaterThan(10_000);
  });

  it('sells newest first under LIFO', () => {
    // 'today' is excluded as unselectable, so aug4 leads.
    expect(selectLots(SOXL_LOTS, 5, 'LIFO', PRICE).lots[0].lotId).toBe('aug4');
  });

  it('prefers long-term lots when asked, for the lower rate', () => {
    expect(selectLots(SOXL_LOTS, 50, 'LONG_TERM_FIRST', PRICE).lots[0].lotId).toBe('mar9');
  });

  it('spans several lots when one cannot cover the order', () => {
    const selection = selectLots(SOXL_LOTS, 310, 'HIGHEST_COST', PRICE);
    expect(selection.lots.map((l) => l.lotId)).toEqual(['assigned', 'aug4', 'jul30']);
    expect(selection.lots.reduce((s, l) => s + l.quantity, 0)).toBe(310);
    expect(selection.shortfall).toBe(0);
  });

  it('splits realized gain by holding period', () => {
    const selection = selectLots(SOXL_LOTS, 444, 'FIFO', PRICE);
    expect(selection.longTermGain).toBeCloseTo((131.6 - 49.31) * 144, 4);
    expect(selection.shortTermGain).toBeLessThan(0);
  });
});

describe('lots the broker will not accept', () => {
  it('never selects an unselectable lot', () => {
    // A lot acquired today is still syncing; offering it produces a rejected
    // order at submit.
    const selection = selectLots(SOXL_LOTS, 460, 'LIFO', PRICE);
    expect(selection.lots.map((l) => l.lotId)).not.toContain('today');
  });

  it('reports the unselectable quantity rather than hiding it', () => {
    expect(selectLots(SOXL_LOTS, 10, 'LIFO', PRICE).unselectableQuantity).toBe(6);
  });

  it('reports a shortfall instead of quietly selling less', () => {
    // Falling back to FIFO for the remainder is exactly the failure this
    // module exists to prevent, so the gap is surfaced instead.
    const selection = selectLots(SOXL_LOTS, 1000, 'HIGHEST_COST', PRICE);
    expect(selection.shortfall).toBeCloseTo(1000 - 460, 4);
  });

  it('has no shortfall when the order is exactly coverable', () => {
    expect(selectLots(SOXL_LOTS, 460, 'FIFO', PRICE).shortfall).toBe(0);
  });

  it('does not leave floating-point dust as a phantom shortfall', () => {
    const fractional = [lot({ id: 'a', quantity: 31.749708, costPerShare: 49.57 })];
    expect(selectLots(fractional, 31.749708, 'FIFO', PRICE).shortfall).toBe(0);
  });

  it('stops at the broker cap of 30 lots', () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      lot({ id: `l${i}`, quantity: 1, costPerShare: 100 + i }),
    );
    const selection = selectLots(many, 50, 'HIGHEST_COST', PRICE);
    expect(selection.lots).toHaveLength(MAX_SELECTED_LOTS);
    expect(selection.shortfall).toBe(20);
  });
});

describe('lots with a basis the broker has not settled', () => {
  const pending = [
    lot({ id: 'known', quantity: 10, costPerShare: 100 }),
    lot({ id: 'pending', quantity: 10, costPerShare: null }),
  ];

  it('reports the total as unknown rather than counting a null as zero', () => {
    // Treating a pending basis as zero would report a fabricated gain equal to
    // the entire proceeds.
    const selection = selectLots(pending, 20, 'FIFO', PRICE);
    expect(selection.realizedGain).toBeNull();
    expect(selection.shortTermGain).toBeNull();
  });

  it('still allows the lot to be sold', () => {
    expect(selectLots(pending, 20, 'FIFO', PRICE).lots).toHaveLength(2);
  });

  it('sorts a pending-basis lot last in cost-ordered strategies', () => {
    // With no cost there is no way to know where it belongs, and putting it
    // first would silently defeat the chosen strategy.
    expect(selectLots(pending, 5, 'HIGHEST_COST', PRICE).lots[0].lotId).toBe('known');
    expect(selectLots(pending, 5, 'LOWEST_COST', PRICE).lots[0].lotId).toBe('known');
  });

  it('reports a known total when no chosen lot is pending', () => {
    expect(selectLots(pending, 10, 'HIGHEST_COST', PRICE).realizedGain).toBeCloseTo(
      (131.6 - 100) * 10,
      4,
    );
  });
});

describe('determinism', () => {
  it('breaks equal-cost ties by date, so a selection is reproducible', () => {
    const tied = [
      lot({ id: 'newer', costPerShare: 100, openDate: '2026-06-01' }),
      lot({ id: 'older', costPerShare: 100, openDate: '2026-01-01' }),
    ];
    expect(selectLots(tied, 50, 'HIGHEST_COST', PRICE).lots[0].lotId).toBe('older');
    expect(selectLots([...tied].reverse(), 50, 'HIGHEST_COST', PRICE).lots[0].lotId).toBe('older');
  });
});

describe('unrealizedGain', () => {
  it('shows how far underwater an assignment lot is', () => {
    const assigned = SOXL_LOTS.find((l) => l.id === 'assigned')!;
    expect(unrealizedGain(assigned, PRICE)).toBeCloseTo((131.6 - 176.68) * 300, 2);
  });

  it('is null when the basis is pending', () => {
    expect(unrealizedGain(lot({ id: 'x', costPerShare: null }), PRICE)).toBeNull();
  });
});

describe('selectableQuantity', () => {
  it('counts only what the broker will accept', () => {
    expect(selectableQuantity(SOXL_LOTS)).toBe(460);
  });
});

describe('lotSelectionBlocker', () => {
  const sell = { side: 'SELL' as const, type: 'LIMIT' as const, quantity: 10 };

  it('permits an ordinary share sell', () => {
    expect(lotSelectionBlocker(sell)).toBeUndefined();
    expect(lotSelectionBlocker({ ...sell, type: 'MARKET' })).toBeUndefined();
  });

  it.each([
    [{ ...sell, side: 'BUY' as const }, /sells only/i],
    [{ ...sell, notional: 100, quantity: undefined }, /dollar-amount/i],
    [{ ...sell, type: 'STOP' as const }, /stop orders/i],
    [{ ...sell, type: 'STOP_LIMIT' as const }, /stop orders/i],
    [{ ...sell, session: 'ALL_DAY' as const }, /overnight/i],
    [{ ...sell, quantity: 1.5 }, /fractional/i],
  ])('explains why %o cannot use lot selection', (order, pattern) => {
    // Robinhood rejects these at submit, so the reason belongs in front of the
    // user while they are still choosing.
    expect(lotSelectionBlocker(order)).toMatch(pattern);
  });

  it('allows a fractional market sell, which the broker does accept', () => {
    expect(lotSelectionBlocker({ ...sell, type: 'MARKET', quantity: 1.5 })).toBeUndefined();
  });
});

describe('resolveCostBasisStrategy', () => {
  it('defaults to highest cost, not the broker default', () => {
    // The whole point: people who never open settings are the ones FIFO hurts.
    const decision = resolveCostBasisStrategy();
    expect(decision.strategy).toBe('HIGHEST_COST');
    expect(decision.source).toBe('default');
  });

  it('honours a chosen strategy', () => {
    expect(resolveCostBasisStrategy({ setting: 'LIFO' })).toEqual({
      strategy: 'LIFO',
      source: 'setting',
    });
  });

  it('lets FIFO be chosen deliberately', () => {
    // Choosing it is fine. Arriving at it by accident is what isn't.
    expect(resolveCostBasisStrategy({ setting: 'FIFO' }).strategy).toBe('FIFO');
  });

  it('lets the environment override, case-insensitively', () => {
    expect(resolveCostBasisStrategy({ env: 'lowest_cost' })).toEqual({
      strategy: 'LOWEST_COST',
      source: 'env',
    });
    expect(resolveCostBasisStrategy({ env: 'LIFO', setting: 'FIFO' }).strategy).toBe('LIFO');
  });

  it('ignores nonsense rather than failing a sale over it', () => {
    expect(resolveCostBasisStrategy({ env: 'CHEAPEST' }).strategy).toBe('HIGHEST_COST');
    expect(resolveCostBasisStrategy({ setting: 'whatever' as never }).strategy).toBe(
      'HIGHEST_COST',
    );
  });
});

describe('planSale', () => {
  const sellOrder = { side: 'SELL' as const, type: 'LIMIT' as const, quantity: 100 };

  it('attaches the strategy lots to an order that can carry them', () => {
    const plan = planSale({
      lots: SOXL_LOTS,
      quantity: 100,
      salePrice: PRICE,
      strategy: 'HIGHEST_COST',
      order: sellOrder,
    });

    // The $176.68 assignment lot is the highest cost, and covers all 100.
    expect(plan.taxLots).toEqual([{ lotId: 'assigned', quantity: 100 }]);
    expect(plan.fallback).toBeUndefined();
    expect(plan.selection?.realizedGain).toBeCloseTo((PRICE - 176.68) * 100, 6);
  });

  it('prices what FIFO would have cost instead', () => {
    const highest = planSale({
      lots: SOXL_LOTS,
      quantity: 100,
      salePrice: PRICE,
      strategy: 'HIGHEST_COST',
      order: sellOrder,
    });
    const fifo = planSale({
      lots: SOXL_LOTS,
      quantity: 100,
      salePrice: PRICE,
      strategy: 'FIFO',
      order: sellOrder,
    });

    // The number this whole module exists to put in front of someone. FIFO
    // reaches for the March lot at $49.31 and books an $8,229 gain; highest-cost
    // closes the $176.68 assignment lot for a $4,508 loss. Same 100 shares.
    expect(fifo.selection!.realizedGain).toBeCloseTo(8_229, 2);
    expect(highest.selection!.realizedGain).toBeCloseTo(-4_508, 2);
    const swing = fifo.selection!.realizedGain! - highest.selection!.realizedGain!;
    expect(swing).toBeCloseTo(12_737, 2);
  });

  it('refuses to specify lots on a stop order, and says what that costs', () => {
    // Robinhood rejects tax_lots on stop orders, so the sale becomes FIFO.
    // Silently becoming FIFO is the exact failure this reports.
    const plan = planSale({
      lots: SOXL_LOTS,
      quantity: 100,
      salePrice: PRICE,
      strategy: 'HIGHEST_COST',
      order: { ...sellOrder, type: 'STOP' },
    });

    expect(plan.taxLots).toEqual([]);
    expect(plan.fallback?.reason).toMatch(/stop orders/i);
    expect(plan.fallback?.additionalGain).toBeCloseTo(12_737, 2);
  });

  it('reports a shortfall rather than sending a partial selection', () => {
    // 460 selectable shares exist but only 466 total; asking for 500 can't be
    // covered. A partial tax_lots array is rejected at submit, and sending none
    // would quietly fall to FIFO.
    const plan = planSale({
      lots: SOXL_LOTS,
      quantity: 500,
      salePrice: PRICE,
      strategy: 'HIGHEST_COST',
      order: { ...sellOrder, quantity: 500 },
    });

    expect(plan.taxLots).toEqual([]);
    expect(plan.fallback?.reason).toMatch(/of 500 shares/);
  });

  it('calls out shares that are still settling', () => {
    const plan = planSale({
      lots: [
        lot({ id: 'settled', quantity: 10, costPerShare: 50 }),
        lot({ id: 'settling', quantity: 40, selectable: false }),
      ],
      quantity: 50,
      salePrice: PRICE,
      strategy: 'HIGHEST_COST',
      order: { ...sellOrder, quantity: 50 },
    });

    expect(plan.fallback?.reason).toMatch(/still settling/i);
  });

  it('leaves additionalGain null rather than guessing past a pending basis', () => {
    const plan = planSale({
      lots: [lot({ id: 'pending', quantity: 100, costPerShare: null })],
      quantity: 100,
      salePrice: PRICE,
      strategy: 'HIGHEST_COST',
      order: { ...sellOrder, type: 'STOP' },
    });

    // A zero here would read as "FIFO costs you nothing", which is unknown.
    expect(plan.fallback?.additionalGain).toBeNull();
  });

  it('reports no extra gain when FIFO is what was chosen', () => {
    const plan = planSale({
      lots: SOXL_LOTS,
      quantity: 100,
      salePrice: PRICE,
      strategy: 'FIFO',
      order: { ...sellOrder, type: 'STOP' },
    });
    expect(plan.fallback?.additionalGain).toBe(0);
  });
});
