import { config, publicClient } from '../config.js';
import { ClawMachineABI } from '../abi/ClawMachine.js';
import { MachineStatus } from '../types/index.js';

export async function getMachineStatus(): Promise<MachineStatus> {
  const defaults: MachineStatus = {
    network: config.network,
    chainId: config.chainId,
    canPull: false,
    pullPrice: '0',
    inventoryValueUsd6: '0',
    reservedValueUsd6: '0',
    fee: '0',
    totalPulls: '0',
    paused: true,
  };

  if (!config.isClawMachineConfigured) {
    return defaults;
  }

  try {
    const [
      canPull,
      pullPrice,
      inventoryValueUsd6,
      reservedValueUsd6,
      fee,
      totalPulls,
      paused,
    ] = await Promise.all([
      publicClient.readContract({
        address: config.clawMachineAddress,
        abi: ClawMachineABI,
        functionName: 'canPull',
      }),
      publicClient.readContract({
        address: config.clawMachineAddress,
        abi: ClawMachineABI,
        functionName: 'pullPrice',
      }),
      publicClient.readContract({
        address: config.clawMachineAddress,
        abi: ClawMachineABI,
        functionName: 'inventoryValueUsd6',
      }),
      publicClient.readContract({
        address: config.clawMachineAddress,
        abi: ClawMachineABI,
        functionName: 'reservedValueUsd6',
      }),
      publicClient.readContract({
        address: config.clawMachineAddress,
        abi: ClawMachineABI,
        functionName: 'getFee',
      }),
      publicClient.readContract({
        address: config.clawMachineAddress,
        abi: ClawMachineABI,
        functionName: 'totalPulls',
      }),
      publicClient.readContract({
        address: config.clawMachineAddress,
        abi: ClawMachineABI,
        functionName: 'paused',
      }),
    ]);

    return {
      network: config.network,
      chainId: config.chainId,
      canPull,
      pullPrice: pullPrice.toString(),
      inventoryValueUsd6: inventoryValueUsd6.toString(),
      reservedValueUsd6: reservedValueUsd6.toString(),
      fee: fee.toString(),
      totalPulls: totalPulls.toString(),
      paused,
    };
  } catch (error) {
    console.error('Failed to read machine status from ClawMachine:', error);
    return defaults;
  }
}
