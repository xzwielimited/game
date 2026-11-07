/**
 * Deterministic 2D Naval Hydrodynamics Simulation Engine
 * Clean-Room implementation for NavalCommand.io
 */

import { Vector2D, vec2, normalizeAngle, msToKnots, knotsToMs } from '../math/vector2.js';
import { ShipDef } from '../models/ships.js';
import {
  PhysicsState,
  SubmarineDepthState,
  DEPTH_SURFACE_METERS,
  DEPTH_PERISCOPE_METERS,
  DEPTH_DEEP_METERS,
  SUB_DIVE_SURFACE_COOLDOWN,
} from '../models/types.js';

export function createInitialPhysicsState(
  shipDef: ShipDef,
  spawnPos: Vector2D,
  headingRad = 0
): PhysicsState {
  return {
    position: { ...spawnPos },
    heading: normalizeAngle(headingRad),
    linearVelocity: vec2(0, 0),
    angularVelocity: 0,
    rudderAngle: 0,
    throttle: 0,
    speedKnots: 0,
    surgeSpeed: 0,
    swaySpeed: 0,
    slipAngle: 0,
    isGrounded: false,
    currentDepth: DEPTH_SURFACE_METERS,
    depthState: 'SURFACE',
    targetDepthState: 'SURFACE',
    depthTransitionTimer: 0,
    stealthModeActive: false,
    isCavitationNoise: false,
    hullHp: shipDef.maxHp,
    maxHp: shipDef.maxHp,
    isDestroyed: false,
  };
}

/**
 * Commands a submarine to transition to a target depth state.
 * Enforces the 4-6s transition cooldown to prevent rapid surface-fire-dive toggling (anti-dolphin-hop).
 */
export function commandDepthState(
  shipDef: ShipDef,
  state: PhysicsState,
  targetDepth: SubmarineDepthState
): boolean {
  if (!shipDef.canSubmerge) {
    return false;
  }

  if (state.depthState === targetDepth && state.depthTransitionTimer <= 0) {
    return true; // Already at target depth
  }

  // Prevent spamming commands while a transition is underway
  if (state.depthTransitionTimer > 0 && state.targetDepthState === targetDepth) {
    return false;
  }

  state.targetDepthState = targetDepth;
  state.depthTransitionTimer = SUB_DIVE_SURFACE_COOLDOWN;
  return true;
}

/**
 * Toggles submarine stealth cruise mode.
 * When enabled, speed is capped below the cavitation threshold.
 */
export function toggleStealthMode(
  shipDef: ShipDef,
  state: PhysicsState,
  enabled?: boolean
): boolean {
  state.stealthModeActive = enabled !== undefined ? enabled : !state.stealthModeActive;
  return state.stealthModeActive;
}

/**
 * Step the deterministic 2D hydrodynamics for a single timestep dt.
 */
