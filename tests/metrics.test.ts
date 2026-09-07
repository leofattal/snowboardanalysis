import { describe, it, expect } from "vitest";
import { computeFrameMetrics, computeSeries, LM } from "../src/analysis/metrics";
import type { FrameSample, Landmark } from "../src/pose/types";

/** Builds a full 33-landmark array; joints default to a standing side-view pose. */
export function makeLandmarks(overrides: Record<number, Partial<Landmark>> = {}): Landmark[] {
  const pts: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.99 }));
  const set = (i: number, x: number, y: number) => {
    pts[i] = { ...pts[i], x, y };
  };
  // Standing pose, image coords (y down). Legs straight, torso upright.
  set(LM.NOSE, 0.5, 0.1);
  set(LM.LEFT_SHOULDER, 0.45, 0.3);
  set(LM.RIGHT_SHOULDER, 0.55, 0.3);
  set(LM.LEFT_ELBOW, 0.42, 0.45);
  set(LM.RIGHT_ELBOW, 0.58, 0.45);
  set(LM.LEFT_WRIST, 0.4, 0.6);
  set(LM.RIGHT_WRIST, 0.6, 0.6);
  set(LM.LEFT_HIP, 0.45, 0.55);
  set(LM.RIGHT_HIP, 0.55, 0.55);
  set(LM.LEFT_KNEE, 0.45, 0.72);
  set(LM.RIGHT_KNEE, 0.55, 0.72);
  set(LM.LEFT_ANKLE, 0.45, 0.9);
  set(LM.RIGHT_ANKLE, 0.55, 0.9);
  for (const [k, v] of Object.entries(overrides)) {
    pts[Number(k)] = { ...pts[Number(k)], ...v };
  }
  return pts;
}

export function sample(t: number, landmarks: Landmark[] | null): FrameSample {
  return { t, landmarks, detectionScore: landmarks ? 0.9 : 0 };
}

describe("computeFrameMetrics", () => {
  it("measures straight legs as ~180° knee flex", () => {
    const m = computeFrameMetrics(sample(0, makeLandmarks()));
    expect(m.valid).toBe(true);
    expect(m.kneeL).toBeCloseTo(180, 1);
    expect(m.kneeR).toBeCloseTo(180, 1);
  });

  it("measures a bent knee correctly", () => {
    // Left knee bent forward: knee at (0.45,0.72), ankle shifted to (0.60,0.90).
    const m = computeFrameMetrics(sample(0, makeLandmarks({ [LM.LEFT_ANKLE]: { x: 0.6, y: 0.9 } })));
    // vectors knee→hip = (0,-0.17), knee→ankle = (0.15,0.18): cos = -0.0306/0.0398 ≈ ...
    expect(m.kneeL).toBeGreaterThan(120);
    expect(m.kneeL).toBeLessThan(160);
    expect(m.kneeR).toBeCloseTo(180, 1);
  });

  it("reports upright torso as ~0° lean", () => {
    const m = computeFrameMetrics(sample(0, makeLandmarks()));
    expect(m.torsoLean).toBeCloseTo(0, 1);
  });

  it("reports forward-folded torso as large lean", () => {
    // Shoulders thrown forward horizontally (folded at the waist): torso ≈ horizontal.
    const m = computeFrameMetrics(
      sample(0, makeLandmarks({ [LM.LEFT_SHOULDER]: { x: 0.2, y: 0.5 }, [LM.RIGHT_SHOULDER]: { x: 0.5, y: 0.5 } })),
    );
    expect(m.torsoLean).toBeGreaterThan(70);
  });

  it("computes zero counter-rotation when shoulders parallel to board", () => {
    const m = computeFrameMetrics(sample(0, makeLandmarks()));
    expect(m.counterRot).toBeCloseTo(0, 1);
  });

  it("computes counter-rotation when shoulders open against the board", () => {
    // Shoulder line tilted ~30° (dy/dx = tan30 ≈ 0.058 over 0.1 width) while ankles stay flat.
    const m = computeFrameMetrics(
      sample(0, makeLandmarks({ [LM.LEFT_SHOULDER]: { x: 0.45, y: 0.271 }, [LM.RIGHT_SHOULDER]: { x: 0.55, y: 0.329 } })),
    );
    expect(m.counterRot).toBeGreaterThan(25);
    expect(m.counterRot).toBeLessThan(35);
  });

  it("biasRaw is 0.5 when hips are centered over the feet", () => {
    const m = computeFrameMetrics(sample(0, makeLandmarks()));
    expect(m.biasRaw).toBeCloseTo(0.5, 2);
  });

  it("biasRaw shifts toward the ankle under the hips", () => {
    // Hips over the left ankle.
    const m = computeFrameMetrics(
      sample(0, makeLandmarks({ [LM.LEFT_HIP]: { x: 0.43, y: 0.55 }, [LM.RIGHT_HIP]: { x: 0.47, y: 0.55 } })),
    );
    expect(m.biasRaw).toBeLessThan(0.1);
  });

  it("marks frames with occluded joints as invalid", () => {
    const m = computeFrameMetrics(sample(0, makeLandmarks({ [LM.LEFT_KNEE]: { visibility: 0.1 } })));
    expect(m.valid).toBe(false);
    expect(m.kneeL).toBeNaN();
  });

  it("marks missing detections as invalid", () => {
    const m = computeFrameMetrics(sample(0, null));
    expect(m.valid).toBe(false);
  });
});

describe("computeSeries", () => {
  it("computes detection rate and travel sign", () => {
    const left = makeLandmarks();
    const right = makeLandmarks({}); // shifted right by +0.2 in x
    const shifted = right.map((p) => ({ ...p, x: Math.min(1, p.x + 0.2) }));
    const samples = [sample(0, left), sample(0.1, shifted), sample(0.2, null)];
    const s = computeSeries(samples);
    expect(s.detectionRate).toBeCloseTo(2 / 3, 5);
    expect(s.travelSign).toBe(1);
  });

  it("reports travelSign 0 for a static rider", () => {
    const lm = makeLandmarks();
    const s = computeSeries([sample(0, lm), sample(0.1, lm), sample(0.2, lm)]);
    expect(s.travelSign).toBe(0);
  });

  it("computes wrist speed in shoulder-widths per second", () => {
    const a = makeLandmarks();
    const b = makeLandmarks({ [LM.LEFT_WRIST]: { x: 0.45, y: 0.6 } }); // moved 0.05 in x
    // shoulder width = 0.1 → 0.5 sw over 0.1s = 5 sw/s (left wrist only, mean with right=0)
    const s = computeSeries([sample(0, a), sample(0.1, b)]);
    expect(s.wristSpeed[0]).toBeNaN();
    expect(s.wristSpeed[1]).toBeCloseTo(2.5, 5);
  });
});
