/**
 * Milestone M2 Unit & Boundary Tests: All 10 Weapon & Equipment Systems
 * Clean-Room Test Suite for NavalCommand.io
 */

import { describe, it, expect } from 'vitest';
import { degToRad, vec2Distance } from '../../common/math/vector2.js';
import {
  WEAPON_DEFINITIONS,
  createWeaponMount,
  isAngleWithinMountArc,
  stepMountTraverse,
  stepMountReloadAndRegen,
  canMountFire,
  fireMount,
  AcousticContact,
  SubmarineContact,
  SurfaceVesselContact,
  ThreatTarget,
} from '../../common/models/weapons.js';
import {
  calculateDispersionEllipse,
  calculateBallisticFlightTime,
  calculateShellAltitude,
  createArtilleryShell,
  stepArtilleryShell,
  createTorpedo,
  createTorpedoDecoy,
  stepTorpedo,
  stepTorpedoDecoy,
  createCruiseMissile,
  stepCruiseMissile,
  createRocket,
  stepRocket,
  createRocketTorpedo,
  stepRocketTorpedo,
  stepCIWSEnvelope,
  launchSAMInterceptor,
  stepSAMInterceptor,
  createDepthCharge,
  calculateDepthChargeDamage,
  stepDepthCharge,
  createNavalMine,
  stepNavalMine,
  createAircraftSquadron,
  stepAircraft,
  deploySonarBuoy,
  stepSonarBuoy,
  executeDredgerAction,
  WeaponKinematicsEngine,
} from '../../common/simulation/weapon_kinematics.js';
import { TerrainEngine } from '../../common/simulation/terrain_engine.js';

