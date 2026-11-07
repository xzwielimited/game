/**
 * 3-Layer Concurrent Sensor Suite, ASW Tactical Balance, ECM Jamming & Mercy Repair
 * Clean-Room implementation for NavalCommand.io (Milestone M3)
 *
 * Implements:
 * 1. Visual Sensor: Line-of-Sight raycasting blocked by islands; detects surface & periscope.
 * 2. Radar Sensor: Detects surface ships, missiles, aircraft; blocked by islands; degraded by ECM.
 * 3. Sonar Sensor: Passive cavitation model, Active 2x counter-detection ping, and persistent Sonar Buoys.
 * 4. High-Speed Aircraft vs Deep Silent Submarine Rule: Aircraft must slow/hover and deploy a Sonar Buoy.
 * 5. 5-State Track Confidence FSM (UNDETECTED -> FAINT_CONTACT -> AMBIGUOUS_TRACK -> FIRM_TRACK -> LOCKED_TARGET).
 * 6. ECM Jamming (5s active / 25s cooldown, 85% missile deflection, 60% radar range reduction).
 * 7. Mercy-Class Hospital Ship Repair (restores 50% hull HP to friendly vessels on 30s cooldown).
 */

import { Vector2D, vec2Distance, shortestAngleDiff, normalizeAngle } from '../math/vector2.js';
import { Polygon, isPointInsidePolygon } from '../math/polygon.js';
import { IslandEntity } from '../models/terrain.js';
import { SubmarineDepthState, DEPTH_PERISCOPE_METERS } from '../models/types.js';
import { CruiseMissileEntity, SonarBuoyEntity } from '../models/weapons.js';

export type SensorLayerType = 'VISUAL' | 'RADAR' | 'PASSIVE_SONAR' | 'ACTIVE_SONAR' | 'SONOBUOY';

export type TrackConfidenceState =
  | 'UNDETECTED'
  | 'FAINT_CONTACT'
  | 'AMBIGUOUS_TRACK'
  | 'FIRM_TRACK'
  | 'LOCKED_TARGET';

export interface SensorEntityState {
  id: string;
  position: Vector2D;
  velocity: Vector2D;
  speedKnots: number;
  depthState: SubmarineDepthState;
  depthMeters: number;
  radarCrossSection: number;
  cavitationThresholdKnots: number;
  isStealthCruiseActive: boolean;
  isActiveSonarPinging: boolean;
  ecmActive: boolean;
  visualRangeMeters?: number;
  radarRangeMeters?: number;
  passiveSonarRangeMeters?: number;
  activeSonarRangeMeters?: number;
}

export interface TrackedContact {
  targetId: string;
  detectedBy: SensorLayerType[];
  confidence: TrackConfidenceState;
  confidenceScore: number; // 0 to 100
  apparentPosition: Vector2D;
  distanceMeters: number;
  bearingRad: number;
}

/**
 * Checks whether a 2D line segment AB intersects segment CD.
 */
function segmentsIntersect(a: Vector2D, b: Vector2D, c: Vector2D, d: Vector2D): boolean {
  const ccw = (p1: Vector2D, p2: Vector2D, p3: Vector2D) =>
    (p3.y - p1.y) * (p2.x - p1.x) > (p2.y - p1.y) * (p3.x - p1.x);
  return ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d);
}

/**
 * Raycasts between observer and target to verify if an island polygon blocks Line-of-Sight (Visual / Radar / Acoustic).
 */
