// Copies the MediaPipe tasks-vision WASM runtime into public/ so the app
// works without a CDN at runtime (dev and production builds).
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const dest = join(root, "public", "wasm");

if (!existsSync(src)) {
  console.warn("[copy-wasm] @mediapipe/tasks-vision not installed yet, skipping");
  process.exit(0);
}
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`[copy-wasm] copied WASM runtime to ${dest}`);
