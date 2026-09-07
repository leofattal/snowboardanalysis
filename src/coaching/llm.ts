import type { KeyframePick } from "../analysis/keyframes";
import { buildSystemPrompt, buildUserPayload } from "./prompt";
import { mockCoach } from "./mock";
import { validateCoaching, type CoachingResult } from "./schema";
import type { AnalysisSummary } from "./summary";

export interface KeyframeImage extends KeyframePick {
  dataUrl: string;
}

interface LlmConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  /** false for text-only models (e.g. Kimi): keyframes are not sent */
  vision: boolean;
}

function getConfig(): LlmConfig | null {
  const apiKey = (import.meta.env.VITE_NEBIUS_API_KEY as string | undefined)?.trim();
  if (!apiKey) return null;
  const baseUrl =
    (import.meta.env.VITE_NEBIUS_BASE_URL as string | undefined)?.trim() || "/api/nebius"; // vite dev proxy
  const model =
    (import.meta.env.VITE_NEBIUS_MODEL as string | undefined)?.trim() || "moonshotai/Kimi-K3";
  const visionEnv = (import.meta.env.VITE_NEBIUS_VISION as string | undefined)?.trim().toLowerCase();
  const vision = visionEnv === "true" || visionEnv === "1";
  return { apiKey, baseUrl, model, vision };
}

interface ChatMessage {
  role: "system" | "user";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
}

/**
 * Stage 2 of the pipeline: sends the metric summary + keyframes to a
 * vision-capable chat model (Nebius Token Factory, OpenAI-compatible).
 * Falls back to the deterministic local coach when no API key is configured.
 */
export async function getCoaching(
  summary: AnalysisSummary,
  keyframes: KeyframeImage[],
): Promise<CoachingResult> {
  const cfg = getConfig();
  if (!cfg) return mockCoach(summary);

  const imageCount = cfg.vision ? keyframes.length : 0;
  const content: ChatMessage["content"] = [
    { type: "text", text: buildUserPayload(summary, imageCount) },
    ...(cfg.vision
      ? keyframes.map((k) => ({ type: "image_url" as const, image_url: { url: k.dataUrl } }))
      : []),
  ];
  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt(cfg.vision) },
    { role: "user", content },
  ];

  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      temperature: 0.2,
      // generous budget: reasoning models (Kimi-K3) spend thousands of
      // reasoning tokens before producing content
      max_tokens: 6000,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Coaching API error ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  const text: string = json?.choices?.[0]?.message?.content ?? "";
  return validateCoaching(text, imageCount, false, cfg.model);
}
