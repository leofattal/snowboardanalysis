/** Normalized 2D/3D landmark as returned by MediaPipe Pose Landmarker. */
export interface Landmark {
  /** x position normalized to frame width (0..1). */
  x: number;
  /** y position normalized to frame height (0..1). */
  y: number;
  /** depth relative to hips (rough, negative = toward camera). */
  z: number;
  /** detection confidence 0..1. */
  visibility: number;
}

/** Pose detected on one sampled video frame. */
export interface FrameSample {
  /** timestamp in seconds */
  t: number;
  /** 33 landmarks, or null when no pose was detected */
  landmarks: Landmark[] | null;
  /** mean landmark visibility, 0 when no detection */
  detectionScore: number;
}
