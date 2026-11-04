import { parseTransaction, decodeFunctionData, encodeFunctionData, getAddress, recoverTransactionAddress, keccak256 } from 'viem';
import { publicClient, config } from '../config.js';
import { ClawMachineABI } from '../abi/ClawMachine.js';
import { RelayResponse } from '../types/index.js';
import { checkRateLimit, recordPull, isDuplicateTx, recordTx } from '../utils/rateLimiter.js';

const PULL_SELECTOR = encodeFunctionData({
  abi: ClawMachineABI,
  functionName: 'pull',
  args: ['0x0000000000000000000000000000000000000000000000000000000000000000', []],
}).slice(0, 10);

export async function validateAndRelayTransaction(signedTx: string): Promise<RelayResponse> {
  let tx;
  try {
    tx = parseTransaction(signedTx as `0x${string}`);
  } catch (error) {
    return {
      txHash: '',
      status: 'reverted',
      error: 'Invalid transaction format',
    };
  }

  // Compute transaction hash
  const txHash = keccak256(signedTx as `0x${string}`);

  // Check for duplicate
  if (isDuplicateTx(txHash)) {
    return {
      txHash,
      status: 'reverted',
      error: 'Duplicate transaction',
    };
  }

  // Validate chain ID
  if (tx.chainId !== 143) {
    return {
      txHash,
      status: 'reverted',
      error: `Invalid chain ID: expected 143, got ${tx.chainId}`,
    };
  }

  // Validate 'to' address
  if (!tx.to || getAddress(tx.to) !== getAddress(config.clawMachineAddress)) {
    return {
      txHash,
      status: 'reverted',
      error: `Invalid 'to' address: expected ${config.clawMachineAddress}`,
    };
  }

  // Validate function selector
  const data = tx.data || '0x';
  if (!data.startsWith(PULL_SELECTOR)) {
    return {
      txHash,
      status: 'reverted',
      error: `Invalid function selector: expected pull()`,
    };
  }

  // Decode calldata
  let decodedData;
  let priceUpdateData: readonly `0x${string}`[];
  try {
    decodedData = decodeFunctionData({
      abi: ClawMachineABI,
      data: data as `0x${string}`,
    });
    
    // Extract priceUpdateData from args
    if (decodedData.functionName === 'pull' && decodedData.args.length >= 2) {
      priceUpdateData = decodedData.args[1] as readonly `0x${string}`[];
    } else {
      return {
        txHash,
        status: 'reverted',
        error: 'Invalid pull() arguments',
      };
    }
  } catch (error) {
    return {
      txHash,
      status: 'reverted',
      error: 'Invalid calldata',
    };
  }

  // Validate gas limit
  if (tx.gas && tx.gas > config.maxGasLimit) {
    return {
      txHash,
      status: 'reverted',
      error: `Gas limit too high: ${tx.gas} > ${config.maxGasLimit}`,
    };
  }

  // Recover sender from transaction
  let sender: string;
  try {
    // Cast to the proper serialized transaction type
    type SerializedTx = `0x02${string}` | `0x01${string}` | `0x03${string}` | `0x04${string}`;
    sender = await recoverTransactionAddress({
      serializedTransaction: signedTx as SerializedTx,
    });
  } catch (error) {
    return {
      txHash,
      status: 'reverted',
      error: 'Failed to recover sender address',
    };
  }

  // Check rate limit
  const rateLimit = checkRateLimit(sender);
  if (!rateLimit.allowed) {
    return {
      txHash,
      status: 'reverted',
      error: `Rate limited: please wait ${Math.ceil(rateLimit.waitTime! / 1000)}s`,
    };
  }

  // Validate value (should cover getTotalFee)
  // Call contract to get the required fee
  try {
    const requiredFee = await publicClient.readContract({
      address: config.clawMachineAddress,
      abi: ClawMachineABI,
      functionName: 'getTotalFee',
      args: [priceUpdateData],
    });
    
    if (!tx.value || tx.value < requiredFee) {
      return {
        txHash,
        status: 'reverted',
        error: `Insufficient value: ${tx.value} < ${requiredFee} (required for Pyth + Entropy fees)`,
      };
    }
  } catch (error) {
    // If contract call fails (contract not deployed yet), just check non-zero
    if (!tx.value || tx.value === 0n) {
      return {
        txHash,
        status: 'reverted',
        error: 'Transaction value must cover Pyth + Entropy fees',
      };
    }
  }

  // Record the pull and tx
  recordPull(sender);
  recordTx(txHash);

  // Broadcast transaction
  try {
    // Try eth_sendRawTransactionSync first (Monad-specific)
    let broadcastHash: `0x${string}`;
    try {
      const hash = await publicClient.request({
        method: 'eth_sendRawTransactionSync' as any,
        params: [signedTx as `0x${string}`],
      }) as string;
      broadcastHash = hash as `0x${string}`;
    } catch (syncError) {
      // Fallback to standard eth_sendRawTransaction
      broadcastHash = await publicClient.sendRawTransaction({
        serializedTransaction: signedTx as `0x${string}`,
      });
    }

    // Wait for receipt
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: broadcastHash,
      timeout: 30_000,
    });

    if (receipt.status === 'reverted') {
      return {
        txHash: broadcastHash,
        status: 'reverted',
        revertReason: 'Transaction reverted on-chain',
      };
    }

    // Extract pullId from PullRequested event
    let pullId: string | undefined;
    for (const log of receipt.logs) {
      try {
        if (log.topics[0] === '0x' + 'PullRequested'.padStart(64, '0')) {
          pullId = log.topics[1]; // pullId is first indexed parameter
          break;
        }
      } catch {}
    }

    return {
      txHash: broadcastHash,
      status: 'success',
      pullId,
    };
  } catch (error: any) {
    // Handle specific errors
    if (error.message?.includes('nonce too low')) {
      return {
        txHash,
        status: 'reverted',
        error: 'Nonce too low - transaction may have been replaced',
      };
    }

    if (error.message?.includes('insufficient funds')) {
      return {
        txHash,
        status: 'reverted',
        error: 'Insufficient funds for gas and fees',
      };
    }

    return {
      txHash,
      status: 'reverted',
      error: error.message || 'Failed to broadcast transaction',
    };
  }
}
