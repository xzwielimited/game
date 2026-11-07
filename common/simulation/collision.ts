/**
 * Mass-Based Momentum Transfer & SAT Polygon Collision Solver
 * Clean-Room implementation for NavalCommand.io
 */

import {
  Vector2D,
  vec2,
  vec2Add,
  vec2Sub,
  vec2Scale,
  vec2Dot,
  vec2Cross,
  vec2Length,
} from '../math/vector2.js';
import { createShipOBB, satPolygonIntersection, Polygon } from '../math/polygon.js';
import { ShipDef } from '../models/ships.js';
import { PhysicsState, CollisionResult } from '../models/types.js';

export const RESTITUTION_SHIP_TO_SHIP = 0.15;
export const RESTITUTION_SHIP_TO_STATIC = 0.05;

/**
 * Calculates moment of inertia for an equivalent rectangular hull.
 * I_zz = (1/12) * M * (L^2 + B^2)
 */
export function calculateMomentOfInertia(massKg: number, length: number, beam: number): number {
  return (1 / 12) * massKg * (length * length + beam * beam);
}

/**
 * Resolves collision between two surface vessels using mass-based momentum transfer.
 */
export function resolveShipToShipCollision(
  defA: ShipDef,
  stateA: PhysicsState,
  defB: ShipDef,
  stateB: PhysicsState
): CollisionResult {
  if (stateA.isDestroyed || stateB.isDestroyed) {
    return {
      hasCollision: false,
      penetrationDepth: 0,
      normal: vec2(0, 0),
      contactPoint: vec2(0, 0),
      impulse: 0,
      damageA: 0,
      damageB: 0,
    };
  }

  // If one vessel is submerged deep and the other is surfaced, no horizontal collision occurs
  if (
    (stateA.depthState === 'DEEP' && stateB.depthState === 'SURFACE') ||
    (stateB.depthState === 'DEEP' && stateA.depthState === 'SURFACE')
  ) {
    return {
      hasCollision: false,
      penetrationDepth: 0,
      normal: vec2(0, 0),
      contactPoint: vec2(0, 0),
      impulse: 0,
      damageA: 0,
      damageB: 0,
    };
  }

  const polyA = createShipOBB(stateA.position, stateA.heading, defA.length, defA.beam);
  const polyB = createShipOBB(stateB.position, stateB.heading, defB.length, defB.beam);

  const sat = satPolygonIntersection(polyA, polyB);
  if (!sat.hasCollision) {
    return {
      hasCollision: false,
      penetrationDepth: 0,
      normal: vec2(0, 0),
      contactPoint: vec2(0, 0),
      impulse: 0,
      damageA: 0,
      damageB: 0,
    };
  }

  let normal = sat.normal; // Points from A to B
  let penetrationDepth = sat.penetrationDepth;
  const contactPoint = sat.contactPoint;

  // Guard longitudinal SAT overlap: ensure normal does not flip to lateral axis during deep penetration
  const dirAB = vec2Sub(stateB.position, stateA.position);
  const distAB = vec2Length(dirAB);
  if (distAB > 1e-4) {
    const dirABNorm = vec2Scale(dirAB, 1 / distAB);
    // If SAT normal flipped nearly orthogonal to vessel center-to-center direction
    if (Math.abs(vec2Dot(normal, dirABNorm)) < 0.5) {
      normal = dirABNorm;
      // Recalculate penetration depth along dirABNorm
      let minA = Number.POSITIVE_INFINITY;
      let maxA = Number.NEGATIVE_INFINITY;
      for (const v of polyA.vertices) {
        const p = vec2Dot(v, dirABNorm);
        if (p < minA) minA = p;
        if (p > maxA) maxA = p;
      }
      let minB = Number.POSITIVE_INFINITY;
      let maxB = Number.NEGATIVE_INFINITY;
      for (const v of polyB.vertices) {
        const p = vec2Dot(v, dirABNorm);
        if (p < minB) minB = p;
        if (p > maxB) maxB = p;
      }
      const longOverlap = Math.min(maxA, maxB) - Math.max(minA, minB);
      if (longOverlap > 0) {
        penetrationDepth = longOverlap;
      }
    }
  }

  // Convert tonnes to kilograms
  const massA = defA.mass * 1000;
  const massB = defB.mass * 1000;
  const invMassA = 1 / massA;
  const invMassB = 1 / massB;
  const totalInvMass = invMassA + invMassB;

  // 1. Positional correction to resolve penetration
  const percent = 0.8; // Positional correction baumgarte factor
  const slop = 0.01;
  const correctionMagnitude = (Math.max(penetrationDepth - slop, 0) / totalInvMass) * percent;
  const correction = vec2Scale(normal, correctionMagnitude);

  stateA.position = vec2Sub(stateA.position, vec2Scale(correction, invMassA));
  stateB.position = vec2Add(stateB.position, vec2Scale(correction, invMassB));

  // 2. Lever arms from center of mass to contact point
  const rA = vec2Sub(contactPoint, stateA.position);
  const rB = vec2Sub(contactPoint, stateB.position);

  // Moments of inertia
  const inertiaA = calculateMomentOfInertia(massA, defA.length, defA.beam);
  const inertiaB = calculateMomentOfInertia(massB, defB.length, defB.beam);

  // 3. Relative contact velocity:
  // v_contact = v + omega x r (in 2D: omega x r = (-omega * r.y, omega * r.x))
  const vContactA: Vector2D = {
    x: stateA.linearVelocity.x - stateA.angularVelocity * rA.y,
    y: stateA.linearVelocity.y + stateA.angularVelocity * rA.x,
  };
  const vContactB: Vector2D = {
    x: stateB.linearVelocity.x - stateB.angularVelocity * rB.y,
    y: stateB.linearVelocity.y + stateB.angularVelocity * rB.x,
  };

  const vRel = vec2Sub(vContactB, vContactA);
  const vRelNormal = vec2Dot(vRel, normal);

  // If moving away from each other, do not apply impulse
  if (vRelNormal > 0) {
    return {
      hasCollision: true,
      penetrationDepth,
      normal,
      contactPoint,
      impulse: 0,
      damageA: 0,
      damageB: 0,
    };
  }

  // 4. Impulse calculation
  const rACrossN = vec2Cross(rA, normal);
  const rBCrossN = vec2Cross(rB, normal);
  const rotFactorA = (rACrossN * rACrossN) / inertiaA;
  const rotFactorB = (rBCrossN * rBCrossN) / inertiaB;

  const e = RESTITUTION_SHIP_TO_SHIP;
  const impulseMag = -(1 + e) * vRelNormal / (invMassA + invMassB + rotFactorA + rotFactorB);
  const impulse = vec2Scale(normal, impulseMag);

  // 5. Apply linear impulses
  stateA.linearVelocity = vec2Sub(stateA.linearVelocity, vec2Scale(impulse, invMassA));
  stateB.linearVelocity = vec2Add(stateB.linearVelocity, vec2Scale(impulse, invMassB));

  // 6. Apply angular impulses
  const torqueA = -vec2Cross(rA, impulse);
  const torqueB = vec2Cross(rB, impulse);
  stateA.angularVelocity += torqueA / inertiaA;
  stateB.angularVelocity += torqueB / inertiaB;

  // 7. Ramming damage calculation
  const deltaVA = impulseMag * invMassA;
  const deltaVB = impulseMag * invMassB;
  const baseDamageA = (impulseMag * deltaVA * 50) / (1000 * (1 + defA.armor * 0.02));
  const baseDamageB = (impulseMag * deltaVB * 50) / (1000 * (1 + defB.armor * 0.02));

  let multA = 1.0;
  let multB = 1.0;

  // Check icebreaker / ramming prow multipliers
  if (defA.isIcebreaker || defA.traits.includes('ICE_RAMMING_PROW') || defA.traits.includes('NUCLEAR_RAMMING_BOW')) {
    multA = 0.25; // 75% self-damage reduction
    multB *= 2.5; // 2.5x damage inflicted on opponent
  }

  if (defB.isIcebreaker || defB.traits.includes('ICE_RAMMING_PROW') || defB.traits.includes('NUCLEAR_RAMMING_BOW')) {
    multB = 0.25;
    multA *= 2.5;
  }

  const finalDamageA = Math.round(baseDamageA * multA);
  const finalDamageB = Math.round(baseDamageB * multB);

  stateA.hullHp = Math.max(0, stateA.hullHp - finalDamageA);
  stateB.hullHp = Math.max(0, stateB.hullHp - finalDamageB);

  if (stateA.hullHp <= 0) stateA.isDestroyed = true;
  if (stateB.hullHp <= 0) stateB.isDestroyed = true;

  return {
    hasCollision: true,
    penetrationDepth,
    normal,
    contactPoint,
    impulse: impulseMag,
    damageA: finalDamageA,
    damageB: finalDamageB,
  };
}

