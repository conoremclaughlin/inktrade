import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import {
  computeBollinger,
  computeEMA,
  computeSMA,
  INDICATOR_COLORS,
  type IndicatorId,
  type TickerHistoryPoint,
} from '@inktrade/client';
import { buildCandlestickHtml } from '../charts/candlestickHtml';
import { colors, fonts, formatPrice, spacing } from '../ui/theme';

export type ChartMode = 'candlestick' | 'line';

interface CrosshairBar {
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  value?: number;
}

interface Props {
  points: TickerHistoryPoint[];
  mode: ChartMode;
  indicators: IndicatorId[];
  height?: number;
}

/** lightweight-charts wants `time` as YYYY-MM-DD for daily bars. */
function toChartTime(date: string): string {
  return date.slice(0, 10);
}

function overlaySeries(points: TickerHistoryPoint[], indicators: IndicatorId[]) {
  if (points.length === 0) return [];
  const closes = points.map((p) => p.close);
  const series: { color: string; data: { time: string; value: number }[] }[] = [];

  const push = (values: (number | null)[], color: string) => {
    const data = values
      .map((v, i) => (v === null ? null : { time: toChartTime(points[i].date), value: v }))
      .filter((d): d is { time: string; value: number } => d !== null);
    if (data.length > 0) series.push({ color, data });
  };

  for (const id of indicators) {
    switch (id) {
      case 'sma20': push(computeSMA(closes, 20), INDICATOR_COLORS.sma20); break;
      case 'sma50': push(computeSMA(closes, 50), INDICATOR_COLORS.sma50); break;
      case 'sma200': push(computeSMA(closes, 200), INDICATOR_COLORS.sma200); break;
      case 'ema12': push(computeEMA(closes, 12), INDICATOR_COLORS.ema12); break;
      case 'ema26': push(computeEMA(closes, 26), INDICATOR_COLORS.ema26); break;
      case 'ema50': push(computeEMA(closes, 50), INDICATOR_COLORS.ema50); break;
      case 'bollinger': {
        const { upper, lower } = computeBollinger(closes, 20, 2);
        push(upper, INDICATOR_COLORS.bollinger);
        push(lower, INDICATOR_COLORS.bollinger);
        break;
      }
    }
  }
  return series;
}

/**
 * Candlestick chart rendered by lightweight-charts inside a WebView.
 *
 * This is the one component that isn't native RN: replicating the crosshair,
 * pan/zoom and candle rendering natively is a rewrite in its own right. The
 * OHLC legend below is native, so the parts we can own natively, we do.
 */
export function CandlestickChart({ points, mode, indicators, height = 320 }: Props) {
  const webRef = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<CrosshairBar | null>(null);

  // Built once — data is pushed in afterwards so the library isn't re-parsed.
  const html = useMemo(() => buildCandlestickHtml(), []);

  const payload = useMemo(
    () => ({
      mode,
      candles: points.map((p) => ({
        time: toChartTime(p.date),
        open: p.open,
        high: p.high,
        low: p.low,
        close: p.close,
      })),
      line: points.map((p) => ({ time: toChartTime(p.date), value: p.close })),
      overlays: overlaySeries(points, indicators),
    }),
    [points, mode, indicators],
  );

  const push = useCallback(() => {
    if (points.length === 0) return;
    webRef.current?.injectJavaScript(
      `window.setChartData(${JSON.stringify(payload)}); true;`,
    );
  }, [payload, points.length]);

  // Re-push whenever the data or mode changes, but only once the page is live.
  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data);
        if (msg.type === 'ready') {
          setReady(true);
          setError(null);
          push();
        } else if (msg.type === 'crosshair') {
          setHovered(msg.bar ?? null);
        } else if (msg.type === 'error') {
          setError(String(msg.message));
        }
      } catch {
        /* ignore malformed messages */
      }
    },
    [push],
  );

  // Push on data change once ready.
  const lastPayloadRef = useRef<string>('');
  const serialized = JSON.stringify(payload);
  if (ready && serialized !== lastPayloadRef.current) {
    lastPayloadRef.current = serialized;
    push();
  }

  const last = points[points.length - 1];
  const bar = hovered ?? (last ? { open: last.open, high: last.high, low: last.low, close: last.close } : null);

  return (
    <View style={[styles.container, { height: height + LEGEND_HEIGHT }]}>
      <View style={styles.legend}>
        {bar ? (
          <>
            <Legend label="O" value={bar.open ?? bar.value} />
            <Legend label="H" value={bar.high} />
            <Legend label="L" value={bar.low} />
            <Legend label="C" value={bar.close ?? bar.value} />
          </>
        ) : (
          <Text style={styles.legendMuted}>—</Text>
        )}
      </View>

      <View style={{ height }}>
        <WebView
          ref={webRef}
          source={{ html }}
          originWhitelist={['*']}
          onMessage={onMessage}
          javaScriptEnabled
          scrollEnabled={false}
          // The chart owns horizontal panning; let it win over the ScrollView.
          nestedScrollEnabled={false}
          style={styles.web}
        />
        {!ready && !error && (
          <View style={styles.overlay}>
            <ActivityIndicator color={colors.accent} />
          </View>
        )}
        {error && (
          <View style={styles.overlay}>
            <Text style={styles.error}>Chart failed to load</Text>
            <Text style={styles.errorDetail}>{error}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const LEGEND_HEIGHT = 26;

function Legend({ label, value }: { label: string; value?: number }) {
  if (value === undefined) return null;
  return (
    <Text style={styles.legendItem}>
      <Text style={styles.legendLabel}>{label} </Text>
      {formatPrice(value)}
    </Text>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%' },
  web: { flex: 1, backgroundColor: colors.void },
  legend: {
    height: LEGEND_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
  },
  legendItem: { color: colors.textPrimary, fontFamily: fonts.mono, fontSize: 11 },
  legendLabel: { color: colors.textMuted },
  legendMuted: { color: colors.textMuted, fontFamily: fonts.mono, fontSize: 11 },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.void,
    gap: spacing.sm,
  },
  error: { color: colors.rose, fontSize: 13, fontWeight: '600' },
  errorDetail: {
    color: colors.textTertiary,
    fontSize: 10,
    fontFamily: fonts.mono,
    paddingHorizontal: spacing.lg,
    textAlign: 'center',
  },
});
