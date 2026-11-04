export type GachaPhase =
  | "idle"
  | "approving"
  | "confirming"
  | "drawing"
  | "revealed"
  | "error";

export type GachaPayout = {
  /** Stock ticker, e.g. "TSLAx". */
  symbol: "TSLAx" | "AAPLx" | "NVDAx" | "SPYx" | string;
  /** Human units, e.g. "0.0036". */
  amount: string;
  /** USD value, e.g. "0.73". */
  usd: string;
};

export type GachaResult = {
  pullId: string;
  legendary: boolean;
  payouts: GachaPayout[];
  valueUsd: string;
  explorerUrl?: string;
};
