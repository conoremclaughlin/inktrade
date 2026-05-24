import type { DecaySimResult } from './types.js';

export function simulateDecay(
  leverageFactor: number,
  annualReturn: number,
  annualVolatility: number,
  days: number,
): DecaySimResult[] {
  const dailyReturn = annualReturn / 252;
  const dailyVol = annualVolatility / Math.sqrt(252);

  const results: DecaySimResult[] = [];
  let expectedValue = 1;
  let naiveValue = 1;

  for (let d = 0; d <= days; d++) {
    results.push({ day: d, expectedValue, naiveValue });

    if (d < days) {
      // Expected LETF daily return accounting for variance drag:
      // E[L * r] with daily variance -> leveraged return minus drag
      const expectedDailyLetf = leverageFactor * dailyReturn
        - (leverageFactor * (leverageFactor - 1) / 2) * dailyVol * dailyVol;
      expectedValue *= (1 + expectedDailyLetf);

      // Naive: just multiply underlying return by factor
      naiveValue *= (1 + leverageFactor * dailyReturn);
    }
  }

  return results;
}

export function annualizedDrag(
  leverageFactor: number,
  annualVolatility: number,
): number {
  return (leverageFactor * (leverageFactor - 1) / 2) * annualVolatility * annualVolatility;
}
