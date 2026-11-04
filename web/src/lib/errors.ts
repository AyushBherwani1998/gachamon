import { BaseError, ContractFunctionRevertedError } from "viem";

function mapRevert(reason: string): string | null {
  if (/insufficient inventory/i.test(reason)) {
    return "The machine does not have enough inventory for this pull right now. Try again after a refill.";
  }
  if (/insufficient fee/i.test(reason)) {
    return "The MON fee was too low for this price update. Refresh and try again.";
  }
  if (
    /older than allowed age|price is older|stale|too old|price is not updated|no price feed|price feed does not exist/i.test(
      reason
    )
  ) {
    return "The Pyth price update is stale. Refresh and try again.";
  }
  if (/invalid update data|invalid price update|malformed/i.test(reason)) {
    return "The Pyth price update was rejected. Refresh and try again.";
  }
  if (/invalid price/i.test(reason)) {
    return "Pyth returned an invalid price. Refresh and try again.";
  }
  if (/paused|enforcedpause/i.test(reason)) {
    return "The machine is paused. Try again later.";
  }
  if (/insufficient funds/i.test(reason)) {
    return "Not enough MON to cover gas and the entropy fee.";
  }
  if (/allowance|insufficient allowance/i.test(reason)) {
    return "The USDC approval is too low. Refresh and approve again.";
  }
  if (/already resolved/i.test(reason)) {
    return "This pull already resolved.";
  }
  return null;
}

/** Turn viem/wallet errors into copy a player can act on. */
export function friendlyTxError(error: unknown): string {
  if (error instanceof BaseError) {
    if (/user rejected|denied/i.test(error.shortMessage)) return "Transaction cancelled.";

    const reverted = error.walk(
      (cause) => cause instanceof ContractFunctionRevertedError
    ) as ContractFunctionRevertedError | null;
    if (reverted) {
      const reason = reverted.reason ?? reverted.data?.errorName ?? "";
      const mapped = mapRevert(reason);
      if (mapped) return mapped;
      if (reason) return reason;
      return "The transaction reverted on-chain.";
    }

    return error.shortMessage;
  }
  if (error instanceof Error) {
    if (/user rejected|denied/i.test(error.message)) return "Transaction cancelled.";
    return error.message;
  }
  return "Something went wrong. Please try again.";
}
