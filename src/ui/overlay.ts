import { LM } from "../analysis/metrics";
import type { FrameSample } from "../pose/types";

/** Skeleton connection pairs (MediaPipe 33-landmark indices), face excluded. */
const CONNECTIONS: Array<[number, number, string]> = [
  // torso
  [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, "torso"],
  [LM.LEFT_SHOULDER, LM.LEFT_HIP, "torso"],
  [LM.RIGHT_SHOULDER, LM.RIGHT_HIP, "torso"],
  [LM.LEFT_HIP, LM.RIGHT_HIP, "torso"],
  // arms
  [LM.LEFT_SHOULDER, LM.LEFT_ELBOW, "arm"],
  [LM.LEFT_ELBOW, LM.LEFT_WRIST, "arm"],
  [LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW, "arm"],
  [LM.RIGHT_ELBOW, LM.RIGHT_WRIST, "arm"],
  // legs
  [LM.LEFT_HIP, LM.LEFT_KNEE, "leg"],
  [LM.LEFT_KNEE, LM.LEFT_ANKLE, "leg"],
  [LM.RIGHT_HIP, LM.RIGHT_KNEE, "leg"],
  [LM.RIGHT_KNEE, LM.RIGHT_ANKLE, "leg"],
];

const COLORS: Record<string, string> = {
  torso: "#f472b6",
  arm: "#facc15",
  leg: "#22d3ee",
  board: "#a3e635",
};

/**
 * Draws the skeleton for the pose sample nearest to the current video time
 * onto a canvas overlaid on the video element.
 */
export class SkeletonOverlay {
  private ctx: CanvasRenderingContext2D;
  private onRedraw = () => this.draw();
  enabled = true;

  constructor(
    private canvas: HTMLCanvasElement,
    private video: HTMLVideoElement,
    private samples: FrameSample[],
    private keyframeTimes: number[] = [],
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    this.ctx = ctx;
    video.addEventListener("timeupdate", this.onRedraw);
    video.addEventListener("loadedmetadata", this.onRedraw);
    window.addEventListener("resize", this.onRedraw);
  }

  destroy(): void {
    this.video.removeEventListener("timeupdate", this.onRedraw);
    this.video.removeEventListener("loadedmetadata", this.onRedraw);
    window.removeEventListener("resize", this.onRedraw);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private nearestSample(t: number) {
    const frames = this.samples;
    let lo = 0;
    let hi = frames.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (frames[mid].t < t) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0 && Math.abs(frames[lo - 1].t - t) < Math.abs(frames[lo].t - t)) return frames[lo - 1];
    return frames[lo];
  }

  draw(): void {
    const { canvas, ctx, video } = this;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;
    if (canvas.width !== vw || canvas.height !== vh) {
      canvas.width = vw;
      canvas.height = vh;
    }
    ctx.clearRect(0, 0, vw, vh);
    if (!this.enabled) return;

    const sample = this.nearestSample(video.currentTime);
    if (!sample?.landmarks) return;
    const lm = sample.landmarks;
    const px = (i: number) => ({ x: lm[i].x * vw, y: lm[i].y * vh });
    const vis = (i: number) => (lm[i]?.visibility ?? 0) >= 0.4;

    ctx.lineWidth = Math.max(2, vw / 300);

    // board line (ankle to ankle), drawn thicker
    if (vis(LM.LEFT_ANKLE) && vis(LM.RIGHT_ANKLE)) {
      const a = px(LM.LEFT_ANKLE);
      const b = px(LM.RIGHT_ANKLE);
      ctx.strokeStyle = COLORS.board;
      ctx.lineWidth = Math.max(3, vw / 200);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    for (const [a, b, group] of CONNECTIONS) {
      if (!vis(a) || !vis(b)) continue;
      const pa = px(a);
      const pb = px(b);
      ctx.strokeStyle = COLORS[group];
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }

    ctx.fillStyle = "#ffffff";
    const r = Math.max(2.5, vw / 350);
    for (const i of [
      LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, LM.LEFT_ELBOW, LM.RIGHT_ELBOW,
      LM.LEFT_WRIST, LM.RIGHT_WRIST, LM.LEFT_HIP, LM.RIGHT_HIP,
      LM.LEFT_KNEE, LM.RIGHT_KNEE, LM.LEFT_ANKLE, LM.RIGHT_ANKLE, LM.NOSE,
    ]) {
      if (!vis(i)) continue;
      const p = px(i);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // highlight when near a coaching keyframe
    if (this.keyframeTimes.some((t) => Math.abs(t - video.currentTime) < 0.25)) {
      ctx.strokeStyle = COLORS.board;
      ctx.lineWidth = Math.max(4, vw / 150);
      ctx.strokeRect(2, 2, vw - 4, vh - 4);
    }
  }
}
