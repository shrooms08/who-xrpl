import { describe, it, expect } from "vitest";
import {
  EYES_IDS,
  MOUTH_IDS,
  MARK_IDS,
  FACE_COLOR_KEYS,
  DEFAULT_FACE,
  isValidFaceSpec,
  sanitizeFaceSpec,
  randomFace,
} from "../spec";
import { EYES, MOUTHS, MARKS } from "../parts.generated";

describe("face spec", () => {
  it("id sets match the generated parts", () => {
    expect(EYES_IDS).toHaveLength(10);
    expect(MOUTH_IDS).toHaveLength(10);
    expect(MARK_IDS).toHaveLength(9); // includes mark-00 (none)
    expect(FACE_COLOR_KEYS).toHaveLength(9); // paper + 8 tints
    expect(new Set(EYES_IDS)).toEqual(new Set(Object.keys(EYES)));
    expect(new Set(MOUTH_IDS)).toEqual(new Set(Object.keys(MOUTHS)));
    expect(new Set(MARK_IDS)).toEqual(new Set(Object.keys(MARKS)));
  });

  it("isValidFaceSpec accepts valid, rejects unknown ids/colors and junk", () => {
    expect(isValidFaceSpec(DEFAULT_FACE)).toBe(true);
    expect(isValidFaceSpec({ eyes: "eyes-99", mouth: "mouth-01", mark: "mark-00", color: "paper" })).toBe(false);
    expect(isValidFaceSpec({ ...DEFAULT_FACE, color: "neon" })).toBe(false);
    expect(isValidFaceSpec({ ...DEFAULT_FACE, mark: "mark-09" })).toBe(false);
    expect(isValidFaceSpec(null)).toBe(false);
    expect(isValidFaceSpec("x")).toBe(false);
    expect(isValidFaceSpec({})).toBe(false);
  });

  it("sanitizeFaceSpec coerces each bad field to its default", () => {
    const s = sanitizeFaceSpec({ eyes: "bad", mouth: "mouth-07", mark: 5, color: "lilac" });
    expect(s).toEqual({ eyes: DEFAULT_FACE.eyes, mouth: "mouth-07", mark: DEFAULT_FACE.mark, color: "lilac" });
    expect(isValidFaceSpec(sanitizeFaceSpec(undefined))).toBe(true);
    expect(isValidFaceSpec(sanitizeFaceSpec("garbage"))).toBe(true);
  });

  it("randomFace is always valid", () => {
    let seed = 42;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < 500; i++) expect(isValidFaceSpec(randomFace(rand))).toBe(true);
  });
});
