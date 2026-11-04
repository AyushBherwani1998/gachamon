import { describe, it, expect, beforeEach, vi } from 'vitest';
import { encodeFunctionData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { validateAndRelayTransaction, PULL_SELECTOR } from './relay.js';
import { config } from '../config.js';
import { ClawMachineABI } from '../abi/ClawMachine.js';
import app from '../routes/index.js';

const CLAW_MACHINE = '0x1111111111111111111111111111111111111111' as const;
const REQUIRED_FEE = 1_480_000_000_000_000_000n; // ~1.48 MON, mainnet getFee()

vi.mock('../config.js', async () => {
  const actual = await vi.importActual<typeof import('../config.js')>('../config.js');

  return {
    ...actual,
    config: {
      ...actual.config,
      network: 'mainnet',
      chainId: 143,
      clawMachineAddress: '0x1111111111111111111111111111111111111111',
      isClawMachineConfigured: true,
      maxGasLimit: 500_000n,
      relayEnabled: false,
    },
    publicClient: {
      sendRawTransaction: vi.fn().mockResolvedValue(`0x${'12'.repeat(32)}`),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({
        status: 'success',
        logs: [],
      }),
      request: vi.fn().mockRejectedValue(new Error('Method not supported')),
      readContract: vi.fn().mockResolvedValue(1_480_000_000_000_000_000n),
    },
  };
});

const validCalldata = encodeFunctionData({
  abi: ClawMachineABI,
  functionName: 'pull',
});

describe('Transaction Relay Validation', () => {
  const testAccount = privateKeyToAccount(
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the pull() selector for the audited contract', () => {
    expect(PULL_SELECTOR).toHaveLength(10);
    expect(validCalldata).toBe(PULL_SELECTOR);
  });

  it('rejects transaction with wrong chain ID', async () => {
    const tx = await testAccount.signTransaction({
      to: CLAW_MACHINE,
      value: 0n,
      data: '0x',
      chainId: 1,
      nonce: 0,
      gas: 100000n,
      maxFeePerGas: 1000000000n,
      maxPriorityFeePerGas: 1000000000n,
    });

    const result = await validateAndRelayTransaction(tx);
    expect(result.status).toBe('reverted');
    expect(result.error).toContain('Invalid chain ID');
  });

  it('rejects transaction with wrong recipient address', async () => {
    const tx = await testAccount.signTransaction({
      to: '0x0000000000000000000000000000000000000001',
      value: 0n,
      data: validCalldata,
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

  it('rejects transaction with wrong function selector', async () => {
    const tx = await testAccount.signTransaction({
      to: CLAW_MACHINE,
      value: REQUIRED_FEE,
      data: '0xdeadbeef',
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

  it('rejects transaction with gas limit too high', async () => {
    const tx = await testAccount.signTransaction({
      to: CLAW_MACHINE,
      value: REQUIRED_FEE,
      data: validCalldata,
      chainId: 143,
      nonce: 0,
      gas: 1000000n,
      maxFeePerGas: 1000000000n,
      maxPriorityFeePerGas: 1000000000n,
    });

    const result = await validateAndRelayTransaction(tx);
    expect(result.status).toBe('reverted');
    expect(result.error).toContain('Gas limit too high');
  });

  it('rejects transaction with zero value', async () => {
    const tx = await testAccount.signTransaction({
      to: CLAW_MACHINE,
      value: 0n,
      data: validCalldata,
      chainId: 143,
      nonce: 0,
      gas: 100000n,
      maxFeePerGas: 1000000000n,
      maxPriorityFeePerGas: 1000000000n,
    });

    const result = await validateAndRelayTransaction(tx);
    expect(result.status).toBe('reverted');
    expect(result.error).toContain('Insufficient value');
    expect(result.error).toContain('getFee()');
  });

  it('rejects transaction with insufficient value', async () => {
    const tx = await testAccount.signTransaction({
      to: CLAW_MACHINE,
      value: REQUIRED_FEE - 1n,
      data: validCalldata,
      chainId: 143,
      nonce: 0,
      gas: 100000n,
      maxFeePerGas: 1000000000n,
      maxPriorityFeePerGas: 1000000000n,
    });

    const result = await validateAndRelayTransaction(tx);
    expect(result.status).toBe('reverted');
    expect(result.error).toContain('Insufficient value');
  });

  it('rejects when getFee() cannot be read', async () => {
    const { publicClient } = await import('../config.js');
    vi.mocked(publicClient.readContract).mockRejectedValueOnce(new Error('call reverted'));

    const tx = await testAccount.signTransaction({
      to: CLAW_MACHINE,
      value: REQUIRED_FEE,
      data: validCalldata,
      chainId: 143,
      nonce: 0,
      gas: 100000n,
      maxFeePerGas: 1000000000n,
      maxPriorityFeePerGas: 1000000000n,
    });

    const result = await validateAndRelayTransaction(tx);
    expect(result.status).toBe('reverted');
    expect(result.error).toContain('Unable to read getFee()');
  });

  it('accepts a valid pull() transaction', async () => {
    const tx = await testAccount.signTransaction({
      to: CLAW_MACHINE,
      value: REQUIRED_FEE + 1n,
      data: validCalldata,
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

  it('keeps the /relay route disabled unless RELAY_ENABLED=true', async () => {
    const response = await app.request('/relay', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ signedTx: '0x' }),
    });

    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain('Relay is disabled');
  });

  it('has a configured mainnet contract in the test environment', () => {
    expect(config.chainId).toBe(143);
    expect(config.clawMachineAddress).toBe(CLAW_MACHINE);
  });
});
