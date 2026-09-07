import "./styles.css";
import { sampleVideoPose } from "./pose/landmarker";
import { captureFrameJpeg } from "./pose/capture";
import { computeSeries } from "./analysis/metrics";
import { detectEdgeChanges, buildTurns } from "./analysis/turns";
import { pickKeyframes } from "./analysis/keyframes";
import { buildSummary, type RidingContext, type Stance } from "./coaching/summary";
import { getCoaching } from "./coaching/llm";
import { showResults, hideResults } from "./ui/results";
import { loadHistory, saveToHistory, deleteHistoryEntry, type HistoryEntry } from "./ui/history";
import { getSupabase } from "./db/client";
import { onAuth, sendMagicLink, signOut } from "./db/auth";
import { cloudSave, cloudDelete, cloudMergeLocals } from "./db/cloud";
import type { Session } from "@supabase/supabase-js";

const MAX_BYTES = 200 * 1024 * 1024;
const MAX_DURATION_S = 60;

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`missing element ${sel}`);
  return el;
};

let objectUrl: string | null = null;
let session: Session | null = null;

const STAGES = ["pose", "metrics", "keyframes", "coaching"] as const;
type Stage = (typeof STAGES)[number];

function setStage(stage: Stage): void {
  const idx = STAGES.indexOf(stage);
  document.querySelectorAll<HTMLLIElement>(".stage-list li").forEach((li) => {
    const liIdx = STAGES.indexOf(li.dataset.stage as Stage);
    li.classList.toggle("done", liIdx < idx);
    li.classList.toggle("active", liIdx === idx);
  });
}

function setProgress(pct: number, detail = ""): void {
  $<HTMLDivElement>("#progress-bar").style.width = `${Math.round(pct)}%`;
  $("#processing-detail").textContent = detail;
}

function showScreen(id: string): void {
  for (const s of ["#screen-upload", "#screen-processing", "#screen-results"]) {
    $(s).hidden = s !== id;
  }
}

function showError(msg: string): void {
  const el = $("#upload-error");
  el.textContent = msg;
  el.hidden = false;
}

/* ===================== upload ===================== */

function setupUpload(): void {
  const dropzone = $("#dropzone");
  const input = $<HTMLInputElement>("#file-input");

  dropzone.addEventListener("click", () => input.click());
  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") input.click();
  });
  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  });
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) handleFile(file);
  });
}

function handleFile(file: File): void {
  $("#upload-error").hidden = true;
  if (!file.type.startsWith("video/")) {
    showError("That doesn't look like a video file — please upload MP4 or MOV.");
    return;
  }
  if (file.size > MAX_BYTES) {
    showError("File is over 200 MB. Trim it down or export at 720p and try again.");
    return;
  }

  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(file);

  const preview = $<HTMLVideoElement>("#preview-video");
  preview.src = objectUrl;
  preview.onloadedmetadata = () => {
    if (!Number.isFinite(preview.duration) || preview.duration <= 0) {
      showError("Couldn't read this video's duration — try re-exporting as MP4 (H.264).");
      return;
    }
    if (preview.duration > MAX_DURATION_S) {
      showError(`Clip is ${Math.round(preview.duration)}s — max is ${MAX_DURATION_S}s. Trim it to your best 5–30 seconds.`);
      return;
    }
    $("#clip-setup").hidden = false;
    $("#clip-meta").textContent = `${Math.round(preview.duration)}s · ${preview.videoWidth}×${preview.videoHeight} · ${(file.size / 1024 / 1024).toFixed(1)} MB`;
    preview.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };
  preview.onerror = () => showError("Couldn't decode this video. Try MP4 (H.264) — HEVC support varies by browser.");
}

/* ===================== analysis pipeline ===================== */

async function runAnalysis(): Promise<void> {
  if (!objectUrl) return;
  const context = $<HTMLSelectElement>("#context-select").value as RidingContext;
  const stance = $<HTMLSelectElement>("#stance-select").value as Stance;

  showScreen("#screen-processing");
  try {
    const video = document.createElement("video");
    video.src = objectUrl;
    video.muted = true;
    video.playsInline = true;
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("failed to load video for processing"));
    });

    setStage("pose");
    setProgress(2, "Loading pose model…");
    const fps = 15;
    const { frames, duration } = await sampleVideoPose(video, {
      fps,
      onProgress: (done, total) => setProgress(2 + (done / total) * 68, `frame ${done} / ${total}`),
    });

    setStage("metrics");
    setProgress(72);
    const series = computeSeries(frames);
    const { times: edgeChanges } = detectEdgeChanges(series.frames, fps);
    const turns = buildTurns(edgeChanges, duration);
    const summary = buildSummary(series, turns, { context, stance, duration, fps });

    setStage("keyframes");
    setProgress(78);
    const picks = pickKeyframes(series, turns, 3);
    const keyframes = [];
    for (const [i, pick] of picks.entries()) {
      const dataUrl = await captureFrameJpeg(video, pick.t);
      keyframes.push({ ...pick, dataUrl });
      setProgress(78 + ((i + 1) / Math.max(1, picks.length)) * 10);
    }
    if (keyframes.length === 0) {
      summary.cameraNotes.push("No usable frames captured — the rider could not be detected reliably in this clip.");
    }

    setStage("coaching");
    setProgress(90, "metrics → coach");
    const coaching = await getCoaching(summary, keyframes);

    setProgress(100, "done");
    hideResults();
    showResults({ objectUrl, samples: frames, summary, coaching, keyframes });
    showScreen("#screen-results");

    const entry: HistoryEntry = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      context,
      stance,
      duration,
      summary,
      coaching,
      keyframes,
    };
    saveToHistory(entry);
    if (session) {
      cloudSave(entry, session.user.id).catch((err) => console.warn("cloud save failed", err));
    }
    void refreshHistory();
  } catch (err) {
    console.error(err);
    showScreen("#screen-upload");
    showError(err instanceof Error ? err.message : "Analysis failed unexpectedly.");
  }
}

