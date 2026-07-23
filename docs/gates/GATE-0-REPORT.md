# Gate 0 — Scaffold · Report

**Status:** ✅ Delivered · approved by user 2026-07-23 (with one Gate-2 amendment).
**Backfilled** retroactively per the standing gate-report-and-commit rule.

---

## 1. What was built (file map)

```
who-xrpl/                          ← folder renamed from "who?" during Gate 0
├── app/                           Next.js 14 App Router
│   ├── layout.tsx                 Root layout, <title>WHO?</title>
│   ├── page.tsx                   Landing page (renders "WHO?")
│   └── globals.css                Tailwind entry
├── lib/
│   ├── game/
│   │   ├── README.md              Engine boundary rules (impl = Gate 2)
│   │   └── word-bank.json         100 words · 6 categories · editable
│   └── ledger/
│       └── README.md              LedgerAdapter boundary rules (impl = Gate 3)
├── supabase/
│   └── migrations/
│       └── 0001_initial_schema.sql  11 tables, enums, RLS, RPCs, realtime
├── docs/
│   ├── RLS.md                     Every policy explained
│   └── gates/
│       └── GATE-0-REPORT.md       (this file)
├── .env.example                   All vars for Gates 0–3, grouped by gate
├── .gitignore
├── README.md                      Run instructions + security summary
├── package.json                   Next 14.2.35, TS, Tailwind, Supabase
└── tsconfig.json / next.config.mjs / postcss.config.mjs / tailwind.config.ts
```

## 2. Acceptance criteria

| Criterion | Status | Evidence |
|---|---|---|
| `npm run dev` boots | ✅ PASS | `HTTP 200`, page renders `WHO?`, zero errors in dev log, "Ready in 3.1s"; `tsc --noEmit` clean. (Achieved after the folder rename — see Decision 1.) |
| Migration applies cleanly to a fresh Supabase project | ✅ PASS (live-applied) | Applied to fresh project **`wzpvdverwrqipxuequaf`** ("who-xrpl", us-east-1, $0/mo). `apply_migration` → `{"success":true}`. `list_tables` confirms all 11 tables with `rls_enabled: true`. Security advisor clean except intentional items (see §4). Migrations `0002`+`0003` harden function grants. |
| RLS.md exists and explains every policy | ✅ PASS | `docs/RLS.md` documents all 18 policies, 4 helper fns, 2 RPCs, secret-word isolation, realtime. |

## 3. Decisions made that weren't specified (all flagged)

1. **Folder renamed `who?` → `who-xrpl`** (user approved). The `?` made webpack
   truncate every module path at `who` (`ENOENT .../who`), returning HTTP 500.
   Not config-fixable. Brand "WHO?" unchanged in UI/title.
2. **Added an 11th table `game_secrets`** (word + category), isolating the secret
   from any client-readable table. The 10 spec-named tables all exist.
3. **`get_game_roster` does not reveal imposter-to-imposter identities** — kept
   least-exposure; imposter-knows-imposter deferred to a **mandatory Gate 2 RPC**.
4. **Clues/votes have no client INSERT policy** (server-only writes); votes
   readable only by their own voter (live tallies hidden). Chat allows
   membership-gated client insert; phase/mute rules tightened in Gate 2.
5. **`category` was treated as secret** (stored in `game_secrets`).
   → **AMENDED at review:** category is **public** to all players; only the word
   stays secret. To be adjusted in Gate 2 (patch 0001 or add 0002).
6. **Next pinned to `14.2.35`** (latest patched 14.2.x within the spec-fixed
   Next 14 line).
7. **No `auth.users` → `profiles` trigger** — app inserts the profile row at
   onboarding (policy allows `id = auth.uid()`).

## 4. Supabase provisioning + security advisor

- **Project:** `who-xrpl`, ref **`wzpvdverwrqipxuequaf`**, org "Minos"
  (`bsftynifetmykjcialnf`), region `us-east-1`, cost **$0/month** (confirmed
  before creation).
- **Creation was initially blocked** by the org's 2-active-free-project limit
  (`BadRequestException`); resolved after the user paused an active project.
- **Migrations applied (all `{"success":true}`):** `0001_initial_schema`,
  `0002_harden_function_grants`, `0003_revoke_anon_function_execute`.
- **Security advisor — final state (after 0002/0003):**
  - ✅ All 7 `anon`-executable SECURITY DEFINER warnings **eliminated** (anon
    revoked; verified anon now gets `permission denied`, authenticated reads
    still work).
  - ℹ️ **INFO** `game_secrets` "RLS enabled, no policy" — **intentional** (the
    locked secret-word table).
  - ⚠️ **WARN** (×6) `authenticated` can execute the SECURITY DEFINER functions —
    **expected/required**: helpers need it for RLS policy evaluation, RPCs are
    client-facing; all benign (each keys off `auth.uid()`, leaks nothing).

## 5. Known issues / debt

- **`npm audit`** flags Next advisories fixed only in Next 15/16 — not applied
  (stack is spec-fixed to Next 14). Revisit at mainnet cutover.
- One transitive `postcss` moderate advisory via Next's bundled copy — same story.
- Landing page is a static placeholder; auth/lobby UI is Gate 1.
- **Env not yet wired**: `.env.local` will be populated with the project URL +
  anon key at the start of Gate 1 (the service-role key stays server-only).
- Optional future hardening: move the 4 pure RLS-helper functions to a
  non-exposed schema to drop the (benign) lint-0029 warnings.

## 6. Gate-2 carry-forward (must not be lost)

- **Public category** (amendment above).
- **Mandatory imposter-knows-imposter RPC.**

## 7. Outcome

Gate 0 approved; Supabase project provisioned and all three migrations applied
successfully to `wzpvdverwrqipxuequaf`. Awaiting the user's dashboard
verification before starting Gate 1.
