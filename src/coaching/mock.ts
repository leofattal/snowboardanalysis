import { clamp } from "../analysis/geometry";
import { faultById } from "./taxonomy";
import type { CoachingFault, CoachingResult } from "./schema";
import type { AnalysisSummary } from "./summary";

interface Rule {
  id: string;
  /** severity 1–5, or 0 when the fault is not present */
  score: (s: AnalysisSummary) => number;
}

/**
 * Deterministic rule-based coach used when no LLM API key is configured.
 * Thresholds mirror the "good range" indicators on the metric cards.
 */
const RULES: Rule[] = [
  {
    id: "stiff-legs",
    // min knee flex above ~150° = legs nearly straight even at the deepest moment
    score: (s) => scoreBand(s.global.minKneeFlex, 140, 165),
  },
  {
    id: "back-seat",
    // mean bias under 0.4 = weight sitting on the back foot
    score: (s) => scoreBand(0.45 - s.global.meanBiasFront, 0, 0.25),
  },
  {
    id: "counter-rotation",
    score: (s) => scoreBand(s.global.p90CounterRot, 20, 45),
  },
  {
    id: "waist-bend",
    // lots of lean but decent knee flex = folding at the hips
    score: (s) => {
      if (s.global.minKneeFlex > 145) return 0; // that's stiff-legs instead
      return scoreBand(s.global.meanTorsoLean, 30, 55);
    },
  },
  {
    id: "arm-flailing",
    score: (s) => scoreBand(s.global.p90WristSpeed, 1.5, 4),
  },
  {
    id: "uneven-rhythm",
    score: (s) => (s.turnRhythmCv === null ? 0 : scoreBand(s.turnRhythmCv, 0.3, 0.6)),
  },
  {
    id: "late-edge-change",
    // proxy: counter-rotation peaking while rhythm is OK-ish and turns exist
    score: (s) =>
      s.turnCount >= 2 && s.global.meanCounterRot > 18 && s.global.p90CounterRot > 30
        ? 2
        : 0,
  },
];

/** Maps a measured value into a 0–5 severity given [start, end] of the bad range. */
function scoreBand(value: number, start: number, end: number): number {
  if (!Number.isFinite(value) || value <= start) return 0;
  const t = clamp((value - start) / Math.max(1e-9, end - start), 0, 1);
  return Math.max(1, Math.round(1 + t * 4));
}

export function mockCoach(summary: AnalysisSummary): CoachingResult {
  const scored = RULES.map((r) => ({ id: r.id, sev: r.score(summary) }))
    .filter((x) => x.sev > 0)
    .sort((a, b) => b.sev - a.sev)
    .slice(0, 3);

  const faults: CoachingFault[] = scored.map((x) => {
    const def = faultById(x.id)!;
    return {
      fault_id: x.id,
      severity: x.sev,
      evidence_keyframe: 0,
      explanation: def.explanation,
      drill: def.drill,
    };
  });

  // Score: start at 90, subtract by severity.
  const penalty = faults.reduce((acc, f) => acc + f.severity * 7, 0);
  const overall = clamp(90 - penalty - (summary.turnCount < 2 ? 10 : 0), 5, 95);

  return {
    faults,
    overall_score: overall,
    camera_notes: summary.cameraNotes,
    mocked: true,
    model: "local-rules",
  };
}
