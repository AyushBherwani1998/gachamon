import { config, publicClient } from '../config.js';
import { ClawMachineABI } from '../abi/ClawMachine.js';
import { PriceUpdateResponse } from '../types/index.js';

export async function getPriceUpdate(symbols: string[]): Promise<PriceUpdateResponse> {
  const feedIds: string[] = [];
  
  for (const symbol of symbols) {
    const feedId = config.pythFeedIds[symbol as keyof typeof config.pythFeedIds];
    if (feedId) {
      feedIds.push(feedId);
    }
  }
  
  if (feedIds.length === 0) {
    return {
      priceUpdateData: [],
      fee: '0',
    };
  }
  
  try {
    const url = new URL(config.pythHermesUrl);
    feedIds.forEach(id => {
      url.searchParams.append('ids[]', id);
    });
    
    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Pyth API error: ${response.statusText}`);
    }
    
    const data = await response.json() as any;
    
    // Extract binary data
    const priceUpdateData: `0x${string}`[] = [];
    if (data?.binary?.data) {
      priceUpdateData.push(('0x' + data.binary.data) as `0x${string}`);
    }
    
    // Get actual total fee from contract (includes Pyth fee + Entropy fee)
    let totalFee = '0';
    try {
      const fee = await publicClient.readContract({
        address: config.clawMachineAddress,
        abi: ClawMachineABI,
        functionName: 'getTotalFee',
        args: [priceUpdateData],
      });
      totalFee = fee.toString();
    } catch (error) {
      // If contract call fails, return estimated fee
      console.warn('Failed to get total fee from contract, using estimate');
      totalFee = (feedIds.length * 0.0001).toString();
    }
    
    return {
      priceUpdateData,
      fee: totalFee,
    };
  } catch (error) {
    console.error('Failed to fetch Pyth price update:', error);
    return {
      priceUpdateData: [],
      fee: '0',
    };
  }
}
