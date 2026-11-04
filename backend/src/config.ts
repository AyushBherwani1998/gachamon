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
  
  // Pyth contracts on Monad
  pythPriceFeedAddress: (process.env.PYTH_PRICE_FEED_ADDRESS || '0xB754BA51E3861Ac0Cb67f73CD046dE790A36508d') as `0x${string}`,
  pythEntropyAddress: '0xD458261E832415CFd3BAE5E416FdF3230ce6F134' as `0x${string}`,
  
  // Pyth feed IDs for xStocks tokens (equity price feeds)
  pythFeedIds: {
    TSLAx: process.env.PYTH_FEED_TSLA || '0x16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1',
    NVDAx: process.env.PYTH_FEED_NVDA || '0xb1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593',
    AAPLx: process.env.PYTH_FEED_AAPL || '0x49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688',
    SPYx: process.env.PYTH_FEED_SPY || '0x19e09bb805456ada3979a7d1cbb4b6d63babc3a0f8e8a9509f68afa5c4c11cd5',
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
  
  // Pyth Hermes API (server-side only: PYTH_API_KEY must never reach the browser)
  // The Pyth Core upgrade requires an API key on every Hermes request.
  pythHermesUrl: process.env.PYTH_HERMES_URL || 'https://pyth.dourolabs.app/hermes/v2/updates/price/latest',
  pythApiKey: process.env.PYTH_API_KEY,

  // Symbols requested when the caller does not pass ?symbols= and the contract
  // is not configured. Only list feeds the API key is entitled to: requesting
  // a non-entitled feed makes Hermes reject the whole batch with 403.
  pythFeeds: (process.env.PYTH_FEEDS || 'TSLAx')
    .split(',')
    .map((symbol) => symbol.trim())
    .filter((symbol) => symbol.length > 0),
};

export const publicClient = createPublicClient({
  chain: monad,
  transport: http(config.rpcUrl),
}) as ReturnType<typeof createPublicClient>;

export const wsClient = createPublicClient({
  chain: monad,
  transport: webSocket(config.wsUrl),
}) as ReturnType<typeof createPublicClient>;
