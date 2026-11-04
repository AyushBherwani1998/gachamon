/**
 * Price fetching + conversion for the ClawMachine keeper.
 *
 * All USD values are bigint with 6 decimals, matching USDC and the contract.
 * No floating point is used for on-chain values. The xStocks API returns a
 * JSON number such as 207.405; we parse the raw response text so the decimal
 * string is preserved exactly.
 */

export const USD6 = 1_000_000n;

/** On-chain symbol -> API symbol / Pyth underlying symbol. */
export interface StockRef {
  symbol: string;
  apiSymbol: string;
  pythSymbol: string;
}

export const STOCK_TABLE: readonly StockRef[] = [
  { symbol: "TSLAx", apiSymbol: "TSLAx", pythSymbol: "TSLA" },
  { symbol: "AAPLx", apiSymbol: "AAPLx", pythSymbol: "AAPL" },
  { symbol: "NVDAx", apiSymbol: "NVDAx", pythSymbol: "NVDA" },
  { symbol: "SPYx", apiSymbol: "SPYx", pythSymbol: "SPY" },
];

export function lookupStock(symbol: string): StockRef | undefined {
  return STOCK_TABLE.find((s) => s.symbol.toLowerCase() === symbol.trim().toLowerCase());
}

/** Equity feed ids from https://hermes.pyth.network/v2/price_feeds?query=...&asset_type=equity */
export const PYTH_FEED_IDS: Record<string, string> = {
  TSLA: "16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1",
  AAPL: "49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688",
  NVDA: "b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593",
  SPY: "19e09bb805456ada3979a7d1cbb4b6d63babc3a0f8e8a9509f68afa5c4c11cd5",
};

/** 0.1% in basis points: update when a price moves at least this much. */
export const MIN_UPDATE_BPS = 10n;
/** Skip a price that moved more than 25% vs the last accepted value. */
export const DEFAULT_MAX_DEVIATION_BPS = 2_500n;
/** Refresh at least every 5 minutes even if prices have not moved. */
export const STALE_SECONDS = 300n;

/**
 * Parse a decimal string (optionally scientific notation) into a positive
 * bigint with 6 decimals. Extra precision is truncated, never rounded up.
 * Returns null for zero, negative, or malformed input.
 */
export function decimalToUsd6(value: string | number): bigint | null {
  const input = String(value).trim();
  const match = /^([+-]?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(input);
  if (!match) return null;

  const [, sign, whole, fraction = "", exponentText = "0"] = match;
  if (sign === "-") return null;

  const digits = (whole + fraction).replace(/^0+/, "");
  if (digits === "") return null; // zero

  const exponent = Number(exponentText) - fraction.length + 6;
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 40) return null;

  let result = BigInt(digits);
  if (exponent >= 0) {
    result *= 10n ** BigInt(exponent);
  } else {
    result /= 10n ** BigInt(-exponent);
  }

  return result > 0n ? result : null;
}

/**
 * Extract the "quote" field from the xStocks price-data response without
 * turning it into a float first. Returns null for `{"quote":null}`.
 */
export function extractQuote(body: string): string | null {
  const match = /"quote"\s*:\s*(null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|"[^"]*")/.exec(body);
  if (!match || match[1] === "null") return null;
  return match[1].replace(/^"|"$/g, "");
}

/** Pyth parsed price (integer mantissa + exponent) -> USD6 bigint. */
export function pythPriceToUsd6(price: string, expo: number): bigint | null {
  let mantissa: bigint;
  try {
    mantissa = BigInt(price);
  } catch {
    return null;
  }
  if (mantissa <= 0n) return null;

  const exponent = expo + 6;
  if (Math.abs(exponent) > 40) return null;
  const result =
    exponent >= 0
      ? mantissa * 10n ** BigInt(exponent)
      : mantissa / 10n ** BigInt(-exponent);

  return result > 0n ? result : null;
}

export interface FetchOptions {
  fetchImpl?: typeof fetch;
  /** Optional Pyth Hermes API key. Hermes requires one since 2026-08-26. */
  pythApiKey?: string;
  timeoutMs?: number;
}

const XSTOCKS_BASE = "https://api.xstocks.fi/api/v2";
const HERMES_BASE = "https://hermes.pyth.network/v2";

