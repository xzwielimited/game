/**
 * Weapon Categories, Mount Definitions & Firing Arcs
 * Clean-Room implementation for NavalCommand.io
 */

import { Vector2D, Vector2, normalizeAngle, shortestAngleDiff, degToRad } from '../math/vector2.js';

export type WeaponCategory =
  | 'ARTILLERY'
  | 'TORPEDO'
  | 'CRUISE_MISSILE'
  | 'ROCKET_BARRAGE'
  | 'ROCKET_TORPEDO'
  | 'SAM_CIWS'
  | 'DEPTH_CHARGE'
  | 'NAVAL_MINE'
  | 'AIRCRAFT_SQUADRON'
  | 'DREDGER_TOOL';

export interface WeaponDef {
  id: string;
  name: string;
  category: WeaponCategory;
  baseDamage: number;
  maxRange: number;            // meters
  projectileSpeed: number;     // m/s
  reloadTimeTotal: number;     // seconds
  ammoMax: number;
  ammoRegenRate: number;       // ammo per second
  traverseSpeed: number;       // rad/s
  defaultArcCoverage: number;  // rad
  caliberMm?: number;
}

export interface WeaponMountDef {
  slotId: string;
  category: WeaponCategory;
  weaponDefId: string;
  localOffset: Vector2D;       // Relative to ship center (meters)
  baseAngle: number;           // Radians (0 = bow, Math.PI = stern, -PI/2 = port, +PI/2 = stbd)
  arcCoverage: number;         // Radians total sweep
  traverseSpeed: number;       // Radians per second
  currentAngle: number;        // Current relative aiming angle
  reloadTimeRemaining: number;
  reloadTimeTotal: number;
  ammoCurrent: number;
  ammoMax: number;
  ammoRegenRate: number;       // Ammo per second
  caliberMm?: number;
  baseDamage?: number;
  maxRange?: number;
  projectileSpeed?: number;
}

export interface WeaponState {
  mountId: string;
  currentAmmo: number;
  maxAmmo: number;
  reloadTimerRemaining: number;
  ammoRegenTimer: number;
  currentHeading: number;
}

export interface FiringCommand {
  mountId: string;
  targetCoords: Vector2;
  launchVector: Vector2;
}

/**
 * Checks whether an aiming angle (relative to ship heading) falls within
 * the mount's designated traverse arc [baseAngle - arc/2, baseAngle + arc/2].
 */
export function isAngleWithinMountArc(
  mount: WeaponMountDef,
  targetRelativeAngle: number,
  toleranceRad = 0.035 // ~2 degrees
): boolean {
  if (mount.arcCoverage >= 2 * Math.PI - 1e-4) {
    return true; // Full 360 degree coverage
  }

  const halfArc = mount.arcCoverage / 2;
  const diffFromBase = Math.abs(shortestAngleDiff(mount.baseAngle, targetRelativeAngle));
  return diffFromBase <= halfArc + toleranceRad;
}

/**
 * Steps the turret traversal toward the target relative angle.
 */
export function stepMountTraverse(
  mount: WeaponMountDef,
  targetRelativeAngle: number,
  dt: number
): void {
  if (mount.traverseSpeed <= 0) {
    // Fixed mount (e.g. torpedo tube or stern rack)
    mount.currentAngle = mount.baseAngle;
    return;
  }

  // Constrain target angle to arc limits
  let clampedTarget = targetRelativeAngle;
  if (mount.arcCoverage < 2 * Math.PI - 1e-4) {
    const halfArc = mount.arcCoverage / 2;
    const diff = shortestAngleDiff(mount.baseAngle, targetRelativeAngle);
    if (diff > halfArc) {
      clampedTarget = normalizeAngle(mount.baseAngle + halfArc);
    } else if (diff < -halfArc) {
      clampedTarget = normalizeAngle(mount.baseAngle - halfArc);
    }
  }

  const angleDiff = shortestAngleDiff(mount.currentAngle, clampedTarget);
  const maxStep = mount.traverseSpeed * dt;

  if (Math.abs(angleDiff) <= maxStep) {
    mount.currentAngle = clampedTarget;
  } else {
    mount.currentAngle = normalizeAngle(mount.currentAngle + Math.sign(angleDiff) * maxStep);
  }
}

