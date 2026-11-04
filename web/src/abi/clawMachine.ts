/**
 * Canonical ClawMachine interface.
 *
 * NOTE: keep in sync with `contracts/abi/ClawMachine.json` once the contracts
 * worker publishes it. This file is hand-written from the shared interface and
 * is the single source of truth for the web app until then.
 */
export const clawMachineAbi = [
  // ------------------------------------------------------------------ views
  {
    type: "function",
    name: "pullPrice",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "commonValue",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "legendaryValue",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "legendaryBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint16" }],
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
    name: "maxPriceAge",
    stateMutability: "view",
    inputs: [],
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
    name: "keeper",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "treasury",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
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
    name: "canPull",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "inventoryValueUsd6",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "reservedValueUsd6",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getStocks",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address[]" }],
  },
  {
    type: "function",
    name: "getPrices",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "pricesUsd6", type: "uint256[]" },
      { name: "updatedAt", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "getFee",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "totalPulls",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getPull",
    stateMutability: "view",
    inputs: [{ name: "pullId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "player", type: "address" },
          { name: "sequenceNumber", type: "uint64" },
          { name: "status", type: "uint8" },
          { name: "legendary", type: "bool" },
          { name: "requestedAt", type: "uint64" },
          { name: "resolvedAt", type: "uint64" },
          { name: "valueUsd6", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getPullPayout",
    stateMutability: "view",
    inputs: [{ name: "pullId", type: "uint256" }],
    outputs: [
      { name: "stocks", type: "address[]" },
      { name: "amounts", type: "uint256[]" },
    ],
  },
  {
    type: "function",
    name: "getRecentPulls",
    stateMutability: "view",
    inputs: [{ name: "count", type: "uint256" }],
    outputs: [{ name: "pullIds", type: "uint256[]" }],
  },
  {
    type: "function",
    name: "owed",
    stateMutability: "view",
    inputs: [
      { name: "player", type: "address" },
      { name: "stock", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  // --------------------------------------------------------------- gameplay
  {
    type: "function",
    name: "pull",
    stateMutability: "payable",
    inputs: [],
    outputs: [{ name: "pullId", type: "uint256" }],
  },
  {
    type: "function",
    name: "withdrawOwed",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  // ------------------------------------------------------------------ keeper
  {
    type: "function",
    name: "setPrices",
    stateMutability: "nonpayable",
    inputs: [
      { name: "stocks", type: "address[]" },
      { name: "pricesUsd6", type: "uint256[]" },
    ],
    outputs: [],
  },
  // ------------------------------------------------------------------- owner
  {
    type: "function",
    name: "setKeeper",
    stateMutability: "nonpayable",
    inputs: [{ name: "", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "setTreasury",
    stateMutability: "nonpayable",
    inputs: [{ name: "", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "setPullConfig",
    stateMutability: "nonpayable",
    inputs: [
      { name: "pullPrice", type: "uint256" },
      { name: "commonValue", type: "uint256" },
      { name: "legendaryValue", type: "uint256" },
      { name: "legendaryBps", type: "uint16" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "setCallbackGasLimit",
    stateMutability: "nonpayable",
    inputs: [{ name: "", type: "uint32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "setMaxPriceAge",
    stateMutability: "nonpayable",
    inputs: [{ name: "", type: "uint256" }],
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
  {
    type: "function",
    name: "withdrawUsdc",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "withdrawStock",
    stateMutability: "nonpayable",
    inputs: [
      { name: "stock", type: "address" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  // ------------------------------------------------------------------ events
  {
    type: "event",
    name: "PullRequested",
    inputs: [
      { name: "pullId", type: "uint256", indexed: true },
      { name: "player", type: "address", indexed: true },
      { name: "sequenceNumber", type: "uint64", indexed: false },
      { name: "feePaid", type: "uint256", indexed: false },
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
      { name: "valueUsd6", type: "uint256", indexed: false },
      { name: "randomNumber", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PricesUpdated",
    inputs: [
      { name: "stocks", type: "address[]", indexed: false },
      { name: "pricesUsd6", type: "uint256[]", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PayoutOwed",
    inputs: [
      { name: "pullId", type: "uint256", indexed: true },
      { name: "player", type: "address", indexed: true },
      { name: "stock", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;

/** PullStatus enum from the contract. */
export const PullStatus = {
  None: 0,
  Pending: 1,
  Resolved: 2,
} as const;
