export interface PricePoint {
  date: string;
  close: number;
}

export interface AlignedReturns {
  dates: string[];
  returns: Map<string, number[]>;
}

export function computeAlignedReturns(
  histories: Map<string, PricePoint[]>,
): AlignedReturns {
  const symbols = [...histories.keys()];
  if (symbols.length === 0) return { dates: [], returns: new Map() };

  const byDate = new Map<string, Map<string, number>>();

  for (const [symbol, bars] of histories) {
    for (let i = 1; i < bars.length; i++) {
      const date = bars[i].date;
      const logReturn = Math.log(bars[i].close / bars[i - 1].close);
      if (!byDate.has(date)) byDate.set(date, new Map());
      byDate.get(date)!.set(symbol, logReturn);
    }
  }

  const dates: string[] = [];
  const aligned = new Map<string, number[]>(symbols.map(s => [s, []]));

  for (const [date, returnsOnDate] of [...byDate.entries()].sort()) {
    if (returnsOnDate.size !== symbols.length) continue;
    dates.push(date);
    for (const symbol of symbols) {
      aligned.get(symbol)!.push(returnsOnDate.get(symbol)!);
    }
  }

  return { dates, returns: aligned };
}
