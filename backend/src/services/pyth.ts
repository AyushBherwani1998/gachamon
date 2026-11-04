import { config } from '../config.js';
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
    
    // Extract binary data and estimate fee
    const priceUpdateData: string[] = [];
    if (data?.binary?.data) {
      priceUpdateData.push('0x' + data.binary.data);
    }
    
    // Estimate fee (typical Pyth update fee on Monad)
    const estimatedFee = (feedIds.length * 0.0001).toString();
    
    return {
      priceUpdateData,
      fee: estimatedFee,
    };
  } catch (error) {
    console.error('Failed to fetch Pyth price update:', error);
    return {
      priceUpdateData: [],
      fee: '0',
    };
  }
}
