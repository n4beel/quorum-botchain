"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { isAddress, type Address } from "viem";

/**
 * The wallets this browser has seen.
 *
 * A Quorum wallet has no registry to look itself up in: the factory emits an address once and
 * after that the only way back to a wallet is to know its address. Losing it on a page refresh
 * makes the app unusable for its actual purpose, so every wallet created or opened here is kept
 * in localStorage and listed on both pages.
 *
 * This is a convenience, not a source of truth. It lives in one browser, it is never read back by
 * the contract, and a wallet missing from it is still perfectly real — which is why the address
 * field stays, and why forgetting a wallet only removes the shortcut.
 */

const KEY = "quorum.wallets.v1";

export interface SavedWallet {
  address: Address;
  chainId: number;
  /** Unix ms, so the list can show the newest first. */
  savedAt: number;
}

const listeners = new Set<() => void>();

/**
 * The raw JSON string, not the parsed array: a snapshot must be referentially stable or
 * useSyncExternalStore re-renders forever. Callers parse it behind a useMemo.
 */
let snapshot = "[]";
let loaded = false;

function read(): string {
  try {
    return window.localStorage.getItem(KEY) ?? "[]";
  } catch {
    // Private windows and blocked site data both throw here. The app works without the list.
    return "[]";
  }
}

function parse(raw: string): SavedWallet[] {
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter(
      (w): w is SavedWallet =>
        typeof w === "object" && w !== null &&
        typeof (w as SavedWallet).address === "string" && isAddress((w as SavedWallet).address) &&
        typeof (w as SavedWallet).chainId === "number" &&
        typeof (w as SavedWallet).savedAt === "number",
    );
  } catch {
    return [];
  }
}

function write(next: SavedWallet[]): void {
  const raw = JSON.stringify(next);
  snapshot = raw;
  try {
    window.localStorage.setItem(KEY, raw);
  } catch {
    // Out of quota, or storage blocked. The in-memory snapshot still serves this page view.
  }
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab of the same app writing the key.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== null && e.key !== KEY) return;
    snapshot = read();
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): string {
  if (!loaded) {
    snapshot = read();
    loaded = true;
  }
  return snapshot;
}

/** The server renders an empty list; the real one arrives on hydration. */
function getServerSnapshot(): string {
  return "[]";
}

/** Remember a wallet, newest first. Re-saving one it already knows just moves it to the top. */
export function rememberWallet(address: Address, chainId: number): void {
  const current = parse(getSnapshot());
  const rest = current.filter(
    (w) => !(w.address.toLowerCase() === address.toLowerCase() && w.chainId === chainId),
  );
  write([{ address, chainId, savedAt: Date.now() }, ...rest]);
}

export function forgetWallet(address: Address, chainId: number): void {
  const current = parse(getSnapshot());
  write(
    current.filter(
      (w) => !(w.address.toLowerCase() === address.toLowerCase() && w.chainId === chainId),
    ),
  );
}

/**
 * The wallets saved for `chainId`, newest first. A wallet deployed on Bohr does not exist on
 * mainnet, so the list is always filtered by the chain the page is pointed at.
 */
export function useSavedWallets(chainId: number | undefined): {
  wallets: SavedWallet[];
  forget: (address: Address) => void;
} {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const wallets = useMemo(
    () => (chainId === undefined ? [] : parse(raw).filter((w) => w.chainId === chainId)),
    [raw, chainId],
  );

  const forget = useCallback(
    (address: Address) => {
      if (chainId !== undefined) forgetWallet(address, chainId);
    },
    [chainId],
  );

  return { wallets, forget };
}
