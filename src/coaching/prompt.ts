import { FAULTS } from "./taxonomy";
import type { AnalysisSummary } from "./summary";

/** System prompt for the coaching LLM. Cached input — keep stable. */
export function buildSystemPrompt(vision: boolean): string {
  const faultList = FAULTS.map((f) => `- ${f.id}: ${f.name} — ${f.explanation}`).join("\n");
  const inputs = vision
    ? `You receive:
1. A JSON summary of pose-estimation metrics measured from the video (angles in degrees; knee flex 180 = straight leg, lower = more bend; weight bias 0 = back foot, 1 = front foot, 0.5 = centered; counter-rotation = angle between shoulders and board line).
2. Keyframe images extracted at the moments the metrics flag as worst.`
    : `You receive a JSON summary of pose-estimation metrics measured from the video (angles in degrees; knee flex 180 = straight leg, lower = more bend; weight bias 0 = back foot, 1 = front foot, 0.5 = centered; counter-rotation = angle between shoulders and board line). No images are provided — reason from the metrics only and set evidence_keyframe to -1.`;
  const evidence = vision
    ? "reference the keyframe index (0-based) that best shows it as evidence,"
    : "set evidence_keyframe to -1,";
  return `You are a certified snowboard instructor (AASI/CASI methodology) giving feedback on a student's riding clip.

${inputs}

Your job:
- Pick the 1–3 most important faults from the FIXED list below. You may ONLY use fault ids from this list — never invent new ones.
- For each fault: rate severity 1–5, ${evidence} explain what the metrics indicate in plain encouraging language, and give ONE concrete drill.
- Give an overall score 0–100 (typical beginner linking turns ≈ 40–60).
- Note any camera/footage problems in camera_notes.
- If the footage is unusable (no rider, too far, not snowboarding), return an empty faults array and explain in camera_notes.
- Prioritize fundamentals: knee flex, weight position, and upper/lower body separation before style issues.
- Be direct and encouraging, like a good instructor at the bottom of the run. No fluff.

FIXED FAULT LIST:
${faultList}

Respond with STRICT JSON only (no markdown, no prose outside the JSON object) matching exactly:
{
  "faults": [
    {
      "fault_id": "one of the ids above",
      "severity": 1,
      "evidence_keyframe": 0,
      "explanation": "what you see and why it matters, 2-3 sentences",
      "drill": "one concrete drill with reps"
    }
  ],
  "overall_score": 50,
  "camera_notes": ["optional notes about footage quality"]
}`;
}

/** User-message text payload: compact metrics summary. */
export function buildUserPayload(summary: AnalysisSummary, keyframeCount: number): string {
  const round = (v: number, d = 1) => (Number.isFinite(v) ? Number(v.toFixed(d)) : null);
  const payload = {
    riding_context: summary.context,
    stance: summary.stance,
    clip_duration_s: round(summary.duration, 0),
    pose_detection_rate: round(summary.detectionRate, 2),
    weight_bias_is_estimate: summary.biasEstimated,
    global_metrics: {
      min_knee_flex_deg: round(summary.global.minKneeFlex, 0),
      mean_knee_flex_deg: round(summary.global.meanKneeFlex, 0),
      p90_counter_rotation_deg: round(summary.global.p90CounterRot, 0),
      mean_counter_rotation_deg: round(summary.global.meanCounterRot, 0),
      mean_weight_bias_front: round(summary.global.meanBiasFront, 2),
      mean_torso_lean_deg: round(summary.global.meanTorsoLean, 0),
      p90_wrist_speed: round(summary.global.p90WristSpeed, 2),
      rider_height_fraction_of_frame: round(summary.global.medianRiderHeight, 2),
    },
    turns_detected: summary.turnCount,
    turn_rhythm_cv: summary.turnRhythmCv === null ? null : round(summary.turnRhythmCv, 2),
    per_turn: summary.turns.map((t) => ({
      turn: t.index + 1,
      start_s: round(t.tStart),
      end_s: round(t.tEnd),
      min_knee_flex_deg: round(t.minKneeFlex, 0),
      p90_counter_rotation_deg: round(t.p90CounterRot, 0),
      mean_weight_bias_front: round(t.meanBiasFront, 2),
    })),
    keyframes_attached: keyframeCount,
    notes: summary.cameraNotes,
  };
  return `Metrics summary (angles in degrees):\n${JSON.stringify(payload, null, 1)}${keyframeCount === 0 ? "\n(No keyframe images attached — metrics-only analysis.)" : ""}`;
}
