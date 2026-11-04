import { wsClient, publicClient, config } from '../config.js';
import { ClawMachineABI } from '../abi/ClawMachine.js';
import { insertPull, updatePullResolved, getLastBlock, setLastBlock } from '../db/index.js';
import { broadcastEvent } from './websocket.js';

const BLOCK_RANGE_LIMIT = 1000; // Monad has eth_getLogs range limits

export async function startIndexer() {
  console.log('Starting indexer...');
  
  // Backfill from last processed block
  await backfillEvents();
  
  // Watch for new events
  watchEvents();
}

async function backfillEvents() {
  try {
    const currentBlock = await publicClient.getBlockNumber();
    let lastBlock = getLastBlock();
    
    if (!lastBlock) {
      // Start from 1000 blocks ago if no last block
      lastBlock = currentBlock - 1000n > 0n ? currentBlock - 1000n : 0n;
      setLastBlock(lastBlock);
    }
    
    console.log(`Backfilling events from block ${lastBlock} to ${currentBlock}`);
    
    // Process in chunks to respect range limits
    let fromBlock = lastBlock + 1n;
    
    while (fromBlock <= currentBlock) {
      const toBlock = fromBlock + BigInt(BLOCK_RANGE_LIMIT) - 1n < currentBlock
        ? fromBlock + BigInt(BLOCK_RANGE_LIMIT) - 1n
        : currentBlock;
      
      console.log(`Fetching logs from ${fromBlock} to ${toBlock}`);
      
      // Fetch PullRequested events
      const pullRequestedLogs = await publicClient.getLogs({
        address: config.clawMachineAddress,
        event: {
          type: 'event',
          name: 'PullRequested',
          inputs: [
            { name: 'pullId', type: 'uint256', indexed: true },
            { name: 'player', type: 'address', indexed: true },
            { name: 'sequenceNumber', type: 'uint64', indexed: false },
            { name: 'pullPrice', type: 'uint256', indexed: false },
          ],
        },
        fromBlock,
        toBlock,
      }).catch((err) => {
        console.error('Error fetching PullRequested logs:', err);
        return [];
      });
      
      for (const log of pullRequestedLogs) {
        try {
          const block = await publicClient.getBlock({ blockNumber: log.blockNumber });
          
          insertPull({
            pullId: log.topics[1] as string,
            player: `0x${log.topics[2]?.slice(26)}` as string,
            sequenceNumber: log.data as string,
            txHash: log.transactionHash as string,
            blockNumber: log.blockNumber.toString(),
            timestamp: Number(block.timestamp),
          });
          
          console.log(`Indexed PullRequested: pullId=${log.topics[1]}`);
        } catch (error) {
          console.error('Error processing PullRequested log:', error);
        }
      }
      
      // Fetch PullResolved events
      const pullResolvedLogs = await publicClient.getLogs({
        address: config.clawMachineAddress,
        event: {
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
        fromBlock,
        toBlock,
      }).catch((err) => {
        console.error('Error fetching PullResolved logs:', err);
        return [];
      });
      
      for (const log of pullResolvedLogs) {
        try {
          const block = await publicClient.getBlock({ blockNumber: log.blockNumber });
          
          // Decode event data
          // This is simplified; in production you'd use proper ABI decoding
          const pullId = log.topics[1] as string;
          
          updatePullResolved({
            pullId,
            legendary: false, // Would decode from log.data
            stocks: [], // Would decode from log.data
            amounts: [], // Would decode from log.data
            txHash: log.transactionHash as string,
            blockNumber: log.blockNumber.toString(),
            timestamp: Number(block.timestamp),
          });
          
          console.log(`Indexed PullResolved: pullId=${pullId}`);
        } catch (error) {
          console.error('Error processing PullResolved log:', error);
        }
      }
      
      setLastBlock(toBlock);
      fromBlock = toBlock + 1n;
    }
    
    console.log(`Backfill complete. Last block: ${currentBlock}`);
  } catch (error) {
    console.error('Error in backfill:', error);
  }
}

function watchEvents() {
  console.log('Watching for new events...');
  
  // Watch PullRequested
  wsClient.watchContractEvent({
    address: config.clawMachineAddress,
    abi: ClawMachineABI,
    eventName: 'PullRequested',
    onLogs: async (logs) => {
      for (const log of logs) {
        try {
          const block = await publicClient.getBlock({ blockNumber: log.blockNumber });
          
          const pullId = log.topics[1] as string;
          const player = `0x${log.topics[2]?.slice(26)}` as string;
          
          insertPull({
            pullId,
            player,
            sequenceNumber: log.args.sequenceNumber?.toString() || '0',
            txHash: log.transactionHash as string,
            blockNumber: log.blockNumber.toString(),
            timestamp: Number(block.timestamp),
          });
          
          console.log(`New PullRequested: pullId=${pullId}, player=${player}`);
          
          broadcastEvent({
            type: 'PullRequested',
            pullId,
            player,
            data: {
              sequenceNumber: log.args.sequenceNumber?.toString(),
              txHash: log.transactionHash,
            },
          });
          
          setLastBlock(log.blockNumber);
        } catch (error) {
          console.error('Error processing PullRequested event:', error);
        }
      }
    },
  });
  
  // Watch PullResolved
  wsClient.watchContractEvent({
    address: config.clawMachineAddress,
    abi: ClawMachineABI,
    eventName: 'PullResolved',
    onLogs: async (logs) => {
      for (const log of logs) {
        try {
          const block = await publicClient.getBlock({ blockNumber: log.blockNumber });
          
          const pullId = log.topics[1] as string;
          const player = `0x${log.topics[2]?.slice(26)}` as string;
          const { legendary, stocks, amounts } = log.args;
          
          updatePullResolved({
            pullId,
            legendary: legendary as boolean,
            stocks: stocks as string[],
            amounts: (amounts as bigint[]).map(a => a.toString()),
            txHash: log.transactionHash as string,
            blockNumber: log.blockNumber.toString(),
            timestamp: Number(block.timestamp),
          });
          
          console.log(`New PullResolved: pullId=${pullId}, legendary=${legendary}`);
          
          broadcastEvent({
            type: 'PullResolved',
            pullId,
            player,
            data: {
              legendary,
              stocks,
              amounts: (amounts as bigint[]).map(a => a.toString()),
              txHash: log.transactionHash,
            },
          });
          
          setLastBlock(log.blockNumber);
        } catch (error) {
          console.error('Error processing PullResolved event:', error);
        }
      }
    },
  });
}
