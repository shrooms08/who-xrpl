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

/** Category keys available in the bank. */
export function categoryKeys(): string[] {
  return Object.keys(CATEGORIES);
}

/** Deterministically pick a secret word given an injected Rng. When `topic` is a
 *  known category, the draw is restricted to it; otherwise (null/unknown) the
 *  whole bank is used. */
export function pickWord(rng: Rng, topic?: string | null): WordChoice {
  const pool =
    topic && CATEGORIES[topic]
      ? CATEGORIES[topic].map((word) => ({ word, category: topic }))
      : allWords();
  return pool[Math.floor(rng() * pool.length)];
}
