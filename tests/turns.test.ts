import { describe, it, expect } from "vitest";
import { detectEdgeChanges, buildTurns, turnRhythmCv } from "../src/analysis/turns";
import type { FrameMetrics } from "../src/analysis/metrics";

function syntheticSeries(hipAngle: (t: number) => number, durationS = 12, fps = 15): FrameMetrics[] {
  const n = Math.round(durationS * fps);
  return Array.from({ length: n }, (_, i) => ({
    t: i / fps,
    valid: true,
    detectionScore: 0.9,
    kneeL: 150,
    kneeR: 150,
    torsoLean: 10,
    counterRot: 5,
    boardAngle: 0,
    hipLineAngle: hipAngle(i / fps),
    biasRaw: 0.5,
    armSpread: 1,
    riderHeight: 0.5,
    midHip: { x: 0.5, y: 0.5 },
  }));
}

describe("detectEdgeChanges", () => {
  it("finds crossings for an oscillating rider (~3 s turn cycle)", () => {
    // 12 s at 15 fps, sine with 3 s period → 4 full cycles → ~8 zero crossings.
    const frames = syntheticSeries((t) => 15 * Math.sin((2 * Math.PI * t) / 3));
    const { times } = detectEdgeChanges(frames, 15);
    expect(times.length).toBeGreaterThanOrEqual(6);
    expect(times.length).toBeLessThanOrEqual(9);
    // crossings are ordered
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1]);
  });

  it("respects the minimum gap (1 s) between crossings", () => {
    const frames = syntheticSeries((t) => 15 * Math.sin((2 * Math.PI * t) / 3));
    const { times } = detectEdgeChanges(frames, 15);
    for (let i = 1; i < times.length; i++) {
      expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(0.99);
    }
  });

  it("ignores sub-threshold wobble", () => {
    const frames = syntheticSeries((t) => 0.5 * Math.sin((2 * Math.PI * t) / 2));
    const { times } = detectEdgeChanges(frames, 15);
    expect(times).toHaveLength(0);
  });

  it("returns no crossings for a flat signal", () => {
    const frames = syntheticSeries(() => 5);
    const { times } = detectEdgeChanges(frames, 15);
    expect(times).toHaveLength(0);
  });

  it("returns empty for too-short or invalid series", () => {
    expect(detectEdgeChanges([], 15).times).toHaveLength(0);
    const invalid = syntheticSeries(() => 0).map((f) => ({ ...f, valid: false }));
    expect(detectEdgeChanges(invalid, 15).times).toHaveLength(0);
  });
});

describe("buildTurns / turnRhythmCv", () => {
  it("builds segments between consecutive edge changes", () => {
    const turns = buildTurns([1, 2.5, 4, 5.5], 8);
    expect(turns).toHaveLength(3);
    expect(turns[0]).toMatchObject({ tStart: 1, tEnd: 2.5 });
  });

  it("computes rhythm CV for even and uneven turns", () => {
    const even = buildTurns([0, 2, 4, 6, 8], 10);
    const uneven = buildTurns([0, 1, 4, 5, 9], 10);
    expect(turnRhythmCv(even)!).toBeCloseTo(0, 6);
    expect(turnRhythmCv(uneven)!).toBeGreaterThan(0.3);
  });

  it("returns null when fewer than 3 turns", () => {
    expect(turnRhythmCv(buildTurns([0, 2], 5))).toBeNull();
  });
});
