import type { FrameSample } from "../pose/types";
import type { CoachingResult } from "../coaching/schema";
import { faultById } from "../coaching/taxonomy";
import type { AnalysisSummary } from "../coaching/summary";
import type { KeyframeImage } from "../coaching/llm";
import { SkeletonOverlay } from "./overlay";

export interface ResultsData {
  objectUrl: string | null;
  samples: FrameSample[] | null;
  summary: AnalysisSummary;
  coaching: CoachingResult;
  keyframes: KeyframeImage[];
}

let activeOverlay: SkeletonOverlay | null = null;

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`missing element ${sel}`);
  return el;
};

type Status = "good" | "borderline" | "poor" | "info";

interface MetricCard {
  name: string;
  value: string;
  status: Status;
  range: string;
  /** value position on the card's mini bar, 0..1 (null → no bar) */
  pos: number | null;
  /** good zone on the mini bar [lo, hi] in 0..1 */
  zone: [number, number] | null;
}

const STATUS_LABEL: Record<Status, string> = {
  good: "In range",
  borderline: "Close",
  poor: "Needs work",
  info: "",
};

function metricCards(s: AnalysisSummary): MetricCard[] {
  const minKnee = s.global.minKneeFlex;
  const counter = s.global.p90CounterRot;
  const bias = s.global.meanBiasFront;
  const lean = s.global.meanTorsoLean;
  const flail = s.global.p90WristSpeed;
  const rhythm = s.turnRhythmCv;

  const pos = (v: number, min: number, max: number) =>
    Number.isFinite(v) ? Math.min(1, Math.max(0, (v - min) / (max - min))) : null;

  const cards: MetricCard[] = [
    {
      name: "Deepest knee flex",
      value: Number.isFinite(minKnee) ? `${Math.round(minKnee)}°` : "—",
      status: !Number.isFinite(minKnee) ? "info" : minKnee < 140 ? "good" : minKnee < 155 ? "borderline" : "poor",
      range: "good < 140° · 180° = straight",
      pos: pos(minKnee, 100, 180),
      zone: [0, 0.5],
    },
    {
      name: "Shoulders vs board",
      value: Number.isFinite(counter) ? `${Math.round(counter)}°` : "—",
      status: !Number.isFinite(counter) ? "info" : counter < 20 ? "good" : counter < 35 ? "borderline" : "poor",
      range: "good < 20°",
      pos: pos(counter, 0, 60),
      zone: [0, 1 / 3],
    },
    {
      name: "Weight on front foot",
      value: Number.isFinite(bias) ? `${Math.round(bias * 100)}%` : "—",
      status: !Number.isFinite(bias) ? "info" : bias >= 0.45 && bias <= 0.65 ? "good" : bias >= 0.38 && bias <= 0.72 ? "borderline" : "poor",
      range: s.biasEstimated ? "good 45–65% · estimated" : "good 45–65%",
      pos: Number.isFinite(bias) ? bias : null,
      zone: [0.45, 0.65],
    },
    {
      name: "Torso lean",
      value: Number.isFinite(lean) ? `${Math.round(lean)}°` : "—",
      status: !Number.isFinite(lean) ? "info" : lean < 30 ? "good" : lean < 45 ? "borderline" : "poor",
      range: "good < 30°",
      pos: pos(lean, 0, 70),
      zone: [0, 30 / 70],
    },
    {
      name: "Arm flail",
      value: Number.isFinite(flail) ? flail.toFixed(1) : "—",
      status: !Number.isFinite(flail) ? "info" : flail < 1.5 ? "good" : flail < 3 ? "borderline" : "poor",
      range: "good < 1.5 sw/s (p90)",
      pos: pos(flail, 0, 5),
      zone: [0, 0.3],
    },
    {
      name: "Turn rhythm",
      value: rhythm === null ? "—" : rhythm.toFixed(2),
      status: rhythm === null ? "info" : rhythm < 0.3 ? "good" : rhythm < 0.5 ? "borderline" : "poor",
      range: "good CV < 0.30",
      pos: rhythm === null ? null : pos(rhythm, 0, 0.8),
      zone: [0, 0.375],
    },
    {
      name: "Turns detected",
      value: String(s.turnCount),
      status: "info",
      range: "edge-change timing is estimated",
      pos: null,
      zone: null,
    },
  ];
  return cards;
}

