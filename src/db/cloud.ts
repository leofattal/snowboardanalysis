import { getSupabase } from "./client";
import type { HistoryEntry } from "../ui/history";
import type { CoachingResult } from "../coaching/schema";
import type { AnalysisSummary, RidingContext, Stance } from "../coaching/summary";
import type { Json } from "../types/supabase";

interface AnalysisRow {
  id: string;
  user_id: string;
  created_at: string;
  context: string;
  stance: string;
  duration_s: number | null;
  overall_score: number | null;
  summary: Json;
  coaching: Json;
  keyframes: Json;
}

export function entryToRow(entry: HistoryEntry, userId: string): AnalysisRow {
  return {
    id: entry.id,
    user_id: userId,
    created_at: entry.createdAt,
    context: entry.context,
    stance: entry.stance,
    duration_s: entry.duration,
    overall_score: entry.coaching.overall_score,
    summary: entry.summary as unknown as Json,
    coaching: entry.coaching as unknown as Json,
    keyframes: entry.keyframes as unknown as Json,
  };
}

export function rowToEntry(row: AnalysisRow): HistoryEntry {
  return {
    id: row.id,
    createdAt: row.created_at,
    context: row.context as RidingContext,
    stance: row.stance as Stance,
    duration: row.duration_s ?? 0,
    summary: row.summary as unknown as AnalysisSummary,
    coaching: row.coaching as unknown as CoachingResult,
    keyframes: Array.isArray(row.keyframes)
      ? (row.keyframes as unknown as HistoryEntry["keyframes"])
      : [],
  };
}

/** Upserts one analysis into the user's cloud history. */
export async function cloudSave(entry: HistoryEntry, userId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.from("analyses").upsert(entryToRow(entry, userId));
  if (error) throw error;
}

/** Fetches the user's cloud history, newest first. */
export async function cloudList(limit = 50): Promise<HistoryEntry[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("analyses")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as AnalysisRow[]).map(rowToEntry);
}

export async function cloudDelete(id: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.from("analyses").delete().eq("id", id);
  if (error) throw error;
}

/** Uploads local entries that don't exist in the cloud yet; returns the merged list. */
export async function cloudMergeLocals(locals: HistoryEntry[], userId: string): Promise<HistoryEntry[]> {
  const cloud = await cloudList();
  const cloudIds = new Set(cloud.map((e) => e.id));
  const missing = locals.filter((e) => !cloudIds.has(e.id));
  for (const entry of missing) {
    await cloudSave(entry, userId);
  }
  return [...cloud, ...missing].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