describe('M2: 10 Naval Weapon & Tactical Equipment Systems', () => {
  describe('1. Naval Artillery Turrets, Firing Arcs & Ballistics', () => {
    it('validates turret mount firing arcs, port/starboard orientation, and reload timers', () => {
      // Bow turret facing 0 rad with 260 deg arc
      const bowMount = createWeaponMount('bow_127', 'gun_127mm_mk45', { x: 40, y: 0 }, 0, degToRad(260));
      expect(isAngleWithinMountArc(bowMount, 0)).toBe(true);
      expect(isAngleWithinMountArc(bowMount, degToRad(120))).toBe(true);
      expect(isAngleWithinMountArc(bowMount, Math.PI)).toBe(false); // Directly astern is blocked

      // Port mount facing -PI/2 with 120 deg arc
      const portMount = createWeaponMount('port_torp', 'torpedo_533mm_unguided', { x: 0, y: -8 }, -Math.PI / 2, degToRad(120));
      expect(isAngleWithinMountArc(portMount, -Math.PI / 2)).toBe(true);
      expect(isAngleWithinMountArc(portMount, Math.PI / 2)).toBe(false); // Starboard blocked

      // Traverse & fire cycle
      const targetAngle = degToRad(45);
      expect(canMountFire(bowMount, targetAngle)).toBe(false); // Not traversed yet
      for (let i = 0; i < 30; i++) {
        stepMountTraverse(bowMount, targetAngle, 0.1);
      }
      expect(canMountFire(bowMount, targetAngle)).toBe(true);
      expect(fireMount(bowMount)).toBe(true);
      expect(bowMount.ammoCurrent).toBe(bowMount.ammoMax - 1);
      expect(bowMount.reloadTimeRemaining).toBe(bowMount.reloadTimeTotal);
      expect(canMountFire(bowMount)).toBe(false);

      // Step reload timer to completion
      stepMountReloadAndRegen(bowMount, bowMount.reloadTimeTotal + 0.1);
      expect(bowMount.reloadTimeRemaining).toBe(0);
      expect(canMountFire(bowMount)).toBe(true);
    });

    it('calculates Gaussian dispersion ellipse and parabolic ballistic shell flight', () => {
      const ellipse = calculateDispersionEllipse(2000);
      expect(ellipse.semiMajorAxis).toBeCloseTo(50.0, 2);
      expect(ellipse.semiMinorAxis).toBeCloseTo(24.0, 2);

      const flightTime = calculateBallisticFlightTime(1600, 800);
      expect(flightTime).toBeCloseTo(2.0, 3);

      const midAlt = calculateShellAltitude(2.0, 1.0, 40.0);
      expect(midAlt).toBeCloseTo(40.0, 3);

      const shell = createArtilleryShell(
        'sh_1',
        'ship_1',
        'turret_1',
        { x: 0, y: 0 },
        { x: 1560, y: 0 },
        WEAPON_DEFINITIONS['heavy_gun_406mm']
      );
      expect(shell.caliberMm).toBe(406);
      expect(shell.isDetonated).toBe(false);

      // Step halfway
      const halfRes = stepArtilleryShell(shell, shell.flightTimeTotal * 0.5);
      expect(halfRes.detonated).toBe(false);
      expect(shell.altitude).toBeGreaterThan(5.0);

      // Step to impact
      const finalRes = stepArtilleryShell(shell, shell.flightTimeTotal * 0.6);
      expect(finalRes.detonated).toBe(true);
      expect(shell.currentPos.x).toBeCloseTo(1560, 1);
    });
  });

  describe('2. Guided & Unguided Torpedoes + Acoustic Decoys', () => {
    it('runs straight torpedo and arms acoustic homing torpedo after 300m run', () => {
      const straight = createTorpedo('t_1', 'sub_1', 'tube_1', { x: 0, y: 0 }, 0, false);
      expect(straight.isArmed).toBe(true);

      const homing = createTorpedo('t_2', 'sub_1', 'tube_2', { x: 0, y: 0 }, 0, true);
      expect(homing.isArmed).toBe(false);

      // Advance 16 seconds (~312m at 19.5 m/s)
      stepTorpedo(homing, 16.0);
      expect(homing.distanceTraveled).toBeGreaterThanOrEqual(300);
      expect(homing.isArmed).toBe(true);
    });

    it('homes on enemy acoustic contact within +/-35 deg cone and gets spoofed by acoustic decoy', () => {
      const homing = createTorpedo('t_homing', 'sub_1', 'tube_1', { x: 0, y: 0 }, 0, true);
      homing.isArmed = true;

      const enemyContact: AcousticContact = {
        id: 'enemy_dd',
        position: { x: 400, y: 120 }, // Within 600m range and +/-35 deg cone
        velocity: { x: 0, y: 0 },
        isCavitating: true,
        isActiveSonarPinging: false,
        acousticSignatureDb: 95,
      };

      stepTorpedo(homing, 1.0, [enemyContact], []);
      expect(homing.targetContactId).toBe('enemy_dd');
      expect(homing.heading).toBeGreaterThan(0); // Turned toward +y

      // Now deploy an acoustic decoy noisemaker (120 dB) within attraction radius
      const decoy = createTorpedoDecoy('decoy_1', 'enemy_dd', { x: 350, y: -80 }, 0);
      stepTorpedo(homing, 1.0, [enemyContact], [decoy]);
      expect(homing.isSpoofedByDecoy).toBe(true);
      expect(homing.spoofedDecoyId).toBe('decoy_1');

      // Decoy expires after duration
      stepTorpedoDecoy(decoy, 30.0);
      expect(decoy.isExpired).toBe(true);
    });
  });

  describe('3. Cruise Missiles & Submarine Periscope Guidance Constraint', () => {
    it('transitions through BOOST -> MIDCOURSE -> TERMINAL and aborts guidance if submarine dives below periscope depth', () => {
      const missile = createCruiseMissile(
        'cm_1',
        'sub_ohio',
        'vls_1',
        { x: 0, y: 0 },
        0,
        { x: 3000, y: 800 },
        true,
        -5.0 // Periscope depth
      );
      expect(missile.guidanceActive).toBe(true);
      expect(missile.guidanceAborted).toBe(false);

      // Step at periscope depth (-5.0m): guidance remains active
      stepCruiseMissile(missile, 2.0, -5.0);
      expect(missile.guidanceActive).toBe(true);
      expect(missile.heading).toBeGreaterThan(0);

      // Submarine dives to deep (-15.0m < -5.0m): guidance immediately aborts!
      const headingBeforeDive = missile.heading;
      const res = stepCruiseMissile(missile, 1.0, -15.0);
      expect(res.guidanceAborted).toBe(true);
      expect(missile.guidanceActive).toBe(false);
      expect(missile.heading).toBeCloseTo(headingBeforeDive, 5);
    });
  });

  describe('4. Unguided Rocket Barrages', () => {
    it('fires multi-round rocket salvo and detonates at impact coordinates', () => {
      const engine = new WeaponKinematicsEngine();
      const rbuMount = createWeaponMount('rbu_1', 'rocket_barrage_rbu', { x: 20, y: 0 }, 0);
      const salvo = engine.fireRocketBarrageMount('ship_1', rbuMount, { x: 0, y: 0 }, { x: 840, y: 0 }, 8);
      expect(salvo.length).toBe(8);

      const rocket = createRocket('rk_1', 'ship_1', 'rbu_1', { x: 0, y: 0 }, { x: 420, y: 0 });
      expect(rocket.flightTimeTotal).toBeCloseTo(1.0, 2);
      const stepRes = stepRocket(rocket, 1.1);
      expect(stepRes.detonated).toBe(true);
      expect(rocket.currentPos.x).toBeCloseTo(420, 1);
    });
  });

  describe('5. Rocket Torpedoes (ASROC Standoff)', () => {
    it('boosts through air, enters water at target coordinates, and homes acoustically underwater', () => {
      const asroc = createRocketTorpedo('asroc_1', 'dd_1', 'asroc_mount', { x: 0, y: 0 }, { x: 560, y: 0 });
      expect(asroc.flightPhase).toBe('AIR_BALLISTIC');

      // Step through air flight (~2.0s at 280 m/s)
      const waterEntry = stepRocketTorpedo(asroc, 2.1, []);
      expect(waterEntry.transitionedToWater).toBe(true);
      expect(asroc.flightPhase).toBe('WATER_ENTRY');

      // Transition to underwater homing
      stepRocketTorpedo(asroc, 0.1, []);
      expect(asroc.flightPhase).toBe('UNDERWATER_HOMING');

      // Home on submerged sub contact ahead
      const subContact: AcousticContact = {
        id: 'sub_target',
        position: { x: 700, y: 30 },
        velocity: { x: 0, y: 0 },
        isCavitating: false,
        isActiveSonarPinging: false,
        acousticSignatureDb: 75,
      };
      stepRocketTorpedo(asroc, 0.5, [subContact]);
      expect(asroc.targetContactId).toBe('sub_target');
      expect(asroc.heading).toBeGreaterThan(0);
    });
  });

  describe('6. SAM & CIWS Point-Defense Interception', () => {
    it('engages incoming cruise missiles with CIWS bursts and SAM interceptors', () => {
      const ciwsMount = createWeaponMount('ciws_1', 'ciws_phalanx_20mm', { x: 0, y: 0 }, 0, 2 * Math.PI);
      const threat: ThreatTarget = {
        id: 'incoming_cm',
        position: { x: 400, y: 0 },
        velocity: { x: -300, y: 0 },
        altitudeMeters: 15,
        hp: 50,
        isDestroyed: false,
        type: 'CRUISE_MISSILE',
      };

      const ciwsRes1 = stepCIWSEnvelope(ciwsMount, { x: 0, y: 0 }, 0, [threat], 0.2);
      expect(ciwsRes1.burstFired).toBe(true);
      expect(threat.hp).toBe(25);

      // Wait reload (0.1s) and fire second burst to destroy threat
      const ciwsRes2 = stepCIWSEnvelope(ciwsMount, { x: 0, y: 0 }, 0, [threat], 0.2);
      expect(ciwsRes2.interceptedThreatId).toBe('incoming_cm');
      expect(threat.isDestroyed).toBe(true);

      // SAM interceptor test
      const airThreat: ThreatTarget = {
        id: 'enemy_strike',
        position: { x: 100, y: 0 },
        velocity: { x: -100, y: 0 },
        altitudeMeters: 120,
        hp: 300,
        isDestroyed: false,
        type: 'AIRCRAFT',
      };
      const sam = launchSAMInterceptor('sam_1', 'dd_1', 'vls_sam', { x: 0, y: 0 }, 'enemy_strike', airThreat.position);
      const samRes = stepSAMInterceptor(sam, 0.15, [airThreat]);
      expect(samRes.detonated).toBe(true);
      expect(samRes.interceptedThreatId).toBe('enemy_strike');
      expect(airThreat.isDestroyed).toBe(true);
    });
  });

  describe('7. ASW Depth Charges', () => {
    it('sinks at 3.5 m/s and detonates via hydrostatic depth fuse or 3D proximity to submerged submarine', () => {
      const dc = createDepthCharge('dc_1', 'dd_1', 'stern_dc', { x: 100, y: 100 }, 'DEEP');
      expect(dc.targetDetonationDepth).toBe(-30.0);

      const sub: SubmarineContact = {
        id: 'sub_akula',
        position: { x: 105, y: 100 },
        velocity: { x: 0, y: 0 },
        depthMeters: -14.0,
        hullHp: 3000,
        isSilent: true,
      };

      // Step 4 seconds -> depth reaches -14.0m (within 15m 3D proximity of sub at x=105, z=-14)
      const res = stepDepthCharge(dc, 4.0, [sub]);
      expect(res.detonated).toBe(true);
      expect(res.damageMap.get('sub_akula')).toBeGreaterThan(1000);
      expect(sub.hullHp).toBeLessThan(2000);

      // Verify 3D quadratic falloff outside blast radius returns 0
      expect(calculateDepthChargeDamage({ x: 0, y: 0 }, -30, { x: 100, y: 0 }, -30)).toBe(0);
    });
  });

  describe('8. Naval Mines', () => {
    it('enforces 5.0s arming delay and triggers on direct contact or magnetic high-speed pass', () => {
      const mine = createNavalMine('mine_1', 'minelayer_1', 'mine_rack', { x: 500, y: 500 });
      expect(mine.isArmed).toBe(false);

      const fastTarget: SurfaceVesselContact = {
        id: 'cruiser_1',
        position: { x: 515, y: 500 }, // 15m away (within 18m magnetic radius, outside 10m contact)
        speedKnots: 24, // > 15 knots threshold
        hullHp: 4500,
        draftMeters: 6.0,
      };

      // Before 5s arming completes, does not detonate
      const earlyRes = stepNavalMine(mine, 3.0, [fastTarget], []);
      expect(earlyRes.detonated).toBe(false);
      expect(mine.isArmed).toBe(false);

      // Finish arming
      stepNavalMine(mine, 2.5, [], []);
      expect(mine.isArmed).toBe(true);

      // Now magnetic influence triggers detonation
      const detRes = stepNavalMine(mine, 0.1, [fastTarget], []);
      expect(detRes.detonated).toBe(true);
      expect(detRes.victimId).toBe('cruiser_1');
      expect(detRes.damage).toBe(2200);
      expect(fastTarget.hullHp).toBe(2300);
    });
  });

  describe('9. Controllable Aircraft Squadrons, ASW Helicopters & Persistent Sonar Buoys', () => {
    it('flies aircraft to cursor waypoint and deploys persistent 1,200m Sonar Buoy for 75s', () => {
      const heli = createAircraftSquadron('heli_1', 'cv_1', 'ASW_HELICOPTER', { x: 0, y: 0 }, { x: 300, y: 0 });
      expect(heli.canDeploySonobuoy).toBe(true);

      // Fly for 5 seconds at 60 m/s -> reaches (300, 0) and enters HOVERING
      stepAircraft(heli, 5.0);
      const hoverRes = stepAircraft(heli, 0.2);
      expect(hoverRes.reachedWaypoint).toBe(true);
      expect(heli.status).toBe('HOVERING');

      // Deploy Sonar Buoy
      const buoy = deploySonarBuoy('buoy_1', 'heli_1', heli.position);
      expect(buoy.radius).toBe(1200);
      expect(buoy.durationRemaining).toBe(75.0);

      const deepSilentSub: SubmarineContact = {
        id: 'silent_sub_yasen',
        position: { x: 1100, y: 0 }, // 800m from buoy at (300, 0) -> inside 1,200m radius
        velocity: { x: 2, y: 0 },
        depthMeters: -35,
        hullHp: 4000,
        isSilent: true,
      };

      const detected = stepSonarBuoy(buoy, 1.0, [deepSilentSub]);
      expect(detected).toContain('silent_sub_yasen');

      // Expire after 75s
      stepSonarBuoy(buoy, 75.0, [deepSilentSub]);
      expect(buoy.isExpired).toBe(true);
    });
  });

  describe('10. Hydraulic Dredger & Sand Depositor Tool', () => {
    it('excavates shallow water channels to 15m depth and deposits sandbars to 2m depth', () => {
      const terrain = new TerrainEngine([]);
      const targetCoords = { x: 3200, y: 5500 }; // Default shallow zone (3.0m depth)
      expect(terrain.getWaterDepthAt(targetCoords.x, targetCoords.y)).toBeLessThan(10.0);

      // Excavate deep channel
      executeDredgerAction('dredger_1', { x: 3150, y: 5500 }, targetCoords, 'EXCAVATE', terrain, 120, 15.0);
      expect(terrain.getWaterDepthAt(targetCoords.x, targetCoords.y)).toBeCloseTo(15.0, 1);

      // Deposit sandbar in deep water
      const deepSpot = { x: -2000, y: -2000 };
      expect(terrain.getWaterDepthAt(deepSpot.x, deepSpot.y)).toBeGreaterThan(20.0);
      executeDredgerAction('dredger_1', { x: -1950, y: -2000 }, deepSpot, 'DEPOSIT_SAND', terrain, 100, 2.0);
      expect(terrain.getWaterDepthAt(deepSpot.x, deepSpot.y)).toBeCloseTo(2.0, 1);
    });
  });
});
