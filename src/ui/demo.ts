// Dev-only: renders the results screen with synthetic data when the page is
// opened with #demo-results. Used for visual iteration on the UI.
import { showResults } from "./results";
import { mockCoach } from "../coaching/mock";
import type { AnalysisSummary } from "../coaching/summary";
import type { ResultsData } from "./results";

function placeholderImage(hue: number, label: string): string {
  const c = document.createElement("canvas");
  c.width = 480;
  c.height = 270;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 480, 270);
  g.addColorStop(0, `hsl(${hue} 55% 16%)`);
  g.addColorStop(1, `hsl(${hue + 50} 65% 32%)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 480, 270);
  // fake "rider" silhouette
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(200, 70); ctx.lineTo(215, 130); ctx.lineTo(190, 200); ctx.lineTo(150, 235);
  ctx.moveTo(215, 130); ctx.lineTo(255, 195); ctx.lineTo(310, 225);
  ctx.moveTo(210, 95); ctx.lineTo(160, 140); ctx.moveTo(212, 95); ctx.lineTo(270, 120);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath(); ctx.arc(198, 58, 12, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = "600 20px system-ui";
  ctx.fillText(label, 20, 252);
  return c.toDataURL("image/jpeg", 0.8);
}

export function showDemo(): void {
  const summary: AnalysisSummary = {
    context: "turns",
    stance: "regular",
    duration: 14,
    fps: 15,
    detectionRate: 0.93,
    travelSign: 1,
    biasEstimated: false,
    cameraNotes: ["Edge-change timing is estimated from hip-line oscillation."],
    global: {
      minKneeFlex: 168,
      meanKneeFlex: 152,
      p90CounterRot: 34,
      meanCounterRot: 22,
      meanBiasFront: 0.31,
      meanTorsoLean: 38,
      p90TorsoLean: 52,
      meanArmSpread: 1.1,
      p90WristSpeed: 2.4,
      medianRiderHeight: 0.52,
    },
    turnCount: 5,
    turnRhythmCv: 0.44,
    turns: [],
  };
  const coaching = mockCoach(summary);
  const data: ResultsData = {
    objectUrl: null,
    samples: null,
    summary,
    coaching,
    keyframes: [
      { t: 2.4, reason: "Turn 2 — weakest moment", dataUrl: placeholderImage(205, "Turn 2 · heelside") },
      { t: 6.1, reason: "Turn 3 — weakest moment", dataUrl: placeholderImage(160, "Turn 3 · toeside") },
      { t: 9.8, reason: "Turn 5 — weakest moment", dataUrl: placeholderImage(255, "Turn 5 · heelside") },
    ],
  };
  showResults(data);
}
