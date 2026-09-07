import { mean, smooth, std } from "./geometry";
import type { FrameMetrics } from "./metrics";

export interface Turn {
  index: number;
  tStart: number;
  tEnd: number;
}

/**
 * Edge changes show up as oscillation of the body-roll signal. We use the hip
 * line angle (detrended with a ~2 s moving average) and call an edge change at
 * each zero crossing that has enough amplitude on both sides and enough
 * separation from the previous one. Imperfect from a pure side view — flagged
 * as estimated in the UI — but reliable for rhythm on traversing turns.
 */
export function detectEdgeChanges(
  frames: FrameMetrics[],
  fps: number,
): { times: number[]; signal: (number | null)[] } {
  const valid = frames.filter((f) => f.valid && Number.isFinite(f.hipLineAngle));
  if (valid.length < Math.max(8, fps)) return { times: [], signal: frames.map(() => null) };

  const times = valid.map((f) => f.t);
  const raw = valid.map((f) => f.hipLineAngle);
  const trendWin = Math.max(3, Math.round(fps * 2) | 1); // ~2 s, odd
  const trend = smooth(raw, trendWin);
  const detrended = raw.map((v, i) => v - trend[i]);
  const sig = smooth(detrended, Math.max(3, Math.round(fps * 0.4) | 1)); // light denoise

  const amplitude = Math.max(1.5, std(sig.filter((v) => Number.isFinite(v))) * 1.2);
  const minGapS = 1.0;

  const crossings: number[] = [];
  let lastExtreme = 0;
  let lastCrossT = -Infinity;
  for (let i = 1; i < sig.length; i++) {
    const a = sig[i - 1];
    const b = sig[i];
    if (a === 0 || b === 0 || Math.sign(a) === Math.sign(b)) {
      if (Math.abs(b) > Math.abs(lastExtreme)) lastExtreme = b;
      continue;
    }
    // sign flip between i-1 and i — require amplitude since last crossing
    if (Math.abs(lastExtreme) >= amplitude && times[i] - lastCrossT >= minGapS) {
      const frac = Math.abs(a) / (Math.abs(a) + Math.abs(b));
      crossings.push(times[i - 1] + frac * (times[i] - times[i - 1]));
      lastCrossT = times[i];
      lastExtreme = 0;
    }
    if (Math.abs(b) > Math.abs(lastExtreme)) lastExtreme = b;
  }

  // Map back onto the full frame timeline (null for invalid frames).
  const signal: (number | null)[] = frames.map(() => null);
  let vi = 0;
  const validIdx = frames.map((f, i) => (f.valid && Number.isFinite(f.hipLineAngle) ? i : -1)).filter((i) => i >= 0);
  for (; vi < validIdx.length; vi++) signal[validIdx[vi]] = sig[vi] ?? null;

  return { times: crossings, signal };
}

/** Builds turn segments between consecutive edge changes. */
export function buildTurns(edgeChanges: number[], duration: number): Turn[] {
  const turns: Turn[] = [];
  for (let i = 0; i < edgeChanges.length - 1; i++) {
    const tEnd = edgeChanges[i + 1];
    turns.push({ index: turns.length, tStart: edgeChanges[i], tEnd: Math.min(tEnd, duration) });
  }
  return turns;
}

/** Coefficient of variation of turn durations — rhythm regularity (NaN-safe). */
export function turnRhythmCv(turns: Turn[]): number | null {
  const durations = turns.map((t) => t.tEnd - t.tStart).filter((d) => d > 0);
  if (durations.length < 3) return null;
  const m = mean(durations);
  const s = std(durations);
  if (!m || !Number.isFinite(s)) return null;
  return s / m;
}
