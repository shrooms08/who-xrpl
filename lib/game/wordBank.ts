import bank from "./word-bank.json";
import type { Rng } from "./rng";

export interface WordChoice {
  word: string;
  category: string;
}

const CATEGORIES = bank.categories as Record<string, string[]>;

/** Every (word, category) pair in the bank. */
export function allWords(): WordChoice[] {
  const out: WordChoice[] = [];
  for (const [category, words] of Object.entries(CATEGORIES)) {
    for (const word of words) out.push({ word, category });
  }
  return out;
}

/** Deterministically pick a secret word given an injected Rng. */
export function pickWord(rng: Rng): WordChoice {
  const all = allWords();
  return all[Math.floor(rng() * all.length)];
}
