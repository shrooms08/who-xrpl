import { describe, it, expect } from "vitest";
import {
  MIN_PLAYERS,
  MAX_PLAYERS,
  imposterCount,
  assignRoles,
  clueError,
  tally,
  checkWinner,
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
  livingCrew,
  makeRng,
  pickWord,
  allWords,
  type GameState,
} from "../index";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);
const sizes = () =>
  Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i);

// ---------------------------------------------------------------------------
// config / role assignment
// ---------------------------------------------------------------------------
describe("imposter scaling", () => {
  it("matches the spec brackets", () => {
    expect([4, 5].map(imposterCount)).toEqual([1, 1]);
    expect([6, 7].map(imposterCount)).toEqual([2, 2]);
    expect([8, 9, 10].map(imposterCount)).toEqual([3, 3, 3]);
  });
  it("throws outside 4–10", () => {
    expect(() => imposterCount(3)).toThrow();
    expect(() => imposterCount(11)).toThrow();
  });
});

describe("assignRoles — counts at every lobby size 4–10", () => {
  for (const n of sizes()) {
    it(`n=${n} → ${imposterCount(n)} imposters, ${n - imposterCount(n)} crew`, () => {
      // several seeds to be sure it's always exactly k, never off-by-one
      for (let seed = 1; seed <= 25; seed++) {
        const players = assignRoles(ids(n), makeRng(seed));
        const imps = players.filter((p) => p.role === "imposter").length;
        const crew = players.filter((p) => p.role === "crew").length;
        expect(imps).toBe(imposterCount(n));
        expect(crew).toBe(n - imposterCount(n));
        expect(players).toHaveLength(n);
        expect(players.every((p) => p.alive)).toBe(true);
      }
    });
  }
});

describe("determinism", () => {
  it("same seed → identical deal (roles + order)", () => {
    const a = deal({ playerIds: ids(6), word: "MANGO", category: "food", rng: makeRng(42) });
    const b = deal({ playerIds: ids(6), word: "MANGO", category: "food", rng: makeRng(42) });
    expect(a).toEqual(b);
  });
  it("different seed → (usually) different deal", () => {
    const a = deal({ playerIds: ids(8), word: "MANGO", category: "food", rng: makeRng(1) });
    const b = deal({ playerIds: ids(8), word: "MANGO", category: "food", rng: makeRng(2) });
    expect(JSON.stringify(a.players) + a.order.join()).not.toEqual(
      JSON.stringify(b.players) + b.order.join(),
    );
  });
  it("category is carried and public on the state", () => {
    const s = deal({ playerIds: ids(4), word: "MANGO", category: "food", rng: makeRng(1) });
    expect(s.category).toBe("food");
  });
});

// ---------------------------------------------------------------------------
// clue validation
// ---------------------------------------------------------------------------
describe("clueError", () => {
  it("accepts a normal clue", () => {
    expect(clueError("sweet and stringy", "MANGO")).toBe("ok");
  });
  it("rejects empty / whitespace", () => {
    expect(clueError("   ", "MANGO")).toBe("empty");
  });
  it("rejects > 60 chars", () => {
    expect(clueError("x".repeat(61), "MANGO")).toBe("too_long");
    expect(clueError("x".repeat(60), "MANGO")).toBe("ok");
  });
  it("rejects the secret word, case-insensitively, as a substring", () => {
    expect(clueError("it is a MANGO", "mango")).toBe("contains_word");
    expect(clueError("MaNgO smoothie", "MANGO")).toBe("contains_word");
    expect(clueError("mangoes are great", "MANGO")).toBe("contains_word");
  });
  it("allows the (no clue) timeout sentinel", () => {
    expect(clueError("(no clue)", "MANGO")).toBe("ok");
  });
});

