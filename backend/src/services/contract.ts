import { publicClient, config } from '../config.js';
import { ClawMachineABI } from '../abi/ClawMachine.js';
import { MachineStatus } from '../types/index.js';

export async function getMachineStatus(): Promise<MachineStatus> {
  try {
    const [canPull, entropyFee, inventoryValue, pendingReservations] = await Promise.all([
      publicClient.readContract({
        address: config.clawMachineAddress,
        abi: ClawMachineABI,
        functionName: 'canPull',
      }).catch(() => false),
      
      publicClient.readContract({
        address: config.clawMachineAddress,
        abi: ClawMachineABI,
        functionName: 'getEntropyFee',
      }).catch(() => 0n),
      
      publicClient.readContract({
        address: config.clawMachineAddress,
        abi: ClawMachineABI,
        functionName: 'getInventoryValue',
      }).catch(() => 0n),
      
      publicClient.readContract({
        address: config.clawMachineAddress,
        abi: ClawMachineABI,
        functionName: 'getPendingReservations',
      }).catch(() => 0n),
    ]);

    return {
      canPull: canPull as boolean,
      pullPrice: '1000000', // 1 USDC (6 decimals)
      inventoryValue: inventoryValue.toString(),
      pendingReservations: pendingReservations.toString(),
      entropyFee: entropyFee.toString(),
    };
  } catch (error) {
    // Return default values if contract doesn't exist yet
    return {
      canPull: false,
      pullPrice: '1000000',
      inventoryValue: '0',
      pendingReservations: '0',
      entropyFee: '0',
    };
  }
}
