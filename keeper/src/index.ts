#!/usr/bin/env bun
/**
 * ClawMachine xStock price keeper.
 *
 * Reads the stock list + last accepted prices from the contract, fetches fresh
 * USD prices, and calls setPrices() when a price moved >= 0.1% or the on-chain
 * prices are older than 5 minutes.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  type Address,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { loadConfig, type Config } from "./config";
import {
  STOCK_TABLE,
  deviationBps,
  errorMessage,
  fetchPrices,
  formatUsd6,
  lookupStock,
  needsUpdate,
  withinDeviation,
  type StockRef,
} from "./prices";

const clawAbi = parseAbi([
  "function getStocks() view returns (address[] stocks)",
  "function getPrices() view returns (uint256[] pricesUsd6, uint256 updatedAt)",
  "function keeper() view returns (address)",
  "function setPrices(address[] stocks, uint256[] pricesUsd6)",
]);

const erc20Abi = parseAbi(["function symbol() view returns (string)"]);

interface ResolvedStock extends StockRef {
  address?: Address;
}

interface Runtime {
  cfg: Config;
  publicClient: PublicClient;
  wallet?: WalletClient;
  account?: PrivateKeyAccount;
  stocks: ResolvedStock[];
  /** Original getStocks() order; on-chain price arrays are aligned with this. */
  tokenAddresses: readonly Address[];
  lastAccepted: Map<string, bigint>;
  keeperVerified: boolean;
  dryRun: boolean;
}

interface ChainState {
  pricesByAddress: Map<string, bigint>;
  updatedAt: bigint;
}

interface Flags {
  once: boolean;
  dryRun: boolean;
}

function timestamp(): string {
  return new Date().toISOString().slice(11, 19);
}

function line(message: string): void {
  console.log(`[${timestamp()}] ${message}`);
}

function warn(message: string): void {
  console.warn(`[${timestamp()}] [warn] ${message}`);
}

function formatBps(bps: bigint): string {
  return `${(Number(bps) / 100).toFixed(2)}%`;
}

function priceSummary(stocks: ResolvedStock[], prices: Map<string, bigint>): string {
  return stocks
    .map((stock) => {
      const price = prices.get(stock.symbol);
      return `${stock.symbol} ${price === undefined ? "n/a" : formatUsd6(price)}`;
    })
    .join("  ");
}

function txLink(cfg: Config, hash: string): string {
  return `${cfg.explorerUrl}/tx/${hash}`;
}

function parseFlags(argv: string[]): Flags {
  const known = new Set(["--once", "--dry-run", "--dry", "--help", "-h"]);
  const unknown = argv.filter((arg) => !known.has(arg));
  if (unknown.length > 0) {
    throw new Error(`unknown argument(s): ${unknown.join(", ")} (try --help)`);
  }
  return {
    once: argv.includes("--once"),
    dryRun: argv.includes("--dry-run") || argv.includes("--dry"),
  };
}

function printHelp(): void {
  console.log(`ClawMachine xStock price keeper

Usage:
  bun run start              run forever (every INTERVAL_SECONDS)
  bun run once               send one update, then exit
  bun run dry                print prices only; no key or contract needed

Flags:
  --once                     single tick, then exit
  --dry-run                  fetch + print prices, send nothing
  --help                     show this help

Environment (see .env.example):
  NETWORK                    mainnet | testnet            (default mainnet)
  RPC_URL                    optional RPC override
  CLAW_MACHINE_ADDRESS       deployed ClawMachine address
  KEEPER_PRIVATE_KEY         0x-prefixed keeper wallet key (not needed for dry)
  INTERVAL_SECONDS           seconds between ticks      (default 60)
  PRICE_SOURCE               xstocks | pyth | auto      (default xstocks)
  PYTH_API_KEY               required for pyth / auto fallback
  MAX_DEVIATION_BPS          skip moves above this       (default 2500 = 25%)`);
}

async function resolveStocks(runtime: Runtime): Promise<ResolvedStock[]> {
  const { cfg, publicClient, dryRun } = runtime;

  if (!cfg.contract) {
    if (!dryRun) {
      throw new Error("CLAW_MACHINE_ADDRESS is required (or run with --dry-run)");
    }
    return STOCK_TABLE.map((stock) => ({ ...stock }));
  }

  let tokenAddresses: readonly Address[];
  try {
    tokenAddresses = await publicClient.readContract({
      address: cfg.contract,
      abi: clawAbi,
      functionName: "getStocks",
    });
    runtime.tokenAddresses = tokenAddresses;
  } catch (error) {
    if (!dryRun) {
      throw new Error(`getStocks() failed on ${cfg.contract}: ${errorMessage(error)}`);
    }
    warn(`could not read getStocks() (${errorMessage(error)}); using the built-in symbol list`);
    return STOCK_TABLE.map((stock) => ({ ...stock }));
  }

  const symbolResults = await Promise.allSettled(
    tokenAddresses.map(async (address) => ({
      address,
      symbol: await publicClient.readContract({ address, abi: erc20Abi, functionName: "symbol" }),
    })),
  );

  const resolved: ResolvedStock[] = [];
  const seen = new Set<string>();

  for (const result of symbolResults) {
    if (result.status === "rejected") {
      warn(`could not read symbol(): ${errorMessage(result.reason)}`);
      continue;
    }
    const { address, symbol } = result.value;
    const stock = lookupStock(symbol);
    if (!stock) {
      warn(`unsupported stock symbol "${symbol}" at ${address}; skipping`);
      continue;
    }
    if (seen.has(stock.symbol)) continue;
    seen.add(stock.symbol);
    resolved.push({ ...stock, address });
  }

  if (resolved.length === 0) {
    if (!dryRun) throw new Error("no supported stocks found on the contract");
    warn("no supported stocks found; using the built-in symbol list");
    return STOCK_TABLE.map((stock) => ({ ...stock }));
  }

  return resolved;
}

