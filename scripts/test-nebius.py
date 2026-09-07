import base64, json, os, struct, sys, urllib.request, zlib

key = open(".env").read().split("VITE_NEBIUS_API_KEY=")[1].split("\n")[0].strip()

def png(color):
    w = h = 64
    raw = b"".join(b"\x00" + bytes(color) * w for _ in range(h))
    def chunk(t, d):
        c = t + d
        return struct.pack(">I", len(d)) + c + struct.pack(">I", zlib.crc32(c))
    return base64.b64encode(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    ).decode()

img = "data:image/png;base64," + png((0, 0, 255))

models = sys.argv[1:] or ["openbmb/MiniCPM-V-4_5", "google/gemma-3-27b-it"]
for model in models:
    body = {
        "model": model,
        "temperature": 0.2,
        "max_tokens": 300,
        "messages": [
            {"role": "system", "content": 'You are a snowboard instructor. Respond with STRICT JSON only: {"faults": [], "overall_score": 0, "camera_notes": []}. Faults must come only from [stiff-legs, back-seat, counter-rotation] with fields fault_id, severity, evidence_keyframe, explanation, drill.'},
            {"role": "user", "content": [
                {"type": "text", "text": "Metrics: min knee flex 165 deg (180=straight), mean front-foot bias 0.3. Two keyframes attached."},
                {"type": "image_url", "image_url": {"url": img}},
                {"type": "image_url", "image_url": {"url": img}},
            ]},
        ],
    }
    req = urllib.request.Request(
        "https://api.tokenfactory.nebius.com/v1/chat/completions",
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    print("===", model, "===")
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            d = json.load(r)
        c = d["choices"][0]["message"]["content"]
        try:
            parsed = json.loads(c.strip().removeprefix("```json").removesuffix("```").strip())
            print("JSON OK:", json.dumps(parsed)[:400])
        except Exception:
            print("NOT CLEAN JSON:", c[:300])
    except Exception as e:
        print("ERROR:", e)
    print()
