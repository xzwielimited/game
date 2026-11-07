/**
 * Core Physics & Entity Types
 * Clean-Room implementation for NavalCommand.io
 */

import { Vector2D } from '../math/vector2.js';

export type SubmarineDepthState = 'SURFACE' | 'PERISCOPE' | 'DEEP';

export const DEPTH_SURFACE_METERS = 0;
export const DEPTH_PERISCOPE_METERS = -5.0;
export const DEPTH_DEEP_METERS = -30.0;
export const SUB_DIVE_SURFACE_COOLDOWN = 5.0; // 4-6 seconds required (anti-dolphin-hop)

export interface PhysicsState {
  position: Vector2D;
  heading: number;                 // Radians [ -PI, PI ]
  linearVelocity: Vector2D;        // World coordinates (m/s)
  angularVelocity: number;         // rad/s
  rudderAngle: number;             // [-1.0, 1.0]
  throttle: number;                // [-0.5, 1.0]
  speedKnots: number;              // Current speed in knots
  surgeSpeed: number;              // Longitudinal velocity (m/s)
  swaySpeed: number;               // Lateral drift velocity (m/s)
  slipAngle: number;               // Radians beta = atan2(w, u)
  isGrounded: boolean;
  currentDepth: number;            // Meters: 0 (SURFACE), -5 (PERISCOPE), -30 (DEEP)
  depthState: SubmarineDepthState;
  targetDepthState: SubmarineDepthState;
  depthTransitionTimer: number;    // Dive/surface transition timer (seconds)
  stealthModeActive: boolean;
  isCavitationNoise: boolean;
  hullHp: number;
  maxHp: number;
  isDestroyed: boolean;
}

export interface CollisionResult {
  hasCollision: boolean;
  penetrationDepth: number;
  normal: Vector2D;
  contactPoint: Vector2D;
  impulse: number;
  damageA: number;
  damageB: number;
}
