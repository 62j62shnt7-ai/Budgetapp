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

export function getCurrencyRate(rates: RatesData, code: string): number {
  const c = rates.currencies.find((item) => item.name.toUpperCase() === code.toUpperCase());
  return c ? c.buy : 1.0;
}

export function computeSpreadPct(sell: number, buy: number): number {
  const mid = (sell + buy) / 2;
  if (!mid) return 0;
  return ((sell - buy) / mid) * 100;
}

export function computeAssetEgpValue(asset: StorageAsset, rates: RatesData): number {
  const qty = Number(asset.quantity) || 0;
  if (asset.currentPrice && asset.currentPrice > 0) {
    const rate = asset.currency && asset.currency !== 'EGP' ? getCurrencyRate(rates, asset.currency) : 1;
    return qty * asset.currentPrice * rate;
  }
  
  // Try matching gold
  const gold = rates.gold.find((g) => g.name.toLowerCase() === asset.name.toLowerCase());
  if (gold) {
    return qty * gold.buy;
  }

  // Fallback to buy price
  const buyPrice = Number(asset.buyPrice) || 0;
  const rate = asset.currency && asset.currency !== 'EGP' ? getCurrencyRate(rates, asset.currency) : 1;
  return qty * buyPrice * rate;
}

export function computeTotalStorageValue(assets: StorageAsset[], rates: RatesData): number {
  return assets.reduce((sum, asset) => sum + computeAssetEgpValue(asset, rates), 0);
}

// ==========================================================================
// Live Market Rates API
// ==========================================================================
export const CURRENCY_RATES_ENDPOINT = 'https://open.er-api.com/v6/latest/USD';
export const GOLD_PRICE_ENDPOINT = 'https://api.gold-api.com/price/XAU';
export const TROY_OUNCE_GRAMS = 31.1035;

export function applySpread(mid: number, spreadPct: number) {
  return {
    sell: Math.round(mid * (1 + spreadPct / 2) * 100) / 100,
    buy: Math.round(mid * (1 - spreadPct / 2) * 100) / 100,
  };
}

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

