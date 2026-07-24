import "server-only"; // adapters touch server secrets + the network
import type { LedgerAdapter } from "./adapter";
import { MockLedgerAdapter } from "./mock";
import { XrplTestnetAdapter } from "./xrpl-testnet";

export * from "./adapter";

let cached: LedgerAdapter | null = null;

/** The active ledger adapter, selected by `LEDGER_ADAPTER` env var.
 *  "xrpl-testnet" → real Xaman/XRPL; anything else (default) → mock. */
export function getLedgerAdapter(): LedgerAdapter {
  if (!cached) {
    cached =
      process.env.LEDGER_ADAPTER === "xrpl-testnet"
        ? new XrplTestnetAdapter()
        : new MockLedgerAdapter();
  }
  return cached;
}