export function isLineOfSightClear(
  observerPos: Vector2D,
  targetPos: Vector2D,
  islands: IslandEntity[]
): boolean {
  for (const island of islands) {
    const verts = island.polygon.vertices;
    if (verts.length < 3) continue;

    // Check if midpoint or sample points fall inside polygon
    const mid: Vector2D = {
      x: (observerPos.x + targetPos.x) * 0.5,
      y: (observerPos.y + targetPos.y) * 0.5,
    };
    if (isPointInsidePolygon(mid, island.polygon)) {
      return false;
    }

    // Check segment intersection with polygon edges
    for (let i = 0; i < verts.length; i++) {
      const v1 = verts[i];
      const v2 = verts[(i + 1) % verts.length];
      if (segmentsIntersect(observerPos, targetPos, v1, v2)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Computes passive cavitation acoustic noise level:
 * Noise_cav = (speedKnots - cavitationThresholdKnots)^2.5 when speed > threshold and stealth cruise is OFF.
 */
export function calculateCavitationNoise(target: SensorEntityState): number {
  if (target.isStealthCruiseActive) {
    return 0;
  }
  const excessSpeed = target.speedKnots - target.cavitationThresholdKnots;
  if (excessSpeed <= 0) {
    return 0;
  }
  return Math.pow(excessSpeed, 2.5);
}

/**
 * Evaluates Visual Line-of-Sight detection.
 * Cannot detect DEEP submarines. Detects PERISCOPE submarines only at close range (<= 250m).
 */
export function evaluateVisualDetection(
  observer: SensorEntityState,
  target: SensorEntityState,
  islands: IslandEntity[] = []
): boolean {
  if (target.depthState === 'DEEP' || target.depthMeters < DEPTH_PERISCOPE_METERS) {
    return false;
  }

  const maxVisualRange = observer.visualRangeMeters ?? 650;
  const effectiveRange = target.depthState === 'PERISCOPE' ? Math.min(250, maxVisualRange * 0.4) : maxVisualRange;

  const dist = vec2Distance(observer.position, target.position);
  if (dist > effectiveRange) {
    return false;
  }

  return isLineOfSightClear(observer.position, target.position, islands);
}

/**
 * Evaluates Radar detection.
 * - Blocked by islands.
 * - Cannot detect DEEP submarines.
 * - Degraded by target's active ECM Jamming (reduces radar detection range to 40% of normal).
 */
export function evaluateRadarDetection(
  observer: SensorEntityState,
  target: SensorEntityState,
  islands: IslandEntity[] = []
): { detected: boolean; effectiveRadarRange: number; positionJitterMeters: number } {
  const baseRadarRange = observer.radarRangeMeters ?? 1400;

  // Target RCS scaling (standard ship RCS ~ 25..100, stealth frigate/Zumwalt RCS ~ 4..10, periscope ~ 2)
  const rcsFactor = target.depthState === 'PERISCOPE'
    ? 0.2
    : Math.max(0.35, Math.min(1.4, Math.pow(target.radarCrossSection / 35, 0.25)));

  // Active ECM Jamming reduces radar detection range by 60% (multiplier 0.40) and blurs target coordinates
  const ecmMultiplier = target.ecmActive ? 0.40 : 1.0;
  const effectiveRadarRange = baseRadarRange * rcsFactor * ecmMultiplier;

  if (target.depthState === 'DEEP' || target.depthMeters < DEPTH_PERISCOPE_METERS) {
    return { detected: false, effectiveRadarRange: 0, positionJitterMeters: 0 };
  }

  const dist = vec2Distance(observer.position, target.position);
  if (dist > effectiveRadarRange) {
    return { detected: false, effectiveRadarRange, positionJitterMeters: 0 };
  }

  if (!isLineOfSightClear(observer.position, target.position, islands)) {
    return { detected: false, effectiveRadarRange, positionJitterMeters: 0 };
  }

  const positionJitterMeters = target.ecmActive ? 85.0 : 0.0;
  return { detected: true, effectiveRadarRange, positionJitterMeters };
}

/**
 * Evaluates Passive & Active Sonar detection between two vessels.
 * - Passive Sonar detects cavitating vessels or vessels emitting active sonar pings (at 2x range!).
 * - Active Sonar reveals quiet DEEP/PERISCOPE submarines within activeSonarRange,
 *   while exposing the pinging observer at 2x activeSonarRange.
 */
export function evaluateSonarDetection(
  observer: SensorEntityState,
  target: SensorEntityState,
  islands: IslandEntity[] = [],
  sonobuoys: SonarBuoyEntity[] = []
): {
  passiveDetected: boolean;
  activeDetected: boolean;
  sonobuoyDetected: boolean;
  counterDetectedPinger: boolean;
} {
  const dist = vec2Distance(observer.position, target.position);
  const losClear = isLineOfSightClear(observer.position, target.position, islands);

  const basePassiveRange = observer.passiveSonarRangeMeters ?? 900;
  const baseActiveRange = observer.activeSonarRangeMeters ?? 1200;

  // 1. Counter-detection: If target is actively pinging sonar, observer hears it at 2x active sonar range!
  const counterDetectionRange = (target.activeSonarRangeMeters ?? 1200) * 2.0;
  const counterDetectedPinger = target.isActiveSonarPinging && losClear && dist <= counterDetectionRange;

  // 2. Passive Sonar: detects cavitation noise
  const cavNoise = calculateCavitationNoise(target);
  const passiveRange = cavNoise > 0
    ? basePassiveRange * Math.min(2.0, 0.7 + cavNoise * 0.05)
    : basePassiveRange * 0.22; // Quiet non-cavitating hull only heard at point-blank hydrophone range (~200m)

  const passiveDetected =
    counterDetectedPinger ||
    (losClear && (cavNoise > 0 ? dist <= passiveRange : (!target.isStealthCruiseActive && dist <= 180)));

  // 3. Active Sonar: Observer pings to illuminate silent submerged targets within baseActiveRange
  const activeDetected = observer.isActiveSonarPinging && losClear && dist <= baseActiveRange;

  // 4. Persistent Sonar Buoys: Detect any submerged or surface target within buoy radius (1,200m)
  let sonobuoyDetected = false;
  for (const buoy of sonobuoys) {
    if (buoy.isExpired) continue;
    if (vec2Distance(buoy.position, target.position) <= buoy.radius) {
      sonobuoyDetected = true;
      break;
    }
  }

  return {
    passiveDetected,
    activeDetected,
    sonobuoyDetected,
    counterDetectedPinger,
  };
}

/**
 * Enforces R2 Tactical Balance Rule:
 * High-speed aircraft flying overhead CANNOT automatically detect deep, silent
 * (non-cavitating, active-sensor-off) submarines; aircraft/ASW helicopters must
 * slow down or hover to deploy Sonar Buoys within detection range.
 */
export function evaluateAircraftSubmarineDetection(
  aircraftPosition: Vector2D,
  aircraftSpeedMs: number,
  isHoveringOrSlow: boolean,
  targetSub: SensorEntityState,
  deployedSonobuoys: SonarBuoyEntity[]
): { detected: boolean; method: 'VISUAL_SURFACE' | 'SONOBUOY' | 'NONE'; canDeployBuoyNow: boolean } {
  const MAX_BUOY_DEPLOY_SPEED_MS = 65.0; // Must be hovering or slow ASW speed
  const canDeployBuoyNow = isHoveringOrSlow || aircraftSpeedMs <= MAX_BUOY_DEPLOY_SPEED_MS;

  // If submarine is on SURFACE or PERISCOPE, aircraft can spot it visually/radar if in range
  const distToSub = vec2Distance(aircraftPosition, targetSub.position);
  if (targetSub.depthState === 'SURFACE' && distToSub <= 900) {
    return { detected: true, method: 'VISUAL_SURFACE', canDeployBuoyNow };
  }

  // Deep silent submarine (non-cavitating, active-sensor-off):
  // High-speed overhead flight CANNOT detect it without a deployed Sonar Buoy!
  const isDeep = targetSub.depthState === 'DEEP' || targetSub.depthMeters < DEPTH_PERISCOPE_METERS;
  const isSilent = calculateCavitationNoise(targetSub) === 0 && !targetSub.isActiveSonarPinging;

  for (const buoy of deployedSonobuoys) {
    if (buoy.isExpired) continue;
    if (vec2Distance(buoy.position, targetSub.position) <= buoy.radius) {
      return { detected: true, method: 'SONOBUOY', canDeployBuoyNow };
    }
  }

  if (isDeep && isSilent) {
    return { detected: false, method: 'NONE', canDeployBuoyNow };
  }

  // If cavitating loudly or pinging active sonar, nearby sonobuoy/hydrophone can pick it up
  return { detected: false, method: 'NONE', canDeployBuoyNow };
}

/**
 * 5-State Track Confidence Finite State Machine (FSM).
 */
export function mapScoreToTrackConfidence(score: number): TrackConfidenceState {
  if (score <= 0) return 'UNDETECTED';
  if (score < 30) return 'FAINT_CONTACT';
  if (score < 60) return 'AMBIGUOUS_TRACK';
  if (score < 85) return 'FIRM_TRACK';
  return 'LOCKED_TARGET';
}

export function stepTrackConfidenceScore(
  currentScore: number,
  activeLayers: SensorLayerType[],
  dt: number
): { score: number; state: TrackConfidenceState } {
  let nextScore = currentScore;

  if (activeLayers.length === 0) {
    // Decay track confidence when contact is lost
    nextScore = Math.max(0, currentScore - 25 * dt);
  } else {
    let gainRate = 0;
    if (activeLayers.includes('VISUAL')) gainRate += 50;
    if (activeLayers.includes('RADAR')) gainRate += 45;
    if (activeLayers.includes('ACTIVE_SONAR')) gainRate += 45;
    if (activeLayers.includes('SONOBUOY')) gainRate += 40;
    if (activeLayers.includes('PASSIVE_SONAR')) gainRate += 25;

    nextScore = Math.min(100, currentScore + gainRate * dt);
  }

  return {
    score: nextScore,
    state: mapScoreToTrackConfidence(nextScore),
  };
}

// ============================================================================
// ELECTRONIC WARFARE (ECM JAMMING) & MERCY HOSPITAL SHIP MECHANICS
// ============================================================================

export interface ECMJammerState {
  active: boolean;
  activeTimerRemaining: number; // 5.0s active duration
  cooldownRemaining: number;    // 25.0s cooldown
  deflectionProbability: number;// 0.85 (85% guided missile deflection)
  radarRangeMultiplier: number; // 0.40 (60% radar range reduction)
}

export function createECMJammerState(): ECMJammerState {
  return {
    active: false,
    activeTimerRemaining: 0,
    cooldownRemaining: 0,
    deflectionProbability: 0.85,
    radarRangeMultiplier: 0.40,
  };
}

export function triggerECMJammer(state: ECMJammerState): boolean {
  if (state.active || state.cooldownRemaining > 0) {
    return false;
  }
  state.active = true;
  state.activeTimerRemaining = 5.0;
  state.cooldownRemaining = 25.0;
  return true;
}

export function stepECMJammer(state: ECMJammerState, dt: number): void {
  if (state.active) {
    state.activeTimerRemaining = Math.max(0, state.activeTimerRemaining - dt);
    if (state.activeTimerRemaining <= 0) {
      state.active = false;
    }
  }
  if (state.cooldownRemaining > 0) {
    state.cooldownRemaining = Math.max(0, state.cooldownRemaining - dt);
  }
}

/**
 * Evaluates whether an incoming guided missile is deflected/spoofed by active ECM Jamming.
 */
export function evaluateECMDeflection(
  missile: CruiseMissileEntity,
  targetEcm: ECMJammerState,
  randomRoll = 0.5
): boolean {
  if (!targetEcm.active) return false;
  if (randomRoll < targetEcm.deflectionProbability) {
    missile.guidanceActive = false;
    missile.guidanceAborted = true;
    missile.heading = normalizeAngle(missile.heading + Math.PI * 0.45); // Spoofed veer-off
    return true;
  }
  return false;
}

export interface MercyRepairTenderState {
  cooldownRemaining: number;
  cooldownTotal: number;     // 30.0s cooldown
  repairRadiusMeters: number;// 250m tender radius
  healFraction: number;      // 0.50 (restores 50% maxHp)
}

export function createMercyRepairState(): MercyRepairTenderState {
  return {
    cooldownRemaining: 0,
    cooldownTotal: 30.0,
    repairRadiusMeters: 250.0,
    healFraction: 0.50,
  };
}

export function stepMercyRepairCooldown(state: MercyRepairTenderState, dt: number): void {
  if (state.cooldownRemaining > 0) {
    state.cooldownRemaining = Math.max(0, state.cooldownRemaining - dt);
  }
}

/**
 * Dispatches Mercy-class Hospital Ship rescue/repair tenders to restore 50% hull HP
 * to a damaged friendly vessel on a 30-second cooldown.
 */
export function executeMercyRepairPulse(
  hospitalPos: Vector2D,
  repairState: MercyRepairTenderState,
  friendlyTarget: { position: Vector2D; hullHp: number; maxHp: number }
): { repaired: boolean; hpRestored: number } {
  if (repairState.cooldownRemaining > 0) {
    return { repaired: false, hpRestored: 0 };
  }
  if (friendlyTarget.hullHp >= friendlyTarget.maxHp || friendlyTarget.hullHp <= 0) {
    return { repaired: false, hpRestored: 0 };
  }

  const dist = vec2Distance(hospitalPos, friendlyTarget.position);
  if (dist > repairState.repairRadiusMeters) {
    return { repaired: false, hpRestored: 0 };
  }

  const healAmount = Math.round(friendlyTarget.maxHp * repairState.healFraction);
  const previousHp = friendlyTarget.hullHp;
  friendlyTarget.hullHp = Math.min(friendlyTarget.maxHp, friendlyTarget.hullHp + healAmount);
  const hpRestored = friendlyTarget.hullHp - previousHp;

  repairState.cooldownRemaining = repairState.cooldownTotal;
  return { repaired: true, hpRestored };
}
