/**
 * Vector2D Math & Naval Coordinate Utilities
 * Clean-Room implementation for NavalCommand.io
 */

export interface Vector2D {
  x: number;
  y: number;
}

export type Vector2 = Vector2D;

export function vec2(x = 0, y = 0): Vector2D {
  return { x, y };
}

export function vec2Add(a: Vector2D, b: Vector2D): Vector2D {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function vec2Sub(a: Vector2D, b: Vector2D): Vector2D {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function vec2Scale(v: Vector2D, s: number): Vector2D {
  return { x: v.x * s, y: v.y * s };
}

export function vec2Dot(a: Vector2D, b: Vector2D): number {
  return a.x * b.x + a.y * b.y;
}

export function vec2Cross(a: Vector2D, b: Vector2D): number {
  return a.x * b.y - a.y * b.x;
}

export function vec2LengthSq(v: Vector2D): number {
  return v.x * v.x + v.y * v.y;
}

export function vec2Length(v: Vector2D): number {
  return Math.sqrt(vec2LengthSq(v));
}

export function vec2DistanceSq(a: Vector2D, b: Vector2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx * dx + dy * dy;
}

export function vec2Distance(a: Vector2D, b: Vector2D): number {
  return Math.sqrt(vec2DistanceSq(a, b));
}

export function vec2Normalize(v: Vector2D): Vector2D {
  const len = vec2Length(v);
  if (len < 1e-9) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

export function vec2Rotate(v: Vector2D, angleRad: number): Vector2D {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return {
    x: v.x * cos - v.y * sin,
    y: v.x * sin + v.y * cos,
  };
}

export function vec2Perp(v: Vector2D): Vector2D {
  return { x: -v.y, y: v.x };
}

export function vec2Lerp(a: Vector2D, b: Vector2D, t: number): Vector2D {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

export function normalizeAngle(angleRad: number): number {
  let a = angleRad % (2 * Math.PI);
  if (a > Math.PI) a -= 2 * Math.PI;
  else if (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

export function shortestAngleDiff(fromRad: number, toRad: number): number {
  return normalizeAngle(toRad - fromRad);
}

export const KNOTS_TO_MS = 0.514444;
export const MS_TO_KNOTS = 1 / KNOTS_TO_MS;

export function knotsToMs(knots: number): number {
  return knots * KNOTS_TO_MS;
}

export function msToKnots(ms: number): number {
  return ms * MS_TO_KNOTS;
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}
