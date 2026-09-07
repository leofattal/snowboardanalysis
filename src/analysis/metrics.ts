import { angleAt, dist, lineAngle, midpoint, undirectedLineDiff, type Pt } from "./geometry";
import type { FrameSample, Landmark } from "../pose/types";

/** MediaPipe Pose landmark indices (33-point model). */
export const LM = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
} as const;

const CORE_JOINTS = [
  LM.LEFT_SHOULDER,
  LM.RIGHT_SHOULDER,
  LM.LEFT_HIP,
  LM.RIGHT_HIP,
  LM.LEFT_KNEE,
  LM.RIGHT_KNEE,
  LM.LEFT_ANKLE,
  LM.RIGHT_ANKLE,
] as const;

const MIN_VISIBILITY = 0.4;

export interface FrameMetrics {
  t: number;
  /** false when key joints are missing/low-confidence — excluded from aggregates */
  valid: boolean;
  detectionScore: number;
  /** knee angles, 180° = perfectly straight leg */
  kneeL: number;
  kneeR: number;
  /** torso angle from vertical, 0° = upright, larger = more leaned/bent over */
  torsoLean: number;
  /** angle between shoulder line and board (ankle) line — upper body vs board */
  counterRot: number;
  /** ankle→ankle line angle (board-line estimate) */
  boardAngle: number;
  /** hip line angle — used for edge-change detection */
  hipLineAngle: number;
  /** projection of mid-hip onto left→right ankle vector, clamped 0..1 (no front/back semantics yet) */
  biasRaw: number;
  /** wrist-to-wrist distance normalized by shoulder width */
  armSpread: number;
  /** rider height as a fraction of frame height (nose to mid-ankle, vertical) */
  riderHeight: number;
  midHip: Pt;
}

function coreVisible(lm: Landmark[]): boolean {
  return CORE_JOINTS.every((i) => (lm[i]?.visibility ?? 0) >= MIN_VISIBILITY);
}

/** Computes per-frame metrics from one pose detection. All angles in degrees. */
export function computeFrameMetrics(sample: FrameSample): FrameMetrics {
  const t = sample.t;
  const lm = sample.landmarks;
  const base: FrameMetrics = {
    t,
    valid: false,
    detectionScore: sample.detectionScore,
    kneeL: NaN,
    kneeR: NaN,
    torsoLean: NaN,
    counterRot: NaN,
    boardAngle: NaN,
    hipLineAngle: NaN,
    biasRaw: NaN,
    armSpread: NaN,
    riderHeight: NaN,
    midHip: { x: NaN, y: NaN },
  };
  if (!lm || lm.length < 33 || !coreVisible(lm)) return base;

  const lShoulder = lm[LM.LEFT_SHOULDER];
  const rShoulder = lm[LM.RIGHT_SHOULDER];
  const lHip = lm[LM.LEFT_HIP];
  const rHip = lm[LM.RIGHT_HIP];
  const lKnee = lm[LM.LEFT_KNEE];
  const rKnee = lm[LM.RIGHT_KNEE];
  const lAnkle = lm[LM.LEFT_ANKLE];
  const rAnkle = lm[LM.RIGHT_ANKLE];

  const midShoulder = midpoint(lShoulder, rShoulder);
  const midHip = midpoint(lHip, rHip);
  const midAnkle = midpoint(lAnkle, rAnkle);

  const shoulderAngle = lineAngle(lShoulder, rShoulder);
  const boardAngle = lineAngle(lAnkle, rAnkle);
  // Torso direction hip→shoulder; upright in image coords (y down) is -90°.
  const torsoAngle = lineAngle(midHip, midShoulder);
  let torsoLean = Math.abs(torsoAngle + 90);
  if (torsoLean > 180) torsoLean = 360 - torsoLean;

  // Projection of mid-hip onto the ankle vector: 0 = left ankle, 1 = right ankle.
  const ax = rAnkle.x - lAnkle.x;
  const ay = rAnkle.y - lAnkle.y;
  const len2 = ax * ax + ay * ay;
  const proj = len2 < 1e-9 ? 0.5 : ((midHip.x - lAnkle.x) * ax + (midHip.y - lAnkle.y) * ay) / len2;

  const shoulderWidth = Math.max(dist(lShoulder, rShoulder), 1e-6);
  const lWrist = lm[LM.LEFT_WRIST];
  const rWrist = lm[LM.RIGHT_WRIST];
  const wristsOk = (lWrist?.visibility ?? 0) >= MIN_VISIBILITY && (rWrist?.visibility ?? 0) >= MIN_VISIBILITY;

  return {
    ...base,
    valid: true,
    kneeL: angleAt(lHip, lKnee, lAnkle),
    kneeR: angleAt(rHip, rKnee, rAnkle),
    torsoLean,
    counterRot: undirectedLineDiff(shoulderAngle, boardAngle),
    boardAngle,
    hipLineAngle: lineAngle(lHip, rHip),
    biasRaw: Math.min(1, Math.max(0, proj)),
    armSpread: wristsOk ? dist(lWrist, rWrist) / shoulderWidth : NaN,
    riderHeight: Math.max(0, midAnkle.y - lm[LM.NOSE].y),
    midHip,
  };
}

export interface Series {
  frames: FrameMetrics[];
  /** mean L/R wrist speed in shoulder-widths per second, per frame (NaN when unavailable) */
  wristSpeed: number[];
  /** fraction of frames with a usable pose */
  detectionRate: number;
  /** sign of net horizontal hip travel in the frame: +1 right, -1 left, 0 static/unknown */
  travelSign: number;
}

export function computeSeries(samples: FrameSample[]): Series {
  const frames = samples.map(computeFrameMetrics);
  const detected = samples.filter((s) => s.landmarks !== null).length;
  const detectionRate = samples.length > 0 ? detected / samples.length : 0;

  // Net horizontal travel of the hips over the clip (camera-static check).
  const valid = frames.filter((f) => f.valid);
  let travelSign = 0;
  if (valid.length >= 2) {
    const dx = valid[valid.length - 1].midHip.x - valid[0].midHip.x;
    if (Math.abs(dx) > 0.05) travelSign = Math.sign(dx);
  }

  const wristSpeed = frames.map((f, i) => {
    const prev = i > 0 ? frames[i - 1] : null;
    if (!prev) return NaN;
    const dt = f.t - prev.t;
    const cur = samples[i].landmarks;
    const prv = samples[i - 1].landmarks;
    if (!cur || !prv || dt <= 0) return NaN;
    const speeds: number[] = [];
    const sw = Math.max(dist(cur[LM.LEFT_SHOULDER], cur[LM.RIGHT_SHOULDER]), 1e-6);
    for (const w of [LM.LEFT_WRIST, LM.RIGHT_WRIST]) {
      if ((cur[w]?.visibility ?? 0) >= MIN_VISIBILITY && (prv[w]?.visibility ?? 0) >= MIN_VISIBILITY) {
        speeds.push(dist(cur[w], prv[w]) / sw / dt);
      }
    }
    return speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : NaN;
  });

  return { frames, wristSpeed, detectionRate, travelSign };
}