// ---------------------------------------------------------------------------
// vote tally
// ---------------------------------------------------------------------------
describe("tally", () => {
  const living = ["a", "b", "c", "d"];
  it("ejects a unique plurality", () => {
    expect(
      tally(
        [
          { voterId: "a", targetId: "b" },
          { voterId: "b", targetId: "c" },
          { voterId: "c", targetId: "b" },
          { voterId: "d", targetId: null },
        ],
        living,
      ).ejected,
    ).toBe("b");
  });
  it("no ejection on a tie for the top", () => {
    expect(
      tally(
        [
          { voterId: "a", targetId: "b" },
          { voterId: "b", targetId: "c" },
          { voterId: "c", targetId: "b" },
          { voterId: "d", targetId: "c" },
        ],
        living,
      ).ejected,
    ).toBeNull();
  });
  it("no ejection when everyone skips", () => {
    expect(
      tally(
        living.map((id) => ({ voterId: id, targetId: null })),
        living,
      ).ejected,
    ).toBeNull();
  });
  it("ignores votes for the dead / non-living targets", () => {
    expect(
      tally([{ voterId: "a", targetId: "zzz" }], living).ejected,
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// win check
// ---------------------------------------------------------------------------
describe("checkWinner", () => {
  const mk = (roles: [string, "crew" | "imposter", boolean][]): GameState =>
    ({
      players: roles.map(([id, role, alive]) => ({ id, role, alive })),
    }) as GameState;

  it("crew win when no imposters remain", () => {
    expect(
      checkWinner(
        mk([
          ["a", "crew", true],
          ["b", "imposter", false],
          ["c", "crew", true],
        ]),
      ),
    ).toBe("crew");
  });
  it("imposter win when imposters ≥ living crew", () => {
    expect(
      checkWinner(
        mk([
          ["a", "imposter", true],
          ["b", "crew", true],
        ]),
      ),
    ).toBe("imposter");
  });
  it("no winner mid-game", () => {
    expect(
      checkWinner(
        mk([
          ["a", "imposter", true],
          ["b", "crew", true],
          ["c", "crew", true],
        ]),
      ),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// clue phase mechanics
// ---------------------------------------------------------------------------
describe("clue phase", () => {
  it("enforces turn order and advances to discussion when all have clued", () => {
    let s = deal({ playerIds: ids(4), word: "MANGO", category: "food", rng: makeRng(7) });
    // wrong player can't clue
    const notCurrent = s.order[1];
    expect(() => submitClue(s, notCurrent, "hi")).toThrow("not_your_turn");
    // each living player clues in order
    for (let i = 0; i < 4; i++) {
      const p = currentCluePlayer(s)!;
      s = submitClue(s, p, `clue-${p}`);
    }
    expect(s.phase).toBe("discussion");
    expect(s.clues).toHaveLength(4);
  });
  it("accepts the NO_CLUE sentinel on timeout", () => {
    let s = deal({ playerIds: ids(4), word: "MANGO", category: "food", rng: makeRng(7) });
    const p = currentCluePlayer(s)!;
    s = submitClue(s, p, "(no clue)");
    expect(s.clues[0].text).toBe("(no clue)");
  });
});

// ---------------------------------------------------------------------------
// full-game drivers (deterministic) at every size / imposter count
// ---------------------------------------------------------------------------
const WORD = "MANGO";

function runCluePhase(s: GameState): GameState {
  while (s.phase === "clue") {
    const p = currentCluePlayer(s)!;
    s = submitClue(s, p, `clue-${p}`);
  }
  return s;
}

/** Everyone coordinates to eject one specific imposter each round; the ejected
 *  imposter always guesses wrong → the game must terminate in a crew win. */
function coordinatedCrewWin(seed: number, n: number): GameState {
  let s = deal({ playerIds: ids(n), word: WORD, category: "food", rng: makeRng(seed) });
  for (let guard = 0; guard < 60 && s.phase !== "end"; guard++) {
    s = runCluePhase(s);
    if (s.phase === "discussion") s = startVote(s);
    const target = livingImposters(s)[0].id;
    for (const v of livingIds(s)) s = submitVote(s, v, target);
    s = closeVote(s);
    if (s.phase === "guess") s = submitGuess(s, "wrong-word"); // never correct
    if (s.phase === "reveal") s = concludeRound(s, makeRng(seed + guard + 1));
  }
  return s;
}

describe("full games — crew win by ejecting every imposter (all sizes)", () => {
  for (const n of sizes()) {
    it(`n=${n} (${imposterCount(n)} imposters) terminates in a crew win`, () => {
      const s = coordinatedCrewWin(100 + n, n);
      expect(s.phase).toBe("end");
      expect(s.winner).toBe("crew");
      expect(livingImposters(s)).toHaveLength(0);
    });
  }
});

describe("imposter win by numbers (ejecting crew to parity)", () => {
  it("n=4, 1 imposter: crew mis-votes until imposters ≥ crew", () => {
    let s = deal({ playerIds: ids(4), word: WORD, category: "food", rng: makeRng(5) });
    for (let guard = 0; guard < 10 && s.phase !== "end"; guard++) {
      s = runCluePhase(s);
      if (s.phase === "discussion") s = startVote(s);
      const crewTarget = livingCrew(s)[0].id; // eject a crew member each round
      for (const v of livingIds(s)) s = submitVote(s, v, crewTarget);
      s = closeVote(s);
      if (s.phase === "guess") s = submitGuess(s, null);
      if (s.phase === "reveal") s = concludeRound(s, makeRng(guard));
    }
    expect(s.phase).toBe("end");
    expect(s.winner).toBe("imposter");
  });
});

describe("imposter-guess", () => {
  it("correct guess by an ejected imposter wins immediately", () => {
    let s = deal({ playerIds: ids(4), word: WORD, category: "food", rng: makeRng(11) });
    s = runCluePhase(s);
    s = startVote(s);
    const imposter = livingImposters(s)[0].id;
    for (const v of livingIds(s)) s = submitVote(s, v, imposter);
    s = closeVote(s);
    expect(s.phase).toBe("guess");
    expect(s.awaitingGuess).toBe(true);
    s = submitGuess(s, "  mAnGo "); // correct, normalized
    expect(s.phase).toBe("end");
    expect(s.winner).toBe("imposter");
    expect(s.guessWasCorrect).toBe(true);
  });

  it("wrong guess by the LAST imposter → crew win", () => {
    // n=4 has exactly 1 imposter; ejecting + wrong guess ends as crew win
    let s = deal({ playerIds: ids(4), word: WORD, category: "food", rng: makeRng(11) });
    s = runCluePhase(s);
    s = startVote(s);
    const imposter = livingImposters(s)[0].id;
    for (const v of livingIds(s)) s = submitVote(s, v, imposter);
    s = closeVote(s);
    s = submitGuess(s, "banana"); // wrong
    expect(s.phase).toBe("reveal");
    s = concludeRound(s, makeRng(1));
    expect(s.phase).toBe("end");
    expect(s.winner).toBe("crew");
  });

  it("no guess is offered when a crew member is ejected", () => {
    let s = deal({ playerIds: ids(6), word: WORD, category: "food", rng: makeRng(3) });
    s = runCluePhase(s);
    s = startVote(s);
    const crew = livingCrew(s)[0].id;
    for (const v of livingIds(s)) s = submitVote(s, v, crew);
    s = closeVote(s);
    expect(s.phase).toBe("reveal");
    expect(s.awaitingGuess).toBe(false);
    expect(s.ejectedRole).toBe("crew");
  });
});

describe("no-ejection round (tie) loops back to clue with same word", () => {
  it("a tie ejects nobody and starts a fresh clue phase", () => {
    let s = deal({ playerIds: ids(6), word: WORD, category: "food", rng: makeRng(9) });
    const word0 = s.word;
    s = runCluePhase(s);
    s = startVote(s);
    // split the vote 3–3 between two targets → tie → no ejection
    const living = livingIds(s);
    s = submitVote(s, living[0], living[2]);
    s = submitVote(s, living[1], living[2]);
    s = submitVote(s, living[2], living[3]);
    s = submitVote(s, living[3], living[3]);
    s = submitVote(s, living[4], living[3]);
    s = submitVote(s, living[5], living[2]);
    s = closeVote(s);
    expect(s.ejectedThisRound).toBeNull();
    expect(s.phase).toBe("reveal");
    s = concludeRound(s, makeRng(2));
    expect(s.phase).toBe("clue");
    expect(s.round).toBe(2);
    expect(s.word).toBe(word0);
    expect(livingIds(s)).toHaveLength(6); // nobody died
  });
});

// ---------------------------------------------------------------------------
// phase guards
// ---------------------------------------------------------------------------
describe("phase guards reject out-of-phase actions", () => {
  it("can't vote during the clue phase; can't clue during voting", () => {
    let s = deal({ playerIds: ids(4), word: WORD, category: "food", rng: makeRng(1) });
    expect(() => submitVote(s, s.order[0], null)).toThrow("not_vote_phase");
    s = runCluePhase(s);
    s = startVote(s);
    expect(() => submitClue(s, livingIds(s)[0], "x")).toThrow("not_clue_phase");
  });
});

// ---------------------------------------------------------------------------
// word bank
// ---------------------------------------------------------------------------
describe("word bank", () => {
  it("has 100 words across 6 categories", () => {
    const all = allWords();
    expect(all).toHaveLength(100);
    expect(new Set(all.map((w) => w.category)).size).toBe(6);
  });
  it("pickWord is deterministic under a seed and returns a real entry", () => {
    const w = pickWord(makeRng(123));
    expect(allWords()).toContainEqual(w);
    expect(pickWord(makeRng(123))).toEqual(w);
  });
});
