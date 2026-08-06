import { describe, it, expect } from 'vitest';
import { asArray, asRecord, isoTimestamp, num, str, unwrapData } from './shapes.js';

describe('unwrapData', () => {
  it('strips the { data, guide } envelope MCP tools wrap payloads in', () => {
    expect(unwrapData({ data: { equity: '10' }, guide: 'how to read this' })).toEqual({
      equity: '10',
    });
  });

  it('leaves a payload that merely has a data field alone', () => {
    // `data` alongside other keys is a field, not an envelope — unwrapping it
    // would throw away the siblings.
    const payload = { data: [1], nextPage: 2 };
    expect(unwrapData(payload)).toBe(payload);
  });

  it('passes through an already-bare payload', () => {
    expect(unwrapData([{ symbol: 'MU' }])).toEqual([{ symbol: 'MU' }]);
  });
});

describe('asArray', () => {
  it('reads a bare array', () => {
    expect(asArray([{ symbol: 'MU' }])).toEqual([{ symbol: 'MU' }]);
  });

  it("reads Robinhood's results wrapper", () => {
    expect(asArray({ results: [{ symbol: 'MU' }] })).toEqual([{ symbol: 'MU' }]);
  });

  it('reads a named collection', () => {
    expect(asArray({ positions: [{ symbol: 'MU' }] }, 'positions')).toEqual([{ symbol: 'MU' }]);
  });

  it('unwraps the envelope before looking for the collection', () => {
    expect(asArray({ data: { results: [{ symbol: 'MU' }] }, guide: 'x' })).toEqual([
      { symbol: 'MU' },
    ]);
  });

  it('discards non-object entries rather than passing them downstream', () => {
    expect(asArray([{ symbol: 'MU' }, null, 'nope', 7])).toEqual([{ symbol: 'MU' }]);
  });

  it('returns empty for a shape it does not recognise', () => {
    expect(asArray({ unexpected: true })).toEqual([]);
  });
});

describe('num', () => {
  it('parses the numeric strings Robinhood sends money as', () => {
    expect(num({ equity: '1234.5600' }, 'equity')).toBe(1234.56);
  });

  it('takes the first key that is actually present', () => {
    expect(num({ market_value: '10' }, 'equity', 'market_value')).toBe(10);
  });

  it.each([[null], [undefined], ['']])('treats %s as absent, not zero', (value) => {
    // Zero would render as real data — a $0.00 position or a flat day — so an
    // absent field has to stay absent all the way to the caller.
    expect(num({ equity: value }, 'equity')).toBeUndefined();
  });

  it('rejects a value that is not a number at all', () => {
    expect(num({ equity: 'unavailable' }, 'equity')).toBeUndefined();
  });

  it('keeps a genuine zero', () => {
    expect(num({ quantity: '0' }, 'quantity')).toBe(0);
  });
});

describe('str', () => {
  it('takes the first present key', () => {
    expect(str({ ticker: 'MU' }, 'symbol', 'ticker')).toBe('MU');
  });

  it('skips empty strings', () => {
    expect(str({ symbol: '', ticker: 'MU' }, 'symbol', 'ticker')).toBe('MU');
  });

  it('stringifies a number', () => {
    expect(str({ id: 42 }, 'id')).toBe('42');
  });
});

describe('isoTimestamp', () => {
  it('normalizes to ISO 8601', () => {
    expect(isoTimestamp('2026-08-04T14:30:00Z')).toBe('2026-08-04T14:30:00.000Z');
  });

  it('returns undefined for garbage rather than the epoch', () => {
    // Falling back to 1970 would silently sort a bad row to the bottom of an
    // activity feed instead of surfacing that it could not be read.
    expect(isoTimestamp('not a date')).toBeUndefined();
    expect(isoTimestamp(undefined)).toBeUndefined();
  });
});

describe('asRecord', () => {
  it('unwraps and returns an object', () => {
    expect(asRecord({ data: { equity: '1' }, guide: 'x' })).toEqual({ equity: '1' });
  });

  it('returns empty for an array or a primitive', () => {
    expect(asRecord([1, 2])).toEqual({});
    expect(asRecord('nope')).toEqual({});
  });
});
