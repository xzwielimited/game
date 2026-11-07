/**
 * 2D Polygon & Separating Axis Theorem (SAT) Collision
 * Clean-Room implementation for NavalCommand.io
 */

import { Vector2D, vec2, vec2Add, vec2Sub, vec2Dot, vec2Normalize, vec2Perp, vec2Rotate, vec2Scale, vec2LengthSq } from './vector2.js';

export interface Polygon {
  vertices: Vector2D[];
}

export interface SATResult {
  hasCollision: boolean;
  penetrationDepth: number;
  normal: Vector2D; // Normal points from Poly A to Poly B
  contactPoint: Vector2D;
}

/**
 * Creates an Oriented Bounding Box (OBB) polygon for a vessel.
 * The vessel is centered at `center`, rotated by `headingRad`.
 * Bow is forward along +X (at heading 0), beam is lateral along Y.
 */
export function createShipOBB(center: Vector2D, headingRad: number, length: number, beam: number): Polygon {
  const halfL = length / 2;
  const halfB = beam / 2;

  // Local corners: front-right, rear-right, rear-left, front-left
  const localCorners: Vector2D[] = [
    { x: halfL, y: halfB },
    { x: -halfL, y: halfB },
    { x: -halfL, y: -halfB },
    { x: halfL, y: -halfB },
  ];

  const vertices: Vector2D[] = localCorners.map(corner => {
    const rotated = vec2Rotate(corner, headingRad);
    return vec2Add(center, rotated);
  });

  return { vertices };
}

/**
 * Calculates SAT intersection between two convex polygons A and B.
 */
export function satPolygonIntersection(polyA: Polygon, polyB: Polygon): SATResult {
  const vertsA = polyA.vertices;
  const vertsB = polyB.vertices;

  let minPenetration = Number.POSITIVE_INFINITY;
  let collisionNormal: Vector2D = { x: 0, y: 0 };

  const getAxes = (verts: Vector2D[]): Vector2D[] => {
    const axes: Vector2D[] = [];
    for (let i = 0; i < verts.length; i++) {
      const p1 = verts[i];
      const p2 = verts[(i + 1) % verts.length];
      const edge = vec2Sub(p2, p1);
      if (vec2LengthSq(edge) < 1e-6) continue;
      const normal = vec2Normalize(vec2Perp(edge));
      axes.push(normal);
    }
    return axes;
  };

  const project = (verts: Vector2D[], axis: Vector2D): { min: number; max: number } => {
    let min = vec2Dot(verts[0], axis);
    let max = min;
    for (let i = 1; i < verts.length; i++) {
      const p = vec2Dot(verts[i], axis);
      if (p < min) min = p;
      if (p > max) max = p;
    }
    return { min, max };
  };

  const axes = [...getAxes(vertsA), ...getAxes(vertsB)];

  // Center vector from A to B to ensure consistent normal direction
  let centerA = vec2(0, 0);
  for (const v of vertsA) centerA = vec2Add(centerA, v);
  centerA = vec2Scale(centerA, 1 / vertsA.length);

  let centerB = vec2(0, 0);
  for (const v of vertsB) centerB = vec2Add(centerB, v);
  centerB = vec2Scale(centerB, 1 / vertsB.length);

  const dirAB = vec2Sub(centerB, centerA);

  for (const axis of axes) {
    const projA = project(vertsA, axis);
    const projB = project(vertsB, axis);

    const overlap = Math.min(projA.max, projB.max) - Math.max(projA.min, projB.min);
    if (overlap <= 0) {
      // Separating axis found: no collision
      return {
        hasCollision: false,
        penetrationDepth: 0,
        normal: { x: 0, y: 0 },
        contactPoint: { x: 0, y: 0 },
      };
    }

    if (overlap < minPenetration) {
      minPenetration = overlap;
      // Ensure normal points from A to B
      if (vec2Dot(axis, dirAB) < 0) {
        collisionNormal = { x: -axis.x, y: -axis.y };
      } else {
        collisionNormal = axis;
      }
    }
  }

  // Approximate contact point as the midpoint of deep penetrating vertices
  let contactPoint = vec2(0, 0);
  let contactCount = 0;

  for (const v of vertsA) {
    if (isPointInsidePolygon(v, polyB)) {
      contactPoint = vec2Add(contactPoint, v);
      contactCount++;
    }
  }
  for (const v of vertsB) {
    if (isPointInsidePolygon(v, polyA)) {
      contactPoint = vec2Add(contactPoint, v);
      contactCount++;
    }
  }

  if (contactCount > 0) {
    contactPoint = vec2Scale(contactPoint, 1 / contactCount);
  } else {
    // Fallback: interpolate center points
    contactPoint = vec2Scale(vec2Add(centerA, centerB), 0.5);
  }

  return {
    hasCollision: true,
    penetrationDepth: minPenetration,
    normal: collisionNormal,
    contactPoint,
  };
}

/**
 * Standard ray-casting test for point inside polygon.
 */
export function isPointInsidePolygon(point: Vector2D, poly: Polygon): boolean {
  const verts = poly.vertices;
  let inside = false;
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    const xi = verts[i].x;
    const yi = verts[i].y;
    const xj = verts[j].x;
    const yj = verts[j].y;

    const intersect = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
