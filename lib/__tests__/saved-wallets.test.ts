import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Address } from "viem";

/**
 * The saved-wallets store is the only record of a wallet's address outside the chain: the factory
 * emits it once and there is no registry to look it up in. These cover the ways that record can be
 * silently lost — a bad entry poisoning the parse, a chain mix-up, or storage simply throwing.
 */

const A = "0x1111111111111111111111111111111111111111" as Address;
const B = "0x2222222222222222222222222222222222222222" as Address;
const BOHR = 968;
const MAINNET = 677;

function freshStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

// The module caches its snapshot at first read, so each test gets a fresh copy of it.
async function load(storage: Storage) {
  const listeners: Array<(e: StorageEvent) => void> = [];
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: storage,
      addEventListener: (_: string, l: (e: StorageEvent) => void) => listeners.push(l),
      removeEventListener: () => {},
    },
  });
  globalThis.localStorage = storage;
  // The module caches its snapshot in a module-level variable, so it has to be re-evaluated.
  vi.resetModules();
  return import("../saved-wallets");
}

describe("saved wallets", () => {
  let storage: Storage;

  beforeEach(() => {
    storage = freshStorage();
  });

  it("keeps a wallet across a reload", async () => {
    const first = await load(storage);
    first.rememberWallet(A, BOHR);

    // A reload is a fresh module against the same storage.
    const second = await load(storage);
    const saved = JSON.parse(storage.getItem("quorum.wallets.v1")!);
    expect(saved).toHaveLength(1);
    expect(saved[0].address).toBe(A);
    expect(second).toBeDefined();
  });

  it("does not duplicate a wallet saved twice", async () => {
    const m = await load(storage);
    m.rememberWallet(A, BOHR);
    m.rememberWallet(A, BOHR);
    expect(JSON.parse(storage.getItem("quorum.wallets.v1")!)).toHaveLength(1);
  });

  it("keeps the same address on two chains apart", async () => {
    const m = await load(storage);
    m.rememberWallet(A, BOHR);
    m.rememberWallet(A, MAINNET);
    const saved = JSON.parse(storage.getItem("quorum.wallets.v1")!);
    expect(saved).toHaveLength(2);
    expect(saved.map((w: { chainId: number }) => w.chainId).sort()).toEqual([MAINNET, BOHR]);
  });

  it("forgets only the wallet named, on the chain named", async () => {
    const m = await load(storage);
    m.rememberWallet(A, BOHR);
    m.rememberWallet(B, BOHR);
    m.rememberWallet(A, MAINNET);
    m.forgetWallet(A, BOHR);
    const saved = JSON.parse(storage.getItem("quorum.wallets.v1")!);
    expect(saved).toHaveLength(2);
    expect(saved.some((w: { address: string; chainId: number }) => w.address === A && w.chainId === BOHR)).toBe(false);
    expect(saved.some((w: { address: string; chainId: number }) => w.address === A && w.chainId === MAINNET)).toBe(true);
  });

  it("drops junk entries rather than throwing the whole list away", async () => {
    storage.setItem(
      "quorum.wallets.v1",
      JSON.stringify([
        { address: "not-an-address", chainId: BOHR, savedAt: 1 },
        { address: A, chainId: BOHR, savedAt: 2 },
        null,
        { address: B },
      ]),
    );
    const m = await load(storage);
    m.rememberWallet(B, BOHR);
    const saved = JSON.parse(storage.getItem("quorum.wallets.v1")!);
    expect(saved.map((w: { address: string }) => w.address).sort()).toEqual([A, B].sort());
  });

  it("survives storage that throws", async () => {
    const hostile = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    } as unknown as Storage;
    const m = await load(hostile);
    expect(() => m.rememberWallet(A, BOHR)).not.toThrow();
  });
});