/**
 * Steps mount reload timer countdown and ammo regeneration.
 */
export function stepMountReloadAndRegen(mount: WeaponMountDef, dt: number): void {
  if (mount.reloadTimeRemaining > 0) {
    mount.reloadTimeRemaining = Math.max(0, mount.reloadTimeRemaining - dt);
  }

  if (mount.ammoCurrent < mount.ammoMax && mount.ammoRegenRate > 0) {
    mount.ammoCurrent = Math.min(mount.ammoMax, mount.ammoCurrent + mount.ammoRegenRate * dt);
  }
}

/**
 * Checks whether the weapon mount is currently loaded, has ammo, and (if target given) is on target.
 */
export function canMountFire(
  mount: WeaponMountDef,
  targetRelativeAngle?: number,
  aimToleranceRad = 0.05
): boolean {
  if (mount.reloadTimeRemaining > 0) return false;
  if (mount.ammoCurrent < 1) return false;

  if (targetRelativeAngle !== undefined) {
    if (!isAngleWithinMountArc(mount, targetRelativeAngle, aimToleranceRad)) {
      return false;
    }
    const aimDiff = Math.abs(shortestAngleDiff(mount.currentAngle, targetRelativeAngle));
    if (aimDiff > aimToleranceRad) {
      return false;
    }
  }

  return true;
}

/**
 * Discharges one round from the mount and resets the reload timer.
 */
export function fireMount(mount: WeaponMountDef): boolean {
  if (!canMountFire(mount)) return false;
  mount.ammoCurrent -= 1;
  mount.reloadTimeRemaining = mount.reloadTimeTotal;
  return true;
}

/**
 * Standard Weapon Presets from R1 / Survey Report Table 6.3
 */
