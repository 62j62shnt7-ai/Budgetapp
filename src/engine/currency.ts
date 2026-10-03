// ==========================================================================
// Currency, Gold & Valuation Engine
// ==========================================================================
import type { RatesData, StorageAsset } from '../types';

export const defaultRates: RatesData = {
  currencies: [
    { name: 'USD', sell: 48.5, buy: 48.4 },
    { name: 'EUR', sell: 52.1, buy: 52.0 },
    { name: 'SAR', sell: 12.9, buy: 12.8 },
    { name: 'AED', sell: 13.2, buy: 13.1 },
    { name: 'GBP', sell: 61.5, buy: 61.3 },
  ],
  gold: [
    { name: 'Gold 24', sell: 3600, buy: 3580 },
    { name: 'Gold 22', sell: 3300, buy: 3280 },
    { name: 'Gold 21', sell: 3150, buy: 3130 },
    { name: 'Gold 18', sell: 2700, buy: 2680 },
    { name: 'Gold coin', sell: 25200, buy: 25000 },
  ],
};

export function getCurrencyRate(rates: RatesData | null | undefined, code?: string): number {
  if (!rates || !code) return 1.0;
  const wanted = code.toUpperCase();
  if (wanted === 'EGP') return 1.0;
  if (Array.isArray(rates.currencies)) {
    const c = rates.currencies.find((item) => item?.name && item.name.toUpperCase() === wanted);
    if (c) return Number(c.sell ?? c.buy) || 1.0;
  }
  const legacy = rates as unknown as Record<string, unknown>;
  if (wanted in legacy) return Number(legacy[wanted]) || 1.0;
  return 1.0;
}

export function resolveCurrencyRate(rates: RatesData | null | undefined, code?: string, fallback = 48.5): number {
  if (!code || code.toUpperCase() === 'EGP') return 1.0;
  const rate = getCurrencyRate(rates, code);
  return rate > 0 && rate !== 1.0 ? rate : fallback;
}

export function computeSpreadPct(sell: number, buy: number): number {
  const mid = (Number(sell) + Number(buy)) / 2;
  if (!mid) return 0.006;
  return Math.abs(Number(sell) - Number(buy)) / mid;
}

export function applySpread(mid: number, spreadPct: number): { sell: number; buy: number } {
  return {
    sell: Math.round(mid * (1 + spreadPct / 2) * 100) / 100,
    buy: Math.round(mid * (1 - spreadPct / 2) * 100) / 100,
  };
}

export function resolveRateSourceValue(sourceValue: string | undefined, rates: RatesData): number | null {
  if (!sourceValue || sourceValue === 'manual') return null;
  const sep = sourceValue.indexOf(':');
  if (sep === -1) return null;
  const type = sourceValue.slice(0, sep);
  const name = sourceValue.slice(sep + 1);
  const list = type === 'gold' ? rates.gold : rates.currencies;
  const match = (list || []).find((item) => item.name.toLowerCase() === name.toLowerCase());
  return match ? match.sell : null;
}

export function storageValue(item: StorageAsset, rates?: RatesData): number {
  const qty = Number(item.quantity) || 0;
  let rate = Number(item.rate ?? item.buyPrice ?? 0);
  if (rates && item.rateSource && item.rateSource !== 'manual') {
    const resolved = resolveRateSourceValue(item.rateSource, rates);
    if (resolved !== null) rate = resolved;
  }
  return qty * rate;
}

export function getCurrencySymbol(code: string): string {
  const upper = (code || '').toUpperCase();
  switch (upper) {
    case 'USD':
      return '$';
    case 'EUR':
      return '€';
    case 'GBP':
      return '£';
    case 'SAR':
      return 'SAR ';
    case 'AED':
      return 'AED ';
    case 'EGP':
      return 'EGP ';
    default:
      return `${code} `;
  }
}