/* ===================== history ===================== */

async function historyEntries(): Promise<HistoryEntry[]> {
  if (!session) return loadHistory();
  try {
    return await cloudMergeLocals(loadHistory(), session.user.id);
  } catch (err) {
    console.warn("cloud history failed, falling back to local", err);
    return loadHistory();
  }
}

async function refreshHistory(): Promise<void> {
  renderHistory(await historyEntries());
}

function renderSparkline(list: HistoryEntry[]): void {
  const svg = $("#trend-spark") as unknown as SVGSVGElement & { hidden: boolean };
  const scores = [...list].reverse().map((e) => e.coaching.overall_score);
  if (scores.length < 2) {
    svg.hidden = true;
    return;
  }
  svg.hidden = false;
  const min = Math.min(...scores) - 5;
  const max = Math.max(...scores) + 5;
  const pts = scores
    .map((s, i) => `${(i / (scores.length - 1)) * 112 + 4},${32 - ((s - min) / (max - min)) * 28}`)
    .join(" ");
  svg.innerHTML = `
    <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    ${pts.split(" ").map((p) => `<circle cx="${p.split(",")[0]}" cy="${p.split(",")[1]}" r="2.5" fill="var(--accent)"/>`).join("")}`;
}

function renderHistory(list: HistoryEntry[]): void {
  const panel = $("#history-panel");
  const ul = $("#history-list");
  ul.innerHTML = "";
  panel.hidden = list.length === 0;
  $("#history-sync-hint").hidden = list.length === 0 || session !== null;
  renderSparkline(list);

  for (const e of list) {
    const li = document.createElement("li");
    li.className = "history-card";
    const thumb = e.keyframes[0]?.dataUrl;
    const date = new Date(e.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const topFault = e.coaching.faults[0]?.fault_id.replace(/-/g, " ") ?? "no faults";
    li.innerHTML = `
      ${thumb ? `<img src="${thumb}" alt="" />` : '<div class="hc-thumb-placeholder"></div>'}
      <div class="hc-body">
        <div class="hc-title">${date} · ${e.context}</div>
        <div class="hc-meta">${topFault}${e.coaching.mocked ? " · offline" : ""}</div>
      </div>
      <span class="hc-score">${e.coaching.overall_score}</span>
      <button class="hc-delete" title="Delete analysis" aria-label="Delete analysis">✕</button>`;
    li.querySelector(".hc-delete")!.addEventListener("click", (ev) => {
      ev.stopPropagation();
      deleteHistoryEntry(e.id);
      if (session) cloudDelete(e.id).catch((err) => console.warn("cloud delete failed", err));
      void refreshHistory();
    });
    li.onclick = () => {
      hideResults();
      showResults({
        objectUrl: null,
        samples: null,
        summary: e.summary,
        coaching: e.coaching,
        keyframes: e.keyframes,
      });
      showScreen("#screen-results");
    };
    ul.appendChild(li);
  }
}

/* ===================== auth ===================== */

function setupAuth(): void {
  const sb = getSupabase();
  if (!sb) return; // auth UI stays hidden without env config
  $("#auth-btn").hidden = false;

  const modal = $("#auth-modal");
  const open = () => {
    modal.hidden = false;
    $<HTMLInputElement>("#auth-email").focus();
  };
  const close = () => {
    modal.hidden = true;
    $("#auth-status").hidden = true;
  };
  $("#auth-btn").onclick = open;
  $("#auth-close").onclick = close;
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) close();
  });

  $("#auth-send").addEventListener("click", async () => {
    const email = $<HTMLInputElement>("#auth-email").value.trim();
    const status = $("#auth-status");
    if (!email) return;
    try {
      await sendMagicLink(email);
      status.textContent = `Link sent to ${email} — click it to sign in. You can close this.`;
      status.classList.remove("error");
      status.hidden = false;
    } catch (err) {
      status.textContent = err instanceof Error ? err.message : "Couldn't send the link — try again.";
      status.classList.add("error");
      status.hidden = false;
    }
  });
  $<HTMLInputElement>("#auth-email").addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("#auth-send").click();
  });

  $("#signout-btn").addEventListener("click", () => void signOut());

  onAuth((s) => {
    session = s;
    $("#auth-btn").hidden = s !== null;
    $("#user-chip").hidden = s === null;
    if (s) {
      $("#user-email").textContent = s.user.email ?? "signed in";
      $("#user-email").title = s.user.email ?? "";
      close();
      void refreshHistory();
    } else {
      renderHistory(loadHistory());
    }
  });
}

/* ===================== boot ===================== */

function main(): void {
  setupUpload();
  setupAuth();
  $("#analyze-btn").addEventListener("click", () => void runAnalysis());
  $("#analyze-another-btn").addEventListener("click", () => {
    hideResults();
    showScreen("#screen-upload");
  });
  void refreshHistory();
}

main();

// Dev-only: #demo-results renders the results screen with synthetic data.
if (location.hash === "#demo-results") {
  import("./ui/demo").then((m) => {
    hideResults();
    m.showDemo();
    showScreen("#screen-results");
  });
}
