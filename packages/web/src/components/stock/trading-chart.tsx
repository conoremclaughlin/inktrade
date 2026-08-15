'use client';

import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type LineData,
  type HistogramData,
  type Time,
  ColorType,
  CrosshairMode,
  LineStyle,
  type MouseEventParams,
} from 'lightweight-charts';
import {
  computeBollinger,
  computeEMA,
  computeSMA,
  INDICATOR_COLORS,
  INDICATOR_LABELS,
  type IndicatorId,
} from '@inktrade/client';
import type { TickerHistoryPoint, TickerHistoryResponse } from '@/lib/hooks';

type ChartMode = 'candlestick' | 'line';

/**
 * Indicators offered on the chart.
 *
 * The maths, colours and labels all come from @inktrade/client. This file used
 * to carry its own copies of computeSMA/EMA/Bollinger alongside its own colour
 * and label maps — they happened to agree with the shared ones to the last
 * decimal on 254 bars of AAPL, which is exactly why the duplication was
 * dangerous rather than obviously broken: nothing would have flagged the day
 * they stopped agreeing, and the two platforms would quietly draw different
 * lines from the same data.
 */
const CHART_INDICATORS: IndicatorId[] = [
  'sma20',
  'sma50',
  'sma200',
  'ema12',
  'ema26',
  'ema50',
  'bollinger',
];

/*
 * VWAP is deliberately absent.
 *
 * It is session-anchored by definition, and these are DAILY bars — so every
 * bar is its own session and the reset makes it degenerate. Measured on 254
 * bars of AAPL, the result equals (high + low + close) / 3 to within 6e-14:
 * not VWAP at all, just smoothed price wearing its name.
 *
 * A trader reading "VWAP" expects the volume-weighted average of the session
 * and will size a trade against it. Drawing typical price under that label is
 * worse than offering nothing. It comes back when intraday bars do.
 */

interface TradingChartProps {
  data: TickerHistoryResponse;
  symbol: string;
  height?: number;
}

