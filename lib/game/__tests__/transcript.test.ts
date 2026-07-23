import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  deal,
  submitClue,
  startVote,
  submitVote,
  closeVote,
  submitGuess,
  concludeRound,
  currentCluePlayer,
  livingIds,
  livingImposters,
  makeRng,
  type GameState,
} from "../index";

// Generates docs/gates/gate2-engine-transcript.txt — a deterministic,
// human-readable sample game used as evidence in the gate report.
describe("sample-game transcript", () => {
  it("plays a full deterministic 4-player game to a crew win", () => {
    const NAMES = ["MIRA", "ZARA", "KOFI", "DEDE"];
    const out: string[] = [];
    const log = (line = "") => out.push(line);

    let s: GameState = deal({
      playerIds: NAMES,
      word: "MANGO",
      category: "food",
      rng: makeRng(7),
    });

    log("WHO? — sample 4-player game (deterministic, seed=7)");
    log("=".repeat(52));
    log(`secret word: ${s.word}   ·   category (public): ${s.category}`);
    log("roles (omniscient — hidden from players in the real app):");
    for (const p of s.players) log(`  ${p.id.padEnd(6)} ${p.role}`);
    log(`clue turn order: ${s.order.join(" → ")}`);
    log("");

    const CLUES: Record<string, string> = {
      MIRA: "sweet but stringy",
      ZARA: "you peel it",
      KOFI: "grows on trees",
      DEDE: "orange inside",
    };

    log(`ROUND ${s.round} — CLUE PHASE`);
    while (s.phase === "clue") {
      const p = currentCluePlayer(s)!;
      const text = CLUES[p] ?? "(no clue)";
      s = submitClue(s, p, text);
      log(`  ${p.padEnd(6)} "${text}"`);
    }

    log("");
    log("DISCUSSION (120s open chat) — the crew compares notes…");
    s = startVote(s);

    log("");
    log("VOTE PHASE");
    const imposter = livingImposters(s)[0].id;
    for (const v of livingIds(s)) {
      const target = v === imposter ? "DEDE" : imposter;
      s = submitVote(s, v, target);
      log(`  ${v.padEnd(6)} votes → ${target}`);
    }
    s = closeVote(s);
    log("");
    log(`RESULT: ${s.ejectedThisRound ?? "nobody"} ejected — role: ${s.ejectedRole ?? "—"}`);

    if (s.phase === "guess") {
      log("");
      log(`GUESS PHASE — ejected imposter (${s.ejectedThisRound}) gets one shot (15s)…`);
      s = submitGuess(s, "melon");
      log(`  guessed "melon" → ${s.guessWasCorrect ? "CORRECT" : "wrong"}`);
    }

    if (s.phase === "reveal") s = concludeRound(s, makeRng(99));

    log("");
    log("=".repeat(52));
    log(`GAME OVER — winner: ${s.winner?.toUpperCase()}   (round ${s.round})`);

    const dir = resolve(__dirname, "../../../docs/gates");
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, "gate2-engine-transcript.txt"), out.join("\n") + "\n");

    expect(s.phase).toBe("end");
    expect(s.winner).toBe("crew");
  });
});
