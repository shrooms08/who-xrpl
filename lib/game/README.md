# lib/game — Pure game engine

Deterministic, side-effect-free state machine for a WHO? round:
`deal → clue → discussion → vote → reveal → (loop | end)`.

**Rules for this directory:**

- No I/O, no network, no `Date.now()`, no randomness sourced internally — all
  entropy (RNG seed, timestamps) is passed in by the caller so the engine stays
  deterministic and unit-testable.
- Never imports `xrpl`, `xumm`, `@supabase/*`, or anything from `app/`.
- Fully unit-tested (Gate 2): role-assignment counts, clue validation, vote
  tallying incl. ties, and win conditions at every lobby size 4–10.

Implementation lands in **Gate 2**. This file marks the boundary.
