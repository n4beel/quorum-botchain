"use client";

import Link from "next/link";
import { useChainId } from "wagmi";
import Panel from "@/components/ui/Panel";
import CopyAddress from "@/components/ui/CopyAddress";
import { isBotChainId } from "@/lib/botchain/chain";
import { useSavedWallets } from "@/lib/saved-wallets";

interface SavedWalletsProps {
  /** The wallet currently open, so the list can mark it rather than link to it. */
  current?: string | null;
}

/**
 * The wallets this browser knows about.
 *
 * Deliberately quiet when empty: a first-time visitor has nothing to list and does not need an
 * empty box explaining that. Once there is something to remember, it is on every page.
 */
export default function SavedWallets({ current = null }: SavedWalletsProps) {
  const chainId = useChainId();
  const { wallets, forget } = useSavedWallets(isBotChainId(chainId) ? chainId : undefined);

  if (wallets.length === 0) return null;

  return (
    <Panel>
      <div className="flex flex-col gap-3">
        <span
          className="mono text-[11px] uppercase tracking-[0.08em]"
          style={{ color: "var(--text-tertiary)" }}
        >
          Your wallets
        </span>

        <ul className="flex flex-col gap-2 list-none p-0 m-0">
          {wallets.map((w) => {
            const isCurrent = current !== null && current.toLowerCase() === w.address.toLowerCase();
            return (
              <li key={w.address} className="flex items-center gap-2 flex-wrap">
                {isCurrent ? (
                  <span
                    className="mono text-[12px] break-all"
                    style={{ color: "var(--text-primary)" }}
                    aria-current="true"
                  >
                    {w.address}
                  </span>
                ) : (
                  <Link
                    href={`/wallet?address=${w.address}`}
                    className="mono text-[12px] break-all underline"
                    style={{ color: "var(--accent)" }}
                  >
                    {w.address}
                  </Link>
                )}

                <CopyAddress value={w.address} />

                <button
                  type="button"
                  onClick={() => forget(w.address)}
                  aria-label={`Forget ${w.address}`}
                  title="Remove from this list — the wallet itself is untouched"
                  className="mono text-[11px] uppercase tracking-[0.08em] cursor-pointer transition-opacity hover:opacity-70"
                  style={{
                    background: "transparent",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "2px",
                    padding: "3px 7px",
                    color: "var(--text-tertiary)",
                  }}
                >
                  forget
                </button>

                {isCurrent && (
                  <span className="mono text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                    open
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
          Kept in this browser only. Forgetting one removes the shortcut, not the wallet — paste the
          address back in at any time.
        </p>
      </div>
    </Panel>
  );
}
