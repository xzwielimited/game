/**
 * Weapon Kinematics, Ballistic Solvers & Tactical Equipment Engine
 * Clean-Room implementation for NavalCommand.io
 *
 * Implements all 10 specialized naval weapon and tactical equipment categories:
 * 1. Naval Artillery Turrets (caliber scaling, dispersion ellipses, parabolic flight arcs)
 * 2. Torpedoes & Decoys (straight-running, acoustic seeker cone +/-35 deg, decoy diversion)
 * 3. Cruise Missiles (boost, midcourse, terminal, submarine dive guidance cutoff at < -5.0m)
 * 4. Rocket Barrages (high-rate unguided rocket saturation salvos)
 * 5. Rocket Torpedoes (ASROC standoff air boost -> water entry -> acoustic homing)
 * 6. SAM & CIWS Point-Defense (rapid-fire CIWS & SAM intercepting missiles/aircraft)
 * 7. ASW Depth Charges (sink rate 3.5 m/s, hydrostatic pressure fuses, proximity triggers)
 * 8. Naval Mines (5s arming delay, contact trigger, magnetic influence trigger, flooding penalty)
 * 9. Aircraft Squadrons & ASW Sonar Buoys (cursor flight paths, 1200m radius, 75s duration)
 * 10. Hydraulic Dredging & Sand Depositor Tool (excavating to 15m, depositing sand to 1-5m)
 */

import {
  Vector2D,
  vec2,
  vec2Add,
  vec2Sub,
  vec2Scale,
  vec2Length,
  vec2Distance,
  vec2Normalize,
  shortestAngleDiff,
  normalizeAngle,
  degToRad,
  knotsToMs,
} from '../math/vector2.js';

import {
  WeaponCategory,
  WeaponDef,
  WeaponMountDef,
  isAngleWithinMountArc,
  stepMountTraverse,
  stepMountReloadAndRegen,
  canMountFire,
  fireMount,
  WEAPON_DEFINITIONS,
  ArtilleryShellEntity,
  TorpedoEntity,
  TorpedoDecoyEntity,
  CruiseMissileEntity,
  RocketEntity,
  RocketTorpedoEntity,
  SAMInterceptorEntity,
  CIWSBurstEntity,
  DepthChargeEntity,
  NavalMineEntity,
  AircraftEntity,
  SonarBuoyEntity,
  DredgerToolAction,
  AcousticContact,
  SubmarineContact,
  SurfaceVesselContact,
  ThreatTarget,
} from '../models/weapons.js';

import { TerrainEngine, TerrainModification } from './terrain_engine.js';
import { DEPTH_PERISCOPE_METERS } from '../models/types.js';

// ============================================================================
// 1. NAVAL ARTILLERY TURRETS & BALLISTIC SOLVERS
// ============================================================================

export interface DispersionEllipse {
  semiMajorAxis: number; // Radial along line of fire (meters)
  semiMinorAxis: number; // Lateral cross-range (meters)
}

/**
 * Calculates Gaussian dispersion ellipse semi-axes for artillery shells.
 * Semi-major axis sigma_r = 0.025 * distance
 * Semi-minor axis sigma_theta = 0.012 * distance
 */
export function calculateDispersionEllipse(distanceMeters: number): DispersionEllipse {
  return {
    semiMajorAxis: 0.025 * distanceMeters,
    semiMinorAxis: 0.012 * distanceMeters,
  };
}

/**
 * Calculates the ballistic flight time of an artillery shell.
 * tau = distance / muzzleSpeed
 */
export function calculateBallisticFlightTime(distanceMeters: number, muzzleSpeed: number): number {
  if (muzzleSpeed <= 0) return 0;
  return distanceMeters / muzzleSpeed;
}

/**
 * Calculates the dispersion offset vector relative to the line of fire.
 * @param distanceMeters Distance from gun to target
 * @param radialNorm Normalized radial deviation [-1.0, 1.0] (defaults to 0 for deterministic testing)
 * @param crossNorm Normalized cross-range deviation [-1.0, 1.0] (defaults to 0 for deterministic testing)
 */
export function calculateDispersionOffset(
  distanceMeters: number,
  radialNorm = 0,
  crossNorm = 0
): { dr: number; dtheta: number } {
  const ellipse = calculateDispersionEllipse(distanceMeters);
  return {
    dr: ellipse.semiMajorAxis * radialNorm,
    dtheta: ellipse.semiMinorAxis * crossNorm,
  };
}

/**
 * Calculates the exact impact coordinates of a shell applying dispersion.
 */
export function calculateShellImpactPosition(
  origin: Vector2D,
  targetPos: Vector2D,
  dispersion = { dr: 0, dtheta: 0 }
): Vector2D {
  const dx = targetPos.x - origin.x;
  const dy = targetPos.y - origin.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 1e-6) {
    return { ...targetPos };
  }

  // Unit vector along line of fire
  const uDirX = dx / dist;
  const uDirY = dy / dist;

  // Unit vector perpendicular to line of fire (port side)
  const uPerpX = -uDirY;
  const uPerpY = uDirX;

  return {
    x: targetPos.x + uDirX * dispersion.dr + uPerpX * dispersion.dtheta,
    y: targetPos.y + uDirY * dispersion.dr + uPerpY * dispersion.dtheta,
  };
}

/**
 * Calculates the instantaneous altitude of a shell along its parabolic trajectory.
 * z(t) = 4 * h_peak * (t / t_flight) * (1 - t / t_flight)
 */
export function calculateShellAltitude(
  flightTimeTotal: number,
  timeElapsed: number,
  peakAltitude: number
): number {
  if (flightTimeTotal <= 0) return 0;
  const ratio = Math.max(0, Math.min(1.0, timeElapsed / flightTimeTotal));
  return 4.0 * peakAltitude * ratio * (1.0 - ratio);
}

/**
 * Calculates the terminal plunging angle of a shell at impact.
 */
export function calculatePlungeAngleRad(peakAltitude: number, distanceMeters: number): number {
  if (distanceMeters <= 0) return Math.PI / 2;
  // Based on derivative of parabola at impact: tan(theta) = 4 * h_peak / distance
  return Math.atan((4.0 * peakAltitude) / distanceMeters);
}

/**
 * Creates an ArtilleryShellEntity with authentic caliber scaling.
 */
