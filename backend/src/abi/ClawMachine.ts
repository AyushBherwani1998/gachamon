/**
 * ClawMachine ABI - Synced with contract from PR #21
 * 
 * This ABI is based on the IClawMachine interface from the actual contract.
 * Key changes from the temporary ABI:
 * - pull() now takes bytes[] priceUpdateData parameter
 * - Fee functions split into getPythFee, getEntropyFee, getTotalFee
 * - PullRequested event includes pullPrice
 * - New TransferOwed event for failed transfers
 * - Pyth oracle integration for on-chain price feeds
 */

export const ClawMachineABI = [
  // Events
  {
    type: 'event',
    name: 'PullRequested',
    inputs: [
      { name: 'pullId', type: 'uint256', indexed: true },
      { name: 'player', type: 'address', indexed: true },
      { name: 'sequenceNumber', type: 'uint64', indexed: false },
      { name: 'pullPrice', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'PullResolved',
    inputs: [
      { name: 'pullId', type: 'uint256', indexed: true },
      { name: 'player', type: 'address', indexed: true },
      { name: 'legendary', type: 'bool', indexed: false },
      { name: 'stocks', type: 'address[]', indexed: false },
      { name: 'amounts', type: 'uint256[]', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'TransferOwed',
    inputs: [
      { name: 'pullId', type: 'uint256', indexed: true },
      { name: 'player', type: 'address', indexed: true },
      { name: 'token', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'InventoryRefilled',
    inputs: [
      { name: 'stocks', type: 'address[]', indexed: false },
      { name: 'amounts', type: 'uint256[]', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'TokenAdded',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'feedId', type: 'bytes32', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'MaxPriceAgeUpdated',
    inputs: [
      { name: 'oldMaxAge', type: 'uint256', indexed: false },
      { name: 'newMaxAge', type: 'uint256', indexed: false },
    ],
  },

  // Player actions
  {
    type: 'function',
    name: 'pull',
    stateMutability: 'payable',
    inputs: [
      { name: 'userRandomNumber', type: 'bytes32' },
      { name: 'priceUpdateData', type: 'bytes[]' },
    ],
    outputs: [
      { name: 'pullId', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'withdrawOwed',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },

  // View functions - Fees
  {
    type: 'function',
    name: 'getPythFee',
    stateMutability: 'view',
    inputs: [
      { name: 'priceUpdateData', type: 'bytes[]' },
    ],
    outputs: [
      { name: '', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'getEntropyFee',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: '', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'getTotalFee',
    stateMutability: 'view',
    inputs: [
      { name: 'priceUpdateData', type: 'bytes[]' },
    ],
    outputs: [
      { name: '', type: 'uint256' },
    ],
  },

  // View functions - Supported tokens and Pyth feed IDs
  {
    type: 'function',
    name: 'getSupportedTokens',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: '', type: 'address[]' },
    ],
  },
  {
    type: 'function',
    name: 'tokenInfo',
    stateMutability: 'view',
    inputs: [
      { name: 'token', type: 'address' },
    ],
    outputs: [
      { name: 'pythFeedId', type: 'bytes32' },
      { name: 'decimals', type: 'uint8' },
      { name: 'supported', type: 'bool' },
    ],
  },

  // View functions - Machine status
  {
    type: 'function',
    name: 'canPull',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: '', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'getInventoryValue',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'totalValueUSDC', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'getPendingReservations',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: '', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'getOwedBalance',
    stateMutability: 'view',
    inputs: [
      { name: 'player', type: 'address' },
    ],
    outputs: [
      { name: 'stocks', type: 'address[]' },
      { name: 'amounts', type: 'uint256[]' },
    ],
  },
  {
    type: 'function',
    name: 'getPullBasicData',
    stateMutability: 'view',
    inputs: [
      { name: 'pullId', type: 'uint256' },
    ],
    outputs: [
      { name: 'player', type: 'address' },
      { name: 'entropySequence', type: 'uint64' },
      { name: 'reservedValue', type: 'uint256' },
      { name: 'resolved', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'getPullPriceSnapshot',
    stateMutability: 'view',
    inputs: [
      { name: 'pullId', type: 'uint256' },
      { name: 'token', type: 'address' },
    ],
    outputs: [
      { name: '', type: 'uint256' },
    ],
  },

  // Owner functions
  {
    type: 'function',
    name: 'addToken',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'pythFeedId', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'removeToken',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setParameters',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_pullPrice', type: 'uint256' },
      { name: '_commonBps', type: 'uint16' },
      { name: '_legendaryRarityBps', type: 'uint16' },
      { name: '_legendaryMultiplier', type: 'uint16' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setMaxPriceAge',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'newMaxAge', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'refillInventory',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'stocks', type: 'address[]' },
      { name: 'amounts', type: 'uint256[]' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'withdrawTreasury',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'pause',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'unpause',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },

  // Pyth Entropy callback (internal)
  {
    type: 'function',
    name: 'entropyCallback',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'sequenceNumber', type: 'uint64' },
      { name: 'provider', type: 'address' },
      { name: 'randomNumber', type: 'bytes32' },
    ],
    outputs: [],
  },
] as const;
