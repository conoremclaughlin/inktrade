/**
 * The handful of instruments that set the weather for everything else.
 *
 * Kept as a shared definition rather than a per-platform list because the
 * awkward part isn't the tickers, it's the units — and getting those wrong is
 * how a strip becomes actively misleading.
 */

export type MacroFormat =
  /** A dollar price: $78.31. */
  | 'price'
  /** An index level: 7,709.96 — no currency symbol, it isn't money. */
  | 'index'
  /** A yield, already expressed in percent: 4.67%. */
  | 'yield';

export interface MacroTicker {
  symbol: string;
  label: string;
  format: MacroFormat;
}

/**
 * Index, rate, energy, metal — one from each of the things that move
 * everything else, in the order a trader scans them.
 *
 * ^TNX is the trap. Its "price" IS a percentage: 4.67 means 4.67%, and
 * rendering it as $4.67 alongside real dollar prices reads as a bond costing
 * four dollars. It gets its own format for that reason alone.
 */
export const MACRO_TICKERS: readonly MacroTicker[] = [
  { symbol: '^GSPC', label: 'S&P 500', format: 'index' },
  { symbol: '^IXIC', label: 'Nasdaq', format: 'index' },
  { symbol: '^VIX', label: 'VIX', format: 'index' },
  { symbol: '^TNX', label: '10Y', format: 'yield' },
  { symbol: 'CL=F', label: 'WTI', format: 'price' },
  { symbol: 'GC=F', label: 'Gold', format: 'price' },
];

export const MACRO_SYMBOLS: readonly string[] = MACRO_TICKERS.map((t) => t.symbol);

/** Render a macro value in its own units. */
export function formatMacro(value: number, format: MacroFormat): string {
  if (!Number.isFinite(value)) return '—';

  switch (format) {
    case 'yield':
      return `${value.toFixed(2)}%`;
    case 'index':
      return value.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    case 'price':
      return `$${value.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
  }
}

/**
 * How to describe a move in the VIX.
 *
 * Deliberately not colour-coded like everything else: a rising VIX is not a
 * good day, and painting it green because the number went up would invert the
 * meaning of the one instrument on the strip that measures fear.
 */
export function isInverted(symbol: string): boolean {
  return symbol === '^VIX';
}
