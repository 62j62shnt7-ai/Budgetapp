import type { EntryDraw, InstaPayFeeConfig, InstaPayRefund } from '../types';

export const DEFAULT_INSTAPAY_FEE_CONFIG: InstaPayFeeConfig = {
  rate: 0.001,
  minimum: 0.5,
  maximum: 20,
  currency: 'EGP',
};

export function isValidInstaPayFeeConfig(value: unknown): value is InstaPayFeeConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const config = value as Record<string, unknown>;
  return config.currency === 'EGP'
    && typeof config.rate === 'number'
    && Number.isFinite(config.rate)
    && config.rate >= 0
    && typeof config.minimum === 'number'
    && Number.isFinite(config.minimum)
    && config.minimum >= 0
    && typeof config.maximum === 'number'
    && Number.isFinite(config.maximum)
    && config.maximum >= config.minimum;
}

export function normalizeInstaPayFeeConfig(value: unknown): InstaPayFeeConfig {
  if (!isValidInstaPayFeeConfig(value)) return { ...DEFAULT_INSTAPAY_FEE_CONFIG };
  return {
    rate: value.rate,
    minimum: Math.round(value.minimum * 100) / 100,
    maximum: Math.round(value.maximum * 100) / 100,
    currency: 'EGP',
  };
}

export function calculateInstaPayFee(transferAmount: number, config: InstaPayFeeConfig): number {
  if (!Number.isFinite(transferAmount) || transferAmount <= 0 || !isValidInstaPayFeeConfig(config)) return 0;
  const amount = Math.round(transferAmount * 100) / 100;
  const rawFee = Math.round(amount * config.rate * 100) / 100;
  const boundedFee = Math.min(config.maximum, Math.max(config.minimum, rawFee));
  return Math.round(boundedFee * 100) / 100;
}

export function buildInstaPayRefunds(
  draws: EntryDraw[],
  principalToReverse: number,
  fallbackAccount: string
): InstaPayRefund[] {
  let remaining = Math.max(0, Math.round((Number(principalToReverse) || 0) * 100) / 100);
  const refunds: InstaPayRefund[] = [];
  for (const draw of [...draws].reverse()) {
    if (remaining <= 0) break;
    const drawPrincipal = Math.max(0, Math.round((Number(draw.amount) || 0) * 100) / 100);
    if (drawPrincipal <= 0) continue;
    const principalAmount = Math.min(drawPrincipal, remaining);
    const recordedFee = Math.max(0, Math.round((Number(draw.instapayFeeAmount) || 0) * 100) / 100);
    const feeAmount = principalAmount >= drawPrincipal
      ? recordedFee
      : Math.round(recordedFee * principalAmount / drawPrincipal * 100) / 100;
    const accountKey = draw.account || fallbackAccount;
    const existing = refunds.find((refund) => refund.accountKey === accountKey);
    if (existing) {
      existing.principalAmount = Math.round((existing.principalAmount + principalAmount) * 100) / 100;
      existing.feeAmount = Math.round((existing.feeAmount + feeAmount) * 100) / 100;
    } else {
      refunds.push({ accountKey, principalAmount, feeAmount });
    }
    remaining = Math.round((remaining - principalAmount) * 100) / 100;
  }
  if (remaining > 0) {
    const existing = refunds.find((refund) => refund.accountKey === fallbackAccount);
    if (existing) existing.principalAmount = Math.round((existing.principalAmount + remaining) * 100) / 100;
    else refunds.push({ accountKey: fallbackAccount, principalAmount: remaining, feeAmount: 0 });
  }
  return refunds;
}
