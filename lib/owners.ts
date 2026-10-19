import { getAddress, isAddress, type Address } from "viem";

/**
 * Validating a signer set before it is deployed.
 *
 * The constructor rejects duplicates, the zero address and an out-of-range threshold, and a
 * deployed wallet can never be reconfigured — there is no owner-management function by design.
 * So a mistake here is permanent and costs a redeploy, which makes catching it in the form worth
 * more than it usually is.
 */

export const MAX_OWNERS = 20;

export type OwnerRow = { id: string; address: string };

export type SignerSet = {
  owners: Address[];
  problems: { id: string; message: string }[];
  thresholdProblem: string | null;
};

export function newOwner(): OwnerRow {
  return { id: Math.random().toString(36).slice(2), address: "" };
}

export function validateSigners(rows: OwnerRow[], threshold: string): SignerSet {
  const problems: { id: string; message: string }[] = [];
  const owners: Address[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const value = row.address.trim();
    if (value === "") continue;

    if (!isAddress(value)) {
      problems.push({ id: row.id, message: "Not an address." });
      continue;
    }
    const checksummed = getAddress(value);
    if (seen.has(checksummed.toLowerCase())) {
      // The constructor rejects this, and the wallet cannot be fixed afterwards.
      problems.push({ id: row.id, message: "Already a signer." });
      continue;
    }
    seen.add(checksummed.toLowerCase());
    owners.push(checksummed);
  }

  if (owners.length > MAX_OWNERS) {
    problems.push({ id: rows[MAX_OWNERS]?.id ?? "", message: `At most ${MAX_OWNERS} signers.` });
  }

  let thresholdProblem: string | null = null;
  const n = Number(threshold);
  if (!/^\d+$/.test(threshold.trim())) {
    thresholdProblem = "A whole number.";
  } else if (n === 0) {
    thresholdProblem = "At least one signature.";
  } else if (owners.length > 0 && n > owners.length) {
    // A threshold above the signer count is a wallet nobody can ever spend from.
    thresholdProblem = `Only ${owners.length} signer${owners.length === 1 ? "" : "s"}.`;
  }

  return { owners, problems, thresholdProblem };
}

export function isDeployable(set: SignerSet, threshold: string): boolean {
  return (
    set.owners.length > 0 &&
    set.problems.length === 0 &&
    set.thresholdProblem === null &&
    /^\d+$/.test(threshold.trim())
  );
}
