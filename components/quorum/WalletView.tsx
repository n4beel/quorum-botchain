"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  BaseError, ContractFunctionRevertedError, formatEther, isAddress, type Address, type Hex,
} from "viem";
import {
  useAccount, useBalance, useChainId, usePublicClient, useReadContract, useReadContracts,
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
import CopyAddress from "@/components/ui/CopyAddress";
import SavedWallets from "@/components/quorum/SavedWallets";
import { rememberWallet } from "@/lib/saved-wallets";
import { canAffordPayment, explainQuorumError } from "@/lib/errors";

/**
 * Every write this page can make, with its arguments.
 *
 * The arguments used to be passed as `readonly unknown[]` and cast to `never` at the call to
 * wagmi, which meant a `submit` missing its `data` argument typechecked cleanly and only failed
 * in the browser, at encoding time. Spelling the tuples out here puts that back under the
 * compiler: `submit` is (to, value, data), the rest take a txId.
 */
type QuorumWrite =
  | readonly ["submit", Address, bigint, Hex]
  | readonly ["confirm", bigint]
  | readonly ["revoke", bigint]
  | readonly ["execute", bigint];

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
  // wagmi memoises the client per config and chain, so its identity is stable between renders —
  // unlike the query results the rule exists to catch. stable-hook-result
  const publicClient = usePublicClient(); // stable-hook-result
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

  // useReadContracts defaults to allowFailure, so a call that reverts lands as an undefined
  // `result` inside `data` and never sets isError. Reading the flag alone left a well-formed but
  // wrong address — one belonging to the other network, say — rendering nothing whatsoever.
  const unreadable = !summary.isLoading && (summary.isError || owners === undefined);

  // A successful read is the proof that this address is a Quorum wallet; nothing else in the app
  // can tell. Saving here means pasting an address once is enough to keep it on the list.
  //
  // The dependency is the owner COUNT, not the array: wagmi hands back a fresh array after every
  // refetch, and an array here would re-run the effect on each render, write a new savedAt, and
  // spin. The ref keeps it to one write per wallet even so.
  const remembered = useRef<string | null>(null);
  const ownerCount = owners?.length ?? 0;
  useEffect(() => {
    if (!wallet || !isBotChainId(chainId) || ownerCount === 0) return;
    const key = `${chainId}:${wallet.toLowerCase()}`;
    if (remembered.current === key) return;
    remembered.current = key;
    rememberWallet(wallet, chainId);
  }, [wallet, chainId, ownerCount]);

  const send = useCallback(
    async (call: QuorumWrite) => {
      if (!wallet || !isBotChainId(chainId)) return;
      setStage("signing");
      setHash(null);
      settled.current = null;
      try {
        const target = { address: wallet, abi: quorumAbi, chainId } as const;
        // Ask the chain first. A multisig execute that will revert — almost always an unfunded
        // wallet — otherwise costs gas and comes back as a bare "failed", with the reason buried
        // in a receipt that carries no revert data.
        //
        // Both calls stay inline rather than sharing a hoisted object: naming it collapses the
        // tuple union and loses the link between the function name and its arguments, which is
        // the very thing being guarded here.
        if (publicClient && address) {
          await publicClient.simulateContract(
            call[0] === "submit"
              ? { ...target, functionName: "submit", args: [call[1], call[2], call[3]], account: address }
              : { ...target, functionName: call[0], args: [call[1]], account: address },
          );
        }

        const txHash = await writeContractAsync(
          call[0] === "submit"
            ? { ...target, functionName: "submit", args: [call[1], call[2], call[3]] }
            : { ...target, functionName: call[0], args: [call[1]] },
        );
        setHash(txHash);
        setStage("pending");
      } catch (err) {
        setStage("idle");

        const reverted =
          err instanceof BaseError
            ? err.walk((e) => e instanceof ContractFunctionRevertedError)
            : null;
        if (reverted instanceof ContractFunctionRevertedError) {
          toast(
            "error",
            "The wallet refused this",
            explainQuorumError(reverted.data?.errorName, reverted.data?.args, {
              symbol: activeBotChain.nativeCurrency.symbol,
              balance: balance?.value,
            }),
          );
          return;
        }

        const message = err instanceof BaseError ? err.shortMessage : "Something went wrong.";
        if (/rejected|denied/i.test(message)) toast("info", "Cancelled", "Nothing was sent.");
        else toast("error", "Could not send", message);
      }
    },
    [wallet, chainId, writeContractAsync, publicClient, address, balance?.value, toast],
  );

  const parsedValue = parseNativeAmount(value);
  const canSubmit = isOwner && isAddress(to.trim()) && parsedValue !== null && stage !== "signing" && stage !== "pending";
  const symbol = activeBotChain.nativeCurrency.symbol;

  return (
    <div className="flex flex-col gap-5">
      <SavedWallets current={wallet} />

      <Panel>
        <div className="flex flex-col gap-3">
          <Input
            label="Wallet address"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="0x…"
            mono
            hint="No wallet needed to read one."
          />
          {wallet && (
            <div className="flex items-center gap-2 flex-wrap">
              <CopyAddress value={wallet} label="copy address" />
              <a href={addressUrl(chainId, wallet)} target="_blank" rel="noreferrer"
                className="mono text-[11px] uppercase tracking-[0.08em] underline"
                style={{ color: "var(--text-tertiary)" }}>
                explorer
              </a>
            </div>
          )}
        </div>
      </Panel>

      {ready && summary.isLoading && <Panel><Spinner label="Reading the chain" /></Panel>}

      {ready && unreadable && (
        <Panel>
          <p className="text-[13px]" style={{ color: "var(--warning)" }}>
            Could not read that address on {activeBotChain.name}. Either it is not a Quorum wallet,
            it lives on the other network, or the chain did not answer.
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
                <Button disabled={!canSubmit} onClick={() => send(["submit", to.trim() as Address, parsedValue!, "0x"])}>
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
                const affordable = canAffordPayment(txn.value, balance?.value);
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
                          <Button size="sm" variant="ghost" onClick={() => send(["revoke", id])}>
                            Revoke
                          </Button>
                        ) : (
                          <Button size="sm" onClick={() => send(["confirm", id])}>
                            Confirm
                          </Button>
                        )}
                        {canExecute && (
                          <Button
                            size="sm"
                            disabled={!affordable}
                            title={affordable ? undefined : "The wallet does not hold enough to pay this"}
                            onClick={() => send(["execute", id])}
                          >
                            Execute
                          </Button>
                        )}
                      </div>
                    )}

                    {isOwner && canExecute && !affordable && (
                      <p className="text-[12px] leading-relaxed" style={{ color: "var(--warning)" }}>
                        Signed and ready, but the wallet holds{" "}
                        {balance ? formatEther(balance.value) : "0"} {symbol} and this pays{" "}
                        {formatEther(txn.value)} {symbol}. Send funds to the wallet address above
                        and the button turns on.
                      </p>
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
