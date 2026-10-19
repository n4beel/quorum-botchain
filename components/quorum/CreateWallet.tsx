"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BaseError, ContractFunctionRevertedError, decodeEventLog, type Hex } from "viem";
import { useChainId, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import Panel from "@/components/ui/Panel";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import TxStatus, { type TxStage } from "@/components/ui/TxStatus";
import { useToast } from "@/components/ui/Toast";
import { addressUrl, isBotChainId } from "@/lib/botchain/chain";
import { getDeployment } from "@/lib/botchain/deployment";
import { quorumFactoryAbi } from "@/lib/botchain/abi";
import CopyAddress from "@/components/ui/CopyAddress";
import { rememberWallet } from "@/lib/saved-wallets";
import { isDeployable, MAX_OWNERS, newOwner, validateSigners, type OwnerRow } from "@/lib/owners";

/**
 * Deploy a shared wallet.
 *
 * The signer set and threshold are fixed at construction and there is no function to change
 * either afterwards. That is the product — a wallet whose rules cannot be rewritten by whoever
 * controls it — but it means every mistake here costs a redeploy, so the form validates against
 * the constructor's own rules rather than letting the chain reject it.
 */
export default function CreateWallet() {
  const chainId = useChainId();
  const { toast } = useToast();
  const { writeContractAsync } = useWriteContract();

  const [rows, setRows] = useState<OwnerRow[]>([newOwner(), newOwner()]);
  const [threshold, setThreshold] = useState("2");
  const [stage, setStage] = useState<TxStage>("idle");
  const [hash, setHash] = useState<Hex | null>(null);
  const [wallet, setWallet] = useState<Hex | null>(null);

  const deployment = isBotChainId(chainId) ? getDeployment(chainId) : null;
  const set = useMemo(() => validateSigners(rows, threshold), [rows, threshold]);
  const ready = isDeployable(set, threshold);

  const receipt = useWaitForTransactionReceipt({
    hash: hash ?? undefined,
    query: { enabled: Boolean(hash) },
  });

  const settled = useRef<Hex | null>(null);
  useEffect(() => {
    if (!hash || settled.current === hash) return;
    if (!receipt.isSuccess && !receipt.isError) return;
    settled.current = hash;

    if (receipt.isError) {
      setStage("failed");
      toast("error", "Deployment failed", "No wallet was created.");
      return;
    }

    // The wallet's address is in the log, not the return data — a receipt carries logs only.
    let created: Hex | null = null;
    for (const log of receipt.data?.logs ?? []) {
      try {
        const parsed = decodeEventLog({ abi: quorumFactoryAbi, ...log });
        if (parsed.eventName === "WalletCreated") created = parsed.args.wallet;
      } catch {
        // Not our log.
      }
    }
    setWallet(created);
    // Nothing else can recover this address later — the factory emitted it once.
    if (created && isBotChainId(chainId)) rememberWallet(created, chainId);
    setStage("confirmed");
    toast("success", "Wallet deployed", "Fund it, then propose a transaction.");
  }, [hash, receipt.isSuccess, receipt.isError, receipt.data, chainId, toast]);

  const handleCreate = useCallback(async () => {
    if (!deployment || !isBotChainId(chainId) || !ready) return;

    setStage("signing");
    setHash(null);
    setWallet(null);
    settled.current = null;

    try {
      const txHash = await writeContractAsync({
        address: deployment.address,
        abi: quorumFactoryAbi,
        functionName: "create",
        args: [set.owners, BigInt(threshold)],
        chainId,
      });
      setHash(txHash);
      setStage("pending");
    } catch (err) {
      setStage("idle");
      const reverted =
        err instanceof BaseError ? err.walk((e) => e instanceof ContractFunctionRevertedError) : null;
      if (reverted instanceof ContractFunctionRevertedError) {
        toast("error", "Refused", reverted.data?.errorName ?? "The contract did not say why.");
        return;
      }
      const message = err instanceof BaseError ? err.shortMessage : "Something went wrong.";
      if (/rejected|denied/i.test(message)) toast("info", "Cancelled", "Nothing was deployed.");
      else toast("error", "Could not deploy", message);
    }
  }, [deployment, chainId, ready, set.owners, threshold, writeContractAsync, toast]);

  if (stage === "confirmed") {
    return (
      <div className="flex flex-col gap-5">
      <Panel>
        <div className="flex flex-col gap-4">
          <TxStatus stage="confirmed" hash={hash} confirmedLabel="Wallet deployed" />
          {wallet && (
            <>
              <div className="flex flex-col gap-1">
                <span className="mono text-[11px] uppercase tracking-[0.08em]" style={{ color: "var(--text-tertiary)" }}>
                  Wallet address
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  <a href={addressUrl(chainId, wallet)} target="_blank" rel="noreferrer"
                    className="mono text-[13px] break-all underline" style={{ color: "var(--accent)" }}>
                    {wallet}
                  </a>
                  <CopyAddress value={wallet} label="copy address" />
                </div>
              </div>
              <p className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                Send BOT to that address to fund it. Any of the {set.owners.length} signers can then
                propose a transaction, and {threshold} must confirm before it executes.
              </p>
              <Link href={`/wallet?address=${wallet}`} className="mono text-[12px] underline" style={{ color: "var(--accent)" }}>
                Open it
              </Link>
            </>
          )}
        </div>
      </Panel>
      </div>
    );
  }

  const busy = stage === "signing" || stage === "pending";

  return (
    <div className="flex flex-col gap-5">
      <Panel>
        <div className="flex flex-col gap-4">
          <p className="mono text-[11px] uppercase tracking-[0.08em]" style={{ color: "var(--text-tertiary)" }}>
            Signers
          </p>

          {rows.map((row, i) => (
            <div key={row.id} className="grid gap-3" style={{ gridTemplateColumns: "1fr 36px" }}>
              <Input
                value={row.address}
                onChange={(e) => setRows(rows.map((r) => (r.id === row.id ? { ...r, address: e.target.value } : r)))}
                placeholder={`signer ${i + 1} — 0x…`}
                mono
                disabled={busy}
                error={set.problems.find((p) => p.id === row.id)?.message}
              />
              <button
                aria-label={`Remove signer ${i + 1}`}
                onClick={() => setRows(rows.length > 1 ? rows.filter((r) => r.id !== row.id) : rows)}
                disabled={busy || rows.length === 1}
                style={{
                  height: "42px", background: "transparent", border: "1px solid var(--border-subtle)",
                  color: "var(--text-tertiary)", cursor: rows.length === 1 ? "not-allowed" : "pointer",
                  opacity: rows.length === 1 ? 0.4 : 1,
                }}
              >
                ×
              </button>
            </div>
          ))}

          <Button variant="ghost" size="sm" onClick={() => setRows([...rows, newOwner()])}
            disabled={busy || rows.length >= MAX_OWNERS}>
            Add signer
          </Button>
        </div>
      </Panel>

      <Panel>
        <div className="flex flex-col gap-4">
          <Input
            label="Signatures required"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            mono
            disabled={busy}
            error={set.thresholdProblem ?? undefined}
            hint={
              set.thresholdProblem
                ? undefined
                : set.owners.length > 0
                  ? `${threshold} of ${set.owners.length}`
                  : "Add signers first"
            }
          />

          {stage === "idle" || stage === "failed" ? (
            <Button onClick={handleCreate} disabled={!ready}>
              {ready ? `Deploy ${threshold}-of-${set.owners.length} wallet` : "Add signers to continue"}
            </Button>
          ) : null}

          <TxStatus stage={stage} hash={hash} failedLabel="Deployment failed — no wallet exists." />

          <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
            Signers and threshold are fixed when the wallet is deployed. There is no function to add,
            remove or replace a signer afterwards — not for you, not for anyone. Check the list before
            you sign.
          </p>
        </div>
      </Panel>
    </div>
  );
}