export function createArtilleryShell(
  id: string,
  shooterId: string,
  mountId: string,
  origin: Vector2D,
  targetPos: Vector2D,
  weaponDef: WeaponDef,
  dispersion = { dr: 0, dtheta: 0 }
): ArtilleryShellEntity {
  const impactPos = calculateShellImpactPosition(origin, targetPos, dispersion);
  const dist = vec2Distance(origin, impactPos);
  const flightTimeTotal = calculateBallisticFlightTime(dist, weaponDef.projectileSpeed);

  // Peak altitude scales with caliber and distance (simulating high-caliber plunging fire)
  const caliber = weaponDef.caliberMm ?? 100;
  const peakAltitude = Math.max(8.0, 0.5 * 9.81 * Math.pow(flightTimeTotal / 2, 2) * (caliber / 127.0));
  const plungeAngleRad = calculatePlungeAngleRad(peakAltitude, dist);

  // Blast radius scales with caliber (e.g. 20mm -> 4m, 460mm -> 45m)
  const blastRadius = Math.max(3.0, (caliber / 460.0) * 45.0);

  return {
    id,
    shooterId,
    mountId,
    origin: { ...origin },
    targetPos: impactPos,
    currentPos: { ...origin },
    muzzleSpeed: weaponDef.projectileSpeed,
    caliberMm: caliber,
    flightTimeTotal,
    timeElapsed: 0,
    altitude: 0,
    peakAltitude,
    plungeAngleRad,
    damage: weaponDef.baseDamage,
    blastRadius,
    dispersionOffset: { x: dispersion.dr, y: dispersion.dtheta },
    isDetonated: false,
  };
}

/**
 * Advances an artillery shell along its ballistic trajectory for one tick.
 */
export function stepArtilleryShell(
  shell: ArtilleryShellEntity,
  dt: number
): { detonated: boolean; impactPos?: Vector2D } {
  if (shell.isDetonated) {
    return { detonated: false };
  }

  shell.timeElapsed += dt;
  const tRatio = Math.min(1.0, shell.timeElapsed / shell.flightTimeTotal);

  // Update 2D horizontal coordinates
  shell.currentPos.x = shell.origin.x + (shell.targetPos.x - shell.origin.x) * tRatio;
  shell.currentPos.y = shell.origin.y + (shell.targetPos.y - shell.origin.y) * tRatio;

  // Update parabolic vertical altitude
  shell.altitude = calculateShellAltitude(shell.flightTimeTotal, shell.timeElapsed, shell.peakAltitude);

  if (shell.timeElapsed >= shell.flightTimeTotal) {
    shell.isDetonated = true;
    shell.currentPos = { ...shell.targetPos };
    shell.altitude = 0;
    return { detonated: true, impactPos: { ...shell.targetPos } };
  }

  return { detonated: false };
}

// ============================================================================
// 2. TORPEDOES & ACOUSTIC DECOYS
// ============================================================================

/**
 * Creates a TorpedoEntity (straight-running or acoustic homing).
 */
export function createTorpedo(
  id: string,
  shooterId: string,
  mountId: string,
  position: Vector2D,
  heading: number,
  isAcousticHoming = false,
  customDef?: Partial<WeaponDef>
): TorpedoEntity {
  const speed = customDef?.projectileSpeed ?? (isAcousticHoming ? knotsToMs(38) : knotsToMs(48)); // 19.5 m/s vs 24.7 m/s
  const maxRange = customDef?.maxRange ?? (isAcousticHoming ? 2200 : 2500);
  const damage = customDef?.baseDamage ?? (isAcousticHoming ? 950 : 1250);

  return {
    id,
    shooterId,
    mountId,
    position: { ...position },
    velocity: { x: Math.cos(heading) * speed, y: Math.sin(heading) * speed },
    heading,
    speed,
    maxRange,
    distanceTraveled: 0,
    damage,
    isAcousticHoming,
    armingDistance: 300.0, // 300m arming run
    isArmed: !isAcousticHoming, // Straight running torpedoes arm immediately
    seekerConeAngleRad: degToRad(70), // +/- 35 deg cone
    seekerRange: 600.0,
    turnRateMax: degToRad(20), // 20 deg/s turn rate
    isSpoofedByDecoy: false,
    isDetonated: false,
    isDud: false,
  };
}

/**
 * Creates a TorpedoDecoyEntity (acoustic noisemaker).
 */
export function createTorpedoDecoy(
  id: string,
  deployerId: string,
  position: Vector2D,
  heading: number,
  driftSpeed = 1.5,
  duration = 25.0
): TorpedoDecoyEntity {
  return {
    id,
    deployerId,
    position: { ...position },
    velocity: { x: Math.cos(heading) * driftSpeed, y: Math.sin(heading) * driftSpeed },
    heading,
    driftSpeed,
    durationRemaining: duration,
    acousticSignatureDb: 120.0, // Loud noisemaker overpowering vessel noise
    attractionRadius: 500.0,    // 500m spoofing radius
    isExpired: false,
  };
}

/**
 * Advances a TorpedoDecoyEntity for one tick.
 */
export function stepTorpedoDecoy(decoy: TorpedoDecoyEntity, dt: number): void {
  if (decoy.isExpired) return;

  decoy.position.x += decoy.velocity.x * dt;
  decoy.position.y += decoy.velocity.y * dt;
  decoy.durationRemaining -= dt;

  if (decoy.durationRemaining <= 0) {
    decoy.isExpired = true;
  }
}

/**
 * Advances a TorpedoEntity for one tick with acoustic seeker cone evaluation and decoy spoofing.
 */
