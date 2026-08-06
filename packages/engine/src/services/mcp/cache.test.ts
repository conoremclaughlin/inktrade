import { describe, it, expect, vi } from 'vitest';
import { DEFAULT_TOOL_TTLS, ToolCache, cacheKey } from './cache.js';

/** A clock the tests drive, so nothing sleeps. */
function clock(start = 1_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe('ToolCache.resolve', () => {
  it('serves a repeat call from cache', async () => {
    const load = vi.fn().mockResolvedValue('v');
    const cache = new ToolCache({ ttls: { t: 1000 }, now: clock().now });

    expect(await cache.resolve('t', {}, load)).toBe('v');
    expect(await cache.resolve('t', {}, load)).toBe('v');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('reloads once the entry expires', async () => {
    const c = clock();
    const load = vi.fn().mockResolvedValue('v');
    const cache = new ToolCache({ ttls: { t: 1000 }, now: c.now });

    await cache.resolve('t', {}, load);
    c.advance(1001);
    await cache.resolve('t', {}, load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('treats different arguments as different entries', async () => {
    const load = vi.fn().mockImplementation(async () => 'v');
    const cache = new ToolCache({ ttls: { t: 1000 }, now: clock().now });

    await cache.resolve('t', { s: 'MU' }, load);
    await cache.resolve('t', { s: 'NVDA' }, load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('ignores argument key order', async () => {
    // Key order varies with how a caller happens to build the object; treating
    // those as distinct requests would halve the hit rate.
    const load = vi.fn().mockResolvedValue('v');
    const cache = new ToolCache({ ttls: { t: 1000 }, now: clock().now });

    await cache.resolve('t', { a: 1, b: 2 }, load);
    await cache.resolve('t', { b: 2, a: 1 }, load);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('bypasses entirely when the TTL is zero', async () => {
    const load = vi.fn().mockResolvedValue('v');
    const cache = new ToolCache({ defaultTtlMs: 0, now: clock().now });

    await cache.resolve('unknown_tool', {}, load);
    await cache.resolve('unknown_tool', {}, load);
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe('single flight', () => {
  it('collapses concurrent identical calls into one request', async () => {
    // getPortfolio fans out with Promise.all, so overlapping identical calls
    // are the normal case rather than a rarity.
    let release!: (v: string) => void;
    const load = vi.fn().mockImplementation(
      () => new Promise<string>((resolve) => (release = resolve)),
    );
    const cache = new ToolCache({ ttls: { t: 1000 }, now: clock().now });

    const both = Promise.all([
      cache.resolve('t', {}, load),
      cache.resolve('t', {}, load),
    ]);
    release('v');

    expect(await both).toEqual(['v', 'v']);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failure', async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue('v');
    const cache = new ToolCache({ ttls: { t: 1000 }, now: clock().now });

    await expect(cache.resolve('t', {}, load)).rejects.toThrow('boom');
    // A cached rejection would turn one blip into a TTL-long outage.
    expect(await cache.resolve('t', {}, load)).toBe('v');
  });

  it('propagates a shared failure to every joined caller', async () => {
    const load = vi.fn().mockRejectedValue(new Error('boom'));
    const cache = new ToolCache({ ttls: { t: 1000 }, now: clock().now });

    const a = cache.resolve('t', {}, load);
    const b = cache.resolve('t', {}, load);
    await expect(a).rejects.toThrow('boom');
    await expect(b).rejects.toThrow('boom');
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe('invalidate', () => {
  it('drops one tool without disturbing the others', async () => {
    const cache = new ToolCache({ ttls: { a: 1000, b: 1000 }, now: clock().now });
    const loadA = vi.fn().mockResolvedValue('a');
    const loadB = vi.fn().mockResolvedValue('b');

    await cache.resolve('a', {}, loadA);
    await cache.resolve('b', {}, loadB);
    cache.invalidate('a');

    await cache.resolve('a', {}, loadA);
    await cache.resolve('b', {}, loadB);
    expect(loadA).toHaveBeenCalledTimes(2);
    expect(loadB).toHaveBeenCalledTimes(1);
  });

  it('drops every entry for a tool regardless of arguments', async () => {
    const cache = new ToolCache({ ttls: { a: 1000 }, now: clock().now });
    const load = vi.fn().mockResolvedValue('v');

    await cache.resolve('a', { n: 1 }, load);
    await cache.resolve('a', { n: 2 }, load);
    cache.invalidate('a');
    await cache.resolve('a', { n: 1 }, load);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('does not match a tool whose name merely shares a prefix', async () => {
    const cache = new ToolCache({ ttls: { get_orders: 1000, get_orders_v2: 1000 }, now: clock().now });
    const load = vi.fn().mockResolvedValue('v');

    await cache.resolve('get_orders_v2', {}, load);
    cache.invalidate('get_orders');
    await cache.resolve('get_orders_v2', {}, load);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('clears everything with no argument', async () => {
    const cache = new ToolCache({ ttls: { a: 1000 }, now: clock().now });
    await cache.resolve('a', {}, vi.fn().mockResolvedValue('v'));
    cache.invalidate();
    expect(cache.size).toBe(0);
  });
});

describe('eviction', () => {
  it('bounds the entry count', async () => {
    const cache = new ToolCache({ ttls: { t: 10_000 }, maxEntries: 3, now: clock().now });
    for (let i = 0; i < 10; i++) {
      await cache.resolve('t', { i }, vi.fn().mockResolvedValue(i));
    }
    expect(cache.size).toBe(3);
  });

  it('evicts the oldest write first', async () => {
    const cache = new ToolCache({ ttls: { t: 10_000 }, maxEntries: 2, now: clock().now });
    const load = vi.fn().mockImplementation(async () => 'v');

    await cache.resolve('t', { i: 1 }, load);
    await cache.resolve('t', { i: 2 }, load);
    await cache.resolve('t', { i: 3 }, load);

    // 1 was pushed out; 3 is still resident.
    await cache.resolve('t', { i: 3 }, load);
    expect(load).toHaveBeenCalledTimes(3);
    await cache.resolve('t', { i: 1 }, load);
    expect(load).toHaveBeenCalledTimes(4);
  });
});

describe('default TTLs', () => {
  it('caches immutable contract definitions for a long time', () => {
    // Strike, expiry and right never change, and instrument lookups are the
    // single largest batch in a portfolio read.
    expect(DEFAULT_TOOL_TTLS.get_option_instruments).toBeGreaterThanOrEqual(60 * 60_000);
  });

  it('keeps quotes far shorter than positions', () => {
    expect(DEFAULT_TOOL_TTLS.get_equity_quotes).toBeLessThan(
      DEFAULT_TOOL_TTLS.get_equity_positions,
    );
    expect(DEFAULT_TOOL_TTLS.get_equity_quotes).toBeLessThanOrEqual(10_000);
  });

  it('does not cache unknown tools by default', () => {
    // Trading tools must never be served from cache.
    expect(new ToolCache().ttlFor('place_equity_order')).toBe(0);
    expect(new ToolCache().ttlFor('review_equity_order')).toBe(0);
  });
});

describe('cacheKey', () => {
  it('is stable across key order and distinct across values', () => {
    expect(cacheKey('t', { a: 1, b: [2, 3] })).toBe(cacheKey('t', { b: [2, 3], a: 1 }));
    expect(cacheKey('t', { a: 1 })).not.toBe(cacheKey('t', { a: 2 }));
    expect(cacheKey('t', { a: 1 })).not.toBe(cacheKey('u', { a: 1 }));
  });

  it('keeps array order significant', () => {
    // Batches are positional; [MU, NVDA] and [NVDA, MU] return the same data
    // but conflating them would be a correctness bet we don't need to take.
    expect(cacheKey('t', { s: ['MU', 'NVDA'] })).not.toBe(cacheKey('t', { s: ['NVDA', 'MU'] }));
  });
});
