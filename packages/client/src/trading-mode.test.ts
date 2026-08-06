import { describe, it, expect } from 'vitest';
import {
  canPlaceOrders,
  isModeUserControlled,
  isReviewOnlyEnv,
  resolveTradingMode,
} from './trading-mode.js';

describe('resolveTradingMode', () => {
  it('enables trading by default — this is a trading product', () => {
    const decision = resolveTradingMode();
    expect(decision.mode).toBe('ENABLED');
    expect(canPlaceOrders(decision)).toBe(true);
    expect(decision.reason).toBeUndefined();
  });

  it('honours the user turning review-only on', () => {
    const decision = resolveTradingMode({ setting: 'REVIEW_ONLY' });
    expect(canPlaceOrders(decision)).toBe(false);
    expect(decision.source).toBe('setting');
    expect(decision.reason).toMatch(/settings/i);
  });

  it('blocks placement when the deployment says so', () => {
    const decision = resolveTradingMode({ env: '1' });
    expect(canPlaceOrders(decision)).toBe(false);
    expect(decision.source).toBe('env');
    expect(decision.reason).toMatch(/INKTRADE_REVIEW_ONLY/);
  });

  it('lets the operator override a user who wants trading on', () => {
    // An override a setting could undo would not be an override.
    const decision = resolveTradingMode({ env: 'true', setting: 'ENABLED' });
    expect(canPlaceOrders(decision)).toBe(false);
    expect(decision.source).toBe('env');
  });

  it('hides the toggle under an env override rather than lying about control', () => {
    expect(isModeUserControlled(resolveTradingMode({ env: '1' }))).toBe(false);
    expect(isModeUserControlled(resolveTradingMode({ setting: 'REVIEW_ONLY' }))).toBe(true);
    expect(isModeUserControlled(resolveTradingMode())).toBe(true);
  });
});

describe('isReviewOnlyEnv', () => {
  it.each(['1', 'true', 'TRUE', 'yes', 'on', 'y', 'enabled', '  true  '])(
    'treats %s as on',
    (value) => {
      // Generous on purpose. Setting INKTRADE_REVIEW_ONLY=true and getting live
      // trading because only "1" was accepted would be a very bad surprise —
      // over-matching blocks an order, under-matching releases one.
      expect(isReviewOnlyEnv(value)).toBe(true);
    },
  );

  it.each(['0', 'false', 'no', 'off', '', '   ', undefined, null])(
    'treats %s as off',
    (value) => {
      expect(isReviewOnlyEnv(value)).toBe(false);
    },
  );

  it('does not treat an unrelated string as on', () => {
    expect(isReviewOnlyEnv('maybe')).toBe(false);
  });
});
