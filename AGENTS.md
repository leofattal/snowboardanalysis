# EdgeCheck — Snowboard Coach (M1 core loop)

Upload a riding clip → in-browser pose extraction → form metrics → AI coaching cards with drills. Vite + TypeScript, no framework.

## Setup

```bash
npm install          # also copies MediaPipe WASM into public/wasm
# one-time: download the pose model (~9 MB)
mkdir -p public/models && curl -sSL -o public/models/pose_landmarker_full.task \
  https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task
```

`public/wasm/` and `public/models/` are gitignored (generated/downloaded artifacts).

## Commands

- `npm run dev` — dev server (includes `/api/nebius` proxy to Token Factory)
- `npm test` — vitest unit tests (geometry, metrics, turn detection, coaching schema/mock)
- `npm run build` — `tsc --noEmit` + `vite build`
- `npm run preview` — serve the production build

## Architecture (two-stage pipeline, PRD §7)

**Stage 1 — pose (free, in-browser, deterministic)**
- `src/pose/landmarker.ts` — MediaPipe PoseLandmarker singleton (GPU delegate, CPU fallback), seek-based video sampling at 15 fps.
- `src/analysis/metrics.ts` — per-frame metrics: knee flex, torso lean, counter-rotation (shoulder line vs ankle/board line), fore/aft weight bias, arm spread, wrist speed, rider size.
- `src/analysis/turns.ts` — edge-change detection via zero crossings of the detrended hip-line angle; turn segments + rhythm CV.
- `src/analysis/keyframes.ts` — picks the worst-scored frame inside the worst turns.
- `src/pose/capture.ts` — re-seeks and captures keyframe JPEGs (≤640 px) for the LLM.
- `src/coaching/summary.ts` — aggregates frames/turns into `AnalysisSummary` + camera notes.

**Stage 2 — coaching (LLM or local mock)**
- `src/coaching/taxonomy.ts` — fixed 14-fault list (PRD §7); the model can only pick from these ids.
- `src/coaching/prompt.ts` — instructor system prompt + JSON metrics payload.
- `src/coaching/llm.ts` — OpenAI-compatible call to Nebius Token Factory with base64 keyframes.
- `src/coaching/schema.ts` — loose-JSON parsing + validation (drops invented faults, clamps severity, fixes evidence indices).
- `src/coaching/mock.ts` — deterministic rule-based fallback using the same taxonomy copy.

**UI**
- `src/main.ts` — orchestrates upload → processing → results, saves history (localStorage, analysis only, no video blobs).
- `src/ui/results.ts` — metric cards with good/borderline/poor ranges, coach cards, keyframe strip + timeline markers, speed controls.
- `src/ui/overlay.ts` — canvas skeleton drawn over the video (legs cyan, arms yellow, torso pink, board line green; frame flashes at keyframes).

## Coaching LLM config (optional)

Copy `.env.example` to `.env`. If `VITE_NEBIUS_API_KEY` is unset, the app runs fully offline with the rule-based mock coach.

- `VITE_NEBIUS_API_KEY` — Token Factory key. In dev it goes through the vite proxy (`/api/nebius` → `https://api.tokenfactory.nebius.com/v1`), avoiding CORS.
- `VITE_NEBIUS_MODEL` — default `moonshotai/Kimi-K3` (text-only reasoning model; needs the large `max_tokens` budget in `llm.ts` because reasoning tokens count against it). Vision-capable alternatives verified on this account: `google/gemma-3-27b-it`, `openbmb/MiniCPM-V-4_5`.
- `VITE_NEBIUS_VISION` — `true` only for vision-capable models; when `false` keyframes are not sent and coaching is metrics-only (`evidence_keyframe` comes back -1).
- `VITE_NEBIUS_BASE_URL` — override the base URL (required outside `vite dev`).
- `scripts/test-nebius.py [models...]` — smoke-tests multi-image + strict-JSON coaching calls against Token Factory.

**Security note:** a pure client-side build ships the API key to browsers. Before any real deployment, put the LLM call behind a server-side proxy and drop the key from the client.

## Supabase (M2, project created)

- Project `edgecheck` (ref `sztwqkzkcjzhcgwpdyft`, us-west-1) in "leofattal's Org". Env vars in `.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- Schema: `public.analyses` (per-user analysis history, jsonb summary/coaching/keyframes) with RLS policies for select/insert/delete of own rows; private `clips` storage bucket with per-user-folder (`<uid>/...`) policies.
- Generated types live in `src/types/supabase.ts`; regenerate after schema changes.
- The app is NOT wired to Supabase yet — auth + cloud history sync is M2 work.

## Known v1 limitations

- Board line is estimated from the ankle-to-ankle vector; edge-change timing from hip-line oscillation — both labeled "estimated" in the UI.
- Fore/aft bias needs horizontal travel to identify the front foot; static/follow-cam clips fall back to stance-based estimation.
- Client-side trim/downscale (ffmpeg.wasm) and Supabase auth/history are intentionally out of scope for this milestone (M2 per PRD).
