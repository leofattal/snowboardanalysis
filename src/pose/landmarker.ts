import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { FrameSample } from "./types";

const MODEL_PATH = "/models/pose_landmarker_full.task";
const WASM_BASE = "/wasm";

let landmarkerPromise: Promise<PoseLandmarker> | null = null;

/** Lazily creates the singleton PoseLandmarker (GPU delegate, CPU fallback). */
export function getPoseLandmarker(): Promise<PoseLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
      const base = { modelAssetPath: MODEL_PATH };
      try {
        return await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { ...base, delegate: "GPU" },
          runningMode: "VIDEO",
          numPoses: 1,
        });
      } catch {
        return await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { ...base, delegate: "CPU" },
          runningMode: "VIDEO",
          numPoses: 1,
        });
      }
    })();
  }
  return landmarkerPromise;
}

/** Seeks a video element and resolves once the frame is presented. */
export function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(cleanup, 3000); // tolerate slow decoders
    function cleanup() {
      clearTimeout(timeout);
      video.removeEventListener("seeked", cleanup);
      resolve();
    }
    video.addEventListener("seeked", cleanup);
    video.currentTime = Math.min(Math.max(0, t), video.duration || t);
  });
}

export interface SampleOptions {
  /** sampling rate in frames per second (default 15) */
  fps?: number;
  /** hard cap on sampled frames (default 600) */
  maxFrames?: number;
  onProgress?: (done: number, total: number) => void;
}

export interface SampleResult {
  frames: FrameSample[];
  fps: number;
  duration: number;
}

/**
 * Steps through the video at a fixed cadence and runs pose detection on each
 * sampled frame. Deterministic (seek-based) so it works on any decodable file.
 */
export async function sampleVideoPose(video: HTMLVideoElement, opts: SampleOptions = {}): Promise<SampleResult> {
  const fps = opts.fps ?? 15;
  const maxFrames = opts.maxFrames ?? 600;
  const landmarker = await getPoseLandmarker();
  const duration = video.duration;
  const dt = 1 / fps;
  const total = Math.max(1, Math.min(maxFrames, Math.round(duration * fps)));

  video.muted = true;
  video.pause();

  const frames: FrameSample[] = [];
  for (let i = 0; i < total; i++) {
    const t = Math.min(i * dt, Math.max(0, duration - 1 / (2 * fps)));
    await seekTo(video, t);
    const res = landmarker.detectForVideo(video, Math.round(t * 1000));
    const lm = res.landmarks && res.landmarks.length > 0 ? res.landmarks[0] : null;
    let score = 0;
    if (lm) {
      for (const p of lm) score += p.visibility ?? 0;
      score /= lm.length;
    }
    frames.push({
      t,
      landmarks: lm ? lm.map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility ?? 0 })) : null,
      detectionScore: score,
    });
    opts.onProgress?.(i + 1, total);
  }
  return { frames, fps, duration };
}
