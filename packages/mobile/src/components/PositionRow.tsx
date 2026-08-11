import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { changeColor, colors, fonts, formatPercent, formatPrice, spacing } from '../ui/theme';

interface Props {
  /** Ticker, or a readable contract label for options. */
  symbol: string;
  /**
   * Marker pinned beside the ticker — an earnings date, say.
   *
   * A slot rather than a prop per marker: the row shouldn't have to know what
   * kinds of warning exist, and the next one shouldn't need this file edited.
   */
  badge?: ReactNode;
  /** Position context — share count and average cost. Omitted for watched-only rows. */
  detail?: string;
  value: number;
  changePercent: number;
  /** Renders value as a dollar amount rather than a share price. */
  currency?: boolean;
  /**
   * No quote available yet. Rendered as a placeholder rather than falling
   * through to 0.00 — a zero price reads as real data and, being non-negative,
   * would even show green.
   */
  pending?: boolean;
  onPress?: () => void;
}

/**
 * One row of a holdings or watchlist section.
 *
 * Holdings carry `detail` (size and average cost); watched symbols don't. Same
 * grammar, different density — so a list of things you own never reads like a
 * list of things you're only watching.
 */
export function PositionRow({
  symbol,
  badge,
  detail,
  value,
  changePercent,
  currency,
  pending,
  onPress,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, pressed && onPress ? styles.pressed : null]}
    >
      <View style={styles.left}>
        <View style={styles.symbolLine}>
          <Text style={styles.symbol} numberOfLines={1}>{symbol}</Text>
          {badge}
        </View>
        {detail ? <Text style={styles.detail} numberOfLines={1}>{detail}</Text> : null}
      </View>
      <View style={styles.right}>
        {pending ? (
          <Text style={styles.pending}>—</Text>
        ) : (
          <>
            <Text style={styles.value}>
              {currency ? '$' : ''}{formatPrice(Math.abs(value))}
            </Text>
            <Text style={[styles.change, { color: changeColor(changePercent) }]}>
              {formatPercent(changePercent)}
            </Text>
          </>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
    gap: spacing.md,
  },
  pressed: { backgroundColor: colors.surface },
  left: { flex: 1, minWidth: 0 },
  // `flexShrink` on the row so a badge never pushes the price off the screen.
  symbolLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  right: { alignItems: 'flex-end' },
  symbol: { color: colors.textPrimary, fontFamily: fonts.mono, fontSize: 14, fontWeight: '600' },
  detail: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },
  value: {
    color: colors.textPrimary,
    fontFamily: fonts.mono,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  change: { fontFamily: fonts.mono, fontSize: 11, marginTop: 2, fontVariant: ['tabular-nums'] },
  pending: { color: colors.textMuted, fontFamily: fonts.mono, fontSize: 14 },
});
