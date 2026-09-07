import { clamp } from "./geometry";
import type { Series } from "./metrics";
import type { Turn } from "./turns";

export interface KeyframePick {
  t: number;
  reason: string;
}

/**
 * Scores every frame for "how wrong does this look" and picks the worst frame
 * inside each of the worst turns. Falls back to evenly spaced frames when no
 * turns were detected.
 */
export function pickKeyframes(series: Series, turns: Turn[], count = 3): KeyframePick[] {
  const score = (i: number): number => {
    const f = series.frames[i];
    if (!f.valid) return -Infinity;
    const knee = Math.min(f.kneeL, f.kneeR);
    const stiffness = Number.isFinite(knee) ? clamp((knee - 130) / 40, 0, 1) : 0;
    const counter = Number.isFinite(f.counterRot) ? clamp((f.counterRot - 15) / 30, 0, 1) : 0;
    const lean = Number.isFinite(f.torsoLean) ? clamp((f.torsoLean - 25) / 30, 0, 1) : 0;
    return stiffness * 0.45 + counter * 0.35 + lean * 0.2;
  };

  const picks: KeyframePick[] = [];

  if (turns.length > 0) {
    const scoredTurns = turns.map((turn) => {
      let best = -Infinity;
      let bestT = (turn.tStart + turn.tEnd) / 2;
      series.frames.forEach((f, i) => {
        if (!f.valid || f.t < turn.tStart || f.t > turn.tEnd) return;
        const s = score(i);
        if (s > best) {
          best = s;
          bestT = f.t;
        }
      });
      return { turn, best, bestT };
    });
    scoredTurns.sort((a, b) => b.best - a.best);
    for (const st of scoredTurns.slice(0, count)) {
      if (st.best === -Infinity) continue;
      picks.push({ t: st.bestT, reason: `Turn ${st.turn.index + 1} — weakest moment` });
    }
  }

  if (picks.length === 0) {
    // No turns: sample frames with highest badness score overall.
    const scored = series.frames.map((f, i) => ({ t: f.t, s: score(i) })).filter((x) => x.s > -Infinity);
    scored.sort((a, b) => b.s - a.s);
    const chosen: typeof scored = [];
    for (const cand of scored) {
      if (chosen.length >= count) break;
      if (chosen.every((c) => Math.abs(c.t - cand.t) > 1.5)) chosen.push(cand);
    }
    chosen.sort((a, b) => a.t - b.t);
    for (const c of chosen) picks.push({ t: c.t, reason: "Lowest form score in clip" });
  }

  picks.sort((a, b) => a.t - b.t);
  return picks.slice(0, count);
}
