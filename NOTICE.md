# Third-party acknowledgements

Inktrade is built on open-source work. This file records the pieces whose
licences ask to be acknowledged, and the ones we simply want to thank.

## lightweight-charts

Copyright © TradingView, Inc.
Licensed under the [Apache License 2.0](https://github.com/tradingview/lightweight-charts/blob/master/LICENSE).

Every candlestick chart in Inktrade — web and mobile — is drawn by
[lightweight-charts](https://github.com/tradingview/lightweight-charts).
Replicating its crosshair and pan/zoom behaviour natively is a project in
itself, and on mobile we host it in a WebView rather than attempt that. We're
grateful for it.

The library ships an on-chart attribution logo, which we disable
(`attributionLogo: false`). That is a supported option rather than a
circumvention: the logo overlays price data and reads as a claim about the
*source* of that data, which would be misleading here. Inktrade's market data
comes from the user's own brokerage — TradingView provides the rendering, not
the numbers. The acknowledgement belongs here instead, where it can say what is
actually true.

TradingView is a trademark of TradingView, Inc. Inktrade is not affiliated with,
endorsed by, or connected to TradingView.
