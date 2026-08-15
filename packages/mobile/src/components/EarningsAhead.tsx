import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  countdownLabel,
  daysUntil,
  earningsExposure,
  earningsProximity,
  exposedSymbols,
  timingLabel,
  type EarningsExposure,
  type Position,
} from '@inktrade/client';
import { useEarnings } from '../hooks/useEarnings';
import { formatDay } from './EarningsBadge';
import { colors, fonts, radii, spacing } from '../ui/theme';

/**
 * What you hold that reports soon.
 *
 * Built after two positions reported on the same afternoon and the first
 * anyone knew of it was the price move — the date existed in the app, buried
 * on a panel you only visit when you already suspect something.
 *
 * Scoped to positions on purpose. A calendar of everything reporting this
 * month is a different feature, and mixing it in would bury the three rows
 * that are actually yours.
 *
 * Deliberately the same component as the web Dashboard's, down to the shared
 * `earningsExposure` join — the phone and the desktop should not be able to
 * disagree about what you are exposed to.
 */
export function EarningsAhead({
  positions,
  onSymbolPress,
}: {
  positions: Position[];
  onSymbolPress: (symbol: string) => void;
}) {
  const { data } = useEarnings(exposedSymbols(positions));
  const [expanded, setExpanded] = useState(false);

  const asOf = data?.asOf ?? '';
  const rows = data ? earningsExposure(positions, data.earnings, asOf) : [];

  // Loading, empty and failed all render as nothing. A skeleton would be a
  // permanent empty box for anyone whose holdings have no report coming.
  if (rows.length === 0) return null;

  const urgent = rows.filter((r) => daysUntil(r.earnings.date, asOf) <= 7);
  const visible = expanded ? rows : rows.slice(0, Math.max(urgent.length, 3));
  const hidden = rows.length - visible.length;

  return (
    <View style={[styles.card, urgent.length > 0 && styles.cardUrgent]}>
      <View style={styles.header}>
        <Text style={[styles.title, urgent.length > 0 && styles.titleUrgent]}>EARNINGS AHEAD</Text>
        <Text style={styles.subtitle}>
          {rows.length} {rows.length === 1 ? 'position' : 'positions'} · 2 months
        </Text>
      </View>

      {visible.map((row) => (
        <ExposureRow
          key={row.symbol}
          row={row}
          asOf={asOf}
          onPress={() => onSymbolPress(row.symbol)}
        />
      ))}

      {hidden > 0 && (
        <Pressable onPress={() => setExpanded(true)} accessibilityRole="button">
          <Text style={styles.more}>{hidden} more ▾</Text>
        </Pressable>
      )}
      {expanded && rows.length > 3 && (
        <Pressable onPress={() => setExpanded(false)} accessibilityRole="button">
          <Text style={styles.more}>Show less ▴</Text>
        </Pressable>
      )}
    </View>
  );
}

function ExposureRow({
  row,
  asOf,
  onPress,
}: {
  row: EarningsExposure;
  asOf: string;
  onPress: () => void;
}) {
  const days = daysUntil(row.earnings.date, asOf);
  const proximity = earningsProximity(days);
  const soon = proximity === 'today' || proximity === 'imminent';
  const session = timingLabel(row.earnings.timing);
  const shorts = row.optionsThrough.filter((o) => o.isShort);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${row.symbol} reports ${countdownLabel(days)}`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.rowMain}>
        <Text style={styles.symbol}>{row.symbol}</Text>
        <Text style={[styles.countdown, soon && styles.countdownUrgent]}>
          {countdownLabel(days)}
        </Text>
      </View>

      <View style={styles.rowMeta}>
        <Text style={styles.day}>
          {formatDay(row.earnings.date)}
          {session ? ` · ${session}` : ''}
          {row.earnings.isEstimate ? ' · est.' : ''}
        </Text>
        {/*
          The exposure, not just the date. A short contract living past the
          report is the position that can gap through both strikes overnight,
          and it is the reason to be reading this at all.
        */}
        <Text style={[styles.exposure, soon && styles.countdownUrgent]} numberOfLines={1}>
          {shorts.length > 0 &&
            `${shorts.length} short ${shorts.length === 1 ? 'contract' : 'contracts'} through it`}
          {shorts.length > 0 && row.shares !== 0 && ' · '}
          {row.shares !== 0 && `${Math.abs(row.shares).toLocaleString()} shares`}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.abyss,
    borderRadius: radii.lg,
    paddingBottom: spacing.xs,
  },
  cardUrgent: {
    borderColor: 'rgba(245, 158, 11, 0.4)',
    backgroundColor: 'rgba(245, 158, 11, 0.06)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  title: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.textTertiary,
  },
  titleUrgent: { color: colors.amber },
  subtitle: { fontSize: 11, color: colors.textTertiary },

  row: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
    gap: 2,
  },
  pressed: { backgroundColor: colors.surface },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  symbol: {
    fontFamily: fonts.mono,
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  countdown: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.textSecondary,
  },
  countdownUrgent: { color: colors.amber, fontWeight: '600' },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  day: { fontSize: 11, color: colors.textTertiary, flexShrink: 1 },
  exposure: { fontSize: 11, color: colors.textTertiary, flexShrink: 1, textAlign: 'right' },
  more: {
    fontSize: 11,
    color: colors.textTertiary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});
