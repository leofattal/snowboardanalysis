import { describe, it, expect } from "vitest";
import { angleAt, lineAngle, angleDiff, undirectedLineDiff, percentile, smooth, clamp } from "../src/analysis/geometry";

describe("geometry", () => {
  it("angleAt computes a right angle", () => {
    expect(angleAt({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(90, 6);
  });

  it("angleAt returns 180 for a straight line", () => {
    expect(angleAt({ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(180, 6);
  });

  it("angleAt returns NaN for zero-length segments", () => {
    expect(angleAt({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 })).toBeNaN();
  });

  it("lineAngle handles axes", () => {
    expect(lineAngle({ x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(0);
    expect(lineAngle({ x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(90);
    expect(lineAngle({ x: 0, y: 0 }, { x: -1, y: 0 })).toBeCloseTo(180);
  });

  it("angleDiff wraps around", () => {
    expect(angleDiff(170, -170)).toBeCloseTo(20);
    expect(angleDiff(10, 350)).toBeCloseTo(20);
  });

  it("undirectedLineDiff treats lines as unoriented", () => {
    expect(undirectedLineDiff(0, 175)).toBeCloseTo(5);
    expect(undirectedLineDiff(0, 90)).toBeCloseTo(90);
  });

  it("percentile interpolates", () => {
    expect(percentile([1, 2, 3, 4], 50)).toBeCloseTo(2.5);
    expect(percentile([1, 2, 3, 4], 0)).toBe(1);
    expect(percentile([1, 2, 3, 4], 100)).toBe(4);
    expect(percentile([], 50)).toBeNaN();
  });

  it("smooth preserves constant signal and softens steps", () => {
    expect(smooth([5, 5, 5, 5, 5], 3)).toEqual([5, 5, 5, 5, 5]);
    const out = smooth([0, 0, 10, 0, 0], 3);
    expect(out[2]).toBeLessThan(10);
    expect(out[1]).toBeGreaterThan(0);
  });

  it("clamp bounds values", () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });
});
