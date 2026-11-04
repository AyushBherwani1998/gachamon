import { describe, expect, test } from "bun:test";
import {
  STOCK_TABLE,
  decimalToUsd6,
  deviationBps,
  extractQuote,
  fetchXStockPrice,
  fetchXStockPrices,
  formatUsd6,
  needsUpdate,
  pythPriceToUsd6,
  withinDeviation,
} from "../src/prices";

describe("decimalToUsd6", () => {
  test("converts API quotes exactly", () => {
    expect(decimalToUsd6("380.9")).toBe(380_900_000n);
    expect(decimalToUsd6("331.23")).toBe(331_230_000n);
    expect(decimalToUsd6("207.405")).toBe(207_405_000n);
    expect(decimalToUsd6("752.745")).toBe(752_745_000n);
  });

  test("handles whole numbers and small values", () => {
    expect(decimalToUsd6("1")).toBe(1_000_000n);
    expect(decimalToUsd6("0.000001")).toBe(1n);
    expect(decimalToUsd6(".5")).toBeNull(); // requires a leading digit
    expect(decimalToUsd6("0.5")).toBe(500_000n);
  });

  test("truncates extra precision instead of rounding up", () => {
    expect(decimalToUsd6("1.2345678")).toBe(1_234_567n);
  });

  test("accepts scientific notation", () => {
    expect(decimalToUsd6("3.8e2")).toBe(380_000_000n);
    expect(decimalToUsd6("2.07405E2")).toBe(207_405_000n);
  });

  test("rejects invalid, zero and negative values", () => {
    expect(decimalToUsd6("0")).toBeNull();
    expect(decimalToUsd6("0.0000001")).toBeNull();
    expect(decimalToUsd6("-1.5")).toBeNull();
    expect(decimalToUsd6("")).toBeNull();
    expect(decimalToUsd6("abc")).toBeNull();
  });
});

describe("extractQuote", () => {
  test("reads a numeric quote", () => {
    expect(extractQuote('{"quote":380.9}')).toBe("380.9");
  });

  test("reads a string quote and ignores whitespace", () => {
    expect(extractQuote('{ "quote" : "207.405" }')).toBe("207.405");
  });

  test("returns null when the market is closed", () => {
    expect(extractQuote('{"quote":null}')).toBeNull();
  });
});

describe("pythPriceToUsd6", () => {
  test("applies the exponent", () => {
    expect(pythPriceToUsd6("38090000000", -8)).toBe(380_900_000n);
    expect(pythPriceToUsd6("20740500000", -8)).toBe(207_405_000n);
  });

  test("rejects non-positive values", () => {
    expect(pythPriceToUsd6("0", -8)).toBeNull();
    expect(pythPriceToUsd6("-1", -8)).toBeNull();
  });
});

describe("update thresholds", () => {
  const now = 1_800_000_000n;

  test("updates when the contract has never been updated", () => {
    expect(needsUpdate(100_000_000n, undefined, 0n, now)).toBe(true);
  });

  test("updates when on-chain prices are 5 minutes old", () => {
    expect(needsUpdate(100_000_000n, 100_000_000n, now - 301n, now)).toBe(true);
    expect(needsUpdate(100_000_000n, 100_000_000n, now - 300n, now)).toBe(true);
    expect(needsUpdate(100_000_000n, 100_000_000n, now - 299n, now)).toBe(false);
  });

  test("updates at exactly 0.1%", () => {
    expect(needsUpdate(100_100_000n, 100_000_000n, now - 10n, now)).toBe(true);
  });

  test("does not update below 0.1% when fresh", () => {
    expect(needsUpdate(100_090_000n, 100_000_000n, now - 10n, now)).toBe(false);
  });

  test("treats a missing baseline as an update", () => {
    expect(needsUpdate(100_000_000n, undefined, now - 10n, now)).toBe(true);
    expect(needsUpdate(100_000_000n, 0n, now - 10n, now)).toBe(true);
  });

  test("deviationBps is relative to the last accepted value", () => {
    expect(deviationBps(101_000_000n, 100_000_000n)).toBe(100n); // 1%
    expect(deviationBps(99_000_000n, 100_000_000n)).toBe(100n);
  });
});

describe("sanity check", () => {
  const last = 100_000_000n;

  test("allows moves up to 25%", () => {
    expect(withinDeviation(125_000_000n, last)).toBe(true);
    expect(withinDeviation(75_000_000n, last)).toBe(true);
  });

  test("rejects moves above 25%", () => {
    expect(withinDeviation(125_000_001n, last)).toBe(false);
    expect(withinDeviation(74_999_999n, last)).toBe(false);
  });

  test("allows anything with no baseline", () => {
    expect(withinDeviation(999_000_000n, undefined)).toBe(true);
    expect(withinDeviation(999_000_000n, 0n)).toBe(true);
  });
});

describe("formatUsd6", () => {
  test("formats for logs without floats", () => {
    expect(formatUsd6(380_900_000n)).toBe("$380.9");
    expect(formatUsd6(207_405_000n)).toBe("$207.405");
    expect(formatUsd6(1_000_000n)).toBe("$1");
    expect(formatUsd6(1n)).toBe("$0.000001");
  });
});

describe("xStocks fetching", () => {
  test("parses a live-shaped response", async () => {
    const fakeFetch = (async () =>
      new Response('{"quote":380.9}', {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;

    expect(await fetchXStockPrice("TSLAx", { fetchImpl: fakeFetch })).toBe(380_900_000n);
  });

  test("keeps the other symbols when one request fails", async () => {
    const fakeFetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("NVDAx")) return new Response("upstream error", { status: 500 });
      if (url.includes("SPYx")) return new Response('{"quote":null}', { status: 200 });
      return new Response('{"quote":100.5}', { status: 200 });
    }) as unknown as typeof fetch;

    const prices = await fetchXStockPrices(STOCK_TABLE, { fetchImpl: fakeFetch });
    expect(prices.get("TSLAx")).toBe(100_500_000n);
    expect(prices.get("AAPLx")).toBe(100_500_000n);
    expect(prices.has("NVDAx")).toBe(false);
    expect(prices.has("SPYx")).toBe(false);
  });
});
