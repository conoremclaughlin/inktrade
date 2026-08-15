import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { computeRedDayTable } from '@inktrade/engine/letf';
import { colors, fonts, radii, spacing } from '../ui/theme';

/*
 * A run of red days, and what survives it.
 *
 * Web renders this as an 8 × 15 grid — every drop size against every streak
 * length. That grid is unreadable at phone width and shrinking it to fit turns
 * the numbers into texture, so here the streak is a control and the drop sizes
 * are the rows. One column of numbers you can actually read, and the axis you
 * gave up is one tap away.
 *
 * The bar matters as much as the figure: "38.9% remaining" is arithmetic,
 * a bar that is a third full is a loss.
 */

const DROP_PCTS = [1, 2, 3, 5, 7, 10, 15, 20];
const STREAKS = [1, 2, 3, 5, 10];

export function RedDayTable({ leverageFactor }: { leverageFactor: number }) {
  const [days, setDays] = useState(3);
  const absLeverage = Math.abs(leverageFactor);

  const table = useMemo(
    () => computeRedDayTable(leverageFactor, DROP_PCTS, Math.max(...STREAKS)),
    [leverageFactor],
  );

  const rows = table.map((row) => row[days - 1]);

  return (
    <View style={styles.wrap}>
      <View style={styles.streaks}>
        {STREAKS.map((d) => (
          <Pressable
            key={d}
            onPress={() => setDays(d)}
            style={[styles.streak, d === days && styles.streakActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: d === days }}
          >
            <Text style={[styles.streakText, d === days && styles.streakTextActive]}>
              {d}d
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.head}>
        <Text style={[styles.headCell, styles.dropCol]}>INDEX / DAY</Text>
        <Text style={[styles.headCell, styles.barCol]}>REMAINING</Text>
      </View>

      {rows.map((cell) => {
        const wipedOut = cell.remainingPct <= 0.05;
        return (
          <View key={cell.dailyDropPct} style={styles.row}>
            <Text style={[styles.drop, styles.dropCol]}>−{cell.dailyDropPct}%</Text>
            <View style={styles.barCol}>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    {
                      width: `${Math.max(0, Math.min(100, cell.remainingPct))}%`,
                      backgroundColor: fillFor(cell.remainingPct),
                    },
                  ]}
                />
              </View>
              <Text style={[styles.remaining, { color: fillFor(cell.remainingPct) }]}>
                {wipedOut ? '0%' : `${cell.remainingPct.toFixed(1)}%`}
              </Text>
            </View>
          </View>
        );
      })}

      <Text style={styles.caveat}>
        The same fall, {days === 1 ? 'once' : `${days} days running`}, at {absLeverage}×.
        A stress test rather than a forecast — real drawdowns are uneven, and a
        bounce partway through leaves you better off than this.
        {absLeverage > 1 && (
          <Text>
            {'\n'}A single day past −{(100 / absLeverage).toFixed(1)}% in the index takes
            the fund to zero, and nothing recovers from there.
          </Text>
        )}
      </Text>
    </View>
  );
}

function fillFor(remaining: number): string {
  if (remaining >= 75) return colors.emerald;
  if (remaining >= 50) return colors.amber;
  return colors.rose;
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  streaks: { flexDirection: 'row', gap: spacing.xs },
  streak: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  streakActive: { borderColor: colors.rose, backgroundColor: 'rgba(244,63,94,0.12)' },
  streakText: { color: colors.textSecondary, fontFamily: fonts.mono, fontSize: 12 },
  streakTextActive: { color: colors.rose },

  head: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs },
  headCell: {
    color: colors.textTertiary,
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 1,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3 },
  dropCol: { width: 80 },
  barCol: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  drop: { color: colors.textPrimary, fontFamily: fonts.mono, fontSize: 13 },
  barTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surfaceRaised,
    overflow: 'hidden',
  },
  barFill: { height: 8, borderRadius: 4 },
  remaining: {
    fontFamily: fonts.mono,
    fontSize: 12,
    width: 52,
    textAlign: 'right',
  },
  caveat: { color: colors.textTertiary, fontSize: 11, lineHeight: 16, marginTop: spacing.xs },
});
