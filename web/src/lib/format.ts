/** Shorten 0x addresses for compact display. */
export function shortAddress(address?: string, chars = 4): string {
  if (!address) return "";
  return `${address.slice(0, 2 + chars)}…${address.slice(-chars)}`;
}

/** Format a 6-decimal USD amount as "$1.00". */
export function formatUsd6(value: bigint | undefined, decimals = 2): string {
  if (value === undefined) return "—";
  const cents = Number(value) / 1_000_000;
  return `$${cents.toFixed(decimals)}`;
}

/** Format an 18-decimal token amount for display. */
export function formatToken(value: bigint | undefined, maxDecimals = 4): string {
  if (value === undefined) return "—";
  const whole = Number(value) / 1e18;
  if (whole === 0) return "0";
  if (whole < 0.0001) return "<0.0001";
  return whole.toLocaleString("en-US", { maximumFractionDigits: maxDecimals });
}

/** Format MON (18 decimals). */
export function formatMon(value: bigint | undefined): string {
  if (value === undefined) return "—";
  const mon = Number(value) / 1e18;
  return `${mon.toLocaleString("en-US", { maximumFractionDigits: 4 })} MON`;
}
