import { useCallback, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import type { PortfolioPoint } from '@inktrade/client';
import { colors } from '../ui/theme';

/** Radius of the largest marker drawn — the scrub halo. Drives the canvas inset. */
const DOT_MAX_R = 8;

interface Props {
  points: PortfolioPoint[];
  height?: number;
  /** Fires with the scrubbed point, or null when the finger lifts. */
  onScrub?: (point: PortfolioPoint | null) => void;
  /**
   * The series is illustrative, not this account's history.
   *
   * Drawn in a neutral colour rather than green or red, because a rising green
   * curve under a red daily loss reads as a contradiction — and worse, as a
   * gain the account did not make. Shape and interaction survive; the claim
   * about direction does not.
   */
  placeholder?: boolean;
}

/**
 * The portfolio value curve.
 *
 * Native react-native-svg rather than a WebView — it's a single series with
 * one gesture, so there's nothing the DOM version would do better, and keeping
 * it native means the scrub gesture doesn't fight the page scroll.
 *
 * Scrubbing drives the header value in the parent rather than drawing a
 * tooltip here: the number you're reading should be in the same place whether
 * or not you're touching the chart.
 */
export function PortfolioChart({ points, height = 160, onScrub, placeholder }: Props) {
  const [width, setWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
  }, []);

  const { linePath, areaPath, xs, ys, rising } = useMemo(() => {
    if (points.length < 2 || width <= 0) {
      return { linePath: '', areaPath: '', xs: [] as number[], ys: [] as number[], rising: true };
    }

    const values = points.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    // A flat series would divide by zero; give it a nominal band so the line
    // renders through the middle instead of collapsing to the top edge.
    const span = max - min || Math.max(1, max * 0.01);

    // The line and fill run edge to edge — insetting them horizontally leaves a
    // hard vertical seam where the fill stops short of the screen. Markers are
    // clamped inward at draw time instead, so the endpoint dot stays whole.
    const padY = DOT_MAX_R + 2;
    const usableH = height - padY * 2;

    const xs = points.map((_, i) => (i / (points.length - 1)) * width);
    const ys = values.map((v) => padY + (1 - (v - min) / span) * usableH);

    let line = `M${xs[0]},${ys[0]}`;
    for (let i = 1; i < xs.length; i++) line += ` L${xs[i]},${ys[i]}`;

    const area = `${line} L${xs[xs.length - 1]},${height} L${xs[0]},${height} Z`;

    return {
      linePath: line,
      areaPath: area,
      xs,
      ys,
      rising: values[values.length - 1] >= values[0],
    };
  }, [points, width, height]);

  const stroke = placeholder ? colors.textMuted : rising ? colors.emerald : colors.rose;

  // Held in a ref so the responder callbacks don't need re-creating on every
  // scrub frame — that would tear down the gesture mid-drag.
  const geom = useRef({ xs, width });
  geom.current = { xs, width };

  const emit = useCallback(
    (index: number | null) => {
      setActiveIndex(index);
      onScrub?.(index === null ? null : points[index]);
    },
    [onScrub, points],
  );

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        // Claim the gesture so a horizontal drag scrubs instead of scrolling
        // the page underneath.
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
    const { xs: currentXs } = geom.current;
    if (currentXs.length === 0) return;

    // Nearest by distance rather than a proportional guess — the plotted xs are
    // inset from the canvas edges, so proportion would drift near the ends.
    let nearest = 0;
    let best = Infinity;
    for (let i = 0; i < currentXs.length; i++) {
      const d = Math.abs(currentXs[i] - x);
      if (d < best) {
        best = d;
        nearest = i;
      }
    }
    emit(nearest);
  }

  /** Keep a marker fully on canvas even when its point sits on the edge. */
  const dotX = (x: number) => Math.max(DOT_MAX_R, Math.min(width - DOT_MAX_R, x));

  const lastX = xs.length ? dotX(xs[xs.length - 1]) : 0;
  const lastY = ys.length ? ys[ys.length - 1] : 0;

  return (
    <View style={{ height }} onLayout={onLayout} {...responder.panHandlers}>
      {width > 0 && points.length >= 2 && (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="pfFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={stroke} stopOpacity="0.26" />
              <Stop offset="1" stopColor={stroke} stopOpacity="0" />
            </LinearGradient>
          </Defs>

          <Path d={areaPath} fill="url(#pfFill)" />
          <Path d={linePath} stroke={stroke} strokeWidth={1.8} fill="none" strokeLinejoin="round" />

          {activeIndex === null ? (
            <Circle cx={lastX} cy={lastY} r={3} fill={stroke} />
          ) : (
            <>
              <Line
                x1={xs[activeIndex]}
                y1={0}
                x2={xs[activeIndex]}
                y2={height}
                stroke={colors.borderBright}
                strokeWidth={1}
              />
              <Circle cx={dotX(xs[activeIndex])} cy={ys[activeIndex]} r={4} fill={stroke} />
              <Circle
                cx={dotX(xs[activeIndex])}
                cy={ys[activeIndex]}
                r={DOT_MAX_R}
                fill={stroke}
                fillOpacity={0.18}
              />
            </>
          )}
        </Svg>
      )}
    </View>
  );
}

export const chartStyles = StyleSheet.create({});
