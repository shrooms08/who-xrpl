# Gate P2 — Face Composer (final pre-mainnet upgrade)

Canonical assets: `docs/design/WHO Face System.html`. 10 eyes · 10 mouths · 8 marks
+ none · 9-tint paper palette. Extracted, wired everywhere, composer live.

## 1. Parts pipeline
- `scripts/extract-faces.mjs` decodes the design bundle (base64 + gzip) into
  `components/faces/parts.generated.ts` — `HEAD_PATH` + the inner SVG markup of
  every eyes/mouth/mark part (ink-on-transparent, shared 200×200 grid). Re-runnable.
- `components/faces/Face.tsx` — one `<Face spec size>` renders any spec at any size
  (32px chip → 150px reveal): head (tinted circle) → mark → eyes → mouth, layered
  at identical size, no per-combo tweaks. Pure/deterministic → server or client.
  Verified by rendering a 6-up strip; all combinations legible at 32px.

## 2. Data + validation
- `profiles.face` jsonb + `game_players.face` jsonb (migration 0017).
- **Random face at onboarding**: a `before insert` trigger on `profiles` assigns a
  random valid face when none is supplied (covers every insert path). Existing
  profiles **backfilled** with random faces in the migration.
- **Server rejects invalid ids**: a `before insert/update of face` trigger
  (migration 0018) validates the spec against the known ranges (eyes-01..10,
  mouth-01..10, mark-00..08, 9 colors) — un-bypassable at the DB. Proven: a bad
  face update raises `invalid_face`; a valid one persists.
- `components/faces/spec.ts` is the shared contract (id sets, palette, `isValidFaceSpec`,
  `sanitizeFaceSpec`, `randomFace`) — server-safe, imported by composer + renderer.

## 3. Snapshot at deal
- `snapshot_game_faces(game)` copies each player's current profile face into
  `game_players.face`; called once from `startGame` right after the deal. Identity
  (name + face) is stable for the game — mid-game profile edits do not change the
  running game; the next game picks them up.
- `get_game_roster` now returns the snapshot `face`.

## 4. Composer UI — `/profile`
Mobile-first (`app/profile`): large live preview + a 32px "how others see you"
beside it; swipeable ink rows for eyes / mouth / mark / paper with the selected
part on a hot ring; 🎲 randomize; **save** persists the jsonb (validated by the DB
trigger). Home header links here ("edit face").

## 5. Rollout — faces on every identity surface
`AvatarChip` renders a `<Face>` when a spec exists (initials remain the no-face
fallback); dead (grayscale + X) and current-turn (hot ring) treatments layer over
the face. Wired through:
- home header · lobby roster · turn strip · clue-feed attribution · **chat
  attribution** · **vote grid** (faces on the vote buttons) · **ejection reveal**
  (large dead-treated face) · **end-screen full reveal**.
- `RosterPlayer.face` flows from `get_game_roster`; lobby faces come live from
  `profiles` (pre-game). *(No match-history surface exists yet — nothing to wire.)*

## 6. Tokens
The 8 new tint hexes live once in `app/globals.css` (`:root --face-*`); `paper`
reuses `--card`. `FACE_COLORS` maps keys → `var(--…)`, so no raw hex in face code.
Grep-proof: the tint hexes appear only in the tokens file; no raw hex in
spec/Face/composer.

## Verification
- 97 unit tests (4 new face-spec: id-set/parts parity, validate accept/reject,
  sanitize coercion, 500× randomFace validity). `tsc` clean; production build ok;
  `/profile` route built.
- DB: backfill (8/8 profiles), `random_face` output valid, `invalid_face`
  rejection proven, valid save persists.
- Composed-face render check (large + 32px legibility) passed.
- Full live-DB e2e re-run (deal → `snapshot_game_faces` → roster).

## Acceptance (host to run — full friends session)
1. Compose + save on mobile; face appears across all surfaces; 32px legibility in
   a 6-player roster.
2. Mid-game face edit does NOT change the running game; next game shows it.
3. Vote grid + ejection reveal render faces incl. dead treatment.
4. Server rejects invalid part ids (proven at the DB).
