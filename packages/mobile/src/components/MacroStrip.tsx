import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import {
  formatMacro,
  isInverted,
  MACRO_SYMBOLS,
  MACRO_TICKERS,
  quotesQuery,
  type Quote,
} from '@inktrade/client';
import { api } from '../lib/api';
import { colors, fonts, spacing } from '../ui/theme';

/**
 * The weather: index, rate, energy, metal.
 *
 * Above your own positions because it is the context they sit in — a red
 * portfolio on a red tape is a different morning from a red portfolio on a
 * green one.
 *
 * The VIX is coloured backwards on purpose. Up is bad there, and painting a
 * rising VIX green would invert the meaning of the one instrument on the strip
 * that measures fear.
 */
export function MacroStrip() {
  const quotes = useQuery(quotesQuery(api, [...MACRO_SYMBOLS]));

  const bySymbol = new Map<string, Quote>();
  for (const quote of quotes.data?.quotes ?? []) bySymbol.set(quote.symbol, quote);

  // Nothing rather than a row of dashes: an empty strip is quieter than a
  // broken-looking one, and the screen below it still works.
  if (bySymbol.size === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.strip}
      contentContainerStyle={styles.content}
    >
      {MACRO_TICKERS.map((ticker) => {
        const quote = bySymbol.get(ticker.symbol);
        if (!quote) return null;

        const change = quote.changePercent;
        const good = isInverted(ticker.symbol) ? change < 0 : change >= 0;

        return (
          <View key={ticker.symbol} style={styles.cell}>
            <Text style={styles.label}>{ticker.label}</Text>
            <Text style={styles.value}>{formatMacro(quote.price, ticker.format)}</Text>
            <Text style={[styles.change, { color: good ? colors.emerald : colors.rose }]}>
              {change >= 0 ? '+' : ''}
              {change.toFixed(2)}%
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexGrow: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  content: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.xl },
  cell: { minWidth: 72 },
  label: {
    color: colors.textTertiary,
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 1,
  },
  value: { color: colors.textPrimary, fontFamily: fonts.mono, fontSize: 13, marginTop: 2 },
  change: { fontFamily: fonts.mono, fontSize: 10, marginTop: 1 },
});
