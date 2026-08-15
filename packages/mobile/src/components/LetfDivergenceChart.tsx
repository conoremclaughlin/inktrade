import { useCallback, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import type { LetfHistoryPointWire } from '@inktrade/client';
import { colors, fonts, spacing } from '../ui/theme';

/*
 * Actual against promised.
 *
 * Three cumulative-return series on one scale: what the fund did, what its
 * index did, and what `N x index` would have paid with no daily reset. The gap
 * between the first and the last is the entire subject of this screen, so they
 * share a y-axis even when the naive line runs off into a number the fund never
 * came close to — compressing the others is not a flaw in the drawing, it is
 * the size of the claim.
 */

const PAD_Y = 10;
const DOT_R = 8;

export interface DivergenceScrub {
  point: LetfHistoryPointWire;
  index: number;
}

interface Props {
  points: LetfHistoryPointWire[];
  leverageFactor: number;
  height?: number;
  onScrub?: (scrub: DivergenceScrub | null) => void;
}

export function LetfDivergenceChart({ points, leverageFactor, height = 190, onScrub }: Props) {
  const [width, setWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
  }, []);

  const geometry = useMemo(() => {
    if (points.length < 2 || width <= 0) return null;

    const series = {
      letf: points.map((p) => p.letfCumReturn),
      naive: points.map((p) => p.naiveCumReturn),
      underlying: points.map((p) => p.underlyingCumReturn),
    };

    const all = [...series.letf, ...series.naive, ...series.underlying];
    let min = Math.min(...all);
    let max = Math.max(...all);
    // Zero has to be on the canvas: these are returns, and a chart that starts
    // at +40% because nothing dipped hides whether the position was ever under
    // water.
    min = Math.min(min, 0);
    max = Math.max(max, 0);
    const span = max - min || 1;

    const usableH = height - PAD_Y * 2;
    const xs = points.map((_, i) => (i / (points.length - 1)) * width);
    const toY = (v: number) => PAD_Y + (1 - (v - min) / span) * usableH;

    const path = (values: number[]) => {
      let d = `M${xs[0]},${toY(values[0])}`;
      for (let i = 1; i < values.length; i += 1) d += ` L${xs[i]},${toY(values[i])}`;
      return d;
    };

    return {
      xs,
      toY,
      zeroY: toY(0),
      letfPath: path(series.letf),
      naivePath: path(series.naive),
      underlyingPath: path(series.underlying),
      series,
    };
  }, [points, width, height]);

  const geom = useRef<{ xs: number[] }>({ xs: [] });
  geom.current = { xs: geometry?.xs ?? [] };

  const emit = useCallback(
    (index: number | null) => {
      setActiveIndex(index);
      onScrub?.(index === null ? null : { point: points[index], index });
    },
    [onScrub, points],
  );

  const responder = useMemo(
    () =>
      PanResponder.create({
        /*
         * Claim horizontal drags only.
         *
         * Claiming on touch-down — or on any movement — makes the chart a dead
         * zone for the page scroll, and this screen is several times taller
         * than the viewport. A finger dragged upward over the chart simply
         * stopped working, which reads as the app freezing rather than as a
         * gesture going to the wrong handler.
         *
         * The cost is that scrubbing starts on movement rather than on touch,
         * so a tap alone no longer places the crosshair. On a page you have to
         * scroll through to reach anything, that's the right way round.
         */
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_e, g) =>
          Math.abs(g.dx) > Math.abs(g.dy) && Math.abs(g.dx) > 4,
        // Once scrubbing, don't hand the gesture back mid-drag.
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => locate(e.nativeEvent.locationX),
        onPanResponderMove: (e) => locate(e.nativeEvent.locationX),
        onPanResponderRelease: () => emit(null),
        onPanResponderTerminate: () => emit(null),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [emit],
  );

  function locate(x: number) {
    const { xs } = geom.current;
    if (xs.length === 0) return;
    let nearest = 0;
    let best = Infinity;
    for (let i = 0; i < xs.length; i += 1) {
      const d = Math.abs(xs[i] - x);
      if (d < best) {
        best = d;
        nearest = i;
      }
    }
    emit(nearest);
  }

  const naiveLabel = `${Math.abs(leverageFactor)}× naive`;

  return (
    <View>
      <View style={{ height }} onLayout={onLayout} {...responder.panHandlers}>
        {geometry && (
          <Svg width={width} height={height}>
            <Line
              x1={0}
              y1={geometry.zeroY}
              x2={width}
              y2={geometry.zeroY}
              stroke={colors.borderDefault}
              strokeWidth={1}
            />

            {/*
              Naive first so the fund's own line draws over it. When they
              overlap — a short window, or a smooth trend — the one that
              matters should be the one you can see.
            */}
            <Path
              d={geometry.naivePath}
              stroke={colors.amber}
              strokeWidth={1.4}
              strokeDasharray="4 3"
              fill="none"
            />
            <Path
              d={geometry.underlyingPath}
              stroke={colors.textTertiary}
              strokeWidth={1.2}
              fill="none"
            />
            <Path
              d={geometry.letfPath}
              stroke={colors.accentBright}
              strokeWidth={2}
              fill="none"
              strokeLinejoin="round"
            />

            {activeIndex !== null && (
              <>
                <Line
                  x1={geometry.xs[activeIndex]}
                  y1={0}
                  x2={geometry.xs[activeIndex]}
                  y2={height}
                  stroke={colors.borderBright}
                  strokeWidth={1}
                />
                <Circle
                  cx={clamp(geometry.xs[activeIndex], width)}
                  cy={geometry.toY(geometry.series.letf[activeIndex])}
                  r={4}
                  fill={colors.accentBright}
                />
                <Circle
                  cx={clamp(geometry.xs[activeIndex], width)}
                  cy={geometry.toY(geometry.series.naive[activeIndex])}
                  r={3}
                  fill={colors.amber}
                />
              </>
            )}
          </Svg>
        )}
      </View>

      <View style={styles.legend}>
        <LegendKey color={colors.accentBright} label="Fund" />
        <LegendKey color={colors.amber} label={naiveLabel} dashed />
        <LegendKey color={colors.textTertiary} label="Index" />
      </View>
    </View>
  );
}

function clamp(x: number, width: number): number {
  return Math.max(DOT_R, Math.min(width - DOT_R, x));
}

function LegendKey({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <View style={styles.legendKey}>
      <View
        style={[
          styles.swatch,
          { backgroundColor: color },
          dashed ? styles.swatchDashed : null,
        ]}
      />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: {
    flexDirection: 'row',
    gap: spacing.lg,
    paddingTop: spacing.sm,
  },
  legendKey: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  swatch: { width: 14, height: 2, borderRadius: 1 },
  // A dashed swatch can't be drawn with a border, so it's approximated by
  // shortening and fading — enough to read as "the modelled one".
  swatchDashed: { width: 10, opacity: 0.85 },
  legendText: { color: colors.textTertiary, fontFamily: fonts.mono, fontSize: 10 },
});