export function TradingChart({ data, symbol, height = 500 }: TradingChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<'Candlestick'> | ISeriesApi<'Line'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const indicatorSeriesRefs = useRef<Map<string, any>>(new Map());

  const [mode, setMode] = useState<ChartMode>('candlestick');
  const [activeIndicators, setActiveIndicators] = useState<Set<IndicatorId>>(new Set(['sma20', 'sma50']));
  const [crosshairData, setCrosshairData] = useState<{
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    change: number;
    changePct: number;
  } | null>(null);

  const pointMap = useMemo(() => {
    const map = new Map<string, TickerHistoryPoint>();
    data.points.forEach((p) => map.set(p.date, p));
    return map;
  }, [data.points]);

  const isPositive = data.totalReturn >= 0;

  const buildChart = useCallback(() => {
    if (!containerRef.current) return;

    // Clean up existing
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      mainSeriesRef.current = null;
      volumeSeriesRef.current = null;
      indicatorSeriesRefs.current.clear();
    }

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: 'rgba(139, 148, 168, 0.8)',
        fontFamily: 'var(--font-mono), ui-monospace, monospace',
        fontSize: 11,
        // Off for the same reason mobile turns it off: it sits over the price
        // data and implies TradingView is the source, which they aren't — this
        // is their rendering library drawing our brokerage's data. Credit for
        // lightweight-charts belongs in NOTICE, not on top of a candle.
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: 'rgba(42, 46, 57, 0.4)', style: LineStyle.Dotted },
        horzLines: { color: 'rgba(42, 46, 57, 0.4)', style: LineStyle.Dotted },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: 'rgba(139, 148, 168, 0.3)',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: 'rgba(15, 22, 41, 0.9)',
        },
        horzLine: {
          color: 'rgba(139, 148, 168, 0.3)',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: 'rgba(15, 22, 41, 0.9)',
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(42, 46, 57, 0.4)',
        scaleMargins: { top: 0.1, bottom: 0.25 },
      },
      timeScale: {
        borderColor: 'rgba(42, 46, 57, 0.4)',
        timeVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      handleScroll: { vertTouchDrag: false },
    });

    chartRef.current = chart;

    // Main series
    if (mode === 'candlestick') {
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#10b981',
        downColor: '#f43f5e',
        borderUpColor: '#10b981',
        borderDownColor: '#f43f5e',
        wickUpColor: '#10b981',
        wickDownColor: '#f43f5e',
      });

      const candleData: CandlestickData[] = data.points.map((p) => ({
        time: p.date as Time,
        open: p.open,
        high: p.high,
        low: p.low,
        close: p.close,
      }));

      candleSeries.setData(candleData);
      mainSeriesRef.current = candleSeries;
    } else {
      const lineSeries = chart.addSeries(LineSeries, {
        color: isPositive ? '#10b981' : '#f43f5e',
        lineWidth: 2,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
        crosshairMarkerBackgroundColor: isPositive ? '#10b981' : '#f43f5e',
        lastValueVisible: true,
        priceLineVisible: true,
      });

      const lineData: LineData[] = data.points.map((p) => ({
        time: p.date as Time,
        value: p.close,
      }));

      lineSeries.setData(lineData);
      mainSeriesRef.current = lineSeries;
    }

    // Volume
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    const volumeData: HistogramData[] = data.points.map((p, i) => {
      const prevClose = i > 0 ? data.points[i - 1].close : p.open;
      return {
        time: p.date as Time,
        value: p.volume,
        color: p.close >= prevClose ? 'rgba(16, 185, 129, 0.25)' : 'rgba(244, 63, 94, 0.25)',
      };
    });

    volumeSeries.setData(volumeData);
    volumeSeriesRef.current = volumeSeries;

    // Indicators
    addIndicators(chart, data.points, activeIndicators);

    // Crosshair handler
    chart.subscribeCrosshairMove((param: MouseEventParams) => {
      if (!param.time || !param.seriesData) {
        setCrosshairData(null);
        return;
      }

      const timeStr = param.time as string;
      const point = pointMap.get(timeStr);
      if (!point) {
        setCrosshairData(null);
        return;
      }

      const idx = data.points.indexOf(point);
      const prevClose = idx > 0 ? data.points[idx - 1].close : point.open;
      const change = point.close - prevClose;
      const changePct = (change / prevClose) * 100;

      setCrosshairData({
        time: timeStr,
        open: point.open,
        high: point.high,
        low: point.low,
        close: point.close,
        volume: point.volume,
        change,
        changePct,
      });
    });

    chart.timeScale().fitContent();
  }, [data.points, mode, activeIndicators, height, isPositive, pointMap]);

  function addIndicators(
    chart: IChartApi,
    points: TickerHistoryPoint[],
    indicators: Set<IndicatorId>,
  ) {
    indicatorSeriesRefs.current.clear();

    const closes = points.map((p) => p.close);

    indicators.forEach((ind) => {
      let values: (number | null)[] = [];
      let extraSeries: { key: string; values: (number | null)[]; color: string; dashed?: boolean }[] = [];

      switch (ind) {
        case 'sma20':
          values = computeSMA(closes, 20);
          break;
        case 'sma50':
          values = computeSMA(closes, 50);
          break;
        case 'sma200':
          values = computeSMA(closes, 200);
          break;
        case 'ema12':
          values = computeEMA(closes, 12);
          break;
        case 'ema26':
          values = computeEMA(closes, 26);
          break;
        case 'ema50':
          values = computeEMA(closes, 50);
          break;
        case 'bollinger': {
          const bb = computeBollinger(closes);
          values = bb.middle;
          extraSeries = [
            { key: 'bollinger_upper', values: bb.upper, color: INDICATOR_COLORS.bollinger, dashed: true },
            { key: 'bollinger_lower', values: bb.lower, color: INDICATOR_COLORS.bollinger, dashed: true },
          ];
          break;
        }
      }

      const lineData: LineData[] = [];
      for (let i = 0; i < points.length; i++) {
        if (values[i] !== null) {
          lineData.push({ time: points[i].date as Time, value: values[i]! });
        }
      }

      if (lineData.length > 0) {
        const series = chart.addSeries(LineSeries, {
          color: INDICATOR_COLORS[ind],
          lineWidth: 1,
          crosshairMarkerVisible: false,
          lastValueVisible: false,
          priceLineVisible: false,
        });
        series.setData(lineData);
        indicatorSeriesRefs.current.set(ind, series);
      }

      for (const extra of extraSeries) {
        const extraData: LineData[] = [];
        for (let i = 0; i < points.length; i++) {
          if (extra.values[i] !== null) {
            extraData.push({ time: points[i].date as Time, value: extra.values[i]! });
          }
        }
        if (extraData.length > 0) {
          const series = chart.addSeries(LineSeries, {
            color: extra.color,
            lineWidth: 1,
            lineStyle: extra.dashed ? LineStyle.Dashed : LineStyle.Solid,
            crosshairMarkerVisible: false,
            lastValueVisible: false,
            priceLineVisible: false,
          });
          series.setData(extraData);
          indicatorSeriesRefs.current.set(extra.key, series);
        }
      }
    });
  }

  useEffect(() => {
    buildChart();
  }, [buildChart]);

  // Resize observer
  useEffect(() => {
    if (!containerRef.current || !chartRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry && chartRef.current) {
        chartRef.current.applyOptions({ width: entry.contentRect.width });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [buildChart]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, []);

  const toggleIndicator = (ind: IndicatorId) => {
    setActiveIndicators((prev) => {
      const next = new Set(prev);
      if (next.has(ind)) next.delete(ind);
      else next.add(ind);
      return next;
    });
  };

  const lastPoint = data.points[data.points.length - 1];
  const displayData = crosshairData ?? {
    time: lastPoint?.date ?? '',
    open: lastPoint?.open ?? 0,
    high: lastPoint?.high ?? 0,
    low: lastPoint?.low ?? 0,
    close: lastPoint?.close ?? 0,
    volume: lastPoint?.volume ?? 0,
    change: data.points.length > 1
      ? lastPoint.close - data.points[data.points.length - 2].close
      : 0,
    changePct: data.points.length > 1
      ? ((lastPoint.close - data.points[data.points.length - 2].close) / data.points[data.points.length - 2].close) * 100
      : 0,
  };

  function formatVol(n: number): string {
    if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
    return String(n);
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        {/* Mode toggle */}
        <div className="flex items-center gap-1 glass rounded-lg p-0.5">
          <button
            onClick={() => setMode('candlestick')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-medium transition-all ${
              mode === 'candlestick'
                ? 'bg-accent/15 text-accent-bright border border-accent/30'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            Candles
          </button>
          <button
            onClick={() => setMode('line')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-medium transition-all ${
              mode === 'line'
                ? 'bg-accent/15 text-accent-bright border border-accent/30'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            Line
          </button>
        </div>

        {/* Indicators */}
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[10px] text-text-muted mr-1">Indicators:</span>
          {CHART_INDICATORS.map((ind) => (
            <button
              key={ind}
              onClick={() => toggleIndicator(ind)}
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium transition-all border ${
                activeIndicators.has(ind)
                  ? 'border-current opacity-100'
                  : 'border-border-subtle text-text-muted opacity-60 hover:opacity-80'
              }`}
              style={activeIndicators.has(ind) ? { color: INDICATOR_COLORS[ind] } : undefined}
            >
              {INDICATOR_LABELS[ind]}
            </button>
          ))}
        </div>
      </div>

      {/* OHLCV readout */}
      <div className="flex items-center gap-4 mb-2 font-mono text-[11px] flex-wrap min-h-[18px]">
        <span className="text-text-muted">
          {displayData.time ? new Date(displayData.time + 'T00:00:00').toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
          }) : ''}
        </span>
        <span className="text-text-secondary">
          O <span className="text-text-primary">{displayData.open.toFixed(2)}</span>
        </span>
        <span className="text-text-secondary">
          H <span className="text-text-primary">{displayData.high.toFixed(2)}</span>
        </span>
        <span className="text-text-secondary">
          L <span className="text-text-primary">{displayData.low.toFixed(2)}</span>
        </span>
        <span className="text-text-secondary">
          C <span className="text-text-primary">{displayData.close.toFixed(2)}</span>
        </span>
        <span className={displayData.change >= 0 ? 'text-emerald' : 'text-rose'}>
          {displayData.change >= 0 ? '+' : ''}{displayData.change.toFixed(2)} ({displayData.changePct >= 0 ? '+' : ''}{displayData.changePct.toFixed(2)}%)
        </span>
        <span className="text-text-muted">
          Vol <span className="text-text-secondary">{formatVol(displayData.volume)}</span>
        </span>
      </div>

      {/* Chart container */}
      <div ref={containerRef} className="w-full rounded-lg overflow-hidden" />

      {/* Active indicators legend */}
      {activeIndicators.size > 0 && (
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          {Array.from(activeIndicators).map((ind) => (
            <div key={ind} className="flex items-center gap-1">
              <div className="w-3 h-0.5 rounded-full" style={{ backgroundColor: INDICATOR_COLORS[ind] }} />
              <span className="text-[10px] font-mono" style={{ color: INDICATOR_COLORS[ind] }}>
                {INDICATOR_LABELS[ind]}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
