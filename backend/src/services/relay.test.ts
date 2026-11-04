import { describe, it, expect, beforeEach, vi } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { validateAndRelayTransaction } from './relay.js';
import { config } from '../config.js';

// Mock the publicClient
vi.mock('../config.js', async () => {
  const actual = await vi.importActual('../config.js');
  return {
    ...actual,
    publicClient: {
      sendRawTransaction: vi.fn().mockResolvedValue('0x123'),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({
        status: 'success',
        logs: [],
      }),
      request: vi.fn().mockRejectedValue(new Error('Method not supported')),
    },
  };
});

describe('Transaction Relay Validation', () => {
  const testAccount = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
  
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  it('should reject transaction with wrong chain ID', async () => {
    const tx = await testAccount.signTransaction({
      to: config.clawMachineAddress,
      value: 0n,
      data: '0x',
      chainId: 1, // Wrong chain
      nonce: 0,
      gas: 100000n,
      maxFeePerGas: 1000000000n,
      maxPriorityFeePerGas: 1000000000n,
    });
    
    const result = await validateAndRelayTransaction(tx);
    expect(result.status).toBe('reverted');
    expect(result.error).toContain('Invalid chain ID');
  });
  
  it('should reject transaction with wrong recipient address', async () => {
    const tx = await testAccount.signTransaction({
      to: '0x0000000000000000000000000000000000000001' as `0x${string}`,
      value: 0n,
      data: '0x',
      chainId: 143,
      nonce: 0,
      gas: 100000n,
      maxFeePerGas: 1000000000n,
      maxPriorityFeePerGas: 1000000000n,
    });
    
    const result = await validateAndRelayTransaction(tx);
    expect(result.status).toBe('reverted');
    expect(result.error).toContain("Invalid 'to' address");
  });
  
  it('should reject transaction with wrong function selector', async () => {
    const tx = await testAccount.signTransaction({
      to: config.clawMachineAddress,
      value: 0n,
      data: '0xdeadbeef' as `0x${string}`,
      chainId: 143,
      nonce: 0,
      gas: 100000n,
      maxFeePerGas: 1000000000n,
      maxPriorityFeePerGas: 1000000000n,
    });
    
    const result = await validateAndRelayTransaction(tx);
    expect(result.status).toBe('reverted');
    expect(result.error).toContain('Invalid function selector');
  });
  
  it('should reject transaction with gas limit too high', async () => {
    const tx = await testAccount.signTransaction({
      to: config.clawMachineAddress,
      value: 100000n,
      data: ('0xeb806ce4' + '0'.repeat(64)) as `0x${string}`,
      chainId: 143,
      nonce: 0,
      gas: 1000000n, // Too high
      maxFeePerGas: 1000000000n,
      maxPriorityFeePerGas: 1000000000n,
    });
    
    const result = await validateAndRelayTransaction(tx);
    expect(result.status).toBe('reverted');
    expect(result.error).toContain('Gas limit too high');
  });
  
  it('should reject transaction with zero value', async () => {
    const tx = await testAccount.signTransaction({
      to: config.clawMachineAddress,
      value: 0n, // Should cover fees
      data: ('0xeb806ce4' + '0'.repeat(64)) as `0x${string}`,
      chainId: 143,
      nonce: 0,
      gas: 100000n,
      maxFeePerGas: 1000000000n,
      maxPriorityFeePerGas: 1000000000n,
    });
    
    const result = await validateAndRelayTransaction(tx);
    expect(result.status).toBe('reverted');
    expect(result.error).toContain('Transaction value must cover Pyth fees');
  });
  
  it('should accept valid transaction', async () => {
    const tx = await testAccount.signTransaction({
      to: config.clawMachineAddress,
      value: 100000n, // Non-zero value for fees
      data: ('0xeb806ce4' + '0'.repeat(64)) as `0x${string}`,
      chainId: 143,
      nonce: 0,
      gas: 100000n,
      maxFeePerGas: 1000000000n,
      maxPriorityFeePerGas: 1000000000n,
    });
    
    const result = await validateAndRelayTransaction(tx);
    expect(result.status).toBe('success');
    expect(result.txHash).toBeTruthy();
  });
});
