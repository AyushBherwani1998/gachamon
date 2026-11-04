import { parseAbiItem } from 'viem';
import { config, publicClient } from '../config.js';
import {
  getLastBlock,
  insertPull,
  markPullRefunded,
  setLastBlock,
  updatePullResolved,
} from '../db/index.js';
import { broadcastEvent } from './websocket.js';

const pullRequestedEvent = parseAbiItem(
  'event PullRequested(uint256 indexed pullId, address indexed player, uint64 sequenceNumber, uint256 feePaid)',
);
const pullResolvedEvent = parseAbiItem(
  'event PullResolved(uint256 indexed pullId, address indexed player, bool legendary, address[] stocks, uint256[] amounts, uint256 valueUsd6, bytes32 randomNumber)',
);
const pullRefundedEvent = parseAbiItem(
  'event PullRefunded(uint256 indexed pullId, address indexed player, uint256 amount)',
);

const RETRY_ATTEMPTS = 3;

let pollTimer: ReturnType<typeof setInterval> | null = null;
let syncing = false;
let started = false;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < RETRY_ATTEMPTS - 1) {
        await sleep(500 * (attempt + 1));
      }
    }
  }

  throw new Error(
    `${label} failed after ${RETRY_ATTEMPTS} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

async function getTimestamps(blockNumbers: Iterable<bigint>): Promise<Map<bigint, number>> {
  const unique = [...new Set(blockNumbers)];
  const timestamps = new Map<bigint, number>();

  await Promise.all(
    unique.map(async (blockNumber) => {
      const block = await withRetry(`eth_getBlockByNumber(${blockNumber})`, () =>
        publicClient.getBlock({ blockNumber }),
      );
      timestamps.set(blockNumber, Number(block.timestamp));
    }),
  );

  return timestamps;
}

async function indexRange(fromBlock: bigint, toBlock: bigint): Promise<void> {
  const address = config.clawMachineAddress;

  const [requestedLogs, resolvedLogs, refundedLogs] = await Promise.all([
    withRetry('PullRequested logs', () =>
      publicClient.getLogs({
        address,
        event: pullRequestedEvent,
        fromBlock,
        toBlock,
      }),
    ),
    withRetry('PullResolved logs', () =>
      publicClient.getLogs({
        address,
        event: pullResolvedEvent,
        fromBlock,
        toBlock,
      }),
    ),
    withRetry('PullRefunded logs', () =>
      publicClient.getLogs({
        address,
        event: pullRefundedEvent,
        fromBlock,
        toBlock,
      }),
    ),
  ]);

  const blockNumbers = [
    ...requestedLogs.map((log) => log.blockNumber),
    ...resolvedLogs.map((log) => log.blockNumber),
    ...refundedLogs.map((log) => log.blockNumber),
  ];
  const timestamps = await getTimestamps(blockNumbers);

  for (const log of requestedLogs) {
    try {
      const { pullId, player, sequenceNumber, feePaid } = log.args;
      if (pullId === undefined || player === undefined) continue;

      const blockNumber = log.blockNumber;
      const timestamp = timestamps.get(blockNumber) ?? Math.floor(Date.now() / 1000);
      const id = pullId.toString();

      insertPull({
        pullId: id,
        player,
        sequenceNumber: (sequenceNumber ?? 0n).toString(),
        feePaid: feePaid?.toString(),
        txHash: log.transactionHash,
        blockNumber: blockNumber.toString(),
        timestamp,
      });

      broadcastEvent({
        type: 'PullRequested',
        pullId: id,
        player,
        data: {
          sequenceNumber: (sequenceNumber ?? 0n).toString(),
          feePaid: (feePaid ?? 0n).toString(),
          txHash: log.transactionHash,
          blockNumber: blockNumber.toString(),
        },
      });
    } catch (error) {
      console.error('Error processing PullRequested log:', error);
    }
  }

  for (const log of resolvedLogs) {
    try {
      const { pullId, player, legendary, stocks, amounts, valueUsd6, randomNumber } = log.args;
      if (pullId === undefined || player === undefined) continue;

      const blockNumber = log.blockNumber;
      const timestamp = timestamps.get(blockNumber) ?? Math.floor(Date.now() / 1000);
      const id = pullId.toString();
      const resolved = {
        pullId: id,
        legendary: Boolean(legendary),
        stocks: [...(stocks ?? [])],
        amounts: [...(amounts ?? [])].map((amount) => amount.toString()),
        valueUsd6: (valueUsd6 ?? 0n).toString(),
        randomNumber: randomNumber ?? '0x',
        txHash: log.transactionHash,
        blockNumber: blockNumber.toString(),
        timestamp,
      };

      let result = updatePullResolved(resolved);
      if (result.changes === 0) {
        // The request event may predate START_BLOCK or the local database.
        insertPull({
          pullId: id,
          player,
          sequenceNumber: '0',
          txHash: log.transactionHash,
          blockNumber: blockNumber.toString(),
          timestamp,
        });
        result = updatePullResolved(resolved);
      }

      broadcastEvent({
        type: 'PullResolved',
        pullId: id,
        player,
        data: {
          legendary: resolved.legendary,
          stocks: resolved.stocks,
          amounts: resolved.amounts,
          valueUsd6: resolved.valueUsd6,
          randomNumber: resolved.randomNumber,
          txHash: log.transactionHash,
          blockNumber: blockNumber.toString(),
        },
      });
    } catch (error) {
      console.error('Error processing PullResolved log:', error);
    }
  }

  for (const log of refundedLogs) {
    try {
      const { pullId, player, amount } = log.args;
      if (pullId === undefined || player === undefined) continue;

      const blockNumber = log.blockNumber;
      const timestamp = timestamps.get(blockNumber) ?? Math.floor(Date.now() / 1000);
      const id = pullId.toString();
      const refund = {
        pullId: id,
        amount: (amount ?? 0n).toString(),
        txHash: log.transactionHash,
        blockNumber: blockNumber.toString(),
        timestamp,
      };

      let result = markPullRefunded(refund);
      if (result.changes === 0) {
        insertPull({
          pullId: id,
          player,
          sequenceNumber: '0',
          txHash: log.transactionHash,
          blockNumber: blockNumber.toString(),
          timestamp,
        });
        result = markPullRefunded(refund);
      }

      broadcastEvent({
        type: 'PullRefunded',
        pullId: id,
        player,
        data: {
          amount: refund.amount,
          txHash: log.transactionHash,
          blockNumber: blockNumber.toString(),
        },
      });
    } catch (error) {
      console.error('Error processing PullRefunded log:', error);
    }
  }
}

function nextFromBlock(head: bigint): bigint {
  const checkpoint = getLastBlock();

  if (checkpoint !== null) {
    const next = checkpoint + 1n;
    return next > config.startBlock ? next : config.startBlock;
  }

  // Without START_BLOCK, index live from the current head instead of walking
  // the whole chain through a rate-limited public RPC.
  return config.startBlockConfigured ? config.startBlock : head;
}

/**
 * Fetch and index every block up to the current head.
 * Safe to call repeatedly; already-indexed ranges resume from the checkpoint.
 */
export async function syncToHead(): Promise<void> {
  if (!config.isClawMachineConfigured) {
    return;
  }

  const head = await publicClient.getBlockNumber();
  let fromBlock = nextFromBlock(head);

  if (fromBlock > head) {
    return;
  }

  const isBackfill = head - fromBlock + 1n > BigInt(config.indexerBlockRange);
  if (isBackfill) {
    console.log(`Indexing ClawMachine logs from block ${fromBlock} to ${head}`);
  }

  const range = BigInt(config.indexerBlockRange);

  while (fromBlock <= head) {
    const toBlock = fromBlock + range - 1n < head ? fromBlock + range - 1n : head;

    await indexRange(fromBlock, toBlock);
    setLastBlock(toBlock);

    fromBlock = toBlock + 1n;
  }

  if (isBackfill) {
    console.log(`Indexer caught up to block ${head}`);
  }
}

async function runOnce(): Promise<void> {
  if (syncing) return;
  syncing = true;

  try {
    await syncToHead();
  } catch (error) {
    console.error('Indexer error:', error);
  } finally {
    syncing = false;
  }
}

export async function startIndexer(): Promise<void> {
  if (started) return;
  started = true;

  if (!config.isClawMachineConfigured) {
    console.warn('CLAW_MACHINE_ADDRESS is not set; indexer is disabled.');
    return;
  }

  if (!config.startBlockConfigured && getLastBlock() === null) {
    console.warn(
      'START_BLOCK is not set; indexing only new blocks. Set START_BLOCK to the deployment block to backfill history.',
    );
  }

  console.log(
    `Starting indexer (chain ${config.chainId}, ${config.indexerBlockRange}-block pages, ${config.indexerPollIntervalMs}ms poll)`,
  );

  await runOnce();

  pollTimer = setInterval(() => {
    void runOnce();
  }, config.indexerPollIntervalMs);
}

export function stopIndexer(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  started = false;
}
