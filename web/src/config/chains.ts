import { defineChain } from "viem";
import { monad, monadTestnet } from "viem/chains";

/**
 * viem ships `monad` and `monadTestnet`, but the testnet explorer in viem
 * points at testnet.monadexplorer.com. Monad's canonical explorer (and the one
 * used by the rest of this repo) is testnet.monadscan.com, so we re-define
 * both chains with the explorers we link to.
 */
export const monadMainnet = defineChain({
  ...monad,
  blockExplorers: {
    default: { name: "Monadscan", url: "https://monadscan.com" },
  },
});

export const monadTestnetChain = defineChain({
  ...monadTestnet,
  blockExplorers: {
    default: { name: "Monad Testnet Explorer", url: "https://testnet.monadscan.com" },
  },
});

export const EXPLORERS = {
  mainnet: "https://monadscan.com",
  testnet: "https://testnet.monadscan.com",
} as const;

/** Fallback MON faucet for testnet players. */
export const TESTNET_FAUCET_URL = "https://faucet.monad.xyz";
