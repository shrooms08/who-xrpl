import { describe, it, expect } from "vitest";
import { splitPot } from "@/lib/ledger/split";
import { GAME_POT_DROPS } from "@/lib/game/config";

const ids = (n: number) =>
  Array.from({ length: n }, (_, i) => `p${i.toString().padStart(2, "0")}`);

/** Shares must always sum back to exactly the pot (no drops created or lost). */
function sum(shares: { drops: string }[]): bigint {
  return shares.reduce((acc, s) => acc + BigInt(s.drops), 0n);
}

describe("splitPot", () => {
  it("splits evenly when the pot divides", () => {
    const shares = splitPot(1_000_000, ids(4));
    expect(shares.map((s) => s.drops)).toEqual([
      "250000",
      "250000",
      "250000",
      "250000",
    ]);
    expect(sum(shares)).toBe(1_000_000n);
  });

  it("gives the remainder to the first winner", () => {
    const shares = splitPot(1_000_000, ids(3));
    // 1_000_000 / 3 = 333333 rem 1 -> first gets 333334
    expect(shares.map((s) => s.drops)).toEqual(["333334", "333333", "333333"]);
    expect(sum(shares)).toBe(1_000_000n);
  });

  it("awards the whole pot to a single winner (imposter-side win)", () => {
    const shares = splitPot(GAME_POT_DROPS, ids(1));
    expect(shares).toEqual([{ playerId: "p00", drops: String(GAME_POT_DROPS) }]);
  });

  it("conserves the pot for every supported winner count 1..10", () => {
    for (let n = 1; n <= 10; n++) {
      const shares = splitPot(GAME_POT_DROPS, ids(n));
      expect(shares).toHaveLength(n);
      expect(sum(shares)).toBe(BigInt(GAME_POT_DROPS));
      // only the first winner may differ (by the remainder); the rest are equal
      const rest = shares.slice(1).map((s) => s.drops);
      expect(new Set(rest).size).toBeLessThanOrEqual(1);
      // first winner's share >= any other (holds the remainder)
      if (n > 1) {
        expect(BigInt(shares[0].drops)).toBeGreaterThanOrEqual(
          BigInt(shares[1].drops),
        );
      }
    }
  });

  it("is order-deterministic (share follows position, remainder to index 0)", () => {
    const a = splitPot(1_000_000, ["x", "y", "z"]);
    const b = splitPot(1_000_000, ["x", "y", "z"]);
    expect(a).toEqual(b);
    expect(a[0]).toEqual({ playerId: "x", drops: "333334" });
  });

  it("returns nothing for zero winners", () => {
    expect(splitPot(GAME_POT_DROPS, [])).toEqual([]);
  });

  it("handles large pots without precision loss (bigint math)", () => {
    const big = 12_345_678_901_234n; // > 2^43, safe only in bigint
    const shares = splitPot(big, ids(7));
    expect(sum(shares)).toBe(big);
  });
});
