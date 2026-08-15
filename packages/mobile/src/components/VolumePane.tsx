import { useMemo } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import type { TickerHistoryPoint } from '@inktrade/client';
import { colors, fonts, formatCompact, spacing } from '../ui/theme';

/**
 * Volume, below price.
 *
 * Its own pane because share counts and dollar prices share no axis — a
 * 40-million-share day plotted against a $300 stock either flattens the price
 * line or disappears entirely.
 *
 * Bars take the colour of their day's direction, which is the whole reason to
 * look: volume alone says "a lot happened", volume plus direction says what.
 */
export function VolumePane({
  points,
  height = 64,
}: {
  points: TickerHistoryPoint[];
  height?: number;
}) {
  const { width: screenWidth } = useWindowDimensions();
  const width = screenWidth - spacing.lg * 2;

  const max = useMemo(
    () => Math.max(...points.map((p) => p.volume), 0),
    [points],
  );

  // Some sources omit volume entirely. An empty pane says nothing useful, and
  // a flat line at zero would imply nothing traded.
  if (points.length === 0 || max <= 0) return null;

  const step = width / points.length;
  const barWidth = Math.max(step * 0.72, 0.6);
  const last = points[points.length - 1];

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.label}>VOLUME</Text>
        <Text style={styles.readout}>
          {formatCompact(last.volume)}
          <Text style={styles.muted}> · avg {formatCompact(average(points))}</Text>
        </Text>
      </View>

      <Svg width={width} height={height}>
        {points.map((p, i) => {
          const h = Math.max((p.volume / max) * height, 0.5);
          const up = p.close >= p.open;
          return (
            <Rect
              key={p.date}
              x={i * step}
              y={height - h}
              width={barWidth}
              height={h}
              fill={up ? colors.emerald : colors.rose}
              opacity={0.55}
            />
          );
        })}
      </Svg>
    </View>
  );
}

function average(points: TickerHistoryPoint[]): number {
  return points.reduce((sum, p) => sum + p.volume, 0) / points.length;
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
  muted: { color: colors.textMuted },
});
