/**
 * Milestone M3 Unit & Simulation Tests:
 * 3-Layer Sensor Suite, Submarine/ASW Tactical Balance, ECM Jamming & Mercy Hospital Ship
 * Clean-Room Test Suite for NavalCommand.io
 */

import { describe, it, expect } from 'vitest';
import { SHIP_ROSTER } from '../../common/models/ships.js';
import {
  createInitialPhysicsState,
  updateHydrodynamics,
  commandDepthState,
  toggleStealthMode,
} from '../../common/simulation/hydrodynamics.js';
import {
  createCruiseMissile,
  stepCruiseMissile,
  deploySonarBuoy,
} from '../../common/simulation/weapon_kinematics.js';
import {
  SensorEntityState,
  isLineOfSightClear,
  calculateCavitationNoise,
  evaluateVisualDetection,
  evaluateRadarDetection,
  evaluateSonarDetection,
  evaluateAircraftSubmarineDetection,
  stepTrackConfidenceScore,
  createECMJammerState,
  triggerECMJammer,
  stepECMJammer,
  evaluateECMDeflection,
  createMercyRepairState,
  stepMercyRepairCooldown,
  executeMercyRepairPulse,
} from '../../common/sensors/sensor_suite.js';
import { IslandEntity } from '../../common/models/terrain.js';

function makeSensorEntity(overrides: Partial<SensorEntityState> = {}): SensorEntityState {
  return {
    id: 'vessel_1',
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    speedKnots: 12,
    depthState: 'SURFACE',
    depthMeters: 0,
    radarCrossSection: 35,
    cavitationThresholdKnots: 18,
    isStealthCruiseActive: false,
    isActiveSonarPinging: false,
    ecmActive: false,
    visualRangeMeters: 650,
    radarRangeMeters: 1400,
    passiveSonarRangeMeters: 900,
    activeSonarRangeMeters: 1200,
    ...overrides,
  };
}

