import { describe, it, expect } from "vitest";
import { mockCoach } from "../src/coaching/mock";
import { validateCoaching, parseJsonLoose } from "../src/coaching/schema";
import { FAULT_IDS } from "../src/coaching/taxonomy";
import type { AnalysisSummary } from "../src/coaching/summary";

export function makeSummary(overrides: Partial<AnalysisSummary["global"]> = {}, extra: Partial<AnalysisSummary> = {}): AnalysisSummary {
  return {
    context: "turns",
    stance: "auto",
    duration: 10,
    fps: 15,
    detectionRate: 0.95,
    travelSign: 1,
    biasEstimated: false,
    cameraNotes: [],
    global: {
      minKneeFlex: 130,
      meanKneeFlex: 145,
      p90CounterRot: 15,
      meanCounterRot: 10,
      meanBiasFront: 0.55,
      meanTorsoLean: 20,
      p90TorsoLean: 30,
      meanArmSpread: 1.2,
      p90WristSpeed: 1.0,
      medianRiderHeight: 0.5,
      ...overrides,
    },
    turnCount: 6,
    turnRhythmCv: 0.2,
    turns: [],
    ...extra,
  };
}

describe("mockCoach", () => {
  it("flags stiff legs when min knee flex is high", () => {
    const r = mockCoach(makeSummary({ minKneeFlex: 168 }));
    expect(r.faults[0]?.fault_id).toBe("stiff-legs");
    expect(r.faults[0].severity).toBeGreaterThanOrEqual(3);
  });

  it("flags back-seat riding when weight sits on the back foot", () => {
    const r = mockCoach(makeSummary({ meanBiasFront: 0.25 }));
    expect(r.faults.map((f) => f.fault_id)).toContain("back-seat");
  });

  it("flags counter-rotation for open shoulders", () => {
    const r = mockCoach(makeSummary({ p90CounterRot: 48 }));
    expect(r.faults.map((f) => f.fault_id)).toContain("counter-rotation");
  });

  it("reports no faults for solid metrics", () => {
    const r = mockCoach(makeSummary());
    expect(r.faults).toHaveLength(0);
    expect(r.overall_score).toBeGreaterThanOrEqual(80);
  });

  it("never returns more than 3 faults, worst first", () => {
    const r = mockCoach(
      makeSummary({ minKneeFlex: 170, meanBiasFront: 0.2, p90CounterRot: 50, p90WristSpeed: 5 }),
    );
    expect(r.faults.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < r.faults.length; i++) {
      expect(r.faults[i - 1].severity).toBeGreaterThanOrEqual(r.faults[i].severity);
    }
  });

  it("waist-bend requires decent knee flex (otherwise it's stiff-legs)", () => {
    const stiff = mockCoach(makeSummary({ minKneeFlex: 170, meanTorsoLean: 50 }));
    expect(stiff.faults.map((f) => f.fault_id)).not.toContain("waist-bend");
    const folded = mockCoach(makeSummary({ minKneeFlex: 120, meanTorsoLean: 50 }));
    expect(folded.faults.map((f) => f.fault_id)).toContain("waist-bend");
  });
});

describe("validateCoaching", () => {
  it("accepts JSON wrapped in markdown fences", () => {
    const text =
      'Here is the analysis:\n```json\n{"faults":[{"fault_id":"stiff-legs","severity":4,"evidence_keyframe":1,"explanation":"x","drill":"y"}],"overall_score":55,"camera_notes":["ok"]}\n```';
    const r = validateCoaching(text, 3, false, "test-model");
    expect(r.faults).toHaveLength(1);
    expect(r.faults[0]).toMatchObject({ fault_id: "stiff-legs", severity: 4, evidence_keyframe: 1 });
    expect(r.overall_score).toBe(55);
    expect(r.camera_notes).toEqual(["ok"]);
    expect(r.mocked).toBe(false);
  });

  it("drops invented fault ids", () => {
    const raw = { faults: [{ fault_id: "bad-vibes", severity: 5, explanation: "x", drill: "y" }] };
    const r = validateCoaching(raw, 3, false, "m");
    expect(r.faults).toHaveLength(0);
  });

  it("clamps severity and fixes out-of-range evidence index", () => {
    const raw = {
      faults: [
        { fault_id: "back-seat", severity: 99, evidence_keyframe: 7, explanation: "x", drill: "y" },
        { fault_id: "looking-down", severity: -2, evidence_keyframe: 1, explanation: "", drill: "" },
      ],
      overall_score: 140,
    };
    const r = validateCoaching(raw, 2, false, "m");
    expect(r.faults[0].severity).toBe(5);
    expect(r.faults[0].evidence_keyframe).toBe(-1);
    expect(r.faults[1].severity).toBe(1);
    // empty explanation/drill fall back to taxonomy copy
    expect(r.faults[1].explanation.length).toBeGreaterThan(10);
    expect(r.overall_score).toBe(100);
  });

  it("caps at 3 faults", () => {
    const raw = {
      faults: FAULT_IDS.slice(0, 5).map((id) => ({ fault_id: id, severity: 3, evidence_keyframe: 0 })),
    };
    const r = validateCoaching(raw, 3, false, "m");
    expect(r.faults).toHaveLength(3);
  });

  it("parseJsonLoose tolerates surrounding prose", () => {
    expect(parseJsonLoose('no json here')).toEqual({});
    expect(parseJsonLoose('prefix {"a": {"b": 1}} suffix')).toEqual({ a: { b: 1 } });
    expect(parseJsonLoose('{"a": "brace } inside string"}')).toEqual({ a: "brace } inside string" });
  });
});
