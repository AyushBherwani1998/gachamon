export type PanelPayout = {
  symbol: string;
  amount: string;
  usd: string;
};

export type FeedItem = {
  pullId: string;
  /** Player address, 0x-prefixed. */
  player: string;
  legendary: boolean;
  payouts: PanelPayout[];
  valueUsd: string;
  /** Unix seconds. */
  resolvedAt?: number;
};
