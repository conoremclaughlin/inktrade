import { useMemo } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Line, Path, Rect } from 'react-native-svg';
import {
  computeMACD,
  computeRSI,
  OSCILLATOR_LABELS,
  RSI_OVERBOUGHT,
  RSI_OVERSOLD,
  type OscillatorId,
  type TickerHistoryPoint,
} from '@inktrade/client';
import { colors, fonts, spacing } from '../ui/theme';

/**
 * RSI and MACD, in their own pane below price.
 *
 * Oscillators can't share the price axis — RSI runs 0–100 and MACD oscillates
 * around zero, so overlaying either on a $300 stock would flatten it into the
 * axis. Their own pane is what makes them readable, and it's why the shared
 * indicator module separates OscillatorId from IndicatorId.
 *
 * Drawn natively rather than in the chart WebView: these are a polyline and a
 * histogram, which react-native-svg does directly. The WebView exists for the
 * crosshair and pan/zoom the candlesticks need, and nothing here needs those.
 *
 * The maths is shared with web and was checked against Robinhood's own
 * published values — see the live indicator test in the engine.
 */
export function OscillatorPane({
  points,
  oscillator,
  height = 110,
}: {
  points: TickerHistoryPoint[];
  oscillator: OscillatorId;
  height?: number;
}) {
  const { width: screenWidth } = useWindowDimensions();
  const width = screenWidth - spacing.lg * 2;

  const closes = useMemo(() => points.map((p) => p.close), [points]);
  const rsi = useMemo(() => (oscillator === 'rsi' ? computeRSI(closes) : null), [closes, oscillator]);
  const macd = useMemo(
    () => (oscillator === 'macd' ? computeMACD(closes) : null),
    [closes, oscillator],
  );

  if (points.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.label}>{OSCILLATOR_LABELS[oscillator]}</Text>
        {oscillator === 'rsi' && <RsiReadout value={lastDefined(rsi)} />}
        {oscillator === 'macd' && <MacdReadout macd={macd} />}
      </View>

      <Svg width={width} height={height}>
        {oscillator === 'rsi' && rsi && <RsiPlot values={rsi} width={width} height={height} />}
        {oscillator === 'macd' && macd && <MacdPlot macd={macd} width={width} height={height} />}
      </Svg>
    </View>
  );
}

function RsiPlot({
  values,
  width,
  height,
}: {
  values: (number | null)[];
  width: number;
  height: number;
}) {
  // Fixed 0–100 scale. Auto-scaling RSI would make 45 look like an extreme on
  // a quiet stock, which is the opposite of what the indicator is for.
  const y = (v: number) => height - (v / 100) * height;

  return (
    <>
      {[RSI_OVERSOLD, 50, RSI_OVERBOUGHT].map((level) => (
        <Line
          key={level}
          x1={0}
          x2={width}
          y1={y(level)}
          y2={y(level)}
          stroke={level === 50 ? colors.borderSubtle : colors.borderDefault}
          strokeWidth={1}
          strokeDasharray={level === 50 ? undefined : '3,3'}
        />
      ))}
      <Path
        d={linePath(values, width, height, (v) => y(v))}
        stroke={colors.violet}
        strokeWidth={1.6}
        fill="none"
      />
    </>
  );
}

function MacdPlot({
  macd,
  width,
  height,
}: {
  macd: { macd: (number | null)[]; signal: (number | null)[]; histogram: (number | null)[] };
  width: number;
  height: number;
}) {
  // One scale across all three series, centred on zero — the crossover and the
  // histogram only mean anything relative to each other.
  const all = [...macd.macd, ...macd.signal, ...macd.histogram].filter(
    (v): v is number => v !== null,
  );
  const extent = Math.max(...all.map(Math.abs), 1e-9);
  const y = (v: number) => height / 2 - (v / extent) * (height / 2 - 2);

  const step = width / Math.max(macd.macd.length - 1, 1);
  const barWidth = Math.max(step * 0.7, 0.7);

  return (
    <>
      <Line
        x1={0}
        x2={width}
        y1={height / 2}
        y2={height / 2}
        stroke={colors.borderDefault}
        strokeWidth={1}
      />
      {macd.histogram.map((v, i) =>
        v === null ? null : (
          <Rect
            key={i}
            x={i * step - barWidth / 2}
            y={Math.min(y(v), height / 2)}
            width={barWidth}
            height={Math.max(Math.abs(y(v) - height / 2), 0.5)}
            fill={v >= 0 ? colors.emerald : colors.rose}
            opacity={0.5}
          />
        ),
      )}
      <Path
        d={linePath(macd.macd, width, height, y)}
        stroke={colors.accentBright}
        strokeWidth={1.6}
        fill="none"
      />
      <Path
        d={linePath(macd.signal, width, height, y)}
        stroke={colors.amber}
        strokeWidth={1.4}
        fill="none"
      />
    </>
  );
}

/**
 * A path that breaks at gaps rather than bridging them.
 *
 * Every one of these series has a warm-up of nulls at the front, and joining
 * across a null would draw a line from the first defined value back to the
 * origin — a dive that never happened.
 */
function linePath(
  values: (number | null)[],
  width: number,
  height: number,
  y: (v: number) => number,
): string {
  const step = width / Math.max(values.length - 1, 1);
  let d = '';
  let pen = false;

  values.forEach((v, i) => {
    if (v === null) {
      pen = false;
      return;
    }
    const command = pen ? 'L' : 'M';
    d += `${command}${(i * step).toFixed(2)} ${y(v).toFixed(2)} `;
    pen = true;
  });

  return d.trim();
}

function RsiReadout({ value }: { value: number | null }) {
  if (value === null) return <Text style={styles.readout}>—</Text>;

  const tone =
    value <= RSI_OVERSOLD ? colors.emerald : value >= RSI_OVERBOUGHT ? colors.rose : colors.textSecondary;
  const note = value <= RSI_OVERSOLD ? ' oversold' : value >= RSI_OVERBOUGHT ? ' overbought' : '';

  return (
    <Text style={[styles.readout, { color: tone }]}>
      {value.toFixed(1)}
      {note}
    </Text>
  );
}

function MacdReadout({
  macd,
}: {
  macd: { macd: (number | null)[]; signal: (number | null)[] } | null;
}) {
  const line = lastDefined(macd?.macd ?? null);
  const signal = lastDefined(macd?.signal ?? null);
  if (line === null || signal === null) return <Text style={styles.readout}>—</Text>;

  const above = line >= signal;
  return (
    <Text style={[styles.readout, { color: above ? colors.emerald : colors.rose }]}>
      {line.toFixed(2)} / {signal.toFixed(2)}
      {above ? ' bullish' : ' bearish'}
    </Text>
  );
}

function lastDefined(values: (number | null)[] | null): number | null {
  if (!values) return null;
  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (values[i] !== null) return values[i];
  }
  return null;
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  label: {
    color: colors.textTertiary,
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.2,
  },
  readout: { color: colors.textSecondary, fontFamily: fonts.mono, fontSize: 11 },
});
