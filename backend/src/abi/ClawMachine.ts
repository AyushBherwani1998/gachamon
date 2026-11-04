/**
 * TEMPORARY ABI FILE - TO BE REGENERATED FROM REAL CONTRACT
 * 
 * This ABI is manually defined based on the IClawMachine interface specification
 * from plan.md. Once the actual ClawMachine.sol contract is deployed, regenerate
 * this file using the compiled ABI.
 * 
 * TODO: Replace with actual ABI after contract deployment
 */

export const ClawMachineABI = [
  {
    type: 'event',
    name: 'PullRequested',
    inputs: [
      { name: 'pullId', type: 'uint256', indexed: true },
      { name: 'player', type: 'address', indexed: true },
      { name: 'sequenceNumber', type: 'uint64', indexed: false },
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
    name: 'InventoryRefilled',
    inputs: [
      { name: 'owner', type: 'address', indexed: true },
      { name: 'stocks', type: 'address[]', indexed: false },
      { name: 'amounts', type: 'uint256[]', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'PricesUpdated',
    inputs: [
      { name: 'stocks', type: 'address[]', indexed: false },
      { name: 'prices', type: 'uint256[]', indexed: false },
      { name: 'timestamp', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'TransferOwed',
    inputs: [
      { name: 'pullId', type: 'uint256', indexed: true },
      { name: 'player', type: 'address', indexed: true },
      { name: 'stock', type: 'address', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'function',
    name: 'pull',
    stateMutability: 'payable',
    inputs: [
      { name: 'userRandomNumber', type: 'bytes32' },
    ],
    outputs: [
      { name: 'pullId', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'withdraw',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
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
    name: 'getFee',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'entropyFeeInMON', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'getInventoryValue',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'totalValueUSD', type: 'uint256' },
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
    name: 'getPull',
    stateMutability: 'view',
    inputs: [
      { name: 'pullId', type: 'uint256' },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'player', type: 'address' },
          { name: 'entropySequence', type: 'uint64' },
          { name: 'reservedValue', type: 'uint256' },
          { name: 'resolved', type: 'bool' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'setPrices',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'stocks', type: 'address[]' },
      { name: 'prices', type: 'uint256[]' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setOracle',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'newOracle', type: 'address' },
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
    name: 'setKeeper',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'newKeeper', type: 'address' },
    ],
    outputs: [],
  },
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
