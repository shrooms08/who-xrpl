# lib/ledger — XRPL adapter boundary

**All** XRPL / Xaman interaction goes through the `LedgerAdapter` interface
defined here. Game logic and UI depend only on the interface, never on `xrpl.js`
or the `xumm` SDK directly.

Planned contents (**Gate 3**):

- `adapter.ts` — the `LedgerAdapter` interface
  (`createSeatClaimRequest`, `verifySeatClaim`, `getAccountInfo`).
- `mock.ts` — `MockLedgerAdapter` (instant-success, used in dev/tests).
- `xrpl-testnet.ts` — `XrplTestnetAdapter` (real testnet + Xaman).
- `index.ts` — env-var-driven adapter selection.

**Invariant (enforced by grep in Gate 3):** no file *outside* this directory
imports `xrpl` or `xumm`.
