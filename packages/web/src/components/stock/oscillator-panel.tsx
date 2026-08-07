'use client';

import { useMemo, useState } from 'react';
import {
  computeMACD,
  computeRSI,
  OSCILLATOR_LABELS,
  RSI_OVERBOUGHT,
  RSI_OVERSOLD,
  type OscillatorId,
  type TickerHistoryPoint,
} from '@inktrade/client';

/**
 * RSI and MACD, in their own pane below price.
 *
 * Oscillators can't share the price axis — RSI runs 0–100 and MACD swings
 * around zero, so overlaying either on a $300 stock flattens it into the axis.
 * Mutually exclusive because two stacked panes leave no room for price.
 *
 * Drawn as inline SVG rather than through the chart library: these are a
 * polyline and a histogram, and the library earns its place for the crosshair
 * and pan/zoom that candlesticks need, none of which applies here.
 *
 * Same functions as mobile, checked against Robinhood's own published values.
 */
export function OscillatorPanel({ points }: { points: TickerHistoryPoint[] }) {
  const [oscillator, setOscillator] = useState<OscillatorId>('rsi');

  const closes = useMemo(() => points.map((p) => p.close), [points]);
  const rsi = useMemo(() => computeRSI(closes), [closes]);
  const macd = useMemo(() => computeMACD(closes), [closes]);

  if (points.length === 0) return null;

  const width = 1000;
  const height = 140;

  return (
    <section className="glass-bright rounded-xl overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-5 py-3">
        <div className="flex items-baseline gap-3">
          <h2 className="text-[14px] font-semibold text-text-primary">
            {OSCILLATOR_LABELS[oscillator]}
          </h2>
          {oscillator === 'rsi' ? (
            <RsiReadout value={lastDefined(rsi)} />
          ) : (
            <MacdReadout line={lastDefined(macd.macd)} signal={lastDefined(macd.signal)} />
          )}
        </div>

        <div className="flex gap-1.5">
          {(['rsi', 'macd'] as OscillatorId[]).map((id) => (
            <button
              key={id}
              onClick={() => setOscillator(id)}
              className={`rounded-md border px-3 py-1.5 font-mono text-[11px] transition-colors ${
                oscillator === id
                  ? 'border-accent/40 bg-accent/15 text-accent-bright'
                  : 'border-border-subtle text-text-tertiary hover:bg-surface/50'
              }`}
            >
              {OSCILLATOR_LABELS[id]}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="h-[140px] w-full"
          role="img"
          aria-label={`${OSCILLATOR_LABELS[oscillator]} over the displayed range`}
        >
          {oscillator === 'rsi' ? (
            <RsiPlot values={rsi} width={width} height={height} />
          ) : (
            <MacdPlot macd={macd} width={width} height={height} />
          )}
        </svg>
      </div>
    </section>
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
  // Fixed 0–100. Auto-scaling would make 45 look extreme on a quiet stock,
  // which is the opposite of what the indicator is for.
  const y = (v: number) => height - (v / 100) * height;

  return (
    <>
      {[RSI_OVERSOLD, 50, RSI_OVERBOUGHT].map((level) => (
        <line
          key={level}
          x1={0}
          x2={width}
          y1={y(level)}
          y2={y(level)}
          stroke="currentColor"
          className={level === 50 ? 'text-border-subtle' : 'text-border-default'}
          strokeWidth={1}
          strokeDasharray={level === 50 ? undefined : '4,4'}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <path
        d={linePath(values, width, y)}
        className="text-violet"
        stroke="currentColor"
        strokeWidth={1.6}
        fill="none"
        vectorEffect="non-scaling-stroke"
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
  // One zero-centred scale across all three: the crossover and the histogram
  // only mean anything relative to each other.
  const all = [...macd.macd, ...macd.signal, ...macd.histogram].filter(
    (v): v is number => v !== null,
  );
  const extent = Math.max(...all.map(Math.abs), 1e-9);
  const y = (v: number) => height / 2 - (v / extent) * (height / 2 - 2);
  const step = width / Math.max(macd.macd.length - 1, 1);

  return (
    <>
      <line
        x1={0}
        x2={width}
        y1={height / 2}
        y2={height / 2}
        stroke="currentColor"
        className="text-border-default"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      {macd.histogram.map((v, i) =>
        v === null ? null : (
          <rect
            key={i}
            x={i * step - step * 0.35}
            y={Math.min(y(v), height / 2)}
            width={Math.max(step * 0.7, 0.5)}
            height={Math.max(Math.abs(y(v) - height / 2), 0.5)}
            className={v >= 0 ? 'text-emerald' : 'text-rose'}
            fill="currentColor"
            opacity={0.5}
          />
        ),
      )}
      <path
        d={linePath(macd.macd, width, y)}
        className="text-accent-bright"
        stroke="currentColor"
        strokeWidth={1.6}
        fill="none"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={linePath(macd.signal, width, y)}
        className="text-amber"
        stroke="currentColor"
        strokeWidth={1.4}
        fill="none"
        vectorEffect="non-scaling-stroke"
      />
    </>
  );
}

/**
 * A path that breaks at gaps rather than bridging them.
 *
 * Every one of these series warms up with nulls, and joining across a null
 * draws a line from the first defined value back to the origin — a dive that
 * never happened.
 */
function linePath(
  values: (number | null)[],
  width: number,
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
    d += `${pen ? 'L' : 'M'}${(i * step).toFixed(2)} ${y(v).toFixed(2)} `;
    pen = true;
  });

  return d.trim();
}

function RsiReadout({ value }: { value: number | null }) {
  if (value === null) return <span className="font-mono text-[13px] text-text-muted">—</span>;

  const tone =
    value <= RSI_OVERSOLD
      ? 'text-emerald'
      : value >= RSI_OVERBOUGHT
        ? 'text-rose'
        : 'text-text-secondary';
  const note = value <= RSI_OVERSOLD ? ' oversold' : value >= RSI_OVERBOUGHT ? ' overbought' : '';

  return (
    <span className={`font-mono text-[13px] tabular-nums ${tone}`}>
      {value.toFixed(1)}
      {note}
    </span>
  );
}

function MacdReadout({ line, signal }: { line: number | null; signal: number | null }) {
  if (line === null || signal === null) {
    return <span className="font-mono text-[13px] text-text-muted">—</span>;
  }

  const above = line >= signal;
  return (
    <span className={`font-mono text-[13px] tabular-nums ${above ? 'text-emerald' : 'text-rose'}`}>
      {line.toFixed(2)} / {signal.toFixed(2)}
      {above ? ' bullish' : ' bearish'}
    </span>
  );
}

function lastDefined(values: (number | null)[]): number | null {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (values[i] !== null) return values[i];
  }
  return null;
}
