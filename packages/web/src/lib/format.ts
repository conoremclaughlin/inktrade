const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', JPY: '¥', CNY: '¥',
  KRW: '₩', INR: '₹', TWD: 'NT$', CAD: 'C$', AUD: 'A$',
  CHF: 'CHF ', HKD: 'HK$', SGD: 'S$', SEK: 'kr', BRL: 'R$',
};

export function currencySymbol(code: string): string {
  return CURRENCY_SYMBOLS[code] ?? `${code} `;
}

export function formatLargeNumber(n: number, currency = 'USD'): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  const sym = currencySymbol(currency);
  if (abs >= 1e12) return `${sign}${sym}${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}${sym}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${sym}${(abs / 1e6).toFixed(0)}M`;
  return `${sym}${n.toLocaleString()}`;
}
