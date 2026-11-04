import { createPublicClient, http, webSocket, type Chain } from 'viem';
import { defineChain } from 'viem';

export const monad: Chain = defineChain({
  id: 143,
  name: 'Monad',
  nativeCurrency: {
    decimals: 18,
    name: 'Monad',
    symbol: 'MON',
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.monad.xyz'],
      webSocket: ['wss://rpc.monad.xyz'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Monad Explorer',
      url: 'https://explorer.monad.xyz',
    },
  },
});

export const config = {
  port: parseInt(process.env.PORT || '3000'),
  rpcUrl: process.env.RPC_URL || 'https://rpc.monad.xyz',
  wsUrl: process.env.WS_URL || 'wss://rpc.monad.xyz',
  clawMachineAddress: (process.env.CLAW_MACHINE_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`,
  
  // Pyth feed IDs for xStocks tokens
  pythFeedIds: {
    TSLAx: process.env.PYTH_FEED_TSLA || '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
    NVDAx: process.env.PYTH_FEED_NVDA || '0x3115a1f4e7923d68205ea1e3c80271396e2ad7bb4e49df45e3e5a9c1d37b10de',
    AAPLx: process.env.PYTH_FEED_AAPL || '0x49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688',
    SPYx: process.env.PYTH_FEED_SPY || '0x19e09bb805456ada3979a9cd1c90a9a76d9a4401fab4d3f55f0e99dfd7c6f5f1',
  },
  
  // Token addresses on Monad
  tokens: {
    USDC: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603' as `0x${string}`,
    TSLAx: '0x8ad3c73f833d3f9a523ab01476625f269aeb7cf0' as `0x${string}`,
    AAPLx: '0x9d275685dc284c8eb1c79f6aba7a63dc75ec890a' as `0x${string}`,
    NVDAx: '0xc845b2894dbddd03858fd2d643b4ef725fe0849d' as `0x${string}`,
    SPYx: '0x90a2a4c76b5d8c0bc892a69ea28aa775a8f2dd48' as `0x${string}`,
  },
  
  // Rate limiting
  rateLimitWindow: 3000, // 3 seconds in ms
  
  // Gas limits
  maxGasLimit: 500_000n,
  
  // Pyth Hermes API
  pythHermesUrl: 'https://hermes.pyth.network/v2/updates/price/latest',
};

export const publicClient = createPublicClient({
  chain: monad,
  transport: http(config.rpcUrl),
}) as ReturnType<typeof createPublicClient>;

export const wsClient = createPublicClient({
  chain: monad,
  transport: webSocket(config.wsUrl),
}) as ReturnType<typeof createPublicClient>;
