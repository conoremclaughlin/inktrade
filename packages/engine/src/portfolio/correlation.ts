import type { CorrelationMatrix } from './types.js';

export function computeCorrelationMatrix(
  returns: Map<string, number[]>,
  symbols: string[],
): CorrelationMatrix {
  const n = symbols.length;
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

  const stats = symbols.map(s => {
    const vals = returns.get(s)!;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const demeaned = vals.map(v => v - mean);
    const variance = demeaned.reduce((a, v) => a + v * v, 0);
    return { demeaned, stdDev: Math.sqrt(variance) };
  });

  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const { demeaned: a, stdDev: sdA } = stats[i];
      const { demeaned: b, stdDev: sdB } = stats[j];
      if (sdA === 0 || sdB === 0) {
        matrix[i][j] = 0;
        matrix[j][i] = 0;
        continue;
      }
      const covariance = a.reduce((sum, _, k) => sum + a[k] * b[k], 0);
      const corr = covariance / (sdA * sdB);
      matrix[i][j] = corr;
      matrix[j][i] = corr;
    }
  }

  const pairs = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      pairs.push({
        symbolA: symbols[i],
        symbolB: symbols[j],
        correlation: matrix[i][j],
      });
    }
  }

  return { symbols, matrix, pairs };
}
