/**
 * ClawMachine ABI for the Chainlink Data Feeds version of the contract
 * (`fix/claw-pyth-entropy`):
 * - pull(userRandomNumber) payable; Chainlink prices are read on-chain
 * - getFee() = the Entropy fee (the whole msg.value)
 * - getTokenPrice(token) = live Chainlink price per whole token, 6 decimals
 * - tokenInfo(token) = (address priceFeed, uint8 decimals, bool supported)
 * - canPull()/getInventoryValue() use live on-chain prices
 * - callbackGasLimit()/setCallbackGasLimit(uint32)
 * - _entropyCallback(...) is the IEntropyConsumer entry point (the web never calls it)
 *
 * Hand-written until the contracts worker pushes
 * `contracts/out/ClawMachine.sol/ClawMachine.json`; re-sync from that file.
 * Do not add the retired Pyth price-update interface (bytes[] priceUpdateData,
 * getPythFee, getTotalFee) or the old audited interface (getRecentPulls, getPull,
 * owed, keeper, setPrices).
 */
export const clawMachineAbi = [
  // Events
  {
    type: "event",
    name: "PullRequested",
    inputs: [
      { name: "pullId", type: "uint256", indexed: true },
      { name: "player", type: "address", indexed: true },
      { name: "sequenceNumber", type: "uint64", indexed: false },
      { name: "pullPrice", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PullResolved",
    inputs: [
      { name: "pullId", type: "uint256", indexed: true },
      { name: "player", type: "address", indexed: true },
      { name: "legendary", type: "bool", indexed: false },
      { name: "stocks", type: "address[]", indexed: false },
      { name: "amounts", type: "uint256[]", indexed: false },
    ],
  },
  {
    type: "event",
    name: "TransferOwed",
    inputs: [
      { name: "pullId", type: "uint256", indexed: true },
      { name: "player", type: "address", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "InventoryRefilled",
    inputs: [
      { name: "stocks", type: "address[]", indexed: false },
      { name: "amounts", type: "uint256[]", indexed: false },
    ],
  },
  {
    type: "event",
    name: "TokenAdded",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "feedId", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "TokenRemoved",
    inputs: [{ name: "token", type: "address", indexed: true }],
  },
  {
    type: "event",
    name: "ParametersUpdated",
    inputs: [
      { name: "pullPrice", type: "uint256", indexed: false },
      { name: "commonBps", type: "uint16", indexed: false },
      { name: "legendaryRarityBps", type: "uint16", indexed: false },
      { name: "legendaryMultiplier", type: "uint16", indexed: false },
    ],
  },
  {
    type: "event",
    name: "MaxPriceAgeUpdated",
    inputs: [
      { name: "oldMaxAge", type: "uint256", indexed: false },
      { name: "newMaxAge", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "CallbackGasLimitUpdated",
    inputs: [
      { name: "oldLimit", type: "uint32", indexed: false },
      { name: "newLimit", type: "uint32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PullRefunded",
    inputs: [
      { name: "pullId", type: "uint256", indexed: true },
      { name: "player", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },

  // Player actions
  {
    type: "function",
    name: "pull",
    stateMutability: "payable",
    inputs: [{ name: "userRandomNumber", type: "bytes32" }],
    outputs: [{ name: "pullId", type: "uint256" }],
  },
  {
    type: "function",
    name: "withdrawOwed",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },

  // View functions - fees and machine status
  {
    type: "function",
    name: "getFee",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getEntropyFee",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getTokenPrice",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [
      { name: "priceUsd6", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "canPull",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "getInventoryValue",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "totalValueUSDC", type: "uint256" }],
  },
  {
    type: "function",
    name: "paused",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "pullPrice",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "commonPayoutBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint16" }],
  },
  {
    type: "function",
    name: "legendaryRarityBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint16" }],
  },
  {
    type: "function",
    name: "legendaryMultiplier",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint16" }],
  },
  {
    type: "function",
    name: "maxPriceAge",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "pendingReservations",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getPendingReservations",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "nextPullId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "callbackGasLimit",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint32" }],
  },
  {
    type: "function",
    name: "getSupportedTokens",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address[]" }],
  },
  {
    type: "function",
    name: "tokenInfo",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [
      { name: "priceFeed", type: "address" },
      { name: "decimals", type: "uint8" },
      { name: "supported", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "getOwedBalance",
    stateMutability: "view",
    inputs: [{ name: "player", type: "address" }],
    outputs: [
      { name: "stocks", type: "address[]" },
      { name: "amounts", type: "uint256[]" },
    ],
  },
  {
    type: "function",
    name: "getPullBasicData",
    stateMutability: "view",
    inputs: [{ name: "pullId", type: "uint256" }],
    outputs: [
      { name: "player", type: "address" },
      { name: "entropySequence", type: "uint64" },
      { name: "reservedValue", type: "uint256" },
      { name: "resolved", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "getPullPriceSnapshot",
    stateMutability: "view",
    inputs: [
      { name: "pullId", type: "uint256" },
      { name: "token", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "usdc",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "entropy",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "entropyProvider",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "pyth",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },

  // Owner functions (not called by the web, kept for a complete ABI)
  {
    type: "function",
    name: "addToken",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "priceFeed", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "removeToken",
    stateMutability: "nonpayable",
    inputs: [{ name: "token", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "setParameters",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_pullPrice", type: "uint256" },
      { name: "_commonBps", type: "uint16" },
      { name: "_legendaryRarityBps", type: "uint16" },
      { name: "_legendaryMultiplier", type: "uint16" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "setMaxPriceAge",
    stateMutability: "nonpayable",
    inputs: [{ name: "newMaxAge", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "setCallbackGasLimit",
    stateMutability: "nonpayable",
    inputs: [{ name: "newLimit", type: "uint32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "refillInventory",
    stateMutability: "nonpayable",
    inputs: [
      { name: "stocks", type: "address[]" },
      { name: "amounts", type: "uint256[]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "withdrawTreasury",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "refundStuckPull",
    stateMutability: "nonpayable",
    inputs: [{ name: "pullId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "withdrawInventory",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "pause",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "unpause",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },

  // Pyth Entropy callback (IEntropyConsumer). Internal to the contract.
  {
    type: "function",
    name: "_entropyCallback",
    stateMutability: "nonpayable",
    inputs: [
      { name: "sequence", type: "uint64" },
      { name: "provider", type: "address" },
      { name: "randomNumber", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

/** Alias matching the ABI file name used by the contracts worker. */
export const ClawMachineABI = clawMachineAbi;