export function stepTorpedo(
  torpedo: TorpedoEntity,
  dt: number,
  contacts: AcousticContact[] = [],
  decoys: TorpedoDecoyEntity[] = []
): { detonated: boolean; targetHitId?: string; isDud: boolean } {
  if (torpedo.isDetonated || torpedo.isDud) {
    return { detonated: false, isDud: torpedo.isDud };
  }

  const stepDist = torpedo.speed * dt;
  torpedo.position.x += torpedo.velocity.x * dt;
  torpedo.position.y += torpedo.velocity.y * dt;
  torpedo.distanceTraveled += stepDist;

  // Maximum range check -> becomes dud if fuel/battery expires
  if (torpedo.distanceTraveled >= torpedo.maxRange) {
    torpedo.isDud = true;
    return { detonated: false, isDud: true };
  }

  // Arming check for acoustic torpedoes
  if (torpedo.isAcousticHoming && !torpedo.isArmed) {
    if (torpedo.distanceTraveled >= torpedo.armingDistance) {
      torpedo.isArmed = true;
    }
  }

  // Acoustic seeker navigation (only active when armed)
  if (torpedo.isAcousticHoming && torpedo.isArmed) {
    let targetPos: Vector2D | null = null;
    let lockedDecoy: TorpedoDecoyEntity | null = null;

    // 1. Decoy Spoofing Check: Decoys have highest acoustic priority within 500m
    const halfCone = torpedo.seekerConeAngleRad / 2;
    for (const decoy of decoys) {
      if (decoy.isExpired) continue;
      const dist = vec2Distance(torpedo.position, decoy.position);
      if (dist <= decoy.attractionRadius) {
        const bearingToDecoy = Math.atan2(decoy.position.y - torpedo.position.y, decoy.position.x - torpedo.position.x);
        const angleDiff = Math.abs(shortestAngleDiff(torpedo.heading, bearingToDecoy));
        if (angleDiff <= halfCone) {
          lockedDecoy = decoy;
          targetPos = decoy.position;
          torpedo.isSpoofedByDecoy = true;
          torpedo.spoofedDecoyId = decoy.id;
          break; // Decoy successfully captures lock
        }
      }
    }

    // 2. Vessel Acoustic Target Search (if not decoy-spoofed)
    if (!targetPos) {
      let highestAcousticScore = -Infinity;
      for (const contact of contacts) {
        if (contact.id === torpedo.shooterId) continue; // Don't home on launching vessel
        const dist = vec2Distance(torpedo.position, contact.position);
        if (dist <= torpedo.seekerRange) {
          const bearingToContact = Math.atan2(
            contact.position.y - torpedo.position.y,
            contact.position.x - torpedo.position.x
          );
          const angleDiff = Math.abs(shortestAngleDiff(torpedo.heading, bearingToContact));
          if (angleDiff <= halfCone) {
            // Loudness score: active sonar ping or cavitation noise enhances attraction
            const acousticScore = contact.acousticSignatureDb - (dist / 10.0);
            if (acousticScore > highestAcousticScore) {
              highestAcousticScore = acousticScore;
              targetPos = contact.position;
              torpedo.targetContactId = contact.id;
            }
          }
        }
      }
    }

    // Proportional navigation turn toward locked target
    if (targetPos) {
      const desiredBearing = Math.atan2(
        targetPos.y - torpedo.position.y,
        targetPos.x - torpedo.position.x
      );
      const angleDiff = shortestAngleDiff(torpedo.heading, desiredBearing);
      const maxTurn = torpedo.turnRateMax * dt;
      const turnStep = Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), maxTurn);

      torpedo.heading = normalizeAngle(torpedo.heading + turnStep);
      torpedo.velocity.x = Math.cos(torpedo.heading) * torpedo.speed;
      torpedo.velocity.y = Math.sin(torpedo.heading) * torpedo.speed;

      // Contact detonation check against decoy
      if (lockedDecoy && vec2Distance(torpedo.position, lockedDecoy.position) <= 12.0) {
        torpedo.isDetonated = true;
        return { detonated: true, targetHitId: lockedDecoy.id, isDud: false };
      }
    }
  }

  return { detonated: false, isDud: false };
}

// ============================================================================
// 3. CRUISE MISSILES & SUBMARINE GUIDANCE CONSTRAINT
// ============================================================================

/**
 * Creates a CruiseMissileEntity.
 */
export function createCruiseMissile(
  id: string,
  shooterId: string,
  mountId: string,
  position: Vector2D,
  heading: number,
  targetCoords: Vector2D,
  isSubmarineLaunched = false,
  shooterDepthMeters = 0
): CruiseMissileEntity {
  const cruiseSpeed = 350.0; // 350 m/s (~Mach 1.05)
  const initialSpeed = 120.0; // Boost start speed

  return {
    id,
    shooterId,
    mountId,
    position: { ...position },
    velocity: { x: Math.cos(heading) * initialSpeed, y: Math.sin(heading) * initialSpeed },
    heading,
    currentSpeed: initialSpeed,
    cruiseSpeed,
    targetCoords: { ...targetCoords },
    flightPhase: 'BOOST',
    boostDuration: 1.5,
    timeInFlight: 0,
    maxRange: 4500.0,
    distanceTraveled: 0,
    damage: 1800,
    hp: 100,
    maxHp: 100,
    radarSeekerActive: false,
    radarSeekerRange: 1200.0,
    guidanceActive: true,
    guidanceAborted: isSubmarineLaunched && shooterDepthMeters < DEPTH_PERISCOPE_METERS,
    isSubmarineLaunched,
    isIntercepted: false,
    isDetonated: false,
  };
}

/**
 * Advances a cruise missile for one tick.
 * Enforces the core submarine tactical rule:
 * If the launching submarine dives below PERISCOPE_DEPTH (< -5.0m),
 * the satellite/radio guidance data link is severed; the missile immediately
 * aborts guidance and continues along a dumb ballistic path.
 */
export function stepCruiseMissile(
  missile: CruiseMissileEntity,
  dt: number,
  launcherDepthMeters?: number,
  overrideTargetCoords?: Vector2D
): { detonated: boolean; intercepted: boolean; guidanceAborted: boolean } {
  if (missile.isDetonated || missile.isIntercepted) {
    return {
      detonated: missile.isDetonated,
      intercepted: missile.isIntercepted,
      guidanceAborted: missile.guidanceAborted,
    };
  }

  // Check launching submarine depth constraint
  if (missile.isSubmarineLaunched && launcherDepthMeters !== undefined) {
    if (launcherDepthMeters < DEPTH_PERISCOPE_METERS) {
      // Submarine dived below -5.0m: Sever guidance link!
      missile.guidanceActive = false;
      missile.guidanceAborted = true;
    }
  }

  missile.timeInFlight += dt;

  // Flight phase state machine
  const distToTarget = vec2Distance(missile.position, overrideTargetCoords ?? missile.targetCoords);

  if (missile.timeInFlight <= missile.boostDuration) {
    missile.flightPhase = 'BOOST';
    // Accelerate to cruise speed
    const boostRatio = missile.timeInFlight / missile.boostDuration;
    missile.currentSpeed = 120.0 + (missile.cruiseSpeed - 120.0) * boostRatio;
  } else if (distToTarget <= missile.radarSeekerRange) {
    missile.flightPhase = 'TERMINAL';
    missile.currentSpeed = missile.cruiseSpeed;
    missile.radarSeekerActive = true;
  } else {
    missile.flightPhase = 'MIDCOURSE';
    missile.currentSpeed = missile.cruiseSpeed;
  }

  // Guidance steering
  if (missile.guidanceActive && !missile.guidanceAborted) {
    const target = overrideTargetCoords ?? missile.targetCoords;
    const desiredHeading = Math.atan2(target.y - missile.position.y, target.x - missile.position.x);
    const angleDiff = shortestAngleDiff(missile.heading, desiredHeading);

    // Terminal phase has higher maneuverability
    const turnRateMax = missile.flightPhase === 'TERMINAL' ? degToRad(35) : degToRad(18);
    const maxTurn = turnRateMax * dt;
    const turnStep = Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), maxTurn);
    missile.heading = normalizeAngle(missile.heading + turnStep);
  }

  // Advance position
  const stepDist = missile.currentSpeed * dt;
  missile.velocity.x = Math.cos(missile.heading) * missile.currentSpeed;
  missile.velocity.y = Math.sin(missile.heading) * missile.currentSpeed;
  missile.position.x += missile.velocity.x * dt;
  missile.position.y += missile.velocity.y * dt;
  missile.distanceTraveled += stepDist;

  // Max range expiration
  if (missile.distanceTraveled >= missile.maxRange) {
    missile.isDetonated = true;
    return { detonated: true, intercepted: false, guidanceAborted: missile.guidanceAborted };
  }

  // Target impact proximity check
  if (distToTarget <= Math.max(15.0, stepDist * 1.5)) {
    missile.isDetonated = true;
    return { detonated: true, intercepted: false, guidanceAborted: missile.guidanceAborted };
  }

  return { detonated: false, intercepted: false, guidanceAborted: missile.guidanceAborted };
}

