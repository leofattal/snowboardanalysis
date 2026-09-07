import { mean, median, percentile, clamp } from "../analysis/geometry";
import type { Series } from "../analysis/metrics";
import type { Turn } from "../analysis/turns";
import { turnRhythmCv } from "../analysis/turns";

export type RidingContext = "turns" | "carving" | "jump" | "rail" | "general";
export type Stance = "regular" | "goofy" | "auto";

export interface TurnStats {
  index: number;
  tStart: number;
  tEnd: number;
  minKneeFlex: number;
  p90CounterRot: number;
  meanBiasFront: number;
  meanTorsoLean: number;
}

export interface AnalysisSummary {
  context: RidingContext;
  stance: Stance;
  duration: number;
  fps: number;
  detectionRate: number;
  /** +1 rider moves right in frame, -1 left, 0 static/unknown */
  travelSign: number;
  /** true when front/back foot was guessed from stance rather than observed travel */
  biasEstimated: boolean;
  cameraNotes: string[];
  global: {
    minKneeFlex: number;
    meanKneeFlex: number;
    p90CounterRot: number;
    meanCounterRot: number;
    meanBiasFront: number;
    meanTorsoLean: number;
    p90TorsoLean: number;
    meanArmSpread: number;
    p90WristSpeed: number;
    medianRiderHeight: number;
  };
  turnCount: number;
  turnRhythmCv: number | null;
  turns: TurnStats[];
}

const meanFinite = (xs: number[]) => mean(xs.filter(Number.isFinite));

/**
 * Aggregates the per-frame series into the summary consumed by the coaching
 * stage (both the LLM payload and the mock coach). `biasFront` is 0..1 where
 * 0 = all weight on the back foot, 0.5 = centered, 1 = all front foot.
 */
export function buildSummary(
  series: Series,
  turns: Turn[],
  meta: { context: RidingContext; stance: Stance; duration: number; fps: number },
): AnalysisSummary {
  const valid = series.frames.filter((f) => f.valid);

  // Resolve which ankle is the front foot.
  let biasEstimated = true;
  let frontIsRight: boolean;
  if (series.travelSign !== 0) {
    // Front foot is the one further along the direction of travel.
    frontIsRight = series.travelSign > 0;
    biasEstimated = false;
  } else {
    const stance = meta.stance === "auto" ? "regular" : meta.stance;
    frontIsRight = stance === "goofy";
  }

  // biasRaw is the projection of mid-hip onto left(0)→right(1) ankle.
  // Convert to back(0)→front(1).
  const biasFront = valid.map((f) => (frontIsRight ? f.biasRaw : 1 - f.biasRaw));

  const minKneePerFrame = valid.map((f) => Math.min(f.kneeL, f.kneeR));
  const cameraNotes: string[] = [];
  if (series.detectionRate < 0.7) {
    cameraNotes.push(
      `Rider was only detected in ${Math.round(series.detectionRate * 100)}% of sampled frames — metrics are based on the usable portion. Keep the rider in frame and unobstructed.`,
    );
  }
  const medianRiderHeight = median(valid.map((f) => f.riderHeight).filter(Number.isFinite));
  if (Number.isFinite(medianRiderHeight) && medianRiderHeight < 0.25) {
    cameraNotes.push("Rider appears small in the frame (<25% of frame height). Film closer for more reliable metrics.");
  }
  if (series.travelSign === 0) {
    cameraNotes.push("Little horizontal travel detected — fore/aft weight bias is estimated from stance only and may be unreliable (moving camera or static shot).");
  }
  if (turns.length < 2) {
    cameraNotes.push("Fewer than two full turns detected — turn-level stats may be incomplete. A longer clip with several linked turns works best.");
  }

  const p90WristSpeed = percentile(series.wristSpeed.filter(Number.isFinite), 90);

  const turnStats: TurnStats[] = turns.map((turn) => {
    const inTurn = series.frames.filter((f) => f.valid && f.t >= turn.tStart && f.t <= turn.tEnd);
    const knees = inTurn.map((f) => Math.min(f.kneeL, f.kneeR)).filter(Number.isFinite);
    const counter = inTurn.map((f) => f.counterRot).filter(Number.isFinite);
    const lean = inTurn.map((f) => f.torsoLean).filter(Number.isFinite);
    const bias = inTurn.map((f) => (frontIsRight ? f.biasRaw : 1 - f.biasRaw)).filter(Number.isFinite);
    return {
      index: turn.index,
      tStart: turn.tStart,
      tEnd: turn.tEnd,
      minKneeFlex: knees.length ? Math.min(...knees) : NaN,
      p90CounterRot: percentile(counter, 90),
      meanBiasFront: mean(bias),
      meanTorsoLean: mean(lean),
    };
  });

  return {
    context: meta.context,
    stance: meta.stance,
    duration: meta.duration,
    fps: meta.fps,
    detectionRate: series.detectionRate,
    travelSign: series.travelSign,
    biasEstimated,
    cameraNotes,
    global: {
      minKneeFlex: minKneePerFrame.length ? Math.min(...minKneePerFrame) : NaN,
      meanKneeFlex: mean(minKneePerFrame),
      p90CounterRot: percentile(valid.map((f) => f.counterRot).filter(Number.isFinite), 90),
      meanCounterRot: meanFinite(valid.map((f) => f.counterRot)),
      meanBiasFront: mean(biasFront),
      meanTorsoLean: meanFinite(valid.map((f) => f.torsoLean)),
      p90TorsoLean: percentile(valid.map((f) => f.torsoLean).filter(Number.isFinite), 90),
      meanArmSpread: meanFinite(valid.map((f) => f.armSpread)),
      p90WristSpeed,
      medianRiderHeight,
    },
    turnCount: turns.length,
    turnRhythmCv: turnRhythmCv(turns),
    turns: turnStats,
  };
}

/** Per-frame front/back weight bias series (0 = back foot, 1 = front foot). */
export function biasFrontSeries(series: Series, summary: AnalysisSummary): (number | null)[] {
  const frontIsRight = summary.travelSign !== 0 ? summary.travelSign > 0 : (summary.stance === "auto" ? "regular" : summary.stance) === "goofy";
  return series.frames.map((f) => {
    if (!f.valid || !Number.isFinite(f.biasRaw)) return null;
    const v = frontIsRight ? f.biasRaw : 1 - f.biasRaw;
    return clamp(v, 0, 1);
  });
}
