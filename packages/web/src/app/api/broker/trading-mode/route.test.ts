import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { TradingMode, TradingModeDecision } from '@inktrade/client';

/*
 * The persistence layer is mocked so these never write to the real
 * ~/.inktrade/trading.json. What is under test is the validation and the
 * refusal, both of which decide whether real orders can be sent.
 */
const tradingMode = vi.fn<() => Promise<TradingModeDecision>>();
const saveTradingModeSetting = vi.fn<(mode: TradingMode) => Promise<void>>();

vi.mock('@/lib/trading-mode', async () => {
  const actual = await vi.importActual<typeof import('@/lib/trading-mode')>('@/lib/trading-mode');
  return {
    ...actual,
    tradingMode: () => tradingMode(),
    saveTradingModeSetting: (m: TradingMode) => saveTradingModeSetting(m),
  };
});

const { GET, PUT } = await import('./route.js');

function put(body: unknown) {
  return new NextRequest('http://localhost/api/broker/trading-mode', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  tradingMode.mockReset();
  saveTradingModeSetting.mockReset();
  saveTradingModeSetting.mockResolvedValue();
  tradingMode.mockResolvedValue({ mode: 'ENABLED', source: 'default' });
});

describe('GET', () => {
  it('returns the decision the server enforces', async () => {
    tradingMode.mockResolvedValue({ mode: 'PAPER', source: 'setting', reason: 'Paper trading.' });
    const body = await (await GET()).json();
    expect(body.mode).toBe('PAPER');
    expect(body.source).toBe('setting');
  });
});

describe('PUT — what may be chosen', () => {
  it.each(['ENABLED', 'PAPER', 'REVIEW_ONLY'] as const)('accepts %s', async (mode) => {
    const res = await PUT(put({ mode }));
    expect(res.status).toBe(200);
    expect(saveTradingModeSetting).toHaveBeenCalledWith(mode);
  });

  it('rejects a mode that is not one of the three', async () => {
    const res = await PUT(put({ mode: 'YOLO' }));
    expect(res.status).toBe(400);
    expect(saveTradingModeSetting).not.toHaveBeenCalled();
  });

  it('rejects a missing mode', async () => {
    const res = await PUT(put({}));
    expect(res.status).toBe(400);
  });

  it('rejects a non-string mode rather than coercing it', async () => {
    // A JSON body is user input; `{mode: true}` must not become "true".
    const res = await PUT(put({ mode: true }));
    expect(res.status).toBe(400);
  });

  it('rejects a body that is not JSON at all', async () => {
    const bad = new NextRequest('http://localhost/api/broker/trading-mode', {
      method: 'PUT',
      body: 'not json',
    });
    expect((await PUT(bad)).status).toBe(400);
  });

  it('names the permitted values in the error, so a caller can fix it', async () => {
    const body = await (await PUT(put({ mode: 'nope' }))).json();
    expect(body.error).toContain('ENABLED');
    expect(body.error).toContain('PAPER');
    expect(body.error).toContain('REVIEW_ONLY');
  });
});

describe('PUT — the env override wins', () => {
  it('refuses a write the environment would immediately overrule', async () => {
    /*
     * Accepting this would report success for a change with no effect — the
     * user would believe they had enabled live trading and be wrong, or
     * believe they had disabled it and be wrong. Both are unacceptable, so
     * neither is allowed.
     */
    tradingMode.mockResolvedValue({
      mode: 'REVIEW_ONLY',
      source: 'env',
      reason: 'Order placement is disabled for this deployment.',
    });

    const res = await PUT(put({ mode: 'ENABLED' }));
    expect(res.status).toBe(403);
    expect(saveTradingModeSetting).not.toHaveBeenCalled();
  });

  it('refuses a switch to paper under an env override too', async () => {
    // Paper is safer than live, but the operator still said no.
    tradingMode.mockResolvedValue({ mode: 'REVIEW_ONLY', source: 'env', reason: 'Locked.' });
    expect((await PUT(put({ mode: 'PAPER' }))).status).toBe(403);
  });

  it('explains why, using the decision the server already made', async () => {
    tradingMode.mockResolvedValue({
      mode: 'REVIEW_ONLY',
      source: 'env',
      reason: 'Order placement is disabled for this deployment (INKTRADE_REVIEW_ONLY).',
    });
    const body = await (await PUT(put({ mode: 'ENABLED' }))).json();
    expect(body.error).toContain('INKTRADE_REVIEW_ONLY');
  });

  it('validates before consulting the environment', async () => {
    // A bad value is a bad request whatever the deployment says.
    tradingMode.mockResolvedValue({ mode: 'REVIEW_ONLY', source: 'env', reason: 'Locked.' });
    expect((await PUT(put({ mode: 'garbage' }))).status).toBe(400);
  });
});
