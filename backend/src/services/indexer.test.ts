import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const state = {
    lastBlock: null as bigint | null,
  };

  return {
    state,
    getBlockNumber: vi.fn(),
    getLogs: vi.fn(),
    getBlock: vi.fn(),
    insertPull: vi.fn(),
    updatePullResolved: vi.fn(),
    markPullRefunded: vi.fn(),
    setLastBlock: vi.fn((block: bigint) => {
      state.lastBlock = block;
    }),
    getLastBlock: vi.fn(() => state.lastBlock),
    broadcastEvent: vi.fn(),
  };
});

vi.mock('../config.js', () => ({
  config: {
    network: 'mainnet',
    chainId: 143,
    clawMachineAddress: '0x1111111111111111111111111111111111111111',
    isClawMachineConfigured: true,
    startBlock: 100n,
    startBlockConfigured: true,
    indexerBlockRange: 100,
    indexerPollIntervalMs: 60_000,
    relayEnabled: false,
  },
  publicClient: {
    getBlockNumber: mocks.getBlockNumber,
    getLogs: mocks.getLogs,
    getBlock: mocks.getBlock,
  },
}));

vi.mock('../db/index.js', () => ({
  insertPull: mocks.insertPull,
  updatePullResolved: mocks.updatePullResolved,
  markPullRefunded: mocks.markPullRefunded,
  setLastBlock: mocks.setLastBlock,
  getLastBlock: mocks.getLastBlock,
}));

vi.mock('./websocket.js', () => ({
  broadcastEvent: mocks.broadcastEvent,
}));

import { syncToHead } from './indexer.js';
import { config } from '../config.js';

const PLAYER = '0x2222222222222222222222222222222222222222';
const STOCK = '0x3333333333333333333333333333333333333333';
const TX = `0x${'ab'.repeat(32)}`;

function ranges(): string[] {
  return [
    ...new Set(
      mocks.getLogs.mock.calls.map(
        ([params]) => `${params.fromBlock.toString()}-${params.toBlock.toString()}`,
      ),
    ),
  ];
}

describe('ClawMachine indexer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.lastBlock = null;
    (config as { startBlockConfigured: boolean }).startBlockConfigured = true;
    mocks.getBlockNumber.mockResolvedValue(350n);
    mocks.getBlock.mockResolvedValue({ timestamp: 1_760_000_000n });
    mocks.getLogs.mockResolvedValue([]);
    mocks.updatePullResolved.mockReturnValue({ changes: 1 });
    mocks.markPullRefunded.mockReturnValue({ changes: 1 });
  });

  it('pages eth_getLogs in configured block ranges', async () => {
    await syncToHead();

    expect(ranges()).toEqual(['100-199', '200-299', '300-350']);
    expect(mocks.getLogs).toHaveBeenCalledTimes(9);
    expect(mocks.setLastBlock).toHaveBeenNthCalledWith(1, 199n);
    expect(mocks.setLastBlock).toHaveBeenNthCalledWith(2, 299n);
    expect(mocks.setLastBlock).toHaveBeenNthCalledWith(3, 350n);
  });

  it('resumes after the stored checkpoint', async () => {
    mocks.state.lastBlock = 250n;

    await syncToHead();

    expect(ranges()).toEqual(['251-350']);
  });

  it('starts at the head when START_BLOCK is not configured', async () => {
    (config as { startBlockConfigured: boolean }).startBlockConfigured = false;
    mocks.getBlockNumber.mockResolvedValue(500n);

    await syncToHead();

    expect(ranges()).toEqual(['500-500']);
  });

  it('stores PullRequested with feePaid and sequence number', async () => {
    mocks.getLogs.mockImplementation(async ({ event, fromBlock }) => {
      if (event.name !== 'PullRequested' || fromBlock !== 100n) return [];

      return [
        {
          args: {
            pullId: 7n,
            player: PLAYER,
            sequenceNumber: 42n,
            feePaid: 1_480_000_000_000_000_000n,
          },
          transactionHash: TX,
          blockNumber: 120n,
        },
      ];
    });

    await syncToHead();

    expect(mocks.insertPull).toHaveBeenCalledWith({
      pullId: '7',
      player: PLAYER,
      sequenceNumber: '42',
      feePaid: '1480000000000000000',
      txHash: TX,
      blockNumber: '120',
      timestamp: 1_760_000_000,
    });
    expect(mocks.broadcastEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PullRequested', pullId: '7', player: PLAYER }),
    );
  });

  it('stores the full PullResolved payload', async () => {
    const randomNumber = `0x${'cd'.repeat(32)}`;

    mocks.getLogs.mockImplementation(async ({ event, fromBlock }) => {
      if (event.name !== 'PullResolved' || fromBlock !== 100n) return [];

      return [
        {
          args: {
            pullId: 7n,
            player: PLAYER,
            legendary: true,
            stocks: [STOCK],
            amounts: [13_698_630_136_986_301n],
            valueUsd6: 10_000_000n,
            randomNumber,
          },
          transactionHash: TX,
          blockNumber: 121n,
        },
      ];
    });

    await syncToHead();

    expect(mocks.updatePullResolved).toHaveBeenCalledWith({
      pullId: '7',
      legendary: true,
      stocks: [STOCK],
      amounts: ['13698630136986301'],
      valueUsd6: '10000000',
      randomNumber,
      txHash: TX,
      blockNumber: '121',
      timestamp: 1_760_000_000,
    });
    expect(mocks.broadcastEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PullResolved', pullId: '7', player: PLAYER }),
    );
  });

  it('creates a pull row when a resolution has no matching request', async () => {
    mocks.updatePullResolved.mockReturnValueOnce({ changes: 0 });
    mocks.getLogs.mockImplementation(async ({ event, fromBlock }) => {
      if (event.name !== 'PullResolved' || fromBlock !== 100n) return [];

      return [
        {
          args: {
            pullId: 9n,
            player: PLAYER,
            legendary: false,
            stocks: [STOCK],
            amounts: [1n],
            valueUsd6: 730_000n,
            randomNumber: `0x${'ef'.repeat(32)}`,
          },
          transactionHash: TX,
          blockNumber: 130n,
        },
      ];
    });

    await syncToHead();

    expect(mocks.insertPull).toHaveBeenCalledWith(
      expect.objectContaining({ pullId: '9', player: PLAYER, sequenceNumber: '0' }),
    );
    expect(mocks.updatePullResolved).toHaveBeenCalledTimes(2);
  });

  it('stores PullRefunded', async () => {
    mocks.getLogs.mockImplementation(async ({ event, fromBlock }) => {
      if (event.name !== 'PullRefunded' || fromBlock !== 100n) return [];

      return [
        {
          args: { pullId: 7n, player: PLAYER, amount: 1_000_000n },
          transactionHash: TX,
          blockNumber: 140n,
        },
      ];
    });

    await syncToHead();

    expect(mocks.markPullRefunded).toHaveBeenCalledWith({
      pullId: '7',
      amount: '1000000',
      txHash: TX,
      blockNumber: '140',
      timestamp: 1_760_000_000,
    });
    expect(mocks.broadcastEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PullRefunded', pullId: '7', player: PLAYER }),
    );
  });
});