async function getText(url: string, opts: FetchOptions, headers: Record<string, string> = {}) {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl(url, {
    headers: { accept: "application/json", ...headers },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} from ${new URL(url).host}`);
  }
  return res.text();
}

/** Fetch one xStock price. Returns null when the API reports no quote. */
export async function fetchXStockPrice(
  apiSymbol: string,
  opts: FetchOptions = {},
): Promise<bigint | null> {
  const body = await getText(
    `${XSTOCKS_BASE}/public/assets/${encodeURIComponent(apiSymbol)}/price-data`,
    opts,
  );
  const quote = extractQuote(body);
  if (quote === null) return null;

  const price = decimalToUsd6(quote);
  if (price === null) throw new Error(`invalid quote ${JSON.stringify(quote)}`);
  return price;
}

/**
 * Fetch all requested xStock prices in parallel. Individual failures are
 * omitted from the result so one flaky symbol does not block the rest.
 */
export async function fetchXStockPrices(
  stocks: readonly StockRef[],
  opts: FetchOptions = {},
): Promise<Map<string, bigint>> {
  const results = await Promise.allSettled(
    stocks.map(async (stock) => [stock.symbol, await fetchXStockPrice(stock.apiSymbol, opts)] as const),
  );

  const prices = new Map<string, bigint>();
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.warn(`[warn] xStocks ${stocks[index].apiSymbol}: ${errorMessage(result.reason)}`);
      return;
    }
    const [symbol, price] = result.value;
    if (price !== null) prices.set(symbol, price);
  });
  return prices;
}

/** Fetch prices from Pyth Hermes in a single batched request. */
export async function fetchPythPrices(
  stocks: readonly StockRef[],
  opts: FetchOptions = {},
): Promise<Map<string, bigint>> {
  if (!opts.pythApiKey) {
    throw new Error("PYTH_API_KEY is not set (Hermes requires an API key since 2026-08-26)");
  }

  const ids = stocks
    .map((stock) => [stock, PYTH_FEED_IDS[stock.pythSymbol]] as const)
    .filter((entry): entry is readonly [StockRef, string] => Boolean(entry[1]));

  if (ids.length === 0) return new Map();

  const query = ids.map(([, id]) => `ids[]=${id}`).join("&");
  const body = await getText(`${HERMES_BASE}/updates/price/latest?${query}&parsed=true`, opts, {
    authorization: `Bearer ${opts.pythApiKey}`,
  });

  let json: any;
  try {
    json = JSON.parse(body);
  } catch {
    throw new Error("Pyth returned invalid JSON");
  }

  const byId = new Map(ids.map(([stock, id]) => [id.toLowerCase(), stock.symbol]));
  const prices = new Map<string, bigint>();

  for (const item of json?.parsed ?? []) {
    const id = String(item?.id ?? "").replace(/^0x/, "").toLowerCase();
    const symbol = byId.get(id);
    if (!symbol) continue;

    const price = pythPriceToUsd6(String(item?.price?.price), Number(item?.price?.expo));
    if (price !== null) prices.set(symbol, price);
  }

  return prices;
}

export type PriceSource = "xstocks" | "pyth" | "auto";

export async function fetchPrices(
  stocks: readonly StockRef[],
  source: PriceSource,
  opts: FetchOptions = {},
): Promise<Map<string, bigint>> {
  if (source === "pyth") return fetchPythPrices(stocks, opts);

  const prices = await fetchXStockPrices(stocks, opts);
  if (source === "xstocks") return prices;

  // auto: fill any gaps (failed request or null quote) from Pyth when a key exists.
  const missing = stocks.filter((stock) => !prices.has(stock.symbol));
  if (missing.length === 0 || !opts.pythApiKey) return prices;

  try {
    const fallback = await fetchPythPrices(missing, opts);
    for (const [symbol, price] of fallback) prices.set(symbol, price);
  } catch (error) {
    console.warn(`[warn] Pyth fallback failed: ${errorMessage(error)}`);
  }
  return prices;
}

/** next vs last, in basis points (last = denominator). */
export function deviationBps(next: bigint, last: bigint): bigint {
  if (last <= 0n) return 0n;
  const diff = next > last ? next - last : last - next;
  return (diff * 10_000n) / last;
}

/** True when next is within maxBps of last (inclusive). No baseline = allowed. */
export function withinDeviation(
  next: bigint,
  last: bigint | undefined,
  maxBps: bigint = DEFAULT_MAX_DEVIATION_BPS,
): boolean {
  if (last === undefined || last <= 0n) return true;
  const diff = next > last ? next - last : last - next;
  return diff * 10_000n <= last * maxBps;
}

/**
 * Update when:
 * - the contract has never been updated,
 * - the last on-chain update is at least 5 minutes old, or
 * - any accepted price moved at least 0.1% vs the last on-chain value.
 */
export function needsUpdate(
  next: bigint,
  last: bigint | undefined,
  updatedAtSeconds: bigint,
  nowSeconds: bigint,
  minBps: bigint = MIN_UPDATE_BPS,
  staleSeconds: bigint = STALE_SECONDS,
): boolean {
  if (updatedAtSeconds === 0n || nowSeconds - updatedAtSeconds >= staleSeconds) return true;
  if (last === undefined || last <= 0n) return true;

  const diff = next > last ? next - last : last - next;
  return diff * 10_000n >= last * minBps;
}

/** Format a USD6 value for logs: $380.90, $207.405. */
export function formatUsd6(value: bigint): string {
  const whole = value / USD6;
  const fraction = (value % USD6).toString().padStart(6, "0").replace(/0+$/, "");
  return `$${whole}${fraction ? `.${fraction}` : ""}`;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    const short = error.message.split("\n")[0];
    return short.length > 240 ? `${short.slice(0, 237)}...` : short;
  }
  return String(error);
}
