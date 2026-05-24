import { describe, it, expect } from 'vitest';
import { computeCorrelationMatrix } from './correlation.js';

describe('computeCorrelationMatrix', () => {
  it('returns 1.0 on the diagonal', () => {
    const returns = new Map([
      ['A', [0.01, -0.02, 0.03, 0.01, -0.01]],
      ['B', [0.02, -0.01, 0.01, 0.03, -0.02]],
    ]);
    const result = computeCorrelationMatrix(returns, ['A', 'B']);

    expect(result.matrix[0][0]).toBe(1);
    expect(result.matrix[1][1]).toBe(1);
  });

  it('computes perfect positive correlation for identical series', () => {
    const series = [0.01, -0.02, 0.03, -0.01, 0.02];
    const returns = new Map([
      ['A', [...series]],
      ['B', [...series]],
    ]);
    const result = computeCorrelationMatrix(returns, ['A', 'B']);

    expect(result.matrix[0][1]).toBeCloseTo(1.0, 10);
    expect(result.matrix[1][0]).toBeCloseTo(1.0, 10);
  });

  it('computes perfect negative correlation for inverted series', () => {
    const series = [0.01, -0.02, 0.03, -0.01, 0.02];
    const returns = new Map([
      ['A', series],
      ['B', series.map(v => -v)],
    ]);
    const result = computeCorrelationMatrix(returns, ['A', 'B']);

    expect(result.matrix[0][1]).toBeCloseTo(-1.0, 10);
  });

  it('returns low correlation for weakly related series', () => {
    // Longer series with opposing patterns to get low correlation
    const a = [0.01, -0.02, 0.01, -0.01, 0.02, -0.02, 0.01, 0.03, -0.01, 0.02,
               -0.03, 0.01, 0.02, -0.01, 0.01, -0.02, 0.03, -0.01, 0.01, -0.02];
    const b = [-0.01, 0.01, -0.02, 0.03, -0.01, 0.01, -0.01, -0.02, 0.03, -0.01,
               0.02, -0.03, 0.01, 0.01, -0.02, 0.01, -0.01, 0.02, -0.03, 0.01];
    const returns = new Map([['A', a], ['B', b]]);
    const result = computeCorrelationMatrix(returns, ['A', 'B']);

    expect(Math.abs(result.matrix[0][1])).toBeLessThan(0.7);
  });

  it('is symmetric', () => {
    const returns = new Map([
      ['A', [0.01, -0.02, 0.03, 0.01]],
      ['B', [0.02, -0.01, 0.01, 0.03]],
      ['C', [-0.01, 0.02, -0.01, 0.02]],
    ]);
    const result = computeCorrelationMatrix(returns, ['A', 'B', 'C']);

    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        expect(result.matrix[i][j]).toBeCloseTo(result.matrix[j][i], 10);
      }
    }
  });

  it('produces correct pairs from upper triangle', () => {
    const returns = new Map([
      ['A', [0.01, -0.02, 0.03]],
      ['B', [0.02, -0.01, 0.01]],
      ['C', [-0.01, 0.02, -0.01]],
    ]);
    const result = computeCorrelationMatrix(returns, ['A', 'B', 'C']);

    expect(result.pairs).toHaveLength(3); // C(3,2) = 3
    expect(result.pairs.map(p => `${p.symbolA}-${p.symbolB}`)).toEqual([
      'A-B', 'A-C', 'B-C',
    ]);
    expect(result.pairs[0].correlation).toBeCloseTo(result.matrix[0][1], 10);
  });

  it('handles zero-variance series gracefully', () => {
    const returns = new Map([
      ['A', [0.01, 0.01, 0.01, 0.01]],
      ['B', [0.02, -0.01, 0.01, 0.03]],
    ]);
    const result = computeCorrelationMatrix(returns, ['A', 'B']);

    expect(result.matrix[0][1]).toBe(0);
  });
});
