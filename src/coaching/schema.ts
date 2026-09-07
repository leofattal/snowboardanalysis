import { clamp } from "../analysis/geometry";
import { FAULT_IDS, faultById } from "./taxonomy";

export interface CoachingFault {
  fault_id: string;
  severity: number; // 1–5
  evidence_keyframe: number; // index into keyframe array, -1 if none
  explanation: string;
  drill: string;
}

export interface CoachingResult {
  faults: CoachingFault[];
  overall_score: number;
  camera_notes: string[];
  /** true when produced by the local rule-based fallback instead of the LLM */
  mocked: boolean;
  model: string;
}

/** Parses, validates and sanitizes raw model output against the fixed taxonomy. */
export function validateCoaching(raw: unknown, keyframeCount: number, mocked: boolean, model: string): CoachingResult {
  const obj = (typeof raw === "string" ? parseJsonLoose(raw) : raw) as Record<string, unknown>;
  const faultsRaw = Array.isArray(obj?.faults) ? obj.faults : [];
  const faults: CoachingFault[] = [];
  for (const f of faultsRaw) {
    if (typeof f !== "object" || f === null) continue;
    const rec = f as Record<string, unknown>;
    const id = String(rec.fault_id ?? "");
    if (!FAULT_IDS.includes(id)) continue; // drop invented faults
    const def = faultById(id)!;
    const ev = Number(rec.evidence_keyframe);
    faults.push({
      fault_id: id,
      severity: clamp(Math.round(Number(rec.severity) || 3), 1, 5),
      evidence_keyframe: Number.isInteger(ev) && ev >= 0 && ev < keyframeCount ? ev : -1,
      explanation: typeof rec.explanation === "string" && rec.explanation.trim() ? rec.explanation.trim() : def.explanation,
      drill: typeof rec.drill === "string" && rec.drill.trim() ? rec.drill.trim() : def.drill,
    });
    if (faults.length >= 3) break;
  }
  const scoreRaw = Number(obj?.overall_score);
  const cameraNotes = Array.isArray(obj?.camera_notes) ? obj.camera_notes.filter((n): n is string => typeof n === "string") : [];
  return {
    faults,
    overall_score: Number.isFinite(scoreRaw) ? clamp(Math.round(scoreRaw), 0, 100) : 50,
    camera_notes: cameraNotes,
    mocked,
    model,
  };
}

/** Extracts the first balanced {...} JSON object from loose model text. */
export function parseJsonLoose(text: string): unknown {
  const start = text.indexOf("{");
  if (start === -1) return {};
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') inString = !inString;
    if (inString) continue;
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return {};
        }
      }
    }
  }
  return {};
}
