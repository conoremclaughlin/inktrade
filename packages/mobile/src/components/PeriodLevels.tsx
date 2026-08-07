import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { periodLevels, type TickerHistoryPoint } from '@inktrade/client';
import { colors, fonts, formatPrice, radii, spacing } from '../ui/theme';

/**
 * Where price sits against the levels people actually name.
 *
 * "Near the monthly low", "3% off the 52-week high" — these are the sentences
 * traders use to describe a setup, and each one is a distance rather than a
 * level. Showing the level alone leaves the reader doing arithmetic on every
 * row, so the distance leads and the level supports it.
 *
 * The maths is shared with web and computed from the daily bars already on
 * screen — no extra request to learn something the chart already knows.
 */
export function PeriodLevels({
  points,
  price,
}: {
  points: TickerHistoryPoint[];
  price: number | null;
}) {
  const levels = useMemo(() => {
    if (points.length === 0 || price === null) return [];
    // The last bar's date, not the wall clock: on a weekend or a holiday the
    // clock says Sunday while the newest session is Friday's.
    const asOf = points[points.length - 1].date.slice(0, 10);
    return periodLevels(points, price, asOf);
  }, [points, price]);

  if (levels.length === 0) return null;

  return (
    <View style={styles.grid}>
      {levels.map((level) => {
        const distance = level.distancePercent;
        // Near is within 3% either way — close enough that the level is doing
        // something to the price rather than sitting in the background.
        const near = distance !== null && Math.abs(distance) <= 3;

        return (
          <View key={level.id} style={[styles.cell, near && styles.cellNear]}>
            <Text style={styles.label}>{level.label}</Text>
            <Text style={styles.value}>${formatPrice(level.value)}</Text>
            <Text
              style={[
                styles.distance,
                near && styles.distanceNear,
                distance !== null && distance < 0 && styles.distanceBelow,
              ]}
            >
              {distance === null
                ? '—'
                : `${distance >= 0 ? '+' : ''}${distance.toFixed(1)}%`}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  cell: {
    // Three across on a phone; the labels are short enough to stay legible.
    flexBasis: '31%',
    flexGrow: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.deep,
  },
  cellNear: { borderColor: colors.accent, backgroundColor: 'rgba(59,130,246,0.1)' },
  label: {
    color: colors.textTertiary,
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 0.8,
  },
  value: {
    color: colors.textPrimary,
    fontFamily: fonts.mono,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 3,
  },
  distance: { color: colors.textMuted, fontFamily: fonts.mono, fontSize: 11, marginTop: 1 },
  distanceNear: { color: colors.accentBright },
  distanceBelow: { color: colors.rose },
});
