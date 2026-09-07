import { seekTo } from "./landmarker";

/**
 * Seeks the video to `t` and captures a JPEG data URL, downscaled so the
 * longest side is at most `maxDim` pixels (keeps LLM token cost down).
 */
export async function captureFrameJpeg(
  video: HTMLVideoElement,
  t: number,
  maxDim = 640,
  quality = 0.72,
): Promise<string> {
  await seekTo(video, t);
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) throw new Error("video not ready for capture");
  const scale = Math.min(1, maxDim / Math.max(vw, vh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(vw * scale);
  canvas.height = Math.round(vh * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}
