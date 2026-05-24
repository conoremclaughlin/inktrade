import type { RedDayCell } from './types.js';

export function computeRedDayTable(
  leverageFactor: number,
  dropPcts: number[] = [1, 2, 3, 5, 7, 10, 15, 20],
  maxDays: number = 15,
): RedDayCell[][] {
  const absLev = Math.abs(leverageFactor);
  const rows: RedDayCell[][] = [];

  for (const dropPct of dropPcts) {
    const row: RedDayCell[] = [];
    for (let days = 1; days <= maxDays; days++) {
      const dailyLevDrop = absLev * (dropPct / 100);
      const remaining = Math.pow(1 - dailyLevDrop, days) * 100;
      row.push({
        dailyDropPct: dropPct,
        consecutiveDays: days,
        remainingPct: Math.max(0, remaining),
      });
    }
    rows.push(row);
  }

  return rows;
}
