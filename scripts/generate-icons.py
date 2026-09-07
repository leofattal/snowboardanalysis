#!/usr/bin/env python3
"""Generates EdgeCheck PWA icons: dark rounded square + cyan mountain glyph."""
import struct, zlib, os, math

BG = (7, 11, 22)
ACCENT = (56, 224, 255)

def rounded_rect_mask(size, radius):
    def inside(x, y):
        for cx, cy in ((radius, radius), (size - radius, radius), (radius, size - radius), (size - radius, size - radius)):
            if (x < radius or x >= size - radius) and (y < radius or y >= size - radius):
                if (x - cx) ** 2 + (y - cy) ** 2 > radius ** 2:
                    return False
        return True
    return inside

def draw_icon(path, size, maskable=False):
    px = [[BG for _ in range(size)] for _ in range(size)]
    radius = int(size * (0.22 if not maskable else 0.12))
    mask = rounded_rect_mask(size, radius)
    # background fill (maskable keeps corners)
    for y in range(size):
        for x in range(size):
            if maskable or mask(x, y):
                # subtle vertical gradient
                t = y / size
                px[y][x] = tuple(min(255, int(c * (1 - 0.25 * t) + 20 * t)) for c in BG)
            else:
                px[y][x] = (0, 0, 0)

    # mountain glyph (matches the header logo): polyline in unit coords
    glyph = [(0.07, 0.75), (0.38, 0.25), (0.56, 0.50), (0.69, 0.34), (0.93, 0.75)]
    base_y = 0.84
    stroke = max(2, int(size * 0.055))

    def draw_line(a, b, width, color):
        ax, ay = a; bx, by = b
        steps = int(max(abs(bx - ax), abs(by - ay))) + 1
        for i in range(steps + 1):
            t = i / steps
            x, y = ax + (bx - ax) * t, ay + (by - ay) * t
            r = width / 2
            for dy in range(-int(r) - 1, int(r) + 2):
                for dx in range(-int(r) - 1, int(r) + 2):
                    if dx * dx + dy * dy <= r * r:
                        xx, yy = int(x + dx), int(y + dy)
                        if 0 <= xx < size and 0 <= yy < size and (maskable or mask(xx, yy)):
                            px[yy][xx] = color

    pts = [(gx * size, gy * size) for gx, gy in glyph]
    for i in range(len(pts) - 1):
        draw_line(pts[i], pts[i + 1], stroke, ACCENT)
    draw_line((0.12 * size, base_y * size), (0.88 * size, base_y * size), stroke, tuple(int(c * 0.45) for c in ACCENT))

    # encode PNG
    raw = b"".join(b"\x00" + b"".join(bytes(p) for p in row) for row in px)
    def chunk(t, d):
        c = t + d
        return struct.pack(">I", len(d)) + c + struct.pack(">I", zlib.crc32(c))
    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(raw, 9))
           + chunk(b"IEND", b""))
    with open(path, "wb") as f:
        f.write(png)
    print("wrote", path, size)

os.makedirs("public/icons", exist_ok=True)
draw_icon("public/icons/icon-192.png", 192)
draw_icon("public/icons/icon-512.png", 512)
draw_icon("public/icons/maskable-512.png", 512, maskable=True)
draw_icon("public/icons/apple-touch-icon.png", 180)
