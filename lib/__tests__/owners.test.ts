import { describe, expect, it } from "vitest";
import { isDeployable, newOwner, validateSigners, type OwnerRow } from "../owners";

const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";

const rows = (...a: string[]): OwnerRow[] => a.map((address, i) => ({ id: String(i), address }));

/**
 * A deployed wallet can never be reconfigured — there is no owner-management function — so every
 * one of these mistakes is permanent and costs a redeploy.
 */
describe("validateSigners", () => {
  it("accepts a sound set", () => {
    const set = validateSigners(rows(A, B), "2");
    expect(set.problems).toEqual([]);
    expect(set.thresholdProblem).toBeNull();
    expect(isDeployable(set, "2")).toBe(true);
  });

  it("ignores a row the user has not filled in", () => {
    const set = validateSigners([...rows(A), newOwner()], "1");
    expect(set.owners).toHaveLength(1);
    expect(set.problems).toEqual([]);
  });

  it("rejects a bad address", () => {
    expect(validateSigners(rows("0xnope"), "1").problems[0].message).toMatch(/not an address/i);
  });

  it("rejects a duplicate signer however it is spelled", () => {
    const set = validateSigners(rows(A, A.toUpperCase().replace("0X", "0x")), "1");
    expect(set.problems.some((p) => /already a signer/i.test(p.message))).toBe(true);
  });

  // The failure that matters most: a wallet nobody can ever spend from.
  it("rejects a threshold above the signer count", () => {
    expect(validateSigners(rows(A, B), "3").thresholdProblem).toMatch(/only 2 signers/i);
  });

  it("rejects a zero threshold", () => {
    expect(validateSigners(rows(A), "0").thresholdProblem).toMatch(/at least one/i);
  });

  it("accepts 1-of-1 and n-of-n", () => {
    expect(isDeployable(validateSigners(rows(A), "1"), "1")).toBe(true);
    expect(isDeployable(validateSigners(rows(A, B), "2"), "2")).toBe(true);
  });

  it("rejects more signers than the contract takes", () => {
    const many = Array.from({ length: 21 }, (_, i) => `0x${String(i + 1).padStart(40, "0")}`);
    expect(isDeployable(validateSigners(rows(...many), "1"), "1")).toBe(false);
  });

  it("is not deployable with no signers", () => {
    expect(isDeployable(validateSigners([], "1"), "1")).toBe(false);
  });
});