// ============================================================================
// 4. UNGUIDED ROCKET BARRAGES
// ============================================================================

/**
 * Creates an unguided saturation rocket.
 */
export function createRocket(
  id: string,
  shooterId: string,
  mountId: string,
  origin: Vector2D,
  targetPos: Vector2D,
  dispersion = { dr: 0, dtheta: 0 }
): RocketEntity {
  const speed = 420.0; // 420 m/s
  const impactPos = calculateShellImpactPosition(origin, targetPos, dispersion);
  const dist = vec2Distance(origin, impactPos);
  const flightTimeTotal = dist / speed;

  return {
    id,
    shooterId,
    mountId,
    origin: { ...origin },
    targetPos: impactPos,
    currentPos: { ...origin },
    speed,
    flightTimeTotal,
    timeElapsed: 0,
    damage: 220,
    blastRadius: 18.0,
    dispersionOffset: { x: dispersion.dr, y: dispersion.dtheta },
    isDetonated: false,
  };
}

/**
 * Advances an unguided rocket for one tick.
 */
export function stepRocket(rocket: RocketEntity, dt: number): { detonated: boolean; impactPos?: Vector2D } {
  if (rocket.isDetonated) return { detonated: false };

  rocket.timeElapsed += dt;
  const ratio = Math.min(1.0, rocket.timeElapsed / rocket.flightTimeTotal);

  rocket.currentPos.x = rocket.origin.x + (rocket.targetPos.x - rocket.origin.x) * ratio;
  rocket.currentPos.y = rocket.origin.y + (rocket.targetPos.y - rocket.origin.y) * ratio;

  if (rocket.timeElapsed >= rocket.flightTimeTotal) {
    rocket.isDetonated = true;
    rocket.currentPos = { ...rocket.targetPos };
    return { detonated: true, impactPos: { ...rocket.targetPos } };
  }

  return { detonated: false };
}

// ============================================================================
// 5. ROCKET TORPEDOES (ASROC / SHKVAL)
// ============================================================================

/**
 * Creates a hybrid RocketTorpedoEntity (standoff rocket boost -> water entry -> acoustic search).
 */
export function createRocketTorpedo(
  id: string,
  shooterId: string,
  mountId: string,
  position: Vector2D,
  targetWaterEntryPos: Vector2D
): RocketTorpedoEntity {
  const heading = Math.atan2(targetWaterEntryPos.y - position.y, targetWaterEntryPos.x - position.x);
  const dist = vec2Distance(position, targetWaterEntryPos);
  const airSpeed = 280.0;
  const airFlightDuration = dist / airSpeed;

  return {
    id,
    shooterId,
    mountId,
    position: { ...position },
    velocity: { x: Math.cos(heading) * airSpeed, y: Math.sin(heading) * airSpeed },
    heading,
    targetWaterEntryPos: { ...targetWaterEntryPos },
    flightPhase: 'AIR_BALLISTIC',
    airSpeed,
    waterSpeed: knotsToMs(50), // 25.7 m/s underwater homing
    timeElapsed: 0,
    airFlightDuration,
    damage: 1100,
    seekerConeAngleRad: degToRad(70),
    seekerRange: 800.0,
    turnRateMax: degToRad(18),
    isDetonated: false,
    isDud: false,
  };
}

/**
 * Advances a RocketTorpedoEntity across its flight phases:
 * AIR_BALLISTIC -> WATER_ENTRY -> UNDERWATER_HOMING.
 */
export function stepRocketTorpedo(
  weapon: RocketTorpedoEntity,
  dt: number,
  contacts: AcousticContact[] = []
): { transitionedToWater: boolean; detonated: boolean } {
  if (weapon.isDetonated || weapon.isDud) {
    return { transitionedToWater: false, detonated: false };
  }

  weapon.timeElapsed += dt;

  if (weapon.flightPhase === 'AIR_BALLISTIC') {
    weapon.position.x += weapon.velocity.x * dt;
    weapon.position.y += weapon.velocity.y * dt;

    if (weapon.timeElapsed >= weapon.airFlightDuration) {
      // Transitions to water entry
      weapon.flightPhase = 'WATER_ENTRY';
      weapon.position = { ...weapon.targetWaterEntryPos };
      weapon.velocity = {
        x: Math.cos(weapon.heading) * weapon.waterSpeed,
        y: Math.sin(weapon.heading) * weapon.waterSpeed,
      };
      return { transitionedToWater: true, detonated: false };
    }
  } else if (weapon.flightPhase === 'WATER_ENTRY') {
    // Parachute deceleration completes after short transition
    weapon.flightPhase = 'UNDERWATER_HOMING';
  } else if (weapon.flightPhase === 'UNDERWATER_HOMING') {
    // Underwater homing run
    const halfCone = weapon.seekerConeAngleRad / 2;
    let targetPos: Vector2D | null = null;

    for (const contact of contacts) {
      if (contact.id === weapon.shooterId) continue;
      const dist = vec2Distance(weapon.position, contact.position);
      if (dist <= weapon.seekerRange) {
        const bearing = Math.atan2(contact.position.y - weapon.position.y, contact.position.x - weapon.position.x);
        if (Math.abs(shortestAngleDiff(weapon.heading, bearing)) <= halfCone) {
          targetPos = contact.position;
          weapon.targetContactId = contact.id;
          break;
        }
      }
    }

    if (targetPos) {
      const desiredBearing = Math.atan2(targetPos.y - weapon.position.y, targetPos.x - weapon.position.x);
      const angleDiff = shortestAngleDiff(weapon.heading, desiredBearing);
      const maxTurn = weapon.turnRateMax * dt;
      weapon.heading = normalizeAngle(weapon.heading + Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), maxTurn));
      weapon.velocity.x = Math.cos(weapon.heading) * weapon.waterSpeed;
      weapon.velocity.y = Math.sin(weapon.heading) * weapon.waterSpeed;

      if (vec2Distance(weapon.position, targetPos) <= 15.0) {
        weapon.isDetonated = true;
        return { transitionedToWater: false, detonated: true };
      }
    }

    weapon.position.x += weapon.velocity.x * dt;
    weapon.position.y += weapon.velocity.y * dt;
  }

  return { transitionedToWater: false, detonated: false };
}

// ============================================================================
// 6. SAM & CIWS POINT-DEFENSE SYSTEMS
// ============================================================================

/**
 * Steps automated CIWS point defense against incoming aerial threats.
 * Intercepts within 800m defensive envelope.
 */