describe('M3: 3-Layer Sensor Suite, Submarine/ASW Balance, ECM & Mercy Hospital Ship', () => {
  describe('1. 3-Layer Concurrent Sensor Suite (Visual, Radar, Sonar & Island Occlusion)', () => {
    const islandObstacle: IslandEntity = {
      id: 'island_central',
      name: 'Central Atoll',
      elevation: 45,
      polygon: {
        vertices: [
          { x: 350, y: -200 },
          { x: 550, y: -200 },
          { x: 550, y: 200 },
          { x: 350, y: 200 },
        ],
      },
    };

    it('blocks Visual and Radar Line-of-Sight when an island polygon lies between vessels', () => {
      const observer = makeSensorEntity({ id: 'obs', position: { x: 0, y: 0 } });
      const targetBehindIsland = makeSensorEntity({ id: 'tgt', position: { x: 800, y: 0 } });
      const targetClear = makeSensorEntity({ id: 'tgt_clear', position: { x: 0, y: 500 } });

      expect(isLineOfSightClear(observer.position, targetBehindIsland.position, [islandObstacle])).toBe(false);
      expect(evaluateRadarDetection(observer, targetBehindIsland, [islandObstacle]).detected).toBe(false);

      expect(isLineOfSightClear(observer.position, targetClear.position, [islandObstacle])).toBe(true);
      expect(evaluateVisualDetection(observer, targetClear, [islandObstacle])).toBe(true);
      expect(evaluateRadarDetection(observer, targetClear, [islandObstacle]).detected).toBe(true);
    });

    it('detects cavitating vessels on Passive Sonar and exposes Active Sonar pingers at 2x counter-detection range', () => {
      const subObserver = makeSensorEntity({
        id: 'sub_obs',
        position: { x: 0, y: 0 },
        depthState: 'DEEP',
        depthMeters: -30,
      });

      // Target destroyer pinging active sonar (active range 1200m -> 2x counter-detection = 2400m)
      const pingingDestroyer = makeSensorEntity({
        id: 'dd_pinger',
        position: { x: 2100, y: 0 },
        isActiveSonarPinging: true,
        activeSonarRangeMeters: 1200,
      });

      const sonarRes = evaluateSonarDetection(subObserver, pingingDestroyer, []);
      expect(sonarRes.counterDetectedPinger).toBe(true);
      expect(sonarRes.passiveDetected).toBe(true);
    });

    it('transitions 5-state Track Confidence FSM up on multi-sensor contact and decays when lost', () => {
      let track = stepTrackConfidenceScore(0, ['VISUAL', 'RADAR'], 0.5);
      expect(track.state).toBe('AMBIGUOUS_TRACK');

      track = stepTrackConfidenceScore(track.score, ['VISUAL', 'RADAR'], 0.6);
      expect(track.state).toBe('LOCKED_TARGET');

      // Lose all sensor contact -> decays back toward UNDETECTED
      track = stepTrackConfidenceScore(track.score, [], 5.0);
      expect(track.state).toBe('UNDETECTED');
    });
  });

  describe('2. Submarine 4-6s Dive/Surface Cooldown, Periscope Guidance & Stealth Cruise', () => {
    it('enforces a 4-6s Dive/Surface transition cooldown blocking rapid dolphin-hopping', () => {
      const subDef = SHIP_ROSTER['akula_ssn'];
      const phys = createInitialPhysicsState(subDef, { x: 0, y: 0 }, 0);

      // Command dive to DEEP: initiates 5.0s transition timer, depthState remains SURFACE until cooldown finishes
      expect(commandDepthState(subDef, phys, 'DEEP')).toBe(true);
      expect(phys.depthTransitionTimer).toBeGreaterThanOrEqual(4.0);
      expect(phys.depthTransitionTimer).toBeLessThanOrEqual(6.0);
      expect(phys.depthState).toBe('SURFACE');

      // Spamming the same dive command during active transition cooldown is blocked!
      expect(commandDepthState(subDef, phys, 'DEEP')).toBe(false);

      // After 2.0 seconds (< 4-6s cooldown), submarine is still on SURFACE and cannot dodge surface fire yet
      updateHydrodynamics(subDef, phys, 0.5, 0, 2.0);
      expect(phys.depthState).toBe('SURFACE');
      expect(phys.depthTransitionTimer).toBeGreaterThan(2.0);

      // Advance remaining 3.5 seconds -> cooldown completes, submarine finally reaches DEEP state
      updateHydrodynamics(subDef, phys, 0.5, 0, 3.5);
      expect(phys.depthTransitionTimer).toBe(0);
      expect(phys.depthState).toBe('DEEP');
    });

    it('aborts active cruise missile guidance immediately if the launching submarine dives below Periscope Depth', () => {
      const missile = createCruiseMissile(
        'cm_sub',
        'yasen_ssgn',
        'vls_1',
        { x: 0, y: 0 },
        0,
        { x: 2500, y: 600 },
        true,
        -5.0 // Periscope depth
      );
      expect(missile.guidanceActive).toBe(true);

      // Submarine dives below periscope depth (-18m < -5m)
      const stepRes = stepCruiseMissile(missile, 0.5, -18.0);
      expect(stepRes.guidanceAborted).toBe(true);
      expect(missile.guidanceActive).toBe(false);
    });

    it('caps submarine speed below cavitation threshold when Stealth Cruise Toggle is active', () => {
      const subDef = SHIP_ROSTER['skipjack_ssn'];
      const phys = createInitialPhysicsState(subDef, { x: 0, y: 0 }, 0);
      commandDepthState(subDef, phys, 'DEEP');
      updateHydrodynamics(subDef, phys, 1.0, 0, 6.0); // Finish dive

      // Enable Stealth Cruise Toggle
      expect(toggleStealthMode(subDef, phys, true)).toBe(true);
      expect(phys.stealthModeActive).toBe(true);

      // Run full throttle for 30 seconds
      for (let i = 0; i < 60; i++) {
        updateHydrodynamics(subDef, phys, 1.0, 0, 0.5);
      }

      // Speed remains strictly below cavitation threshold and cavitation noise is false!
      expect(phys.isCavitationNoise).toBe(false);
      const cavThresholdKnots = subDef.cavitationThresholdSpeed * 1.94384;
      expect(phys.speedKnots).toBeLessThanOrEqual(cavThresholdKnots);
    });
  });

  describe('3. High-Speed Aircraft vs Deep Silent Submarine & Sonar Buoy Requirement', () => {
    it('prevents high-speed aircraft from detecting a deep, silent submarine unless a Sonar Buoy is deployed', () => {
      const deepSilentSub = makeSensorEntity({
        id: 'silent_seawolf',
        position: { x: 500, y: 500 },
        depthState: 'DEEP',
        depthMeters: -35,
        speedKnots: 12,
        cavitationThresholdKnots: 22,
        isStealthCruiseActive: true,
        isActiveSonarPinging: false,
      });

      expect(calculateCavitationNoise(deepSilentSub)).toBe(0);

      // 1. High-speed strike fighter flying directly overhead (120 m/s, no buoys)
      const highSpeedPass = evaluateAircraftSubmarineDetection(
        { x: 500, y: 500 },
        120.0,
        false,
        deepSilentSub,
        []
      );
      expect(highSpeedPass.detected).toBe(false);
      expect(highSpeedPass.canDeployBuoyNow).toBe(false);

      // 2. ASW Helicopter slows/hovers and deploys a persistent Sonar Buoy within 1,200m
      const buoy = deploySonarBuoy('buoy_alpha', 'heli_asw', { x: 900, y: 500 }); // 400m from sub
      const buoyPass = evaluateAircraftSubmarineDetection(
        { x: 900, y: 500 },
        0.0,
        true,
        deepSilentSub,
        [buoy]
      );
      expect(buoyPass.canDeployBuoyNow).toBe(true);
      expect(buoyPass.detected).toBe(true);
      expect(buoyPass.method).toBe('SONOBUOY');
    });
  });

  describe('4. Electronic Warfare (ECM Jamming) & Mercy-Class Hospital Ship', () => {
    it('activates ECM Jamming (5s active / 25s cooldown), reduces enemy radar range by 60%, and deflects guided missiles', () => {
      const ecm = createECMJammerState();
      expect(triggerECMJammer(ecm)).toBe(true);
      expect(ecm.active).toBe(true);
      expect(ecm.activeTimerRemaining).toBe(5.0);
      expect(ecm.cooldownRemaining).toBe(25.0);

      // Cannot re-trigger while active or on cooldown
      expect(triggerECMJammer(ecm)).toBe(false);

      const enemyObserver = makeSensorEntity({ id: 'enemy', position: { x: 0, y: 0 }, radarRangeMeters: 1400 });
      const jammingCruiser = makeSensorEntity({
        id: 'cruiser_ecm',
        position: { x: 900, y: 0 },
        ecmActive: true,
      });

      // Normal radar range ~1400m; with ECM (0.4x = 560m), cruiser at 900m is hidden from radar!
      const radarCheck = evaluateRadarDetection(enemyObserver, jammingCruiser, []);
      expect(radarCheck.effectiveRadarRange).toBeCloseTo(560, 0);
      expect(radarCheck.detected).toBe(false);

      // Guided missile deflection check
      const incomingMissile = createCruiseMissile('cm_enemy', 'enemy', 'vls', { x: 200, y: 0 }, 0, { x: 900, y: 0 });
      const deflected = evaluateECMDeflection(incomingMissile, ecm, 0.30); // Roll 0.30 < 0.85 deflection probability
      expect(deflected).toBe(true);
      expect(incomingMissile.guidanceActive).toBe(false);
      expect(incomingMissile.guidanceAborted).toBe(true);

      // Step 5.5s -> ECM active phase ends, cooldown still counting down
      stepECMJammer(ecm, 5.5);
      expect(ecm.active).toBe(false);
      expect(ecm.cooldownRemaining).toBeCloseTo(19.5, 1);
    });

    it('restores 50% hull HP to damaged friendly vessels on a 30s cooldown with Mercy-class Hospital Ship', () => {
      const mercyState = createMercyRepairState();
      const damagedAlly = {
        position: { x: 120, y: 0 },
        hullHp: 1500,
        maxHp: 5000,
      };

      const repair1 = executeMercyRepairPulse({ x: 0, y: 0 }, mercyState, damagedAlly);
      expect(repair1.repaired).toBe(true);
      expect(repair1.hpRestored).toBe(2500); // 50% of 5000 maxHp
      expect(damagedAlly.hullHp).toBe(4000);
      expect(mercyState.cooldownRemaining).toBe(30.0);

      // Blocked while on 30s cooldown
      const repairWhileCooling = executeMercyRepairPulse({ x: 0, y: 0 }, mercyState, damagedAlly);
      expect(repairWhileCooling.repaired).toBe(false);

      // Advance 30s cooldown and repair again (capped at maxHp)
      stepMercyRepairCooldown(mercyState, 30.0);
      const repair2 = executeMercyRepairPulse({ x: 0, y: 0 }, mercyState, damagedAlly);
      expect(repair2.repaired).toBe(true);
      expect(damagedAlly.hullHp).toBe(5000);
    });
  });
});
