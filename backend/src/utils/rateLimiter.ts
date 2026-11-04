import { config } from '../config.js';

const addressLastPull = new Map<string, number>();
const processedTxHashes = new Set<string>();

export function checkRateLimit(address: string): { allowed: boolean; waitTime?: number } {
  const now = Date.now();
  const lastPull = addressLastPull.get(address);
  
  if (lastPull && now - lastPull < config.rateLimitWindow) {
    const waitTime = config.rateLimitWindow - (now - lastPull);
    return { allowed: false, waitTime };
  }
  
  return { allowed: true };
}

export function recordPull(address: string) {
  addressLastPull.set(address, Date.now());
}

export function isDuplicateTx(txHash: string): boolean {
  return processedTxHashes.has(txHash);
}

export function recordTx(txHash: string) {
  processedTxHashes.add(txHash);
  
  // Clean up old entries after 5 minutes to prevent memory leak
  setTimeout(() => {
    processedTxHashes.delete(txHash);
  }, 5 * 60 * 1000);
}
