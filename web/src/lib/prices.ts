import type { PriceUpdateResponse } from "./types";

/** Client fetch for the server-side Pyth proxy. The API key never leaves the server. */
export async function fetchPriceUpdate(chainId: number): Promise<PriceUpdateResponse> {
  const response = await fetch(`/api/price-update?chainId=${chainId}`, {
    cache: "no-store",
  });
  const body = (await response.json().catch(() => null)) as
    | (PriceUpdateResponse & { error?: string })
    | null;

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        "Pyth rejected the price key. The server key is not entitled to this feed."
      );
    }
    if (response.status === 429) {
      throw new Error("Pyth is rate limiting price updates. Wait a few seconds and retry.");
    }
    throw new Error(body?.error ?? `Price service returned HTTP ${response.status}.`);
  }
  if (!body || !Array.isArray(body.updateData) || !Array.isArray(body.prices)) {
    throw new Error("Price service returned an unexpected response.");
  }
  return body;
}

/** Normalize a token amount to 18 decimals for USD math. */
export function tokenAmountTo18(amount: bigint, decimals: number): bigint {
  if (decimals === 18) return amount;
  if (decimals < 18) return amount * 10n ** BigInt(18 - decimals);
  return amount / 10n ** BigInt(decimals - 18);
}
