import { StyleSheet, Text, View } from 'react-native';
import { sectorEntries, type LetfHoldingsResponse } from '@inktrade/client';
import { changeColor, colors, fonts, formatPercent, spacing } from '../ui/theme';

/*
 * What the fund is actually leveraged to.
 *
 * A 3x NASDAQ fund is not a bet on "tech" so much as a bet on eight companies,
 * and the concentration figure is the fastest way to see that. The holdings
 * belong to the *index*, not the fund — the fund itself holds swaps — which is
 * why the weights are the index's and no dollar amounts appear.
 */

const MAX_ROWS = 10;

export function LetfHoldings({ data }: { data: LetfHoldingsResponse }) {
  const holdings = data.holdings.slice(0, MAX_ROWS);
  const sectors = sectorEntries(data.sectorWeightings).slice(0, 5);
  const heaviest = holdings[0]?.weight ?? 1;

  if (holdings.length === 0 && sectors.length === 0) {
    return <Text style={styles.empty}>No holdings reported for this fund.</Text>;
  }

  return (
    <View style={styles.wrap}>
      {data.topConcentration.top5 > 0 && (
        <View style={styles.concentration}>
          <Concentration label="TOP 5" value={data.topConcentration.top5} />
          <Concentration label="TOP 10" value={data.topConcentration.top10} />
        </View>
      )}

      {holdings.map((h) => (
        <View key={h.symbol || h.name} style={styles.row}>
          <Text style={styles.symbol} numberOfLines={1}>
            {h.symbol || h.name}
          </Text>
          <View style={styles.barTrack}>
            {/*
              Scaled to the heaviest holding rather than to 100%, because the
              top name is rarely above 10% and a bar that never leaves the left
              edge conveys nothing about the spread between positions.
            */}
            <View style={[styles.barFill, { width: `${(h.weight / heaviest) * 100}%` }]} />
          </View>
          <Text style={styles.weight}>{h.weight.toFixed(1)}%</Text>
          <Text style={[styles.change, { color: h.change1D == null ? colors.textMuted : changeColor(h.change1D) }]}>
            {h.change1D == null ? '—' : formatPercent(h.change1D)}
          </Text>
        </View>
      ))}

      {sectors.length > 0 && (
        <View style={styles.sectors}>
          <Text style={styles.sectionLabel}>SECTORS</Text>
          {sectors.map((s) => (
            <View key={s.key} style={styles.sectorRow}>
              <Text style={styles.sectorName} numberOfLines={1}>
                {s.label}
              </Text>
              <Text style={styles.sectorWeight}>{s.weight.toFixed(1)}%</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function Concentration({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.concentrationStat}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <Text style={styles.concentrationValue}>{value.toFixed(1)}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 2 },
  concentration: { flexDirection: 'row', gap: spacing.xl, marginBottom: spacing.sm },
  concentrationStat: {},
  concentrationValue: {
    color: colors.textPrimary,
    fontFamily: fonts.mono,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 2,
  },
  sectionLabel: {
    color: colors.textTertiary,
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 1,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 3 },
  symbol: { color: colors.textPrimary, fontFamily: fonts.mono, fontSize: 12, width: 56 },
  barTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceRaised,
    overflow: 'hidden',
  },
  barFill: { height: 6, borderRadius: 3, backgroundColor: colors.accent },
  weight: { color: colors.textSecondary, fontFamily: fonts.mono, fontSize: 11, width: 42, textAlign: 'right' },
  change: { fontFamily: fonts.mono, fontSize: 11, width: 56, textAlign: 'right' },

  sectors: { marginTop: spacing.md, gap: 2 },
  sectorRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  sectorName: { color: colors.textSecondary, fontSize: 12, flex: 1 },
  sectorWeight: { color: colors.textSecondary, fontFamily: fonts.mono, fontSize: 11 },

  empty: { color: colors.textMuted, fontSize: 12 },
});
