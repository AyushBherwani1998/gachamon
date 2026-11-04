import {
  decodeFunctionData,
  encodeFunctionData,
  getAddress,
  keccak256,
  parseEventLogs,
  parseTransaction,
  recoverTransactionAddress,
} from 'viem';
import { config, publicClient } from '../config.js';
import { ClawMachineABI } from '../abi/ClawMachine.js';
import { RelayResponse } from '../types/index.js';
import { checkRateLimit, recordPull, isDuplicateTx, recordTx } from '../utils/rateLimiter.js';

export const PULL_SELECTOR = encodeFunctionData({
  abi: ClawMachineABI,
  functionName: 'pull',
});

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

  // Transaction hash is keccak256 of the serialized signed transaction.
  const txHash = keccak256(signedTx as `0x${string}`);

  if (isDuplicateTx(txHash)) {
    return {
      txHash,
      status: 'reverted',
      error: 'Duplicate transaction',
    };
  }

  if (tx.chainId !== config.chainId) {
    return {
      txHash,
      status: 'reverted',
      error: `Invalid chain ID: expected ${config.chainId}, got ${tx.chainId}`,
    };
  }

  if (!tx.to || getAddress(tx.to) !== getAddress(config.clawMachineAddress)) {
    return {
      txHash,
      status: 'reverted',
      error: `Invalid 'to' address: expected ${config.clawMachineAddress}`,
    };
  }

  // The audited contract exposes pull() with no calldata arguments.
  const data = tx.data || '0x';
  if (data.slice(0, 10).toLowerCase() !== PULL_SELECTOR.toLowerCase()) {
    return {
      txHash,
      status: 'reverted',
      error: 'Invalid function selector: expected pull()',
    };
  }

  try {
    const decoded = decodeFunctionData({
      abi: ClawMachineABI,
      data: data as `0x${string}`,
    });

    if (decoded.functionName !== 'pull') {
      return {
        txHash,
        status: 'reverted',
        error: 'Invalid function: expected pull()',
      };
    }
  } catch (error) {
    return {
      txHash,
      status: 'reverted',
      error: 'Invalid calldata',
    };
  }

  if (tx.gas && tx.gas > config.maxGasLimit) {
    return {
      txHash,
      status: 'reverted',
      error: `Gas limit too high: ${tx.gas} > ${config.maxGasLimit}`,
    };
  }

  let sender: string;
  try {
    sender = await recoverTransactionAddress({
      serializedTransaction:
        signedTx as Parameters<typeof recoverTransactionAddress>[0]['serializedTransaction'],
    });
  } catch (error) {
    return {
      txHash,
      status: 'reverted',
      error: 'Failed to recover sender address',
    };
  }

  const rateLimit = checkRateLimit(sender);
  if (!rateLimit.allowed) {
    return {
      txHash,
      status: 'reverted',
      error: `Rate limited: please wait ${Math.ceil((rateLimit.waitTime ?? 0) / 1000)}s`,
    };
  }

  // msg.value must cover the Pyth Entropy fee reported by the contract.
  let requiredFee: bigint;
  try {
    requiredFee = await publicClient.readContract({
      address: config.clawMachineAddress,
      abi: ClawMachineABI,
      functionName: 'getFee',
    });
  } catch (error) {
    return {
      txHash,
      status: 'reverted',
      error: 'Unable to read getFee() from ClawMachine; check CLAW_MACHINE_ADDRESS and RPC_URL',
    };
  }

  if ((tx.value ?? 0n) < requiredFee) {
    return {
      txHash,
      status: 'reverted',
      error: `Insufficient value: ${tx.value ?? 0n} < ${requiredFee} (getFee())`,
    };
  }

  recordPull(sender);
  recordTx(txHash);

  try {
    const broadcastHash = await publicClient.sendRawTransaction({
      serializedTransaction: signedTx as `0x${string}`,
    });

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

    const [requested] = parseEventLogs({
      abi: ClawMachineABI,
      eventName: 'PullRequested',
      logs: receipt.logs,
    });

    return {
      txHash: broadcastHash,
      status: 'success',
      pullId: requested?.args.pullId.toString(),
    };
  } catch (error: any) {
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