export function updateHydrodynamics(
  shipDef: ShipDef,
  state: PhysicsState,
  throttleInput: number,
  rudderInput: number,
  dt: number
): void {
  if (state.isDestroyed) {
    state.linearVelocity = vec2(0, 0);
    state.angularVelocity = 0;
    state.speedKnots = 0;
    return;
  }

  // 1. Clamp inputs
  const clampedThrottle = Math.max(-0.5, Math.min(1.0, throttleInput));
  const clampedRudder = Math.max(-1.0, Math.min(1.0, rudderInput));
  state.throttle = clampedThrottle;
  state.rudderAngle = clampedRudder;

  // 2. Submarine depth transition timer
  if (state.depthTransitionTimer > 0) {
    state.depthTransitionTimer = Math.max(0, state.depthTransitionTimer - dt);
    if (state.depthTransitionTimer <= 1e-6) {
      state.depthTransitionTimer = 0;
      state.depthState = state.targetDepthState;
      if (state.depthState === 'SURFACE') state.currentDepth = DEPTH_SURFACE_METERS;
      else if (state.depthState === 'PERISCOPE') state.currentDepth = DEPTH_PERISCOPE_METERS;
      else if (state.depthState === 'DEEP') state.currentDepth = DEPTH_DEEP_METERS;
    }
  }

  // 3. Coordinate Transformation: World velocity to Body frame (Surge u, Sway w)
  const cosH = Math.cos(state.heading);
  const sinH = Math.sin(state.heading);

  let u = state.linearVelocity.x * cosH + state.linearVelocity.y * sinH;
  let w = -state.linearVelocity.x * sinH + state.linearVelocity.y * cosH;

  // 4. Maximum speed adjustments based on depth & stealth mode
  let effectiveMaxForwardSpeed = shipDef.maxForwardSpeed;
  let effectiveMaxReverseSpeed = shipDef.maxReverseSpeed;

  if (shipDef.canSubmerge) {
    if (state.depthState === 'PERISCOPE') {
      effectiveMaxForwardSpeed *= 0.85;
    } else if (state.depthState === 'DEEP') {
      // Modern nuclear submarines are faster submerged; diesel subs are slower
      if (shipDef.traits.includes('HIGH_SUBMERGED_SPEED') || shipDef.traits.includes('NUCLEAR_SUBMERSIBLE')) {
        effectiveMaxForwardSpeed *= 1.65;
      } else {
        effectiveMaxForwardSpeed *= 0.60;
      }
    }
  }

  // Stealth cruise speed cap (below cavitation threshold)
  if (state.stealthModeActive) {
    effectiveMaxForwardSpeed = Math.min(effectiveMaxForwardSpeed, shipDef.cavitationThresholdSpeed * 0.95);
  }

  // 5. Propulsion & Thrust
  let targetSurgeSpeed = 0;
  if (clampedThrottle > 0) {
    targetSurgeSpeed = clampedThrottle * effectiveMaxForwardSpeed;
  } else if (clampedThrottle < 0) {
    targetSurgeSpeed = clampedThrottle * 2 * effectiveMaxReverseSpeed; // -0.5 maps to full reverse speed
  }

  // Acceleration / Deceleration
  if (targetSurgeSpeed > u) {
    u = Math.min(targetSurgeSpeed, u + shipDef.accelerationRate * dt);
  } else if (targetSurgeSpeed < u) {
    u = Math.max(targetSurgeSpeed, u - shipDef.decelerationRate * dt);
  }

  // 6. Rudder Dynamics & Yaw Rate
  // Rudder effectiveness is proportional to forward water flow over the rudder,
  // enhanced at zero/low speed by propeller wash from active thrust:
  const speedRatio = Math.max(
    0.35,
    Math.min(
      1.0,
      (Math.abs(u) + Math.abs(clampedThrottle) * 0.35) / Math.max(0.1, shipDef.maxForwardSpeed)
    )
  );
  const reverseFactor = u < 0 ? -1 : 1;
  const targetAngularVelocity = clampedRudder * shipDef.turnRateMax * speedRatio * reverseFactor;

  // Angular inertia smoothing
  const rotAccel = shipDef.turnRateMax * 3.0;
  if (targetAngularVelocity > state.angularVelocity) {
    state.angularVelocity = Math.min(targetAngularVelocity, state.angularVelocity + rotAccel * dt);
  } else if (targetAngularVelocity < state.angularVelocity) {
    state.angularVelocity = Math.max(targetAngularVelocity, state.angularVelocity - rotAccel * dt);
  }

  // 7. Hydrodynamic Drift & Quadratic Lateral Drag
  // Turning introduces outward centripetal lateral sway velocity: w_induced = -u * omega * driftCoeff
  const inducedSway = -u * state.angularVelocity * shipDef.driftCoefficient * 0.8;
  w += inducedSway * dt;

  // Lateral quadratic and linear resistance prevents pure sliding
  const cQuadSway = 0.25;
  w -= Math.sign(w) * (cQuadSway * w * w + 1.5 * Math.abs(w)) * dt;

  // Turning speed loss: sustained hard turns bleed 25-30% of forward speed
  if (Math.abs(state.angularVelocity) > 0.01) {
    const turnSeverity = Math.abs(state.angularVelocity) / shipDef.turnRateMax;
    const turnSpeedLoss = turnSeverity * 0.28 * dt;
    u *= Math.max(0.70, 1.0 - turnSpeedLoss);
  }

  // 8. Grounding friction (if grounded on shallow seabed)
  if (state.isGrounded) {
    u *= Math.max(0, 1.0 - 4.0 * dt);
    w *= Math.max(0, 1.0 - 5.0 * dt);
    state.angularVelocity *= Math.max(0, 1.0 - 4.0 * dt);
  }

  // 9. Update slip angle beta = atan2(w, u)
  state.surgeSpeed = u;
  state.swaySpeed = w;
  state.slipAngle = Math.abs(u) > 0.01 ? Math.atan2(w, u) : 0;

  // 10. Transform body velocities back to world space
  state.linearVelocity = {
    x: u * cosH - w * sinH,
    y: u * sinH + w * cosH,
  };

  const totalSpeedMs = Math.sqrt(state.linearVelocity.x * state.linearVelocity.x + state.linearVelocity.y * state.linearVelocity.y);
  state.speedKnots = msToKnots(totalSpeedMs);

  // 11. Cavitation check
  state.isCavitationNoise =
    totalSpeedMs > shipDef.cavitationThresholdSpeed &&
    !state.stealthModeActive &&
    state.depthState !== 'SURFACE';

  // 12. Integrate heading and position
  state.heading = normalizeAngle(state.heading + state.angularVelocity * dt);
  state.position.x += state.linearVelocity.x * dt;
  state.position.y += state.linearVelocity.y * dt;
}