async function readChainState(runtime: Runtime): Promise<ChainState | null> {
  if (!runtime.cfg.contract) return null;

  try {
    const [prices, updatedAt] = await runtime.publicClient.readContract({
      address: runtime.cfg.contract,
      abi: clawAbi,
      functionName: "getPrices",
    });

    // getPrices() is aligned with getStocks() order, which may contain symbols
    // we skipped. Key by address so filtering can never shift the mapping.
    const pricesByAddress = new Map<string, bigint>();
    runtime.tokenAddresses.forEach((address, index) => {
      const price = prices[index];
      if (price !== undefined) pricesByAddress.set(address.toLowerCase(), price);
    });

    return { pricesByAddress, updatedAt };
  } catch (error) {
    if (!runtime.dryRun) throw error;
    warn(`could not read getPrices() (${errorMessage(error)}); prices will be shown without on-chain baseline`);
    return null;
  }
}

async function verifyKeeper(runtime: Runtime): Promise<void> {
  if (runtime.keeperVerified) return;
  const { cfg, publicClient, account } = runtime;
  if (!cfg.contract || !account) return;

  const keeper = await publicClient.readContract({
    address: cfg.contract,
    abi: clawAbi,
    functionName: "keeper",
  });

  if (keeper.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error(
      `wallet ${account.address} is not the keeper (${keeper}); the owner must call setKeeper(${account.address})`,
    );
  }
  runtime.keeperVerified = true;
}

async function sendPrices(
  runtime: Runtime,
  stocks: ResolvedStock[],
  prices: Map<string, bigint>,
): Promise<string> {
  const { cfg, publicClient, wallet, account } = runtime;
  if (!cfg.contract || !wallet || !account) {
    throw new Error("wallet is not configured");
  }

  const addresses: Address[] = [];
  const values: bigint[] = [];
  for (const stock of stocks) {
    const price = prices.get(stock.symbol);
    if (price === undefined || !stock.address) continue;
    addresses.push(stock.address);
    values.push(price);
  }
  if (addresses.length === 0) throw new Error("nothing to send");

  await verifyKeeper(runtime);

  // Monad charges the gas LIMIT, so estimate and add a small buffer only.
  const estimate = await publicClient.estimateContractGas({
    account,
    address: cfg.contract,
    abi: clawAbi,
    functionName: "setPrices",
    args: [addresses, values],
  });
  const gas = estimate + estimate / 5n + 5_000n;

  const hash = await wallet.writeContract({
    account,
    chain: cfg.chain,
    address: cfg.contract,
    abi: clawAbi,
    functionName: "setPrices",
    args: [addresses, values],
    gas,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
  if (receipt.status !== "success") {
    throw new Error(`setPrices reverted in ${txLink(cfg, hash)}`);
  }

  for (let i = 0; i < addresses.length; i++) {
    const symbol = stocks.find((stock) => stock.address === addresses[i])?.symbol;
    if (symbol) runtime.lastAccepted.set(symbol, values[i]);
  }

  return hash;
}

async function tick(runtime: Runtime): Promise<void> {
  const { cfg, stocks, dryRun } = runtime;

  const chainState = await readChainState(runtime);

  const baseline = new Map<string, bigint>();
  if (chainState) {
    for (const stock of stocks) {
      const onchain = stock.address
        ? chainState.pricesByAddress.get(stock.address.toLowerCase())
        : undefined;
      if (onchain !== undefined && onchain > 0n) baseline.set(stock.symbol, onchain);
    }
  }
  for (const [symbol, price] of runtime.lastAccepted) {
    if (!baseline.has(symbol)) baseline.set(symbol, price);
  }

  const fetched = await fetchPrices(stocks, cfg.priceSource, {
    pythApiKey: cfg.pythApiKey,
  });

  if (fetched.size === 0) {
    throw new Error(`no prices available from PRICE_SOURCE=${cfg.priceSource}`);
  }

  // Sanity check: never push a price that jumped more than MAX_DEVIATION_BPS.
  const accepted = new Map<string, bigint>();
  for (const stock of stocks) {
    const price = fetched.get(stock.symbol);
    if (price === undefined) continue;

    const previous = baseline.get(stock.symbol);
    if (!withinDeviation(price, previous, cfg.maxDeviationBps)) {
      warn(
        `${stock.symbol} skipped: ${formatUsd6(price)} is ${formatBps(
          deviationBps(price, previous!),
        )} from last accepted ${formatUsd6(previous!)}`,
      );
      continue;
    }
    accepted.set(stock.symbol, price);
  }

  if (accepted.size === 0) {
    throw new Error("all prices were skipped by the deviation sanity check");
  }

  const now = BigInt(Math.floor(Date.now() / 1000));
  const updatedAt = chainState?.updatedAt ?? 0n;
  const due = stocks.filter((stock) => {
    const price = accepted.get(stock.symbol);
    if (price === undefined) return false;
    if (!chainState) return true;
    return needsUpdate(price, baseline.get(stock.symbol), updatedAt, now);
  });

  const summary = priceSummary(stocks, fetched);
  const maxMove = stocks.reduce((max, stock) => {
    const price = accepted.get(stock.symbol);
    const previous = baseline.get(stock.symbol);
    if (price === undefined || previous === undefined) return max;
    return deviationBps(price, previous) > max ? deviationBps(price, previous) : max;
  }, 0n);

  if (dryRun) {
    const action =
      due.length > 0
        ? `would update ${due.length}/${stocks.length}`
        : `no update needed (fresh, max move ${formatBps(maxMove)})`;
    line(`DRY ${cfg.network}  ${summary}  | ${action}`);
    return;
  }

  if (due.length === 0) {
    line(`${cfg.network}  ${summary}  | no update needed (fresh, max move ${formatBps(maxMove)})`);
    return;
  }

  const hash = await sendPrices(
    runtime,
    stocks.filter((stock) => accepted.has(stock.symbol)),
    accepted,
  );
  line(`${cfg.network}  ${summary}  | tx ${hash}  | ${txLink(cfg, hash)}`);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(finish, ms);
    wakeUp = finish;
    function finish() {
      clearTimeout(timer);
      wakeUp = undefined;
      resolve();
    }
  });
}

