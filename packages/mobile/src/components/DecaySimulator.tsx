import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import { annualizedDrag, simulateDecay } from '@inktrade/engine/letf';
import { colors, fonts, radii, spacing } from '../ui/theme';

/*
 * What the daily reset costs, at a volatility you choose.
 *
 * A leveraged fund promises N times the *daily* move. Compounding N times a
 * daily move is not the same as N times the compounded move, and the wedge
 * between them scales with variance: drag = L(L−1)/2 × σ². That formula is the
 * whole product warning, and it is far more legible as a number you can move
 * than as a sentence in a prospectus.
 *
 * Chips rather than sliders. There's no slider in this app's dependency set,
 * and dragging for a two-significant-figure input is worse on a phone than
 * picking from the handful of values anyone actually reasons about.
 */

const TRADING_DAYS = 252;

/** Underlying annualised volatility, as percent. */
const VOL_PRESETS = [15, 25, 35, 50, 70];
/** Underlying annualised return, as percent. */
const RETURN_PRESETS = [-20, -10, 0, 10, 20];

export function DecaySimulator({ leverageFactor }: { leverageFactor: number }) {
  const [volPct, setVolPct] = useState(25);
  const [returnPct, setReturnPct] = useState(10);

  const absLeverage = Math.abs(leverageFactor);

  const { path, naivePath, drag, finalExpected, finalNaive } = useMemo(() => {
    const results = simulateDecay(
      absLeverage,
      returnPct / 100,
      volPct / 100,
      TRADING_DAYS,
    );
    return {
      results,
      drag: annualizedDrag(absLeverage, volPct / 100) * 100,
      finalExpected: (results[results.length - 1].expectedValue - 1) * 100,
      finalNaive: (results[results.length - 1].naiveValue - 1) * 100,
      path: results.map((r) => r.expectedValue),
      naivePath: results.map((r) => r.naiveValue),
    };
  }, [absLeverage, returnPct, volPct]);

  const cost = finalExpected - finalNaive;

  return (
    <View style={styles.wrap}>
      <Row label="INDEX VOLATILITY">
        {VOL_PRESETS.map((v) => (
          <Chip key={v} label={`${v}%`} active={v === volPct} onPress={() => setVolPct(v)} />
        ))}
      </Row>

      <Row label="INDEX RETURN (ANNUAL)">
        {RETURN_PRESETS.map((r) => (
          <Chip
            key={r}
            label={`${r > 0 ? '+' : ''}${r}%`}
            active={r === returnPct}
            onPress={() => setReturnPct(r)}
          />
        ))}
      </Row>

      <TwoLineChart expected={path} naive={naivePath} />

      <View style={styles.readout}>
        <Stat label="ANNUAL DRAG" value={`−${drag.toFixed(1)}%`} tone={colors.rose} />
        <Stat
          label={`${absLeverage}× NAIVE`}
          value={`${finalNaive >= 0 ? '+' : ''}${finalNaive.toFixed(1)}%`}
          tone={colors.amber}
        />
        <Stat
          label="EXPECTED"
          value={`${finalExpected >= 0 ? '+' : ''}${finalExpected.toFixed(1)}%`}
          tone={colors.accentBright}
        />
      </View>

      <Text style={styles.caveat}>
        Over a year at {volPct}% volatility, the daily reset costs about{' '}
        {Math.abs(cost).toFixed(1)} points against a naive {absLeverage}× return.
        {'\n'}
        This is the average path, not a promise — the order the moves arrive in
        changes the result, which is what makes these funds hard to hold.
      </Text>
    </View>
  );
}

function TwoLineChart({ expected, naive }: { expected: number[]; naive: number[] }) {
  const [width, setWidth] = useState(0);
  const height = 110;

  const paths = useMemo(() => {
    if (width <= 0 || expected.length < 2) return null;

    const all = [...expected, ...naive, 1];
    const min = Math.min(...all);
    const max = Math.max(...all);
    const span = max - min || 1;

    const pad = 6;
    const usableH = height - pad * 2;
    const toY = (v: number) => pad + (1 - (v - min) / span) * usableH;
    const toX = (i: number, n: number) => (i / (n - 1)) * width;

    const build = (values: number[]) => {
      let d = `M${toX(0, values.length)},${toY(values[0])}`;
      for (let i = 1; i < values.length; i += 1) d += ` L${toX(i, values.length)},${toY(values[i])}`;
      return d;
    };

    return { expected: build(expected), naive: build(naive), baseY: toY(1) };
  }, [expected, naive, width]);

  return (
    <View
      style={{ height }}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
    >
      {paths && (
        <Svg width={width} height={height}>
          {/* Break-even. Without it a decaying curve still looks like a gain. */}
          <Line
            x1={0}
            y1={paths.baseY}
            x2={width}
            y2={paths.baseY}
            stroke={colors.borderDefault}
            strokeWidth={1}
          />
          <Path
            d={paths.naive}
            stroke={colors.amber}
            strokeWidth={1.4}
            strokeDasharray="4 3"
            fill="none"
          />
          <Path d={paths.expected} stroke={colors.accentBright} strokeWidth={2} fill="none" />
        </Svg>
      )}
    </View>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.chips}>{children}</View>
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color: tone }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  row: { gap: spacing.xs },
  rowLabel: {
    color: colors.textTertiary,
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 1,
  },
  chips: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  chipActive: { borderColor: colors.accent, backgroundColor: 'rgba(59,130,246,0.15)' },
  chipText: { color: colors.textSecondary, fontFamily: fonts.mono, fontSize: 12 },
  chipTextActive: { color: colors.accentBright },

  readout: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { flex: 1 },
  statLabel: { color: colors.textTertiary, fontFamily: fonts.mono, fontSize: 9, letterSpacing: 0.8 },
  statValue: { fontFamily: fonts.mono, fontSize: 15, fontWeight: '600', marginTop: 2 },

  caveat: { color: colors.textTertiary, fontSize: 11, lineHeight: 16 },
});