export function stepCIWSEnvelope(
  ciwsMount: WeaponMountDef,
  mountWorldPos: Vector2D,
  shipHeading: number,
  threats: ThreatTarget[],
  dt: number
): { burstFired: boolean; interceptedThreatId?: string } {
  stepMountReloadAndRegen(ciwsMount, dt);

  const ciwsRange = ciwsMount.maxRange ?? 800.0;
  let targetThreat: ThreatTarget | null = null;
  let closestDist = Infinity;

  // Search closest incoming threat within defensive envelope
  for (const threat of threats) {
    if (threat.isDestroyed) continue;
    const dist = vec2Distance(mountWorldPos, threat.position);
    if (dist <= ciwsRange && dist < closestDist) {
      const bearing = Math.atan2(threat.position.y - mountWorldPos.y, threat.position.x - mountWorldPos.x);
      const relAngle = normalizeAngle(bearing - shipHeading);
      if (isAngleWithinMountArc(ciwsMount, relAngle)) {
        closestDist = dist;
        targetThreat = threat;
      }
    }
  }

  if (!targetThreat) return { burstFired: false };

  // Traverse CIWS turret toward target threat
  const targetBearing = Math.atan2(targetThreat.position.y - mountWorldPos.y, targetThreat.position.x - mountWorldPos.x);
  const targetRelAngle = normalizeAngle(targetBearing - shipHeading);
  stepMountTraverse(ciwsMount, targetRelAngle, dt);

  // Check if aligned and ready to fire
  if (canMountFire(ciwsMount, targetRelAngle, degToRad(4.0))) {
    fireMount(ciwsMount);

    // Apply rapid-fire burst damage
    const burstDamage = ciwsMount.baseDamage ?? 25;
    targetThreat.hp -= burstDamage;

    if (targetThreat.hp <= 0) {
      targetThreat.isDestroyed = true;
      return { burstFired: true, interceptedThreatId: targetThreat.id };
    }
    return { burstFired: true };
  }

  return { burstFired: false };
}

/**
 * Creates a SAMInterceptorEntity.
 */
export function launchSAMInterceptor(
  id: string,
  shooterId: string,
  mountId: string,
  position: Vector2D,
  targetThreatId: string,
  threatPos: Vector2D
): SAMInterceptorEntity {
  const heading = Math.atan2(threatPos.y - position.y, threatPos.x - position.x);
  const speed = 680.0; // 680 m/s

  return {
    id,
    shooterId,
    mountId,
    position: { ...position },
    velocity: { x: Math.cos(heading) * speed, y: Math.sin(heading) * speed },
    heading,
    speed,
    targetThreatId,
    timeElapsed: 0,
    maxFlightTime: 5.0,
    damage: 450,
    proximityRadius: 15.0,
    isDetonated: false,
  };
}

/**
 * Advances a SAMInterceptorEntity toward its assigned aerial threat.
 */
export function stepSAMInterceptor(
  sam: SAMInterceptorEntity,
  dt: number,
  threats: ThreatTarget[]
): { detonated: boolean; interceptedThreatId?: string } {
  if (sam.isDetonated) return { detonated: false };

  sam.timeElapsed += dt;
  if (sam.timeElapsed >= sam.maxFlightTime) {
    sam.isDetonated = true;
    return { detonated: true };
  }

  const threat = threats.find(t => t.id === sam.targetThreatId && !t.isDestroyed);
  if (threat) {
    const desiredHeading = Math.atan2(threat.position.y - sam.position.y, threat.position.x - sam.position.x);
    const angleDiff = shortestAngleDiff(sam.heading, desiredHeading);
    const maxTurn = degToRad(40) * dt; // 40 deg/s high-G turn
    sam.heading = normalizeAngle(sam.heading + Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), maxTurn));
    sam.velocity.x = Math.cos(sam.heading) * sam.speed;
    sam.velocity.y = Math.sin(sam.heading) * sam.speed;
  }

  sam.position.x += sam.velocity.x * dt;
  sam.position.y += sam.velocity.y * dt;

  if (threat) {
    const dist = vec2Distance(sam.position, threat.position);
    if (dist <= Math.max(sam.proximityRadius, sam.speed * dt * 0.6)) {
      sam.isDetonated = true;
      threat.hp -= sam.damage;
      if (threat.hp <= 0) {
        threat.isDestroyed = true;
      }
      return { detonated: true, interceptedThreatId: threat.id };
    }
  }

  return { detonated: false };
}

// ============================================================================
// 7. ASW DEPTH CHARGES
// ============================================================================

/**
 * Creates a DepthChargeEntity.
 */
export function createDepthCharge(
  id: string,
  dropperId: string,
  mountId: string,
  position: Vector2D,
  fuseSetting: 'SURFACE' | 'PERISCOPE' | 'DEEP' | number = 'PERISCOPE'
): DepthChargeEntity {
  let targetDepth = -5.0;
  if (fuseSetting === 'SURFACE') targetDepth = 0.0;
  else if (fuseSetting === 'PERISCOPE') targetDepth = -5.0;
  else if (fuseSetting === 'DEEP') targetDepth = -30.0;
  else if (typeof fuseSetting === 'number') targetDepth = fuseSetting;

  return {
    id,
    dropperId,
    mountId,
    position: { ...position },
    currentDepth: 0.0,
    sinkRate: 3.5, // 3.5 m/s sink rate
    fuseSetting,
    targetDetonationDepth: targetDepth,
    proximityRadius: 15.0,
    baseDamage: 1500,
    blastRadius: 25.0,
    isDetonated: false,
  };
}

/**
 * Calculates depth charge shockwave damage falling off quadratically with 3D distance.
 */
export function calculateDepthChargeDamage(
  chargePos: Vector2D,
  chargeDepth: number,
  subPos: Vector2D,
  subDepth: number,
  baseDamage = 1500,
  blastRadius = 25.0
): number {
  const horizontalDist = vec2Distance(chargePos, subPos);
  const verticalDist = Math.abs(chargeDepth - subDepth);
  const dist3D = Math.sqrt(horizontalDist * horizontalDist + verticalDist * verticalDist);

  if (dist3D > blastRadius) return 0;
  // Quadratic falloff: Damage * (1 - (r / R)^2)
  return Math.round(baseDamage * (1.0 - (dist3D * dist3D) / (blastRadius * blastRadius)));
}

/**
 * Advances a depth charge through the water column for one tick.
 */
