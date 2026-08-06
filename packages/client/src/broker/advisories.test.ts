import { describe, it, expect } from 'vitest';
import {
  alternativeToExercise,
  brokerIdOf,
  disposesShares,
  exerciseAdvisory,
} from './advisories.js';

describe('brokerIdOf', () => {
  it.each([
    ['Robinhood', 'robinhood'],
    ['robinhood (agentic)', 'robinhood'],
    ['Charles Schwab', 'schwab'],
    ['thinkorswim', 'schwab'],
    ['Mock Broker', 'mock'],
    [undefined, 'mock'],
  ])('maps %s to %s', (name, expected) => {
    expect(brokerIdOf(name)).toBe(expected);
  });
});

describe('disposesShares', () => {
  it('is true only for the two events that actually sell stock', () => {
    // Long put exercised, and short call assigned. Those sell shares.
    expect(disposesShares({ putCall: 'PUT', side: 'BUY' })).toBe(true);
    expect(disposesShares({ putCall: 'CALL', side: 'SELL' })).toBe(true);
  });

  it('is false for the two that acquire stock', () => {
    // A long call exercised and a short put assigned both BUY shares — a new
    // lot appears, nothing is realized, there is nothing to warn about.
    expect(disposesShares({ putCall: 'CALL', side: 'BUY' })).toBe(false);
    expect(disposesShares({ putCall: 'PUT', side: 'SELL' })).toBe(false);
  });
});

describe('exerciseAdvisory', () => {
  it('warns before exercising a long put, with the same-day deadline', () => {
    const advisory = exerciseAdvisory({ broker: 'robinhood', putCall: 'PUT', side: 'BUY' });

    expect(advisory).not.toBeNull();
    expect(advisory!.tone).toBe('critical');
    expect(advisory!.timeCritical).toBe(true);
    expect(advisory!.action).toMatch(/same day/i);
  });

  it('tells you to call support today once it has already happened', () => {
    const advisory = exerciseAdvisory({
      broker: 'robinhood',
      putCall: 'CALL',
      side: 'SELL',
      assigned: true,
    });

    // After the fact the alternative is gone; the support call is all there is,
    // and it expires at the end of the day.
    expect(advisory!.action).toMatch(/TODAY/);
    expect(advisory!.action).toMatch(/only be changed on the day/i);
  });

  it('stays quiet when the event acquires shares', () => {
    // Warning on all four events trains people to ignore the warning by the
    // time it matters.
    expect(exerciseAdvisory({ broker: 'robinhood', putCall: 'CALL', side: 'BUY' })).toBeNull();
    expect(exerciseAdvisory({ broker: 'robinhood', putCall: 'PUT', side: 'SELL' })).toBeNull();
  });

  it('does not put Robinhood’s support process on another broker', () => {
    expect(exerciseAdvisory({ broker: 'schwab', putCall: 'PUT', side: 'BUY' })).toBeNull();
  });
});

describe('alternativeToExercise', () => {
  it('calls closing a long put the better trade', () => {
    const alt = alternativeToExercise({ putCall: 'PUT', side: 'BUY' });
    expect(alt!.steps[0]).toMatch(/sell the put/i);
    expect(alt!.tradeoff).toMatch(/strictly better/i);
  });

  it('is honest that closing a short call costs money', () => {
    // Closing a long put COLLECTS time value; closing a short call PAYS it.
    // Presenting them as the same thing would be dishonest.
    const alt = alternativeToExercise({ putCall: 'CALL', side: 'SELL' });
    expect(alt!.steps[0]).toMatch(/buy the call back/i);
    expect(alt!.tradeoff).toMatch(/costs/i);
  });

  it('offers nothing when nothing is being disposed of', () => {
    expect(alternativeToExercise({ putCall: 'CALL', side: 'BUY' })).toBeNull();
  });
});
