'use client';

import { useEffect, useRef } from 'react';

const SCRIPT_SRC = 'https://s3.tradingview.com/external-embedding/embed-widget-symbol-overview.js';

/** Hands the widget its config; TradingView renders into its own iframe. */
function injectWidget(host: HTMLElement): void {
  const script = document.createElement('script');
  script.src = SCRIPT_SRC;
  script.async = true;
  script.type = 'text/javascript';
  script.innerHTML = JSON.stringify({
    symbols: [['Martı (MRT)', 'AMEX:MRT|12M']],
    chartOnly: true,
    width: '100%',
    height: '100%',
    locale: 'tr',
    colorTheme: 'light',
    autosize: true,
    showVolume: false,
    showMA: false,
    hideDateRanges: false,
    hideMarketStatus: true,
    hideSymbolLogo: true,
    scalePosition: 'right',
    scaleMode: 'Normal',
    fontFamily: 'Libre Franklin, Arial, sans-serif',
    fontSize: '12',
    noTimeScale: false,
    valuesTracking: '1',
    changeMode: 'price-and-percent',
    chartType: 'area',
    lineWidth: 3,
    lineType: 0,
    lineColor: '#01b251',
    topColor: 'rgba(1, 178, 81, 0.28)',
    bottomColor: 'rgba(1, 178, 81, 0)',
    backgroundColor: 'rgba(255, 255, 255, 1)',
    gridLineColor: 'rgba(0, 0, 0, 0)',
    widgetFontColor: '#000000',
    dateRanges: ['1m|30', '3m|60', '12m|1D', '60m|1W', 'all|1M'],
  });
  host.appendChild(script);
}

/**
 * TradingView's official, key-free embeddable chart for MRT (NYSE American = "AMEX" there).
 * The widget renders in its own iframe; we only hand it a config and keep its attribution.
 */
export function TradingViewChart() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host || host.querySelector('script')) return;
    // Third-party script: load it only when the chart is about to scroll into view.
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        injectWidget(host);
      },
      { rootMargin: '600px 0px' },
    );
    io.observe(host);
    return () => io.disconnect();
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <div className="tradingview-widget-container h-[380px] w-full border-y border-(--line)">
        <div ref={ref} className="tradingview-widget-container__widget h-full w-full" />
      </div>
      <p className="meta">
        Grafik{' '}
        <a
          href="https://tr.tradingview.com/symbols/AMEX-MRT/"
          target="_blank"
          rel="noopener noreferrer"
          className="link-underline"
        >
          TradingView
        </a>{' '}
        tarafından sağlanır; veriler gecikmeli olabilir.
      </p>
    </div>
  );
}
