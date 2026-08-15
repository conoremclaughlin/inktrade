import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { supportResistance, type SwingLevel, type TickerHistoryPoint } from '@inktrade/client';
import { colors, fonts, formatMoney, radii, spacing } from '../ui/theme';

/**
 * Support below, resistance above, from clustered swing points.
 *
 * Touches are shown because they are the argument: a level tested five times
 * is a different claim from one tested twice, and hiding that would ask the
 * reader to trust a number with no reason attached. The last-touch date is
 * there for the same reason — a ceiling from February and one from last week
 * are not equally interesting.
 */
export function SwingLevels({
  points,
  price,
}: {
  points: TickerHistoryPoint[];
  price: number | null;
}) {
  const levels = useMemo(
    () => (price === null ? [] : supportResistance(points, price)),
    [points, price],
  );

  if (points.length === 0 || price === null) return null;

  const resistance = levels.filter((l) => l.kind === 'resistance');
  const support = levels.filter((l) => l.kind === 'support');

  return (
    <View style={styles.wrap}>
      <Side
        title="Resistance"
        levels={resistance}
        // Above all-time highs there is genuinely nothing overhead, and saying
        // so is more useful than an empty box the reader has to interpret.
        empty="Nothing overhead within 25% — price is at or near its highs."
        tone={colors.rose}
      />
      <Side
        title="Support"
        levels={support}
        empty="No tested level within 25% below."
        tone={colors.emerald}
      />
    </View>
  );
}

function Side({
  title,
  levels,
  empty,
  tone,
}: {
  title: string;
  levels: SwingLevel[];
  empty: string;
  tone: string;
}) {
  return (
    <View style={styles.side}>
      <Text style={styles.title}>{title.toUpperCase()}</Text>

      {levels.length === 0 ? (
        <Text style={styles.empty}>{empty}</Text>
      ) : (
        levels.map((level) => (
          <View key={`${level.kind}-${level.price}`} style={styles.row}>
            <View style={styles.rowLeft}>
              <Text style={[styles.price, { color: tone }]}>{formatMoney(level.price)}</Text>
              <Text style={styles.meta}>
                {level.touches} {level.touches === 1 ? 'touch' : 'touches'} · last{' '}
                {shortDate(level.lastTouch)}
              </Text>
            </View>
            <Text style={styles.distance}>
              {level.distancePercent >= 0 ? '+' : ''}
              {level.distancePercent.toFixed(1)}%
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

function shortDate(iso: string): string {
  const [, month, day] = iso.slice(0, 10).split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[Number(month) - 1]} ${Number(day)}`;
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  side: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.deep,
    padding: spacing.md,
    gap: spacing.xs,
  },
  title: {
    color: colors.textTertiary,
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  rowLeft: { flex: 1 },
  price: { fontFamily: fonts.mono, fontSize: 14, fontWeight: '700' },
  meta: { color: colors.textMuted, fontSize: 10, marginTop: 1 },
  distance: { color: colors.textSecondary, fontFamily: fonts.mono, fontSize: 12 },
  empty: { color: colors.textMuted, fontSize: 11, lineHeight: 16 },
});