export const WEAPON_DEFINITIONS: Record<string, WeaponDef> = {
  // Artillery
  autocannon_20mm: {
    id: 'autocannon_20mm',
    name: '20mm Autocannon',
    category: 'ARTILLERY',
    baseDamage: 25,
    maxRange: 600,
    projectileSpeed: 950,
    reloadTimeTotal: 0.1,
    ammoMax: 200,
    ammoRegenRate: 10.0,
    traverseSpeed: degToRad(60),
    defaultArcCoverage: degToRad(280),
    caliberMm: 20,
  },
  bofors_40mm: {
    id: 'bofors_40mm',
    name: '40mm Bofors Cannon',
    category: 'ARTILLERY',
    baseDamage: 45,
    maxRange: 1200,
    projectileSpeed: 900,
    reloadTimeTotal: 0.4,
    ammoMax: 120,
    ammoRegenRate: 4.0,
    traverseSpeed: degToRad(40),
    defaultArcCoverage: degToRad(280),
    caliberMm: 40,
  },
  gun_76mm_oto: {
    id: 'gun_76mm_oto',
    name: '76mm Oto Melara Rapid',
    category: 'ARTILLERY',
    baseDamage: 110,
    maxRange: 1800,
    projectileSpeed: 850,
    reloadTimeTotal: 1.5,
    ammoMax: 40,
    ammoRegenRate: 1.5,
    traverseSpeed: degToRad(35),
    defaultArcCoverage: degToRad(280),
    caliberMm: 76,
  },
  gun_127mm_mk45: {
    id: 'gun_127mm_mk45',
    name: '127mm/54 Mk 45 Naval Gun',
    category: 'ARTILLERY',
    baseDamage: 260,
    maxRange: 2400,
    projectileSpeed: 820,
    reloadTimeTotal: 3.0,
    ammoMax: 30,
    ammoRegenRate: 0.8,
    traverseSpeed: degToRad(25),
    defaultArcCoverage: degToRad(280),
    caliberMm: 127,
  },
  gun_130mm_dual: {
    id: 'gun_130mm_dual',
    name: 'Twin 130mm AK-130',
    category: 'ARTILLERY',
    baseDamage: 380,
    maxRange: 2600,
    projectileSpeed: 850,
    reloadTimeTotal: 3.5,
    ammoMax: 30,
    ammoRegenRate: 0.7,
    traverseSpeed: degToRad(20),
    defaultArcCoverage: degToRad(260),
    caliberMm: 130,
  },
  heavy_gun_305mm: {
    id: 'heavy_gun_305mm',
    name: 'Twin 305mm Heavy Turret',
    category: 'ARTILLERY',
    baseDamage: 950,
    maxRange: 3200,
    projectileSpeed: 800,
    reloadTimeTotal: 18.0,
    ammoMax: 24,
    ammoRegenRate: 0.35,
    traverseSpeed: degToRad(10),
    defaultArcCoverage: degToRad(260),
    caliberMm: 305,
  },
  heavy_gun_380mm: {
    id: 'heavy_gun_380mm',
    name: 'Twin 380mm SK C/34',
    category: 'ARTILLERY',
    baseDamage: 1400,
    maxRange: 3600,
    projectileSpeed: 820,
    reloadTimeTotal: 22.0,
    ammoMax: 24,
    ammoRegenRate: 0.3,
    traverseSpeed: degToRad(8),
    defaultArcCoverage: degToRad(260),
    caliberMm: 380,
  },
  heavy_gun_406mm: {
    id: 'heavy_gun_406mm',
    name: 'Triple 406mm/50 Mark 7',
    category: 'ARTILLERY',
    baseDamage: 1800,
    maxRange: 3800,
    projectileSpeed: 780,
    reloadTimeTotal: 25.0,
    ammoMax: 20,
    ammoRegenRate: 0.25,
    traverseSpeed: degToRad(6),
    defaultArcCoverage: degToRad(260),
    caliberMm: 406,
  },
  heavy_gun_460mm: {
    id: 'heavy_gun_460mm',
    name: 'Triple 460mm Type 94',
    category: 'ARTILLERY',
    baseDamage: 2200,
    maxRange: 4200,
    projectileSpeed: 780,
    reloadTimeTotal: 28.0,
    ammoMax: 18,
    ammoRegenRate: 0.2,
    traverseSpeed: degToRad(5),
    defaultArcCoverage: degToRad(240),
    caliberMm: 460,
  },

  // Torpedoes
  torpedo_533mm_unguided: {
    id: 'torpedo_533mm_unguided',
    name: '533mm Heavy Steam Torpedo',
    category: 'TORPEDO',
    baseDamage: 1250,
    maxRange: 2500,
    projectileSpeed: 24.7, // 48 knots
    reloadTimeTotal: 16.0,
    ammoMax: 8,
    ammoRegenRate: 0.25,
    traverseSpeed: 0,
    defaultArcCoverage: degToRad(30),
    caliberMm: 533,
  },
  torpedo_acoustic_homing: {
    id: 'torpedo_acoustic_homing',
    name: 'Acoustic Homing Torpedo',
    category: 'TORPEDO',
    baseDamage: 950,
    maxRange: 2200,
    projectileSpeed: 19.5, // 38 knots
    reloadTimeTotal: 20.0,
    ammoMax: 6,
    ammoRegenRate: 0.2,
    traverseSpeed: degToRad(15),
    defaultArcCoverage: degToRad(60),
    caliberMm: 533,
  },
  torpedo_decoy: {
    id: 'torpedo_decoy',
    name: 'Acoustic Decoy Noisemaker',
    category: 'TORPEDO',
    baseDamage: 0,
    maxRange: 500,
    projectileSpeed: 1.5,
    reloadTimeTotal: 25.0,
    ammoMax: 4,
    ammoRegenRate: 0.1,
    traverseSpeed: 0,
    defaultArcCoverage: 2 * Math.PI,
  },

  // Cruise Missiles
  cruise_missile_vls: {
    id: 'cruise_missile_vls',
    name: 'VLS Anti-Ship Cruise Missile',
    category: 'CRUISE_MISSILE',
    baseDamage: 1800,
    maxRange: 4500,
    projectileSpeed: 350,
    reloadTimeTotal: 30.0,
    ammoMax: 8,
    ammoRegenRate: 0.15,
    traverseSpeed: 0,
    defaultArcCoverage: 2 * Math.PI,
  },

  // Rocket Barrage
  rocket_barrage_rbu: {
    id: 'rocket_barrage_rbu',
    name: 'RBU-6000 Rocket Barrage',
    category: 'ROCKET_BARRAGE',
    baseDamage: 220,
    maxRange: 1600,
    projectileSpeed: 420,
    reloadTimeTotal: 14.0,
    ammoMax: 36,
    ammoRegenRate: 1.0,
    traverseSpeed: degToRad(25),
    defaultArcCoverage: degToRad(180),
  },

  // Rocket Torpedo
  rocket_torpedo_asroc: {
    id: 'rocket_torpedo_asroc',
    name: 'ASROC Rocket Torpedo',
    category: 'ROCKET_TORPEDO',
    baseDamage: 1100,
    maxRange: 3200,
    projectileSpeed: 280,
    reloadTimeTotal: 32.0,
    ammoMax: 4,
    ammoRegenRate: 0.08,
    traverseSpeed: degToRad(20),
    defaultArcCoverage: degToRad(180),
  },

  // SAM / CIWS
  ciws_phalanx_20mm: {
    id: 'ciws_phalanx_20mm',
    name: '20mm Phalanx CIWS',
    category: 'SAM_CIWS',
    baseDamage: 25,
    maxRange: 800,
    projectileSpeed: 1050,
    reloadTimeTotal: 0.1,
    ammoMax: 800,
    ammoRegenRate: 35.0,
    traverseSpeed: degToRad(75),
    defaultArcCoverage: degToRad(300),
    caliberMm: 20,
  },
  sam_interceptor: {
    id: 'sam_interceptor',
    name: 'RIM-162 ESSM Surface-to-Air Missile',
    category: 'SAM_CIWS',
    baseDamage: 450,
    maxRange: 2800,
    projectileSpeed: 680,
    reloadTimeTotal: 8.0,
    ammoMax: 16,
    ammoRegenRate: 0.5,
    traverseSpeed: 0,
    defaultArcCoverage: 2 * Math.PI,
  },

  // Depth Charges
  depth_charge_rack: {
    id: 'depth_charge_rack',
    name: 'Stern ASW Depth Charge Rack',
    category: 'DEPTH_CHARGE',
    baseDamage: 1500,
    maxRange: 120,
    projectileSpeed: 3.5, // sink rate
    reloadTimeTotal: 12.0,
    ammoMax: 12,
    ammoRegenRate: 0.4,
    traverseSpeed: 0,
    defaultArcCoverage: degToRad(60),
  },

  // Naval Mines
  naval_mine_layer: {
    id: 'naval_mine_layer',
    name: 'Moored Contact Mine Layer',
    category: 'NAVAL_MINE',
    baseDamage: 2200,
    maxRange: 50,
    projectileSpeed: 0,
    reloadTimeTotal: 18.0,
    ammoMax: 8,
    ammoRegenRate: 0.2,
    traverseSpeed: 0,
    defaultArcCoverage: degToRad(45),
  },

  // Aircraft & ASW Helis
  carrier_strike_wing: {
    id: 'carrier_strike_wing',
    name: 'Strike Fighter Flight Wing',
    category: 'AIRCRAFT_SQUADRON',
    baseDamage: 650,
    maxRange: 6000,
    projectileSpeed: 120,
    reloadTimeTotal: 35.0,
    ammoMax: 12,
    ammoRegenRate: 0.1,
    traverseSpeed: degToRad(45),
    defaultArcCoverage: 2 * Math.PI,
  },
  asw_helicopter: {
    id: 'asw_helicopter',
    name: 'ASW Sonobuoy Helicopter',
    category: 'AIRCRAFT_SQUADRON',
    baseDamage: 300,
    maxRange: 3500,
    projectileSpeed: 60,
    reloadTimeTotal: 40.0,
    ammoMax: 6,
    ammoRegenRate: 0.08,
    traverseSpeed: degToRad(30),
    defaultArcCoverage: 2 * Math.PI,
  },

  // Dredger Tool
  hydraulic_dredge_arm: {
    id: 'hydraulic_dredge_arm',
    name: 'Hydraulic Dredging & Sand Depositor Boom',
    category: 'DREDGER_TOOL',
    baseDamage: 0,
    maxRange: 80,
    projectileSpeed: 0,
    reloadTimeTotal: 4.0,
    ammoMax: 100,
    ammoRegenRate: 5.0,
    traverseSpeed: degToRad(15),
    defaultArcCoverage: degToRad(180),
  },
};

