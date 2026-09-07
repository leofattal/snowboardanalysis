import { describe, it, expect } from "vitest";
import { entryToRow, rowToEntry } from "../src/db/cloud";
import type { HistoryEntry } from "../src/ui/history";
import { makeSummary } from "./coaching.test";

function makeEntry(): HistoryEntry {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    createdAt: "2026-09-07T10:00:00.000Z",
    context: "turns",
    stance: "regular",
    duration: 12.5,
    summary: makeSummary(),
    coaching: {
      faults: [
        { fault_id: "stiff-legs", severity: 4, evidence_keyframe: 0, explanation: "x", drill: "y" },
      ],
      overall_score: 52,
      camera_notes: ["note"],
      mocked: false,
      model: "test",
    },
    keyframes: [{ t: 2.4, reason: "Turn 2", dataUrl: "data:image/jpeg;base64,AAAA" }],
  };
}

describe("cloud row mapping", () => {
  it("round-trips a HistoryEntry through a DB row", () => {
    const entry = makeEntry();
    const row = entryToRow(entry, "user-123");
    expect(row.user_id).toBe("user-123");
    expect(row.id).toBe(entry.id);
    expect(row.overall_score).toBe(52);
    const back = rowToEntry(row);
    expect(back).toEqual(entry);
  });

  it("tolerates missing keyframes array", () => {
    const entry = makeEntry();
    const row = entryToRow(entry, "user-123");
    const back = rowToEntry({ ...row, keyframes: null as never });
    expect(back.keyframes).toEqual([]);
  });
});
