# WHO?

Real-time social-deduction (imposter) game with XRPL integration, built for the
XRPL Commons "Make Waves" competition.

- **Week 1 target:** XRPL **testnet** only.
- **No custody, ever.** The app never holds keys, seed phrases, or user funds.
- **Adapter boundary:** all XRPL interaction goes through
  [`lib/ledger`](lib/ledger/README.md). Game logic never imports `xrpl.js`.

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind · Supabase (Postgres, Auth,
Realtime) · xrpl.js + Xaman/XUMM (Gate 3) · deploys to Vercel.

## Repo structure

```
app/                 Next.js App Router (UI + route handlers)
lib/
  game/              Pure, deterministic game engine (Gate 2). No I/O, no xrpl.
    word-bank.json   Seed secret-word bank (100 words, 6 categories).
  ledger/            LedgerAdapter interface + mock/testnet impls (Gate 3).
supabase/
  migrations/        SQL migrations (0001 = initial schema + RLS).
docs/
  RLS.md             Every row-level-security policy, explained.
```

## Prerequisites

- Node.js 20+ (developed on 24)
- A [Supabase](https://supabase.com) project (free tier is fine)
- (Gate 3 only) an [apps.xumm.dev](https://apps.xumm.dev) API key + an XRPL
  testnet address

## Setup

```bash
# 1. Install
npm install

# 2. Configure env
cp .env.example .env.local
#   → fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
#     and SUPABASE_SERVICE_ROLE_KEY from Supabase → Settings → API.

# 3. Apply the database schema to your Supabase project (pick one):

#   a) Supabase SQL editor: paste supabase/migrations/0001_initial_schema.sql
#      and run it.

#   b) Supabase CLI (recommended):
#        npm i -g supabase
#        supabase link --project-ref <your-ref>
#        supabase db push

#   c) psql:
#        psql "$SUPABASE_DB_URL" -f supabase/migrations/0001_initial_schema.sql

# 4. Run
npm run dev            # http://localhost:3000
```

Other scripts: `npm run build`, `npm run start`, `npm run typecheck`,
`npm run lint`.

### Auth setup (email OTP) — one-time

Login uses Supabase email **OTP codes**. For the 6-digit code to appear in the
email, the email template must render the token. In the Supabase dashboard →
**Authentication → Email Templates → Magic Link**, ensure the body includes:

```
Your WHO? code is: {{ .Token }}
```

(The default template only contains a magic-link URL, not a code.) Also confirm
**Authentication → Providers → Email** is enabled. Note: the built-in SMTP has a
low hourly send limit — fine for small tests, configure custom SMTP for heavier
use.

## Security model

Read [`docs/RLS.md`](docs/RLS.md). In short: RLS is enabled **and forced** on
every table with a default-deny posture; a player's **role** and the **secret
word** are never selectable from a client-facing table (own-row-only + an
isolated `game_secrets` table reached through a `SECURITY DEFINER` RPC); and all
game-state transitions are written server-side with the service-role key.

## Build gates (Week 1)

| Gate | Scope | Status |
|---|---|---|
| **0** | Scaffold: repo structure, schema + RLS, docs | ✅ this deliverable |
| **1** | Lobbies: OTP auth, create/join, realtime presence | ✅ |
| **2** | Game loop: pure engine + server orchestration + UI | ⬜ |
| **3** | XRPL testnet seat-claim via Xaman | ⬜ |

Mainnet, payouts, NFTs, voice, matchmaking, and leaderboards are explicitly out
of scope for Week 1.
