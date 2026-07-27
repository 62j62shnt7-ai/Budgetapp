import { ratesData, saveSetting, storageAssets } from "../store/state.js";
import { keys, saveSetting as saveStorageKey } from "../store/storage.js";

const CURRENCY_RATES_ENDPOINT = "https://open.er-api.com/v6/latest/USD";
const GOLD_PRICE_ENDPOINT = "https://api.gold-api.com/price/XAU";
const TROY_OUNCE_GRAMS = 31.1035;

export function computeSpreadPct(sell, buy) {
  const mid = (Number(sell) + Number(buy)) / 2;
  if (!mid) return 0.006;
  return (Number(buy) - Number(sell)) / mid;
}

export function applySpread(mid, spreadPct) {
  return {
    sell: Math.round(mid * (1 - spreadPct / 2) * 100) / 100,
    buy: Math.round(mid * (1 + spreadPct / 2) * 100) / 100
  };
}

export async function fetchLiveCurrencyRates() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(CURRENCY_RATES_ENDPOINT, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) throw new Error(`Currency rate request failed (${response.status})`);
    const data = await response.json();
    if (data.result !== "success" || !data.rates || typeof data.rates.EGP !== "number") {
      throw new Error("Unexpected currency rate response");
    }
    return data.rates;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

export function egpPerUnit(liveRates, code) {
  if (code === "USD") return liveRates.EGP;
  const perUsd = liveRates[code];
  if (!perUsd) return null;
  return liveRates.EGP / perUsd;
}

export async function fetchLiveGoldSpotUsd() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(GOLD_PRICE_ENDPOINT, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) throw new Error(`Gold price request failed (${response.status})`);
    const data = await response.json();
    const price = Number(data.price ?? data.price_usd ?? data.rate ?? data.spotPrice);
    if (!price || Number.isNaN(price)) throw new Error("Unexpected gold price response");
    return price;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

export function resolveRateSourceValue(sourceValue) {
  if (!sourceValue || sourceValue === "manual") return null;
  const sep = sourceValue.indexOf(":");
  if (sep === -1) return null;
  const type = sourceValue.slice(0, sep);
  const name = sourceValue.slice(sep + 1);
  const list = type === "gold" ? ratesData.gold : ratesData.currencies;
  const match = (list || []).find((item) => item.name === name);
  return match ? match.sell : null;
}

export function syncStorageRates() {
  let changed = false;
  storageAssets.forEach((item) => {
    const resolved = resolveRateSourceValue(item.rateSource);
    if (resolved !== null && resolved !== item.rate) {
      item.rate = resolved;
      changed = true;
    }
  });
  if (changed) saveSetting(keys.storage, storageAssets);
}
