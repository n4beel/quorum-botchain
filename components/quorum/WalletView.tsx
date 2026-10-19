"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BaseError, formatEther, isAddress, type Address, type Hex } from "viem";
import {
  useAccount, useBalance, useChainId, useReadContract, useReadContracts,
  useWaitForTransactionReceipt, useWriteContract,
} from "wagmi";
import Panel from "@/components/ui/Panel";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import TxStatus, { type TxStage } from "@/components/ui/TxStatus";
import { useToast } from "@/components/ui/Toast";
import { activeBotChain, addressUrl, isBotChainId } from "@/lib/botchain/chain";
import { parseNativeAmount } from "@/lib/botchain/amount";
import { quorumAbi } from "@/lib/botchain/abi";

/**
 * A wallet's queue: what has been proposed, who has signed it, and what can be executed.
 *
 * Confirmations are rendered as one mark per signer rather than as a count or a bar. "3 of 5" is
 * a number of people, and a row of marks makes the shape of a nearly-ready transaction legible at
 * a glance — which is the thing a signer opening this page actually wants to know.
 */
function WalletBody() {
  const chainId = useChainId();
  const { address } = useAccount();
  const { toast } = useToast();
  const { writeContractAsync } = useWriteContract();
  const search = useSearchParams();
  const fromQuery = search.get("address") ?? "";

  const [typed, setTyped] = useState(fromQuery);
  const [to, setTo] = useState("");
  const [value, setValue] = useState("");
  const [stage, setStage] = useState<TxStage>("idle");
  const [hash, setHash] = useState<Hex | null>(null);

  useEffect(() => setTyped(fromQuery), [fromQuery]);

  const wallet = isAddress(typed.trim()) ? (typed.trim() as Address) : null;
  const ready = Boolean(wallet) && isBotChainId(chainId);
  const base = { address: wallet ?? undefined, abi: quorumAbi } as const;

  const { data: balance } = useBalance({ address: wallet ?? undefined, query: { enabled: ready } });

  const summary = useReadContracts({
    contracts: [
      { ...base, functionName: "owners" },
      { ...base, functionName: "threshold" },
      { ...base, functionName: "txCount" },
    ],
    query: { enabled: ready },
  });

  const owners = summary.data?.[0]?.result as readonly Address[] | undefined;
  const threshold = summary.data?.[1]?.result as bigint | undefined;
  const txCount = summary.data?.[2]?.result as bigint | undefined;

  const ids = useMemo(
    () => (txCount === undefined ? [] : Array.from({ length: Number(txCount) }, (_, i) => BigInt(i)).reverse()),
    [txCount],
  );

  const queue = useReadContracts({
    contracts: ids.map((id) => ({ ...base, functionName: "transactions" as const, args: [id] })),
    query: { enabled: ready && ids.length > 0 },
  });

  // Whether the connected signer has already confirmed each queued transaction.
  const mine = useReadContracts({
    contracts:
      address && owners?.some((o) => o.toLowerCase() === address.toLowerCase())
        ? ids.map((id) => ({ ...base, functionName: "confirmedBy" as const, args: [id, address] }))
        : [],
    query: { enabled: ready && Boolean(address) && ids.length > 0 },
  });

  const isOwner = Boolean(address && owners?.some((o) => o.toLowerCase() === address.toLowerCase()));

  const receipt = useWaitForTransactionReceipt({ hash: hash ?? undefined, query: { enabled: Boolean(hash) } });
  const settled = useRef<Hex | null>(null);

  // The refetch functions, not the query objects that wrap them. react-query keeps these stable
  // across renders; the results around them are a fresh identity every render, and depending on
  // those would make this callback — and the effect below it — run on every render.
  const refetchSummary = summary.refetch;
  const refetchQueue = queue.refetch;
  const refetchMine = mine.refetch;
  const refetchAll = useCallback(() => {
    void refetchSummary();
    void refetchQueue();
    void refetchMine();
  }, [refetchSummary, refetchQueue, refetchMine]);

  useEffect(() => {
    if (!hash || settled.current === hash) return;
    if (!receipt.isSuccess && !receipt.isError) return;
    settled.current = hash;
    if (receipt.isSuccess) {
      setStage("confirmed");
      toast("success", "Done", "The wallet has been updated.");
      refetchAll();
    } else {
      setStage("failed");
      toast("error", "Transaction failed", "Nothing changed.");
    }
  }, [hash, receipt.isSuccess, receipt.isError, toast, refetchAll]);

  const send = useCallback(
    async (functionName: "submit" | "confirm" | "revoke" | "execute", args: readonly unknown[]) => {
      if (!wallet || !isBotChainId(chainId)) return;
      setStage("signing");
      setHash(null);
      settled.current = null;
      try {
        const txHash = await writeContractAsync({
          address: wallet, abi: quorumAbi, functionName,
          args: args as never, chainId,
        });
        setHash(txHash);
        setStage("pending");
      } catch (err) {
        setStage("idle");
        const message = err instanceof BaseError ? err.shortMessage : "Something went wrong.";
        if (/rejected|denied/i.test(message)) toast("info", "Cancelled", "Nothing was sent.");
        else toast("error", "Could not send", message);
      }
    },
    [wallet, chainId, writeContractAsync, toast],
  );

  const parsedValue = parseNativeAmount(value);
  const canSubmit = isOwner && isAddress(to.trim()) && parsedValue !== null && stage !== "signing" && stage !== "pending";
  const symbol = activeBotChain.nativeCurrency.symbol;

  return (
    <div className="flex flex-col gap-5">
      <Panel>
        <Input
          label="Wallet address"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="0x…"
          mono
          hint="No wallet needed to read one."
        />
      </Panel>

      {ready && summary.isLoading && <Panel><Spinner label="Reading the chain" /></Panel>}

      {ready && summary.isError && (
        <Panel>
          <p className="text-[13px]" style={{ color: "var(--warning)" }}>
            Could not read that address. Either it is not a Quorum wallet, or the chain did not answer.
          </p>
        </Panel>
      )}

      {ready && owners && threshold !== undefined && (
        <>
          <Panel>
            <div className="flex flex-col gap-4">
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <span className="mono text-[11px] uppercase tracking-[0.08em]" style={{ color: "var(--text-tertiary)" }}>
                  {threshold.toString()} of {owners.length} required
                </span>
                <span className="mono text-[16px]" style={{ color: "var(--text-primary)" }}>
                  {balance ? formatEther(balance.value) : "0"} {symbol}
                </span>
              </div>

              <ul className="flex flex-col gap-1.5">
                {owners.map((owner) => {
                  const you = address && owner.toLowerCase() === address.toLowerCase();
                  return (
                    <li key={owner} className="flex items-center gap-2">
                      <span aria-hidden="true" style={{ width: "14px", height: "2px", background: you ? "var(--accent)" : "var(--border-strong)" }} />
                      <a href={addressUrl(chainId, owner)} target="_blank" rel="noreferrer"
                        className="mono text-[12px] break-all" style={{ color: you ? "var(--accent)" : "var(--text-secondary)" }}>
                        {owner}{you ? "  (you)" : ""}
                      </a>
                    </li>
                  );
                })}
              </ul>

              {!isOwner && address && (
                <p className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                  You are not a signer on this wallet, so you can read it but not act on it.
                </p>
              )}
            </div>
          </Panel>

          {isOwner && (
            <Panel>
              <div className="flex flex-col gap-4">
                <p className="mono text-[11px] uppercase tracking-[0.08em]" style={{ color: "var(--text-tertiary)" }}>
                  Propose a payment
                </p>
                <Input label="To" value={to} onChange={(e) => setTo(e.target.value)} placeholder="0x…" mono
                  error={to.trim() !== "" && !isAddress(to.trim()) ? "Not an address." : undefined} />
                <Input label={`Amount (${symbol})`} value={value} onChange={(e) => setValue(e.target.value)}
                  placeholder="1.5" mono
                  error={value.trim() !== "" && parsedValue === null ? "Not an amount this app will send." : undefined}
                  hint={balance && parsedValue !== null && parsedValue > balance.value ? "More than the wallet holds — it will fail at execution." : undefined} />
                <Button disabled={!canSubmit} onClick={() => send("submit", [to.trim() as Address, parsedValue!])}>
                  Propose
                </Button>
              </div>
            </Panel>
          )}

          <Panel>
            <p className="mono text-[11px] uppercase tracking-[0.08em] mb-4" style={{ color: "var(--text-tertiary)" }}>
              Queue
            </p>

            {ids.length === 0 && (
              <p className="text-[13px]" style={{ color: "var(--text-tertiary)" }}>
                Nothing proposed yet.
              </p>
            )}

            <div className="flex flex-col gap-4">
              {ids.map((id, i) => {
                const txn = queue.data?.[i]?.result as
                  | { to: Address; value: bigint; data: Hex; executed: boolean; confirmations: bigint }
                  | undefined;
                if (!txn) return null;

                const confirmed = Number(txn.confirmations);
                const need = Number(threshold);
                const iConfirmed = Boolean(mine.data?.[i]?.result);
                const canExecute = !txn.executed && confirmed >= need;

                return (
                  <div key={id.toString()} className="flex flex-col gap-2.5 pb-4"
                    style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <div className="flex items-baseline justify-between gap-3 flex-wrap">
                      <span className="mono text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                        #{id.toString()}
                      </span>
                      <span className="mono text-[14px]" style={{ color: "var(--text-primary)" }}>
                        {formatEther(txn.value)} {symbol}
                      </span>
                    </div>

                    <a href={addressUrl(chainId, txn.to)} target="_blank" rel="noreferrer"
                      className="mono text-[12px] break-all" style={{ color: "var(--text-secondary)" }}>
                      → {txn.to}
                    </a>

                    {/* One mark per signer: the shape of a nearly-ready transaction, not a number. */}
                    <div className="flex items-center gap-1.5">
                      {owners.map((owner, oi) => (
                        <span key={owner} aria-hidden="true"
                          style={{
                            width: "16px", height: "3px",
                            background: oi < confirmed ? "var(--accent)" : "var(--border-default)",
                          }} />
                      ))}
                      <span className="mono text-[11px] ml-2" style={{ color: txn.executed ? "var(--success)" : "var(--text-tertiary)" }}>
                        {txn.executed ? "executed" : `${confirmed} of ${need}`}
                      </span>
                    </div>

                    {isOwner && !txn.executed && (
                      <div className="flex flex-wrap gap-2 mt-1">
                        {iConfirmed ? (
                          <Button size="sm" variant="ghost" onClick={() => send("revoke", [id])}>
                            Revoke
                          </Button>
                        ) : (
                          <Button size="sm" onClick={() => send("confirm", [id])}>
                            Confirm
                          </Button>
                        )}
                        {canExecute && (
                          <Button size="sm" onClick={() => send("execute", [id])}>
                            Execute
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-4">
              <TxStatus stage={stage} hash={hash} confirmedLabel="Done" failedLabel="Transaction failed — nothing changed." />
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

export default function WalletView() {
  return (
    <Suspense fallback={<Panel><Spinner label="Loading" /></Panel>}>
      <WalletBody />
    </Suspense>
  );
}
