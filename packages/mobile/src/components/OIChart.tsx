import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg';
import type { OIStrike } from '@inktrade/client';
import { colors, fonts, formatCompact, spacing } from '../ui/theme';

interface Props {
  strikes: OIStrike[];
  underlyingPrice: number;
  maxPain: number;
  width: number;
  height?: number;
  metric?: 'oi' | 'volume';
}

const PADDING = { top: 12, right: 8, bottom: 20, left: 34 };

/**
 * Open interest by strike, calls above the axis and puts below.
 *
 * Native react-native-svg rather than a WebView: it's a static bar chart with
 * no crosshair or pan, so there's nothing the DOM version does that we'd lose,
 * and it scrolls inside the page without gesture conflicts.
 */
export function OIChart({
  strikes,
  underlyingPrice,
  maxPain,
  width,
  height = 220,
  metric = 'oi',
}: Props) {
  const { bars, maxValue, plotW, plotH, xFor } = useMemo(() => {
    const plotW = Math.max(0, width - PADDING.left - PADDING.right);
    const plotH = Math.max(0, height - PADDING.top - PADDING.bottom);

    const value = (s: OIStrike) =>
      metric === 'oi'
        ? { call: s.callOI, put: s.putOI }
        : { call: s.callVolume, put: s.putVolume };

    const maxValue = strikes.reduce((m, s) => {
      const v = value(s);
      return Math.max(m, v.call, v.put);
    }, 0);

    const barW = strikes.length > 0 ? plotW / strikes.length : 0;
    const bars = strikes.map((s, i) => ({
      strike: s.strike,
      x: i * barW,
      w: Math.max(1, barW - 1),
      ...value(s),
    }));

    // Strikes are evenly spaced by index, not by price — matching the web
    // chart, since strike spacing is irregular and index spacing reads better.
    const xFor = (strike: number) => {
      const i = strikes.findIndex((s) => s.strike >= strike);
      if (i < 0) return plotW;
      return i * barW + barW / 2;
    };

    return { bars, maxValue, plotW, plotH, xFor };
  }, [strikes, width, height, metric]);

  if (strikes.length === 0 || plotW <= 0) {
    return (
      <View style={[styles.empty, { height }]}>
        <Text style={styles.emptyText}>No options data</Text>
      </View>
    );
  }

  const midY = plotH / 2;
  const scale = maxValue > 0 ? midY / maxValue : 0;

  return (
    <View>
      <Svg width={width} height={height}>
        <G x={PADDING.left} y={PADDING.top}>
          {/* Zero axis */}
          <Line x1={0} y1={midY} x2={plotW} y2={midY} stroke={colors.borderDefault} strokeWidth={1} />

          {/* Gridlines at half scale */}
          <Line x1={0} y1={midY / 2} x2={plotW} y2={midY / 2} stroke={colors.borderSubtle} strokeWidth={0.5} />
          <Line x1={0} y1={midY * 1.5} x2={plotW} y2={midY * 1.5} stroke={colors.borderSubtle} strokeWidth={0.5} />

          {bars.map((b) => (
            <G key={b.strike}>
              {/* Calls above the axis */}
              <Rect
                x={b.x}
                y={midY - b.call * scale}
                width={b.w}
                height={Math.max(0, b.call * scale)}
                fill={colors.emerald}
                opacity={0.75}
              />
              {/* Puts below */}
              <Rect
                x={b.x}
                y={midY}
                width={b.w}
                height={Math.max(0, b.put * scale)}
                fill={colors.rose}
                opacity={0.75}
              />
            </G>
          ))}

          {/* Max pain and spot markers */}
          <Line
            x1={xFor(maxPain)}
            y1={0}
            x2={xFor(maxPain)}
            y2={plotH}
            stroke={colors.amber}
            strokeWidth={1}
            strokeDasharray="3,3"
          />
          <Line
            x1={xFor(underlyingPrice)}
            y1={0}
            x2={xFor(underlyingPrice)}
            y2={plotH}
            stroke={colors.accentBright}
            strokeWidth={1}
          />

          {/* Y labels */}
          <SvgText x={-6} y={4} fill={colors.textMuted} fontSize={9} textAnchor="end">
            {formatCompact(maxValue)}
          </SvgText>
          <SvgText x={-6} y={midY + 4} fill={colors.textMuted} fontSize={9} textAnchor="end">
            0
          </SvgText>
          <SvgText x={-6} y={plotH + 2} fill={colors.textMuted} fontSize={9} textAnchor="end">
            {formatCompact(maxValue)}
          </SvgText>

          {/* X labels — first, middle, last only; more than that is unreadable on a phone */}
          {[0, Math.floor(bars.length / 2), bars.length - 1].map((i, n) => (
            <SvgText
              key={`${i}-${n}`}
              x={bars[i].x + bars[i].w / 2}
              y={plotH + 14}
              fill={colors.textMuted}
              fontSize={9}
              textAnchor="middle"
            >
              {`$${Math.round(bars[i].strike)}`}
            </SvgText>
          ))}
        </G>
      </Svg>

      <View style={styles.legend}>
        <LegendDot color={colors.emerald} label="Calls" />
        <LegendDot color={colors.rose} label="Puts" />
        <LegendDot color={colors.amber} label="Max pain" />
        <LegendDot color={colors.accentBright} label="Spot" />
      </View>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: colors.textMuted, fontSize: 12 },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 7, height: 7, borderRadius: 2 },
  legendLabel: { color: colors.textTertiary, fontSize: 10, fontFamily: fonts.mono },
});
