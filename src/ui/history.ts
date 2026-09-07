import type { CoachingResult } from "../coaching/schema";
import type { AnalysisSummary, RidingContext, Stance } from "../coaching/summary";

export interface HistoryEntry {
  id: string;
  createdAt: string; // ISO
  context: RidingContext;
  stance: Stance;
  duration: number;
  summary: AnalysisSummary;
  coaching: CoachingResult;
  keyframes: { t: number; reason: string; dataUrl: string }[];
}

const KEY = "edgecheck.history.v1";
const MAX_ENTRIES = 20;

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveToHistory(entry: HistoryEntry): void {
  const list = loadHistory();
  list.unshift(entry);
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_ENTRIES)));
  } catch {
    // Quota exceeded — drop keyframe images of older entries and retry once.
    const trimmed = list.slice(0, 5).map((e, i) => (i === 0 ? e : { ...e, keyframes: [] }));
    try {
      localStorage.setItem(KEY, JSON.stringify(trimmed));
    } catch {
      /* give up silently */
    }
  }
}

export function deleteHistoryEntry(id: string): void {
  const list = loadHistory().filter((e) => e.id !== id);
  localStorage.setItem(KEY, JSON.stringify(list));
}
