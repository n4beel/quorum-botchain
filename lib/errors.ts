import { formatEther } from "viem";

/**
 * What a Quorum revert means, in a sentence.
 *
 * The contract reverts with custom errors, which reach the UI as a selector and nothing else. A
 * signer who clicks Execute and is told "Transaction failed" learns nothing — the failure that
 * actually happens in practice is a wallet with no funds in it, and that is fixable in ten
 * seconds if someone says so.
 */
export function explainQuorumError(
  errorName: string | undefined,
  args: readonly unknown[] | undefined,
  context: { symbol: string; balance?: bigint },
): string {
  const arg = (i: number): bigint | undefined => {
    const v = args?.[i];
    return typeof v === "bigint" ? v : undefined;
  };

  switch (errorName) {
    case "ExecutionFailed": {
      const held =
        context.balance === undefined
          ? null
          : `The wallet holds ${formatEther(context.balance)} ${context.symbol}.`;
      return [
        "The payment itself failed, so nothing moved and the transaction is still in the queue.",
        held,
        "Usually this means the wallet has not been funded for the amount being sent.",
      ]
        .filter(Boolean)
        .join(" ");
    }
    case "ThresholdNotMet": {
      const need = arg(1);
      const have = arg(2);
      return need !== undefined && have !== undefined
        ? `Not enough signatures yet — ${have.toString()} of ${need.toString()}.`
        : "Not enough signatures yet.";
    }
    case "AlreadyExecuted":
      return "This transaction has already been executed.";
    case "AlreadyConfirmed":
      return "You have already signed this one.";
    case "NotConfirmed":
      return "You have not signed this one, so there is nothing to revoke.";
    case "NotOwner":
      return "The connected wallet is not a signer on this wallet.";
    case "TxNotFound":
      return "No transaction with that number exists in this wallet.";
    default:
      return errorName
        ? `The contract refused this: ${errorName}.`
        : "The contract refused this and did not say why.";
  }
}

/**
 * Whether a queued payment can actually be paid right now.
 *
 * Checked before the button is enabled rather than after the transaction reverts, because the
 * answer is on screen already — the wallet's balance is right at the top of the page.
 */
export function canAffordPayment(value: bigint, balance: bigint | undefined): boolean {
  if (balance === undefined) return true; // Not known yet; let the chain decide.
  return balance >= value;
}