/**
 * Resolves collision between a vessel and an immovable static island polygon.
 */
export function resolveShipToIslandCollision(
  shipDef: ShipDef,
  state: PhysicsState,
  islandPolygon: Polygon
): CollisionResult {
  if (state.isDestroyed) {
    return {
      hasCollision: false,
      penetrationDepth: 0,
      normal: vec2(0, 0),
      contactPoint: vec2(0, 0),
      impulse: 0,
      damageA: 0,
      damageB: 0,
    };
  }

  const polyA = createShipOBB(state.position, state.heading, shipDef.length, shipDef.beam);
  const sat = satPolygonIntersection(polyA, islandPolygon);

  if (!sat.hasCollision) {
    return {
      hasCollision: false,
      penetrationDepth: 0,
      normal: vec2(0, 0),
      contactPoint: vec2(0, 0),
      impulse: 0,
      damageA: 0,
      damageB: 0,
    };
  }

  const normal = sat.normal; // Normal pointing from ship into island
  const massKg = shipDef.mass * 1000;
  const invMass = 1 / massKg;
  const inertia = calculateMomentOfInertia(massKg, shipDef.length, shipDef.beam);

  // Positional pushout
  const correction = vec2Scale(normal, -sat.penetrationDepth * 1.05);
  state.position = vec2Add(state.position, correction);

  // Velocity along normal
  const vDotN = vec2Dot(state.linearVelocity, normal);
  let damage = 0;
  let impulseMag = 0;

  if (vDotN > 0) {
    const e = RESTITUTION_SHIP_TO_STATIC;
    impulseMag = (1 + e) * vDotN * massKg;

    // Apply linear rebound
    state.linearVelocity = vec2Sub(state.linearVelocity, vec2Scale(normal, (1 + e) * vDotN));
    state.angularVelocity *= 0.5;

    // Island collision damage proportional to kinetic energy of impact
    const impactSpeed = vDotN;
    damage = Math.round((0.5 * massKg * impactSpeed * impactSpeed) / (40000 * (1 + shipDef.armor * 0.03)));
    state.hullHp = Math.max(0, state.hullHp - damage);
    if (state.hullHp <= 0) state.isDestroyed = true;
  }

  return {
    hasCollision: true,
    penetrationDepth: sat.penetrationDepth,
    normal,
    contactPoint: sat.contactPoint,
    impulse: impulseMag,
    damageA: damage,
    damageB: 0,
  };
}
