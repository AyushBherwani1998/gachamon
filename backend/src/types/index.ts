export interface Pull {
  id: number;
  pullId: bigint;
  player: string;
  sequenceNumber: bigint;
  txHash: string;
  blockNumber: bigint;
  timestamp: number;
  resolved: boolean;
  legendary?: boolean;
  stocks?: string[];
  amounts?: string[];
  resolvedTxHash?: string;
  resolvedBlockNumber?: bigint;
  resolvedTimestamp?: number;
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
  canPull: boolean;
  pullPrice: string;
  inventoryValue: string;
  treasury?: string;
  pendingReservations: string;
  entropyFee: string;
}

export interface PriceUpdateResponse {
  priceUpdateData: string[];
  fee: string;
}

export interface PlayerStats {
  address: string;
  totalPulls: number;
  legendaryCount: number;
  commonCount: number;
  totalValue: string;
  pulls: Pull[];
}

export interface LeaderboardEntry {
  address: string;
  totalPulls: number;
  legendaryCount: number;
  totalValue: string;
}

export interface EventMessage {
  type: 'PullRequested' | 'PullResolved';
  pullId: string;
  player: string;
  data: any;
}
