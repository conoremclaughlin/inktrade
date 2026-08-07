'use client';

import { useQuery } from '@tanstack/react-query';
import {
  formatMacro,
  isInverted,
  MACRO_SYMBOLS,
  MACRO_TICKERS,
  quotesQuery,
  type Quote,
} from '@inktrade/client';
import { brokerApi } from '@/lib/broker-api';

/**
 * The weather: index, rate, energy, metal.
 *
 * Above your own positions because it's the context they sit in — a red
 * portfolio on a red tape is a different morning from a red portfolio on a
 * green one.
 *
 * The units come from the shared definition, and they're the part that matters:
 * ^TNX is a yield, so 4.67 means 4.67% and rendering it as $4.67 beside WTI
 * reads as a bond costing four dollars. The VIX is coloured backwards, because
 * up is bad there and painting a rising VIX green would invert the meaning of
 * the one instrument here that measures fear.
 */
export function MacroStrip() {
  const quotes = useQuery(quotesQuery(brokerApi, [...MACRO_SYMBOLS]));

  const bySymbol = new Map<string, Quote>();
  for (const quote of quotes.data?.quotes ?? []) bySymbol.set(quote.symbol, quote);

  // Nothing rather than a row of dashes: an empty strip is quieter than a
  // broken-looking one, and the page below it still works.
  if (bySymbol.size === 0) return null;

  return (
    <section
      className="flex gap-8 overflow-x-auto border-b border-border-subtle pb-3"
      aria-label="Market overview"
    >
      {MACRO_TICKERS.map((ticker) => {
        const quote = bySymbol.get(ticker.symbol);
        if (!quote) return null;

        const change = quote.changePercent;
        const good = isInverted(ticker.symbol) ? change < 0 : change >= 0;

        return (
          <div key={ticker.symbol} className="min-w-[84px] whitespace-nowrap">
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-tertiary">
              {ticker.label}
            </p>
            <p className="mt-0.5 font-mono text-[14px] text-text-primary tabular-nums">
              {formatMacro(quote.price, ticker.format)}
            </p>
            <p
              className={`font-mono text-[11px] tabular-nums ${good ? 'text-emerald' : 'text-rose'}`}
            >
              {change >= 0 ? '+' : ''}
              {change.toFixed(2)}%
            </p>
          </div>
        );
      })}
    </section>
  );
}