/**
 * Creates a WeaponMountDef from a WeaponDef with optional overrides.
 */
export function createWeaponMount(
  slotId: string,
  weaponDefId: string,
  localOffset: Vector2D,
  baseAngle: number,
  arcCoverage?: number
): WeaponMountDef {
  const def = WEAPON_DEFINITIONS[weaponDefId];
  if (!def) {
    throw new Error(`Unknown weapon definition id: ${weaponDefId}`);
  }

  const arc = arcCoverage !== undefined ? arcCoverage : def.defaultArcCoverage;

  return {
    slotId,
    category: def.category,
    weaponDefId: def.id,
    localOffset,
    baseAngle,
    arcCoverage: arc,
    traverseSpeed: def.traverseSpeed,
    currentAngle: baseAngle,
    reloadTimeRemaining: 0,
    reloadTimeTotal: def.reloadTimeTotal,
    ammoCurrent: def.ammoMax,
    ammoMax: def.ammoMax,
    ammoRegenRate: def.ammoRegenRate,
    caliberMm: def.caliberMm,
    baseDamage: def.baseDamage,
    maxRange: def.maxRange,
    projectileSpeed: def.projectileSpeed,
  };
}

// ============================================================================
// PROJECTILE & TACTICAL EQUIPMENT ENTITY INTERFACES
// ============================================================================

