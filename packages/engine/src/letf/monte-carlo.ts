import type { MonteCarloPercentiles } from './types.js';

function gaussianRandom(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

export function runMonteCarlo(
  leverageFactor: number,
  annualReturn: number,
  annualVolatility: number,
  days: number,
  simulations: number = 1000,
): MonteCarloPercentiles[] {
  const dailyMu = (annualReturn - 0.5 * annualVolatility * annualVolatility) / 252;
  const dailySigma = annualVolatility / Math.sqrt(252);

  // Run all simulations, store LETF value at each day
  const paths: Float64Array[] = [];
  for (let s = 0; s < simulations; s++) {
    const path = new Float64Array(days + 1);
    path[0] = 1;
    let underlying = 1;
    let letf = 1;
    for (let d = 1; d <= days; d++) {
      const z = gaussianRandom();
      const underlyingReturn = Math.exp(dailyMu + dailySigma * z) - 1;
      underlying *= (1 + underlyingReturn);
      letf *= (1 + leverageFactor * underlyingReturn);
      path[d] = Math.max(0, letf);
    }
    paths.push(path);
  }

  // Compute percentiles at each timestep
  const result: MonteCarloPercentiles[] = [];
  const naiveDailyReturn = annualReturn / 252;

  for (let d = 0; d <= days; d++) {
    const values = paths.map((p) => p[d]).sort((a, b) => a - b);
    const p = (pct: number) => values[Math.floor(pct * values.length)] ?? 0;

    result.push({
      day: d,
      p5: p(0.05),
      p25: p(0.25),
      p50: p(0.50),
      p75: p(0.75),
      p95: p(0.95),
      naive: Math.pow(1 + leverageFactor * naiveDailyReturn, d),
    });
  }

  return result;
}