export function stepDepthCharge(
  charge: DepthChargeEntity,
  dt: number,
  submarines: SubmarineContact[] = []
): { detonated: boolean; damageMap: Map<string, number> } {
  const damageMap = new Map<string, number>();
  if (charge.isDetonated) return { detonated: false, damageMap };

  // Sinks vertically at 3.5 m/s
  charge.currentDepth -= charge.sinkRate * dt;

  let shouldDetonate = false;

  // 1. Hydrostatic Fuse Check
  if (charge.currentDepth <= charge.targetDetonationDepth) {
    shouldDetonate = true;
  }

  // 2. Magnetic Proximity Fuse Check against submerged submarines
  if (!shouldDetonate) {
    for (const sub of submarines) {
      const hDist = vec2Distance(charge.position, sub.position);
      const vDist = Math.abs(charge.currentDepth - sub.depthMeters);
      const dist3D = Math.sqrt(hDist * hDist + vDist * vDist);
      if (dist3D <= charge.proximityRadius) {
        shouldDetonate = true;
        break;
      }
    }
  }

  if (shouldDetonate) {
    charge.isDetonated = true;
    for (const sub of submarines) {
      const dmg = calculateDepthChargeDamage(
        charge.position,
        charge.currentDepth,
        sub.position,
        sub.depthMeters,
        charge.baseDamage,
        charge.blastRadius
      );
      if (dmg > 0) {
        damageMap.set(sub.id, dmg);
        sub.hullHp = Math.max(0, sub.hullHp - dmg);
      }
    }
    return { detonated: true, damageMap };
  }

  return { detonated: false, damageMap };
}

// ============================================================================
// 8. NAVAL MINES
// ============================================================================

/**
 * Creates a moored contact / magnetic NavalMineEntity.
 */
export function createNavalMine(
  id: string,
  deployerId: string,
  mountId: string,
  position: Vector2D
): NavalMineEntity {
  return {
    id,
    deployerId,
    mountId,
    position: { ...position },
    armingTimerRemaining: 5.0, // 5.0s arming delay
    isArmed: false,
    contactRadius: 10.0,
    magneticInfluenceRadius: 18.0,
    speedTriggerThresholdKnots: 15.0,
    damage: 2200,
    floodingSpeedPenalty: 0.60,
    floodingDurationSeconds: 8.0,
    isDetonated: false,
  };
}

/**
 * Advances a naval mine for one tick.
 */
export function stepNavalMine(
  mine: NavalMineEntity,
  dt: number,
  surfaceVessels: SurfaceVesselContact[] = [],
  submarines: SubmarineContact[] = []
): { detonated: boolean; victimId?: string; damage: number; floodingPenalty: number } {
  if (mine.isDetonated) {
    return { detonated: false, damage: 0, floodingPenalty: 0 };
  }

  // Arming countdown
  if (!mine.isArmed) {
    mine.armingTimerRemaining -= dt;
    if (mine.armingTimerRemaining <= 0) {
      mine.isArmed = true;
    }
    return { detonated: false, damage: 0, floodingPenalty: 0 };
  }

  // 1. Surface vessel detection
  for (const vessel of surfaceVessels) {
    const dist = vec2Distance(mine.position, vessel.position);

    // Direct hull contact trigger
    if (dist <= mine.contactRadius) {
      mine.isDetonated = true;
      vessel.hullHp = Math.max(0, vessel.hullHp - mine.damage);
      return {
        detonated: true,
        victimId: vessel.id,
        damage: mine.damage,
        floodingPenalty: mine.floodingSpeedPenalty,
      };
    }

    // Magnetic / acoustic influence trigger (vessel passing within 18m at speed > 15 kts)
    if (dist <= mine.magneticInfluenceRadius && vessel.speedKnots >= mine.speedTriggerThresholdKnots) {
      mine.isDetonated = true;
      vessel.hullHp = Math.max(0, vessel.hullHp - mine.damage);
      return {
        detonated: true,
        victimId: vessel.id,
        damage: mine.damage,
        floodingPenalty: mine.floodingSpeedPenalty,
      };
    }
  }

  // 2. Submarines at surface or periscope depth trigger mine contact
  for (const sub of submarines) {
    if (sub.depthMeters >= -10.0) {
      // Near-surface contact
      const dist = vec2Distance(mine.position, sub.position);
      if (dist <= mine.contactRadius) {
        mine.isDetonated = true;
        sub.hullHp = Math.max(0, sub.hullHp - mine.damage);
        return {
          detonated: true,
          victimId: sub.id,
          damage: mine.damage,
          floodingPenalty: mine.floodingSpeedPenalty,
        };
      }
    }
  }

  return { detonated: false, damage: 0, floodingPenalty: 0 };
}

// ============================================================================
// 9. AIRCRAFT SQUADRONS & PERSISTENT SONAR BUOYS
// ============================================================================

/**
 * Creates an AircraftEntity (Strike Fighter or ASW Helicopter).
 */
export function createAircraftSquadron(
  id: string,
  carrierId: string,
  type: 'STRIKE_FIGHTER' | 'ASW_HELICOPTER',
  position: Vector2D,
  targetWaypoint: Vector2D
): AircraftEntity {
  const isFighter = type === 'STRIKE_FIGHTER';
  const cruiseSpeed = isFighter ? 120.0 : 60.0;
  const heading = Math.atan2(targetWaypoint.y - position.y, targetWaypoint.x - position.x);

  return {
    id,
    carrierId,
    type,
    position: { ...position },
    velocity: { x: Math.cos(heading) * cruiseSpeed, y: Math.sin(heading) * cruiseSpeed },
    heading,
    cruiseSpeed,
    turnRateMax: isFighter ? degToRad(45) : degToRad(30),
    targetWaypoint: { ...targetWaypoint },
    status: 'TRANSIT',
    fuelRemaining: 180.0,
    maxFuelSeconds: 180.0,
    payloadAmmo: isFighter ? 4 : 2,
    strikeDamage: isFighter ? 650 : 300,
    canDeploySonobuoy: !isFighter, // ASW Helicopters deploy sonobuoys
    sonobuoyCooldownRemaining: 0,
    isReturning: false,
  };
}

/**
 * Advances an aircraft squadron along its cursor-guided waypoint flight path.
 */
export function stepAircraft(
  aircraft: AircraftEntity,
  dt: number,
  overrideWaypoint?: Vector2D
): { reachedWaypoint: boolean; fuelDepleted: boolean } {
  aircraft.fuelRemaining = Math.max(0, aircraft.fuelRemaining - dt);
  if (aircraft.fuelRemaining <= 0) {
    aircraft.status = 'RETURNING';
    aircraft.isReturning = true;
    return { reachedWaypoint: false, fuelDepleted: true };
  }

  const target = overrideWaypoint ?? aircraft.targetWaypoint;
  const dist = vec2Distance(aircraft.position, target);

  if (dist > 15.0) {
    const desiredHeading = Math.atan2(target.y - aircraft.position.y, target.x - aircraft.position.x);
    const angleDiff = shortestAngleDiff(aircraft.heading, desiredHeading);
    const maxTurn = aircraft.turnRateMax * dt;
    aircraft.heading = normalizeAngle(aircraft.heading + Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), maxTurn));

    aircraft.velocity.x = Math.cos(aircraft.heading) * aircraft.cruiseSpeed;
    aircraft.velocity.y = Math.sin(aircraft.heading) * aircraft.cruiseSpeed;

    aircraft.position.x += aircraft.velocity.x * dt;
    aircraft.position.y += aircraft.velocity.y * dt;
    return { reachedWaypoint: false, fuelDepleted: false };
  } else {
    // Reached waypoint: hover or attack run
    aircraft.status = aircraft.type === 'ASW_HELICOPTER' ? 'HOVERING' : 'ATTACK_RUN';
    return { reachedWaypoint: true, fuelDepleted: false };
  }
}