function verdictFor(score: number): { title: string; sub: string } {
  if (score >= 80) return { title: "Strong riding", sub: "Fundamentals look solid — refine the details below." };
  if (score >= 60) return { title: "Solid foundation", sub: "A couple of habits are holding you back — fix the top one first." };
  if (score >= 40) return { title: "Developing", sub: "The building blocks are there. Focus on the top fault below this week." };
  return { title: "Needs work", sub: "Start with the first fault — fixing it will make everything else easier." };
}

const RING_CIRCUMFERENCE = 2 * Math.PI * 54;

export function showResults(data: ResultsData): void {
  const section = $("#screen-results");
  section.hidden = false;
  activeOverlay?.destroy();
  activeOverlay = null;

  const playerColumn = document.querySelector<HTMLElement>(".player-column")!;
  const video = $<HTMLVideoElement>("#result-video");

  if (data.objectUrl && data.samples) {
    playerColumn.style.display = "";
    video.src = data.objectUrl;
    const overlay = new SkeletonOverlay(
      $<HTMLCanvasElement>("#overlay-canvas"),
      video,
      data.samples,
      data.keyframes.map((k) => k.t),
    );
    activeOverlay = overlay;
    $<HTMLInputElement>("#overlay-toggle").onchange = (e) => {
      overlay.enabled = (e.target as HTMLInputElement).checked;
      overlay.draw();
    };
    video.addEventListener("play", () => overlay.draw());

    // speed buttons
    document.querySelectorAll<HTMLButtonElement>(".speed-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.speed === "1");
      btn.onclick = () => {
        video.playbackRate = Number(btn.dataset.speed);
        document.querySelectorAll(".speed-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
      };
    });

    // timeline: playhead fill + keyframe markers
    const fill = $("#timeline-fill");
    const track = $("#timeline-track");
    track.innerHTML = "";
    video.ontimeupdate = () => {
      if (video.duration) fill.style.width = `${(video.currentTime / video.duration) * 100}%`;
    };
    video.addEventListener("loadedmetadata", () => {
      track.innerHTML = "";
      for (const k of data.keyframes) {
        const marker = document.createElement("div");
        marker.className = "keyframe-marker";
        marker.style.left = `${(k.t / video.duration) * 100}%`;
        marker.title = `${k.reason} (${k.t.toFixed(1)}s)`;
        marker.onclick = () => seekTo(video, k.t);
        track.appendChild(marker);
      }
    });
  } else {
    playerColumn.style.display = "none";
  }

  // keyframe thumbnails
  const strip = $("#keyframe-strip");
  strip.innerHTML = "";
  data.keyframes.forEach((k, i) => {
    const fig = document.createElement("figure");
    fig.className = "keyframe-thumb";
    const imgWrap = document.createElement("div");
    imgWrap.className = "kf-img";
    const img = document.createElement("img");
    img.src = k.dataUrl;
    img.alt = k.reason;
    const time = document.createElement("span");
    time.className = "kf-time";
    time.textContent = `${k.t.toFixed(1)}s`;
    imgWrap.append(img, time);
    const cap = document.createElement("figcaption");
    cap.textContent = `#${i} — ${k.reason}`;
    fig.append(imgWrap, cap);
    fig.onclick = () => {
      if (data.objectUrl) seekTo(video, k.t);
    };
    strip.appendChild(fig);
  });

  // score ring + verdict
  const score = data.coaching.overall_score;
  const ring = $("#ring-fill") as unknown as SVGCircleElement;
  ring.style.strokeDashoffset = String(RING_CIRCUMFERENCE);
  ring.style.stroke = score >= 60 ? (score >= 80 ? "var(--good)" : "var(--accent)") : score >= 40 ? "var(--warn)" : "var(--bad)";
  $("#score-num").textContent = String(score);
  // animate on next frame so the transition runs
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      ring.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - score / 100));
    }),
  );
  const verdict = verdictFor(score);
  $("#verdict-title").textContent = verdict.title;
  $("#verdict-sub").textContent =
    data.coaching.faults.length > 0
      ? `${verdict.sub} Top priority: ${faultById(data.coaching.faults[0].fault_id)?.name ?? "see below"}.`
      : verdict.sub;
  $("#mock-badge").hidden = !data.coaching.mocked;

  // metric cards
  const cards = $("#metric-cards");
  cards.innerHTML = "";
  for (const c of metricCards(data.summary)) {
    const el = document.createElement("div");
    el.className = "metric-card";
    const chip = c.status !== "info" ? `<span class="mc-chip ${c.status}">${STATUS_LABEL[c.status]}</span>` : "";
    const bar =
      c.pos !== null && c.zone
        ? `<div class="mc-bar"><div class="mc-zone" style="left:${c.zone[0] * 100}%;width:${(c.zone[1] - c.zone[0]) * 100}%"></div><div class="mc-needle" style="left:${c.pos * 100}%"></div></div>`
        : "";
    el.innerHTML = `<div class="mc-top"><span class="mc-name">${c.name}</span>${chip}</div><div class="mc-value">${c.value}</div>${bar}<div class="mc-range">${c.range}</div>`;
    cards.appendChild(el);
  }

  // coach cards
  const coach = $("#coach-cards");
  coach.innerHTML = "";
  if (data.coaching.faults.length === 0) {
    const el = document.createElement("p");
    el.className = "coach-empty";
    el.textContent =
      "No faults identified from this clip — either it looks solid or the footage couldn't be analyzed. Check the footage notes below.";
    coach.appendChild(el);
  }
  data.coaching.faults.forEach((f, i) => {
    const def = faultById(f.fault_id);
    const el = document.createElement("div");
    el.className = `coach-card ${f.severity >= 4 ? "sev-high" : f.severity <= 2 ? "sev-low" : ""}`;
    el.style.animationDelay = `${i * 90}ms`;
    el.innerHTML = `
      <div class="cc-head"><h3>${def?.name ?? f.fault_id}</h3><span class="sev-badge s${f.severity}">Severity ${f.severity}/5</span></div>
      <p>${f.explanation}</p>
      <div class="drill"><span class="drill-label">Drill</span>${f.drill}</div>`;
    if (f.evidence_keyframe >= 0 && f.evidence_keyframe < data.keyframes.length && data.objectUrl) {
      const kf = data.keyframes[f.evidence_keyframe];
      const btn = document.createElement("button");
      btn.className = "evidence-btn";
      btn.textContent = `View keyframe #${f.evidence_keyframe} · ${kf.t.toFixed(1)}s`;
      btn.onclick = () => {
        seekTo(video, kf.t);
        video.scrollIntoView({ behavior: "smooth", block: "nearest" });
      };
      el.appendChild(btn);
    }
    coach.appendChild(el);
  });

  // camera notes (deduped — the mock coach echoes summary notes back)
  const notes = $("#camera-notes");
  const allNotes = [...new Set([...data.summary.cameraNotes, ...data.coaching.camera_notes])];
  if (allNotes.length > 0) {
    notes.innerHTML = `<h3>Footage notes</h3><ul>${allNotes.map((n) => `<li>${n}</li>`).join("")}</ul>`;
  } else {
    notes.innerHTML = "";
  }
}

function seekTo(video: HTMLVideoElement, t: number): void {
  video.currentTime = t;
  video.pause();
}

export function hideResults(): void {
  activeOverlay?.destroy();
  activeOverlay = null;
  $("#screen-results").hidden = true;
  const video = $<HTMLVideoElement>("#result-video");
  video.pause();
  video.removeAttribute("src");
  video.load();
}
