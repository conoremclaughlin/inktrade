import { describe, it, expect } from 'vitest';
import { resolveApiUrl, isLoopback, describeApiUrlProblem } from './resolveApiUrl';

const base = { isDev: true, port: 6001 };

describe('resolveApiUrl', () => {
  it('prefers an explicit override over everything else', () => {
    expect(
      resolveApiUrl({
        ...base,
        explicit: 'https://api.example.com',
        metroHostUri: '192.168.1.5:8081',
        productionApiUrl: 'https://prod.example.com',
      }),
    ).toEqual({ url: 'https://api.example.com', source: 'env' });
  });

  it('ignores a blank override rather than treating it as set', () => {
    expect(resolveApiUrl({ ...base, explicit: '   ', metroHostUri: '192.168.1.5:8081' })).toEqual({
      url: 'http://192.168.1.5:6001',
      source: 'metro',
    });
  });

  it('derives the host from Metro and swaps in the API port', () => {
    expect(resolveApiUrl({ ...base, metroHostUri: '192.168.86.60:8081' })).toEqual({
      url: 'http://192.168.86.60:6001',
      source: 'metro',
    });
  });

  it('handles a Metro host with a path segment', () => {
    expect(resolveApiUrl({ ...base, metroHostUri: '192.168.86.60:8081/_expo' }).url).toBe(
      'http://192.168.86.60:6001',
    );
  });

  it('keeps autodiscovering in dev even when a production URL is configured', () => {
    expect(
      resolveApiUrl({
        ...base,
        metroHostUri: '10.0.0.4:8081',
        productionApiUrl: 'https://prod.example.com',
      }).source,
    ).toBe('metro');
  });

  it('uses the configured production URL when there is no Metro host', () => {
    expect(
      resolveApiUrl({
        ...base,
        isDev: false,
        productionApiUrl: 'https://prod.example.com',
      }),
    ).toEqual({ url: 'https://prod.example.com', source: 'config' });
  });

  it('strips a trailing slash so paths do not double up', () => {
    expect(resolveApiUrl({ ...base, explicit: 'https://api.example.com/' }).url).toBe(
      'https://api.example.com',
    );
  });

  it('falls back to loopback when nothing is available', () => {
    expect(resolveApiUrl(base)).toEqual({ url: 'http://127.0.0.1:6001', source: 'fallback' });
  });
});

describe('isLoopback', () => {
  it.each([
    ['http://localhost:6001', true],
    ['http://127.0.0.1:6001', true],
    ['https://localhost', true],
    ['http://192.168.86.60:6001', false],
    ['https://api.example.com', false],
    // Must not match a hostname that merely starts with the loopback name.
    ['http://localhost.evil.com', false],
  ])('%s -> %s', (url, expected) => {
    expect(isLoopback(url)).toBe(expected);
  });
});

describe('describeApiUrlProblem', () => {
  it('flags a release build with no production URL configured', () => {
    const hint = describeApiUrlProblem({ url: 'http://127.0.0.1:6001', source: 'fallback' }, false);
    expect(hint).toMatch(/productionApiUrl/);
  });

  it('explains that loopback is the phone itself', () => {
    const hint = describeApiUrlProblem({ url: 'http://127.0.0.1:6001', source: 'fallback' }, true);
    expect(hint).toMatch(/phone itself/);
  });

  it('has no complaint about a well-formed explicit URL', () => {
    expect(
      describeApiUrlProblem({ url: 'https://api.example.com', source: 'env' }, false),
    ).toBeUndefined();
  });
});