/**
 * Deploys a persistent Sonar Buoy (1,200m radius, 75s duration).
 */
export function deploySonarBuoy(
  id: string,
  deployerId: string,
  position: Vector2D
): SonarBuoyEntity {
  return {
    id,
    deployerId,
    position: { ...position },
    radius: 1200.0,          // 1,200m detection radius
    durationRemaining: 75.0,  // 75 seconds persistent lifespan
    isExpired: false,
    detectedContactIds: [],
  };
}

/**
 * Advances a Sonar Buoy for one tick, detecting submerged submarines within 1,200m.
 */
export function stepSonarBuoy(
  buoy: SonarBuoyEntity,
  dt: number,
  submarines: SubmarineContact[] = []
): string[] {
  if (buoy.isExpired) return [];

  buoy.durationRemaining -= dt;
  if (buoy.durationRemaining <= 0) {
    buoy.isExpired = true;
    buoy.detectedContactIds = [];
    return [];
  }

  const detected: string[] = [];
  for (const sub of submarines) {
    const dist = vec2Distance(buoy.position, sub.position);
    if (dist <= buoy.radius) {
      detected.push(sub.id);
    }
  }

  buoy.detectedContactIds = detected;
  return detected;
}

// ============================================================================
// 10. HYDRAULIC DREDGING & SAND DEPOSITOR TOOL
// ============================================================================

/**
 * Executes hydraulic dredging channel excavation or sand deposition.
 * Excavation mode: bathymetry depth -> 15.0m (creates deep navigable channel).
 * Deposition mode: bathymetry depth -> 1.0 - 5.0m (creates shallow sandbar grounding heavy hulls).
 */
export function executeDredgerAction(
  dredgerId: string,
  dredgerPos: Vector2D,
  targetCoords: Vector2D,
  mode: 'EXCAVATE' | 'DEPOSIT_SAND',
  terrainEngine: TerrainEngine,
  radius = 120.0,
  targetDepth?: number
): TerrainModification {
  if (mode === 'EXCAVATE') {
    const depth = targetDepth ?? 15.0; // 15.0m deep water channel
    return terrainEngine.excavateChannel(targetCoords, radius, depth);
  } else {
    const depth = targetDepth ?? 2.0;  // 2.0m shallow sandbar
    return terrainEngine.depositSand(targetCoords, radius, depth);
  }
}

// ============================================================================
// 11. UNIFIED WEAPON KINEMATICS ENGINE CONTAINER
// ============================================================================

export interface WeaponKinematicsWorldContext {
  submarines?: SubmarineContact[];
  surfaceVessels?: SurfaceVesselContact[];
  acousticContacts?: AcousticContact[];
  threats?: ThreatTarget[];
  terrainEngine?: TerrainEngine;
}

export class WeaponKinematicsEngine {
  public shells: ArtilleryShellEntity[] = [];
  public torpedoes: TorpedoEntity[] = [];
  public decoys: TorpedoDecoyEntity[] = [];
  public cruiseMissiles: CruiseMissileEntity[] = [];
  public rockets: RocketEntity[] = [];
  public rocketTorpedoes: RocketTorpedoEntity[] = [];
  public samInterceptors: SAMInterceptorEntity[] = [];
  public depthCharges: DepthChargeEntity[] = [];
  public mines: NavalMineEntity[] = [];
  public aircraft: AircraftEntity[] = [];
  public sonobuoys: SonarBuoyEntity[] = [];

  private nextEntityId = 1;

  public generateId(prefix: string): string {
    return `${prefix}_${this.nextEntityId++}`;
  }

  /**
   * Clears all active projectiles and deployables.
   */
  public clearAll(): void {
    this.shells = [];
    this.torpedoes = [];
    this.decoys = [];
    this.cruiseMissiles = [];
    this.rockets = [];
    this.rocketTorpedoes = [];
    this.samInterceptors = [];
    this.depthCharges = [];
    this.mines = [];
    this.aircraft = [];
    this.sonobuoys = [];
  }

  /**
   * Fires an artillery turret mount toward designated target coordinates.
   */
  public fireArtilleryMount(
    shooterId: string,
    mount: WeaponMountDef,
    mountWorldPos: Vector2D,
    targetCoords: Vector2D,
    dispersionRadial = 0,
    dispersionCross = 0
  ): ArtilleryShellEntity | null {
    if (!fireMount(mount)) return null;

    const weaponDef = WEAPON_DEFINITIONS[mount.weaponDefId] ?? {
      id: mount.weaponDefId,
      name: 'Artillery',
      category: 'ARTILLERY',
      baseDamage: mount.baseDamage ?? 100,
      maxRange: mount.maxRange ?? 2000,
      projectileSpeed: mount.projectileSpeed ?? 850,
      reloadTimeTotal: mount.reloadTimeTotal,
      ammoMax: mount.ammoMax,
      ammoRegenRate: mount.ammoRegenRate,
      traverseSpeed: mount.traverseSpeed,
      defaultArcCoverage: mount.arcCoverage,
      caliberMm: mount.caliberMm ?? 127,
    };

    const dist = vec2Distance(mountWorldPos, targetCoords);
    const dispersion = calculateDispersionOffset(dist, dispersionRadial, dispersionCross);
    const shell = createArtilleryShell(
      this.generateId('shell'),
      shooterId,
      mount.slotId,
      mountWorldPos,
      targetCoords,
      weaponDef,
      dispersion
    );

    this.shells.push(shell);
    return shell;
  }

  /**
   * Launches a torpedo or deploys a torpedo decoy.
   */
  public fireTorpedoMount(
    shooterId: string,
    mount: WeaponMountDef,
    mountWorldPos: Vector2D,
    heading: number,
    isAcousticHoming = false
  ): TorpedoEntity | TorpedoDecoyEntity | null {
    if (!fireMount(mount)) return null;

    if (mount.weaponDefId === 'torpedo_decoy') {
      const decoy = createTorpedoDecoy(
        this.generateId('decoy'),
        shooterId,
        mountWorldPos,
        heading
      );
      this.decoys.push(decoy);
      return decoy;
    }

    const torpedo = createTorpedo(
      this.generateId('torp'),
      shooterId,
      mount.slotId,
      mountWorldPos,
      heading,
      isAcousticHoming
    );
    this.torpedoes.push(torpedo);
    return torpedo;
  }