export interface ArtilleryShellEntity {
  id: string;
  shooterId: string;
  mountId: string;
  origin: Vector2D;
  targetPos: Vector2D;
  currentPos: Vector2D;
  muzzleSpeed: number;
  caliberMm: number;
  flightTimeTotal: number;
  timeElapsed: number;
  altitude: number;
  peakAltitude: number;
  plungeAngleRad: number;
  damage: number;
  blastRadius: number;
  dispersionOffset: Vector2D;
  isDetonated: boolean;
}

export interface TorpedoEntity {
  id: string;
  shooterId: string;
  mountId: string;
  position: Vector2D;
  velocity: Vector2D;
  heading: number;
  speed: number;
  maxRange: number;
  distanceTraveled: number;
  damage: number;
  isAcousticHoming: boolean;
  armingDistance: number;
  isArmed: boolean;
  seekerConeAngleRad: number; // e.g. 70 deg (+/- 35 deg)
  seekerRange: number;        // e.g. 600m
  turnRateMax: number;        // rad/s (e.g. 20 deg/s)
  targetContactId?: string;
  isSpoofedByDecoy: boolean;
  spoofedDecoyId?: string;
  isDetonated: boolean;
  isDud: boolean;
}

export interface TorpedoDecoyEntity {
  id: string;
  deployerId: string;
  position: Vector2D;
  velocity: Vector2D;
  heading: number;
  driftSpeed: number;
  durationRemaining: number;
  acousticSignatureDb: number; // 120 dB
  attractionRadius: number;    // 500m
  isExpired: boolean;
}

export interface CruiseMissileEntity {
  id: string;
  shooterId: string;
  mountId: string;
  position: Vector2D;
  velocity: Vector2D;
  heading: number;
  currentSpeed: number;
  cruiseSpeed: number;
  targetCoords: Vector2D;
  flightPhase: 'BOOST' | 'MIDCOURSE' | 'TERMINAL';
  boostDuration: number;
  timeInFlight: number;
  maxRange: number;
  distanceTraveled: number;
  damage: number;
  hp: number;
  maxHp: number;
  radarSeekerActive: boolean;
  radarSeekerRange: number; // 1200m
  guidanceActive: boolean;
  guidanceAborted: boolean;
  isSubmarineLaunched: boolean;
  isIntercepted: boolean;
  isDetonated: boolean;
}

export interface RocketEntity {
  id: string;
  shooterId: string;
  mountId: string;
  origin: Vector2D;
  targetPos: Vector2D;
  currentPos: Vector2D;
  speed: number;
  flightTimeTotal: number;
  timeElapsed: number;
  damage: number;
  blastRadius: number;
  dispersionOffset: Vector2D;
  isDetonated: boolean;
}

