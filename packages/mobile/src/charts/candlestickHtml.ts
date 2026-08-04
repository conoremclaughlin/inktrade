import { colors } from '../ui/theme';
import { LIGHTWEIGHT_CHARTS_BASE64 } from './lightweightChartsEmbedded';

/**
 * The document hosting the candlestick chart.
 *
 * Built once and kept stable: data arrives afterwards via injectJavaScript, so
 * a period change or a quote tick updates the series in place instead of
 * reloading the WebView and re-parsing the ~250KB library.
 *
 * Crosshair moves are posted back to React Native so the OHLC legend can be
 * rendered natively rather than in HTML.
 */
export function buildCandlestickHtml(): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<style>
  html, body { margin: 0; padding: 0; background: ${colors.void}; overflow: hidden; }
  #chart { width: 100vw; height: 100vh; }
</style>
</head>
<body>
<div id="chart"></div>
<script>
(function () {
  function post(msg) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(msg));
    }
  }

  try {
    // The library is embedded as base64 so the chart works offline.
    var script = document.createElement('script');
    script.textContent = atob("${LIGHTWEIGHT_CHARTS_BASE64}");
    document.head.appendChild(script);
  } catch (err) {
    post({ type: 'error', message: 'lib-load: ' + String(err) });
    return;
  }

  var chart, candleSeries, lineSeries, overlays = [], mode = 'candlestick';

  function init() {
    chart = LightweightCharts.createChart(document.getElementById('chart'), {
      layout: {
        background: { type: 'solid', color: '${colors.void}' },
        textColor: '${colors.textTertiary}',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: '${colors.borderSubtle}' },
        horzLines: { color: '${colors.borderSubtle}' },
      },
      rightPriceScale: { borderColor: '${colors.borderDefault}' },
      timeScale: { borderColor: '${colors.borderDefault}', rightOffset: 4 },
      crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
      handleScale: { axisPressedMouseMove: false },
      autoSize: true,
    });

    chart.subscribeCrosshairMove(function (param) {
      if (!param || !param.time || !param.seriesData) {
        post({ type: 'crosshair', bar: null });
        return;
      }
      var active = mode === 'candlestick' ? candleSeries : lineSeries;
      var bar = param.seriesData.get(active);
      if (!bar) { post({ type: 'crosshair', bar: null }); return; }
      post({ type: 'crosshair', bar: bar, time: param.time });
    });

    post({ type: 'ready' });
  }

  function clearOverlays() {
    overlays.forEach(function (s) { try { chart.removeSeries(s); } catch (e) {} });
    overlays = [];
  }

  // Called from React Native.
  window.setChartData = function (payload) {
    try {
      if (!chart) init();
      mode = payload.mode || 'candlestick';

      if (candleSeries) { chart.removeSeries(candleSeries); candleSeries = null; }
      if (lineSeries) { chart.removeSeries(lineSeries); lineSeries = null; }
      clearOverlays();

      if (mode === 'candlestick') {
        candleSeries = chart.addSeries(LightweightCharts.CandlestickSeries, {
          upColor: '${colors.emerald}',
          downColor: '${colors.rose}',
          borderUpColor: '${colors.emerald}',
          borderDownColor: '${colors.rose}',
          wickUpColor: '${colors.emerald}',
          wickDownColor: '${colors.rose}',
        });
        candleSeries.setData(payload.candles);
      } else {
        lineSeries = chart.addSeries(LightweightCharts.LineSeries, {
          color: '${colors.accentBright}',
          lineWidth: 2,
        });
        lineSeries.setData(payload.line);
      }

      (payload.overlays || []).forEach(function (o) {
        var s = chart.addSeries(LightweightCharts.LineSeries, {
          color: o.color,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        s.setData(o.data);
        overlays.push(s);
      });

      chart.timeScale().fitContent();
      post({ type: 'rendered', count: payload.candles ? payload.candles.length : 0 });
    } catch (err) {
      post({ type: 'error', message: 'render: ' + String(err) });
    }
  };

  init();
})();
</script>
</body>
</html>`;
}