export function formatNativeCurrency(quantity: number, unitOrCode?: string): string {
  const qty = Number(quantity) || 0;
  const upper = (unitOrCode || '').toUpperCase().trim();

  if (upper === 'USD' || upper === 'DOLLARS' || upper === '$') {
    return `$${qty.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (upper === 'EUR' || upper === 'EUROS' || upper === '€') {
    return `€${qty.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (upper === 'GBP' || upper === 'POUNDS' || upper === '£') {
    return `£${qty.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (upper === 'SAR' || upper === 'AED' || upper === 'EGP') {
    return `${upper} ${qty.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `${qty.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${unitOrCode || 'units'}`;
}

export function inferAssetLocation(asset: Partial<StorageAsset>): {
  locationType: 'bank' | 'cash' | 'vault' | 'other';
  location: string;
  locationLabel: string;
} {
  if (asset.locationType) {
    const locType = asset.locationType;
    const loc = asset.location || (locType === 'bank' ? 'hsbc' : locType === 'cash' ? 'cash' : locType === 'vault' ? 'vault' : 'other');
    const locLabel = asset.locationLabel || (
      locType === 'bank'
        ? (loc.toLowerCase().includes('cib') ? 'CIB Foreign Account' : loc.toLowerCase().includes('hsbc') ? 'HSBC Foreign Account' : `${loc.toUpperCase()} Foreign Account`)
        : locType === 'cash'
        ? 'Physical Cash'
        : locType === 'vault'
        ? 'Physical Vault'
        : 'Storage'
    );
    return {
      locationType: locType,
      location: loc,
      locationLabel: locLabel,
    };
  }

  if (asset.location) {
    const loc = asset.location.toLowerCase();
    const locType: 'bank' | 'cash' | 'vault' | 'other' =
      loc === 'cash' ? 'cash' : loc === 'vault' ? 'vault' : (loc === 'hsbc' || loc === 'cib') ? 'bank' : 'other';
    return inferAssetLocation({ ...asset, locationType: locType, location: loc });
  }

  const name = (asset.name || '').toLowerCase();
  const category = (asset.category || '').toLowerCase();
  const rateSource = (asset.rateSource || '').toLowerCase();

  if (name.includes('cash') || name.includes('wallet') || name.includes('hand')) {
    return { locationType: 'cash', location: 'cash', locationLabel: 'Physical Cash' };
  }
  if (name.includes('hsbc')) {
    return { locationType: 'bank', location: 'hsbc', locationLabel: 'HSBC Foreign Account' };
  }
  if (name.includes('cib')) {
    return { locationType: 'bank', location: 'cib', locationLabel: 'CIB Foreign Account' };
  }
  if (category.includes('gold') || rateSource.startsWith('gold:') || name.includes('gold') || name.includes('silver') || name.includes('coin')) {
    return { locationType: 'vault', location: 'vault', locationLabel: 'Physical Vault' };
  }
  if (category.includes('currency') || rateSource.startsWith('currency:')) {
    return { locationType: 'bank', location: 'hsbc', locationLabel: 'HSBC Foreign Account' };
  }
  return { locationType: 'other', location: 'other', locationLabel: 'Storage' };
}

export function computeAssetEgpValue(asset: StorageAsset, rates: RatesData): number {
  return storageValue(asset, rates);
}

export function computeTotalStorageValue(assets: StorageAsset[], rates: RatesData): number {
  return (assets || []).reduce((sum, asset) => sum + storageValue(asset, rates), 0);
}


// ==========================================================================
// Live Market Rates API
// ==========================================================================
export const CURRENCY_RATES_ENDPOINT = 'https://open.er-api.com/v6/latest/USD';
export const GOLD_PRICE_ENDPOINT = 'https://api.gold-api.com/price/XAU';
export const TROY_OUNCE_GRAMS = 31.1035;

export function egpPerUnit(liveRates: Record<string, number>, code: string): number | null {
  if (code === 'USD') return liveRates.EGP;
  const perUsd = liveRates[code];
  if (!perUsd) return null;
  return liveRates.EGP / perUsd;
}

export async function fetchLiveCurrencyRates(): Promise<Record<string, number>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(CURRENCY_RATES_ENDPOINT, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) throw new Error(`Currency rate request failed (${response.status})`);
    const data = await response.json();
    if (data.result !== 'success' || !data.rates || typeof data.rates.EGP !== 'number') {
      throw new Error('Unexpected currency rate response');
    }
    return data.rates;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

export async function fetchLiveGoldSpotUsd(): Promise<number> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(GOLD_PRICE_ENDPOINT, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) throw new Error(`Gold price request failed (${response.status})`);
    const data = await response.json();
    const price = Number(data.price ?? data.price_usd ?? data.rate ?? data.spotPrice);
    if (!price || Number.isNaN(price)) throw new Error('Unexpected gold price response');
    return price;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

export const RATE_AUTO_FETCH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export async function autoFetchLatestRates(
  currentRates: RatesData,
  minIntervalMs: number = RATE_AUTO_FETCH_INTERVAL_MS
): Promise<RatesData | null> {
  // Do not pull automatically unless an hour has passed since the last fetch
  if (currentRates.lastFetched) {
    const lastTime = new Date(currentRates.lastFetched).getTime();
    if (!isNaN(lastTime) && Date.now() - lastTime < minIntervalMs) {
      return null;
    }
  }

  try {
    const [liveRates, xauUsd] = await Promise.all([
      fetchLiveCurrencyRates(),
      fetchLiveGoldSpotUsd().catch(() => null),
    ]);

    const updatedCurrencies = (currentRates.currencies || []).map((currency) => {
      const mid = egpPerUnit(liveRates, currency.name.toUpperCase());
      if (mid === null) return currency;
      const spreadPct = computeSpreadPct(currency.sell, currency.buy);
      const next = applySpread(mid, spreadPct);
      return { ...currency, ...next };
    });

    let updatedGold = currentRates.gold || [];
    if (xauUsd && liveRates.EGP) {
      const egpPerOz = xauUsd * liveRates.EGP;
      const egpPerGram24k = egpPerOz / TROY_OUNCE_GRAMS;
      updatedGold = (currentRates.gold || []).map((item) => {
        let mid: number | null = null;
        const match = item.name.match(/(\d+)/);
        if (match) {
          const karat = Number(match[1]);
          mid = egpPerGram24k * (karat / 24);
        } else if (item.name.toLowerCase().includes('coin') || item.name.toLowerCase().includes('pound')) {
          mid = egpPerGram24k * (21 / 24) * 8;
        }
        if (mid === null) return item;
        const spreadPct = computeSpreadPct(item.sell, item.buy);
        const next = applySpread(mid, spreadPct);
        next.sell = Math.round(next.sell);
        next.buy = Math.round(next.buy);
        return { ...item, ...next };
      });
    }

    const nowIso = new Date().toISOString();
    return {
      currencies: updatedCurrencies,
      gold: updatedGold,
      lastFetched: nowIso,
      currenciesLastFetched: nowIso,
      goldLastFetched: xauUsd ? nowIso : (currentRates.goldLastFetched || currentRates.lastFetched),
    };
  } catch (err) {
    console.warn('Silent live rate auto-fetch skipped (network offline or unreachable):', err);
    return null;
  }
}

