import { describe, it, expect } from "vitest";
import { buildSummary } from "../src/coaching/summary";
import { computeSeries, LM } from "../src/analysis/metrics";
import type { Landmark } from "../src/pose/types";
import { makeLandmarks, sample } from "./metrics.test";

const landmarksAt = (xOffset: number): Landmark[] =>
  makeLandmarks({}).map((p) => ({ ...p, x: Math.min(1, p.x + xOffset) }));

describe("buildSummary", () => {
  it("converts biasRaw into front-foot bias using travel direction", () => {
    // Rider moves right (+x) → front foot is the right ankle. Hips centered → bias 0.5.
    const samples = [
      sample(0, landmarksAt(0)),
      sample(0.1, landmarksAt(0.1)),
      sample(0.2, landmarksAt(0.2)),
    ];
    const series = computeSeries(samples);
    const s = buildSummary(series, [], { context: "turns", stance: "auto", duration: 0.2, fps: 15 });
    expect(s.global.meanBiasFront).toBeCloseTo(0.5, 1);
    expect(s.biasEstimated).toBe(false);
    expect(s.travelSign).toBe(1);
  });

  it("flags estimated bias when the camera/rider is static", () => {
    const lm = makeLandmarks({ [LM.LEFT_HIP]: { x: 0.4, y: 0.55 }, [LM.RIGHT_HIP]: { x: 0.42, y: 0.55 } });
    const series = computeSeries([sample(0, lm), sample(0.1, lm)]);
    const s = buildSummary(series, [], { context: "turns", stance: "regular", duration: 0.1, fps: 15 });
    expect(s.biasEstimated).toBe(true);
    // regular → front = left ankle; hips near left ankle → bias high (toward front)
    expect(s.global.meanBiasFront).toBeGreaterThan(0.8);
    expect(s.cameraNotes.some((n) => n.includes("bias"))).toBe(true);
  });

  it("adds a camera note for small riders and low detection", () => {
    const small = makeLandmarks({}).map((p) => ({ ...p, x: 0.4 + (p.x - 0.5) * 0.2, y: 0.4 + (p.y - 0.5) * 0.2 }));
    const series = computeSeries([sample(0, small), sample(0.1, null)]);
    const s = buildSummary(series, [], { context: "turns", stance: "auto", duration: 0.1, fps: 15 });
    expect(s.cameraNotes.some((n) => n.includes("small"))).toBe(true);
    expect(s.cameraNotes.some((n) => n.includes("detected"))).toBe(true);
  });
});
