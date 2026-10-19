import { describe, expect, it } from "vitest";
import { parseEther } from "viem";
import { canAffordPayment, explainQuorumError } from "../errors";

describe("explainQuorumError", () => {
  it("names funding as the cause of a failed execution, with the balance", () => {
    const msg = explainQuorumError("ExecutionFailed", [0n], { symbol: "tBOT", balance: 0n });
    expect(msg).toContain("0 tBOT");
    expect(msg).toContain("funded");
    expect(msg).toContain("still in the queue");
  });

  it("omits the balance when it is not known", () => {
    const msg = explainQuorumError("ExecutionFailed", [0n], { symbol: "tBOT" });
    expect(msg).not.toContain("holds");
  });

  it("counts the signatures for ThresholdNotMet", () => {
    expect(explainQuorumError("ThresholdNotMet", [0n, 3n, 1n], { symbol: "BOT" })).toBe(
      "Not enough signatures yet — 1 of 3.",
    );
  });

  it("falls back to the error name it does not know", () => {
    expect(explainQuorumError("SomethingNew", [], { symbol: "BOT" })).toContain("SomethingNew");
  });

  it("says something useful even with no error name at all", () => {
    expect(explainQuorumError(undefined, undefined, { symbol: "BOT" })).toContain("did not say why");
  });
});

describe("canAffordPayment", () => {
  it("refuses a payment larger than the balance", () => {
    expect(canAffordPayment(parseEther("0.1"), 0n)).toBe(false);
  });

  it("allows a payment the balance exactly covers", () => {
    expect(canAffordPayment(parseEther("0.1"), parseEther("0.1"))).toBe(true);
  });

  it("does not block while the balance is still unknown", () => {
    expect(canAffordPayment(parseEther("0.1"), undefined)).toBe(true);
  });
});