  /**
   * Launches a cruise missile.
   */
  public fireCruiseMissileMount(
    shooterId: string,
    mount: WeaponMountDef,
    mountWorldPos: Vector2D,
    heading: number,
    targetCoords: Vector2D,
    isSubmarineLaunched = false,
    shooterDepthMeters = 0
  ): CruiseMissileEntity | null {
    if (!fireMount(mount)) return null;

    const missile = createCruiseMissile(
      this.generateId('c_missile'),
      shooterId,
      mount.slotId,
      mountWorldPos,
      heading,
      targetCoords,
      isSubmarineLaunched,
      shooterDepthMeters
    );
    this.cruiseMissiles.push(missile);
    return missile;
  }

  /**
   * Fires a rocket barrage salvo.
   */
  public fireRocketBarrageMount(
    shooterId: string,
    mount: WeaponMountDef,
    mountWorldPos: Vector2D,
    targetCoords: Vector2D,
    rocketCount = 12
  ): RocketEntity[] {
    if (!fireMount(mount)) return [];

    const dist = vec2Distance(mountWorldPos, targetCoords);
    const rockets: RocketEntity[] = [];

    for (let i = 0; i < rocketCount; i++) {
      // Semi-random deterministic spread around target area
      const angle = (i / rocketCount) * 2 * Math.PI;
      const radiusFraction = (i % 3 + 1) / 3;
      const dispersion = calculateDispersionOffset(
        dist,
        Math.cos(angle) * radiusFraction,
        Math.sin(angle) * radiusFraction
      );

      const rocket = createRocket(
        this.generateId('rocket'),
        shooterId,
        mount.slotId,
        mountWorldPos,
        targetCoords,
        dispersion
      );
      this.rockets.push(rocket);
      rockets.push(rocket);
    }

    return rockets;
  }

  /**
   * Fires a rocket-delivered torpedo (ASROC).
   */
  public fireRocketTorpedoMount(
    shooterId: string,
    mount: WeaponMountDef,
    mountWorldPos: Vector2D,
    targetWaterEntryPos: Vector2D
  ): RocketTorpedoEntity | null {
    if (!fireMount(mount)) return null;

    const weapon = createRocketTorpedo(
      this.generateId('asroc'),
      shooterId,
      mount.slotId,
      mountWorldPos,
      targetWaterEntryPos
    );
    this.rocketTorpedoes.push(weapon);
    return weapon;
  }

  /**
   * Drops a depth charge.
   */
  public dropDepthCharge(
    dropperId: string,
    mount: WeaponMountDef,
    dropPos: Vector2D,
    fuseSetting: 'SURFACE' | 'PERISCOPE' | 'DEEP' | number = 'PERISCOPE'
  ): DepthChargeEntity | null {
    if (!fireMount(mount)) return null;

    const charge = createDepthCharge(
      this.generateId('dc'),
      dropperId,
      mount.slotId,
      dropPos,
      fuseSetting
    );
    this.depthCharges.push(charge);
    return charge;
  }

  /**
   * Lays a naval mine.
   */
  public layNavalMine(
    deployerId: string,
    mount: WeaponMountDef,
    dropPos: Vector2D
  ): NavalMineEntity | null {
    if (!fireMount(mount)) return null;

    const mine = createNavalMine(
      this.generateId('mine'),
      deployerId,
      mount.slotId,
      dropPos
    );
    this.mines.push(mine);
    return mine;
  }

  /**
   * Launches an aircraft squadron or ASW helicopter.
   */
  public launchAircraft(
    carrierId: string,
    mount: WeaponMountDef,
    launchPos: Vector2D,
    type: 'STRIKE_FIGHTER' | 'ASW_HELICOPTER',
    targetWaypoint: Vector2D
  ): AircraftEntity | null {
    if (!fireMount(mount)) return null;

    const aircraft = createAircraftSquadron(
      this.generateId('air'),
      carrierId,
      type,
      launchPos,
      targetWaypoint
    );
    this.aircraft.push(aircraft);
    return aircraft;
  }

  /**
   * Deploys a persistent Sonar Buoy (1,200m radius, 75s duration).
   */
  public deployPersistentSonarBuoy(
    deployerId: string,
    position: Vector2D
  ): SonarBuoyEntity {
    const buoy = deploySonarBuoy(
      this.generateId('buoy'),
      deployerId,
      position
    );
    this.sonobuoys.push(buoy);
    return buoy;
  }

  /**
   * Advances all active simulation entities for one tick.
   */
  public step(dt: number, context: WeaponKinematicsWorldContext = {}): void {
    const { submarines = [], surfaceVessels = [], acousticContacts = [], threats = [] } = context;

    // 1. Step artillery shells
    for (const shell of this.shells) {
      stepArtilleryShell(shell, dt);
    }
    this.shells = this.shells.filter(s => !s.isDetonated);

    // 2. Step decoys
    for (const decoy of this.decoys) {
      stepTorpedoDecoy(decoy, dt);
    }
    this.decoys = this.decoys.filter(d => !d.isExpired);

    // 3. Step torpedoes
    for (const torpedo of this.torpedoes) {
      stepTorpedo(torpedo, dt, acousticContacts, this.decoys);
    }
    this.torpedoes = this.torpedoes.filter(t => !t.isDetonated && !t.isDud);

    // 4. Step cruise missiles
    for (const missile of this.cruiseMissiles) {
      // Find launcher submarine if applicable
      const subLauncher = submarines.find(s => s.id === missile.shooterId);
      stepCruiseMissile(missile, dt, subLauncher?.depthMeters);
    }
    this.cruiseMissiles = this.cruiseMissiles.filter(m => !m.isDetonated && !m.isIntercepted);

    // 5. Step rockets
    for (const rocket of this.rockets) {
      stepRocket(rocket, dt);
    }
    this.rockets = this.rockets.filter(r => !r.isDetonated);

    // 6. Step rocket torpedoes
    for (const asroc of this.rocketTorpedoes) {
      stepRocketTorpedo(asroc, dt, acousticContacts);
    }
    this.rocketTorpedoes = this.rocketTorpedoes.filter(r => !r.isDetonated && !r.isDud);

    // 7. Step SAM interceptors
    for (const sam of this.samInterceptors) {
      stepSAMInterceptor(sam, dt, threats);
    }
    this.samInterceptors = this.samInterceptors.filter(s => !s.isDetonated);

    // 8. Step depth charges
    for (const dc of this.depthCharges) {
      stepDepthCharge(dc, dt, submarines);
    }
    this.depthCharges = this.depthCharges.filter(d => !d.isDetonated);

    // 9. Step naval mines
    for (const mine of this.mines) {
      stepNavalMine(mine, dt, surfaceVessels, submarines);
    }
    this.mines = this.mines.filter(m => !m.isDetonated);

    // 10. Step aircraft
    for (const air of this.aircraft) {
      stepAircraft(air, dt);
    }

    // 11. Step sonar buoys
    for (const buoy of this.sonobuoys) {
      stepSonarBuoy(buoy, dt, submarines);
    }
    this.sonobuoys = this.sonobuoys.filter(b => !b.isExpired);
  }
}