let wakeUp: (() => void) | undefined;
let stopping = false;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    return;
  }

  const flags = parseFlags(argv);
  const cfg = loadConfig();

  if (!flags.dryRun && !cfg.contract) {
    throw new Error("CLAW_MACHINE_ADDRESS is required (or use --dry-run)");
  }
  if (!flags.dryRun && !cfg.privateKey) {
    throw new Error("KEEPER_PRIVATE_KEY is required (or use --dry-run)");
  }

  const publicClient = createPublicClient({
    chain: cfg.chain,
    transport: http(cfg.rpcUrl, { timeout: 20_000, retryCount: 2 }),
    pollingInterval: 500,
  });

  let wallet: WalletClient | undefined;
  let account: PrivateKeyAccount | undefined;

  if (!flags.dryRun) {
    if (!cfg.privateKey) {
      throw new Error("KEEPER_PRIVATE_KEY is required (or use --dry-run)");
    }
    if (cfg.privateKey === `0x${"0".repeat(64)}`) {
      throw new Error("KEEPER_PRIVATE_KEY is still the placeholder from .env.example");
    }
    account = privateKeyToAccount(cfg.privateKey);
    wallet = createWalletClient({
      account,
      chain: cfg.chain,
      transport: http(cfg.rpcUrl, { timeout: 20_000 }),
    });
  }

  const runtime: Runtime = {
    cfg,
    publicClient,
    wallet,
    account,
    stocks: [],
    tokenAddresses: [],
    lastAccepted: new Map(),
    keeperVerified: false,
    dryRun: flags.dryRun,
  };

  runtime.stocks = await resolveStocks(runtime);

  const mode = flags.dryRun ? "dry-run" : flags.once ? "once" : `every ${cfg.intervalSeconds}s`;
  line(
    `keeper starting: ${cfg.network} (chain ${cfg.chain.id}), ${runtime.stocks
      .map((stock) => stock.symbol)
      .join(", ")} | source=${cfg.priceSource} | ${mode}${
      account ? ` | wallet=${account.address}` : ""
    }`,
  );

  process.on("SIGINT", () => {
    stopping = true;
    wakeUp?.();
    line("SIGINT received, stopping after the current tick");
  });
  process.on("SIGTERM", () => {
    stopping = true;
    wakeUp?.();
  });

  do {
    try {
      await tick(runtime);
    } catch (error) {
      console.error(`[${timestamp()}] [error] ${errorMessage(error)}`);
      if (flags.once) {
        process.exitCode = 1;
        return;
      }
      console.error(`[${timestamp()}] [error] retrying in ${cfg.intervalSeconds}s`);
    }

    if (flags.once) return;
    if (!stopping) await wait(cfg.intervalSeconds * 1000);
  } while (!stopping);
}

main().catch((error) => {
  console.error(`[error] ${errorMessage(error)}`);
  process.exitCode = 1;
});
