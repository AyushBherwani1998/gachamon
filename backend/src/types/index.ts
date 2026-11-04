export interface Pull {
  id: number;
  pullId: bigint;
  player: string;
  sequenceNumber: bigint;
  feePaid?: string;
  txHash: string;
  blockNumber: bigint;
  timestamp: number;
  resolved: boolean;
  legendary?: boolean;
  stocks?: string[];
  amounts?: string[];
  valueUsd6?: string;
  randomNumber?: string;
  resolvedTxHash?: string;
  resolvedBlockNumber?: bigint;
  resolvedTimestamp?: number;
  refunded: boolean;
  refundAmount?: string;
  refundTxHash?: string;
  refundBlockNumber?: bigint;
  refundTimestamp?: number;
}

export interface RelayRequest {
  signedTx: string;
}

export interface RelayResponse {
  txHash: string;
  status: 'pending' | 'success' | 'reverted';
  pullId?: string;
  revertReason?: string;
  error?: string;
}

export interface MachineStatus {
  network: 'mainnet' | 'testnet';
  chainId: number;
  canPull: boolean;
  pullPrice: string;
  inventoryValueUsd6: string;
  reservedValueUsd6: string;
  fee: string;
  totalPulls: string;
  paused: boolean;
}

export interface PlayerStats {
  address: string;
  totalPulls: number;
  legendaryCount: number;
  commonCount: number;
  refundedCount: number;
  totalValue: string;
  totalValueUsd6: string;
  pulls: Pull[];
}

export interface LeaderboardEntry {
  player: string;
  totalPulls: number;
  legendaryCount: number;
  totalValue: string;
  totalValueUsd6: string;
}

export type IndexedEventType = 'PullRequested' | 'PullResolved' | 'PullRefunded';

export interface EventMessage {
  type: IndexedEventType;
  pullId: string;
  player: string;
  data: Record<string, unknown>;
}