export interface RocketTorpedoEntity {
  id: string;
  shooterId: string;
  mountId: string;
  position: Vector2D;
  velocity: Vector2D;
  heading: number;
  targetWaterEntryPos: Vector2D;
  flightPhase: 'AIR_BALLISTIC' | 'WATER_ENTRY' | 'UNDERWATER_HOMING';
  airSpeed: number;
  waterSpeed: number;
  timeElapsed: number;
  airFlightDuration: number;
  damage: number;
  seekerConeAngleRad: number;
  seekerRange: number;
  turnRateMax: number;
  targetContactId?: string;
  isDetonated: boolean;
  isDud: boolean;
}

export interface SAMInterceptorEntity {
  id: string;
  shooterId: string;
  mountId: string;
  position: Vector2D;
  velocity: Vector2D;
  heading: number;
  speed: number;
  targetThreatId: string;
  timeElapsed: number;
  maxFlightTime: number;
  damage: number;
  proximityRadius: number; // 15m
  isDetonated: boolean;
}

export interface CIWSBurstEntity {
  id: string;
  shooterId: string;
  mountId: string;
  position: Vector2D;
  targetThreatId: string;
  damage: number;
  timeElapsed: number;
  duration: number;
}

export interface DepthChargeEntity {
  id: string;
  dropperId: string;
  mountId: string;
  position: Vector2D;
  currentDepth: number; // meters, <= 0
  sinkRate: number;     // 3.5 m/s
  fuseSetting: 'SURFACE' | 'PERISCOPE' | 'DEEP' | number;
  targetDetonationDepth: number; // 0m, -5m, -30m, etc.
  proximityRadius: number;       // 15m
  baseDamage: number;            // 1500
  blastRadius: number;           // 25m
  isDetonated: boolean;
}

export interface NavalMineEntity {
  id: string;
  deployerId: string;
  mountId: string;
  position: Vector2D;
  armingTimerRemaining: number; // 5.0s
  isArmed: boolean;
  contactRadius: number;        // 10m
  magneticInfluenceRadius: number; // 18m
  speedTriggerThresholdKnots: number; // 15 knots
  damage: number;               // 2200
  floodingSpeedPenalty: number; // 0.60
  floodingDurationSeconds: number; // 8.0s
  isDetonated: boolean;
}

export interface AircraftEntity {
  id: string;
  carrierId: string;
  type: 'STRIKE_FIGHTER' | 'ASW_HELICOPTER';
  position: Vector2D;
  velocity: Vector2D;
  heading: number;
  cruiseSpeed: number;
  turnRateMax: number;
  targetWaypoint: Vector2D;
  status: 'TRANSIT' | 'ATTACK_RUN' | 'HOVERING' | 'RETURNING';
  fuelRemaining: number;
  maxFuelSeconds: number;
  payloadAmmo: number;
  strikeDamage: number;
  canDeploySonobuoy: boolean;
  sonobuoyCooldownRemaining: number;
  isReturning: boolean;
}

export interface SonarBuoyEntity {
  id: string;
  deployerId: string;
  position: Vector2D;
  radius: number;           // 1200m
  durationRemaining: number; // 75s
  isExpired: boolean;
  detectedContactIds: string[];
}

export interface DredgerToolAction {
  id: string;
  dredgerId: string;
  position: Vector2D;
  targetCoords: Vector2D;
  mode: 'EXCAVATE' | 'DEPOSIT_SAND' | 'DEPOSIT_LAND';
  progressSeconds: number;
  durationSeconds: number; // 4.0s for excavate, 6.0s for deposit
  radius: number;          // e.g. 60m
  isComplete: boolean;
}

export interface AcousticContact {
  id: string;
  position: Vector2D;
  velocity: Vector2D;
  isCavitating: boolean;
  isActiveSonarPinging: boolean;
  acousticSignatureDb: number;
}

export interface SubmarineContact {
  id: string;
  position: Vector2D;
  velocity: Vector2D;
  depthMeters: number; // e.g. 0, -5, -30
  hullHp: number;
  isSilent: boolean;
}

export interface SurfaceVesselContact {
  id: string;
  position: Vector2D;
  speedKnots: number;
  hullHp: number;
  draftMeters: number;
}

export interface ThreatTarget {
  id: string;
  position: Vector2D;
  velocity: Vector2D;
  altitudeMeters: number;
  hp: number;
  isDestroyed: boolean;
  type: 'CRUISE_MISSILE' | 'AIRCRAFT' | 'ROCKET';
}

