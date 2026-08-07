import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { oversoldQuery, RSI_OVERSOLD, type OversoldCandidate } from '@inktrade/client';
import { api } from '../lib/api';
import { colors, fonts, formatMoney, radii, spacing } from '../ui/theme';

/**
 * Scan a watchlist for "oversold, near the lows".
 *
 * Explicitly triggered rather than automatic. A scan is one history fetch per
 * symbol upstream, so running it because a list happened to open would spend
 * forty requests to answer a question nobody asked.
 *
 * Both signals are shown as separate badges rather than folded into a score.
 * A ranking you can't interrogate is one you won't act on: "RSI 36.9 and 7%
 * off the low" is a reason, "score 82" is not.
 */
export function OversoldScan({ symbols }: { symbols: string[] }) {
  const [requested, setRequested] = useState(false);
  const scan = useQuery(oversoldQuery(api, symbols, requested));

  if (symbols.length === 0) return null;

  if (!requested) {
    return (
      <Pressable
        onPress={() => setRequested(true)}
        style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}
      >
        <Text style={styles.triggerText}>
          Scan {symbols.length} {symbols.length === 1 ? 'symbol' : 'symbols'} for oversold
        </Text>
      </Pressable>
    );
  }

  if (scan.isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} size="small" />
        <Text style={styles.loadingText}>
          Reading a year of bars for {symbols.length} symbols…
        </Text>
      </View>
    );
  }

  if (scan.error) {
    return (
      <View style={styles.notice}>
        <Text style={styles.noticeText}>Couldn&apos;t run the scan. Try again in a moment.</Text>
      </View>
    );
  }

  const result = scan.data;
  if (!result) return null;

  return (
    <View style={styles.results}>
      <View style={styles.summary}>
        <Text style={styles.summaryText}>
          {result.candidates.length} of {result.scanned} · RSI ≤ {result.threshold} or within{' '}
          {result.nearPercent}% of the 52-week low
        </Text>
        <Pressable onPress={() => scan.refetch()} hitSlop={10}>
          <Text style={styles.again}>Rescan</Text>
        </Pressable>
      </View>

      {result.candidates.length === 0 && (
        // Nothing qualifying is a real answer, and worth distinguishing from a
        // scan that failed.
        <Text style={styles.empty}>
          Nothing on this list is oversold or near its low right now.
        </Text>
      )}

      {result.candidates.map((candidate) => (
        <CandidateRow key={candidate.symbol} candidate={candidate} />
      ))}

      {result.skipped.length > 0 && (
        <Text style={styles.footnote}>
          No history for {result.skipped.join(', ')} — skipped rather than counted as clear.
        </Text>
      )}
      {result.dropped > 0 && (
        <Text style={styles.footnote}>
          {result.dropped} more symbols weren&apos;t scanned — the list is over the per-scan cap.
        </Text>
      )}
    </View>
  );
}

function CandidateRow({ candidate }: { candidate: OversoldCandidate }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Text style={styles.symbol}>{candidate.symbol}</Text>
        <View style={styles.badges}>
          {candidate.oversold && (
            <View style={[styles.badge, styles.badgeOversold]}>
              <Text style={[styles.badgeText, { color: colors.violet }]}>OVERSOLD</Text>
            </View>
          )}
          {candidate.nearLow && (
            <View style={[styles.badge, styles.badgeNear]}>
              <Text style={[styles.badgeText, { color: colors.accentBright }]}>NEAR LOW</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.rowRight}>
        <Text style={styles.price}>{formatMoney(candidate.price)}</Text>
        <Text style={styles.detail}>
          RSI{' '}
          <Text
            style={{
              color:
                candidate.rsi !== null && candidate.rsi <= RSI_OVERSOLD
                  ? colors.violet
                  : colors.textTertiary,
            }}
          >
            {candidate.rsi === null ? '—' : candidate.rsi.toFixed(1)}
          </Text>
          {candidate.fromLow52 !== null && `  ·  ${candidate.fromLow52.toFixed(1)}% off low`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },

  trigger: {
    marginHorizontal: spacing.lg,
    marginVertical: spacing.sm,
    paddingVertical: 11,
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderDefault,
  },
  triggerText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },

  loading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  loadingText: { color: colors.textTertiary, fontSize: 12 },

  results: { paddingBottom: spacing.sm },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  summaryText: { color: colors.textTertiary, fontSize: 11, flex: 1, lineHeight: 15 },
  again: { color: colors.accentBright, fontSize: 12 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  rowLeft: { flex: 1, gap: 4 },
  symbol: { color: colors.textPrimary, fontFamily: fonts.mono, fontSize: 13, fontWeight: '700' },
  badges: { flexDirection: 'row', gap: spacing.xs },
  badge: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
  badgeOversold: { backgroundColor: 'rgba(139,92,246,0.18)' },
  badgeNear: { backgroundColor: 'rgba(59,130,246,0.18)' },
  badgeText: { fontFamily: fonts.mono, fontSize: 8, letterSpacing: 0.8 },

  rowRight: { alignItems: 'flex-end' },
  price: { color: colors.textSecondary, fontFamily: fonts.mono, fontSize: 13 },
  detail: { color: colors.textTertiary, fontFamily: fonts.mono, fontSize: 10, marginTop: 3 },

  empty: {
    color: colors.textMuted,
    fontSize: 12,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  footnote: {
    color: colors.textMuted,
    fontSize: 10,
    lineHeight: 14,
    paddingHorizontal: spacing.lg,
    paddingTop: 4,
  },
  notice: {
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.3)',
    backgroundColor: 'rgba(244,63,94,0.08)',
  },
  noticeText: { color: colors.rose, fontSize: 12 },
});
