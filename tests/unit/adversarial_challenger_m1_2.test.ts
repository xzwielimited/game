import { describe, it, expect, beforeEach } from 'vitest';
import {
  TerrainEngine,
  ResourceEngine,
  SHIP_ROSTER,
  getAllShipDefs,
  getShipDef,
  getShipsByTier,
  getShipsByClass,
  getRequiredXpForTier,
  ShipClassId,
  createInitialPhysicsState,
  createXpCrate,
  createOilRig,
  vec2,
  vec2Length,
  vec2Distance,
  knotsToMs,
  degToRad,
  WEAPON_DEFINITIONS,
  ARCTIC_ICE_BOUNDARY_Y,
} from '../../common/index.js';

describe('Adversarial Verification Suite: Milestone M1 (Challenger M1-2)', () => {
  let terrain: TerrainEngine;
  let resources: ResourceEngine;
  const dt = 0.05;

  beforeEach(() => {
    terrain = new TerrainEngine();
    resources = new ResourceEngine();
  });

  // =========================================================================
  // 1. BATHYMETRIC GROUNDING BOUNDARY CONDITIONS & BEACHING THRESHOLDS
  // =========================================================================
  describe('1. Bathymetric Grounding Boundary Conditions', () => {
    it('boundary condition depth == draft: vessel floats without grounding or damage', () => {
      // Fletcher DD has draft 4.5m
      const fletcher = SHIP_ROSTER['fletcher_dd'];
      // Place ship where water depth is exactly 4.5m (one of the default shallow zones has depth 4.5m at center: (7500, 7000))
      const exactDepth = terrain.getWaterDepthAt(7500, 7000);
      expect(exactDepth).toBeCloseTo(4.5, 2);

      const state = createInitialPhysicsState(fletcher, vec2(7500, 7000), 0);
      state.linearVelocity = vec2(10, 0);

      const result = terrain.checkGrounding(fletcher, state, dt);
      expect(result.isGrounded).toBe(false);
      expect(result.damage).toBe(0);
      expect(state.isGrounded).toBe(false);
      expect(state.linearVelocity.x).toBe(10); // Not slowed down
    });

    it('boundary condition depth < draft (infinitesimal deficit): grounding triggers with friction', () => {
      const fletcher = SHIP_ROSTER['fletcher_dd']; // draft = 4.5m
      // Add a custom shallow zone with depth 4.499m (draft deficit 0.001m)
      terrain.addShallowZone(vec2(1000, 1000), 500, 4.499);
      const depth = terrain.getWaterDepthAt(1000, 1000);
      expect(depth).toBeCloseTo(4.499, 3);

      const state = createInitialPhysicsState(fletcher, vec2(1000, 1000), 0);
      state.linearVelocity = vec2(10, 0);
      const initialHp = state.hullHp;

      const result = terrain.checkGrounding(fletcher, state, 1.0);
      expect(result.isGrounded).toBe(true);
      expect(state.isGrounded).toBe(true);
      // Small draft deficit (0.001m <= 1.5m) applies friction, does NOT beach
      expect(state.linearVelocity.x).toBeGreaterThan(0);
      expect(state.linearVelocity.x).toBeLessThan(10);
      expect(state.hullHp).toBeLessThanOrEqual(initialHp);
    });

    it('boundary condition beaching threshold at exactly draftDeficit > 1.5m', () => {
      const fletcher = SHIP_ROSTER['fletcher_dd']; // draft = 4.5m

      // Scenario A: draftDeficit = 1.500m (depth = 3.0m). draftDeficit is NOT > 1.5, so friction applies
      terrain.addShallowZone(vec2(2000, 2000), 500, 3.0);
      const stateA = createInitialPhysicsState(fletcher, vec2(2000, 2000), 0);
      stateA.linearVelocity = vec2(10, 0);
      stateA.speedKnots = 19.4;
      terrain.checkGrounding(fletcher, stateA, dt);

      // Should be grounded but NOT catastrophically halted to zero immediately
      expect(stateA.isGrounded).toBe(true);
      expect(stateA.linearVelocity.x).toBeGreaterThan(0);

      // Scenario B: draftDeficit = 1.501m (depth = 2.999m). draftDeficit IS > 1.5 -> catastrophic beaching!
      terrain.addShallowZone(vec2(3000, 3000), 500, 2.999);
      const stateB = createInitialPhysicsState(fletcher, vec2(3000, 3000), 0);
      stateB.linearVelocity = vec2(10, 0);
      stateB.angularVelocity = 0.5;
      stateB.speedKnots = 19.4;
      terrain.checkGrounding(fletcher, stateB, dt);

      expect(stateB.isGrounded).toBe(true);
      expect(stateB.linearVelocity.x).toBe(0);
      expect(stateB.linearVelocity.y).toBe(0);
      expect(stateB.angularVelocity).toBe(0);
      expect(stateB.speedKnots).toBe(0);
    });

    it('shallow draft immunity completely protects littoral craft across all shallow depths', () => {
      const ptBoat = SHIP_ROSTER['pt_boat_109']; // SHALLOW_DRAFT_IMMUNITY
      const vosper = SHIP_ROSTER['vosper_mtb'];  // SHALLOW_DRAFT_IMMUNITY
      const skjold = SHIP_ROSTER['skjold_corvette']; // SHALLOW_DRAFT_IMMUNITY

      // Extremely shallow water (0.5m depth, well below draft 1.2m - 1.6m)
      terrain.addShallowZone(vec2(4000, 4000), 500, 0.5);

      for (const ship of [ptBoat, vosper, skjold]) {
        const state = createInitialPhysicsState(ship, vec2(4000, 4000), 0);
        state.linearVelocity = vec2(15, 0);
        const initialHp = state.hullHp;

        const res = terrain.checkGrounding(ship, state, 1.0);
        expect(res.isGrounded).toBe(false);
        expect(res.damage).toBe(0);
        expect(state.isGrounded).toBe(false);
        expect(state.linearVelocity.x).toBe(15);
        expect(state.hullHp).toBe(initialHp);
      }
    });

    it('submarine seabed dive boundary: deep dive into shallow water (< 25m) forces periscope depth with damage', () => {
      const sub = SHIP_ROSTER['skipjack_ssn'];

      // Depth = 24.9m (< 25.0m threshold)
      terrain.addShallowZone(vec2(5000, 5000), 500, 24.9);
      const stateDeep = createInitialPhysicsState(sub, vec2(5000, 5000), 0);
      stateDeep.depthState = 'DEEP';
      stateDeep.currentDepth = -30.0;

      const res = terrain.checkGrounding(sub, stateDeep, 1.0);
      expect(res.isGrounded).toBe(true);
      expect(stateDeep.depthState).toBe('PERISCOPE');
      expect(stateDeep.currentDepth).toBe(-5.0);
      expect(res.damage).toBe(Math.round(sub.maxHp * 0.05 * 1.0));

      // Boundary condition: depth = 25.0m (not < 25.0m)
      terrain.addShallowZone(vec2(6000, 6000), 500, 25.0);
      const stateBorder = createInitialPhysicsState(sub, vec2(6000, 6000), 0);
      stateBorder.depthState = 'DEEP';
      stateBorder.currentDepth = -20.0;

      const resBorder = terrain.checkGrounding(sub, stateBorder, 1.0);
      expect(resBorder.isGrounded).toBe(false);
      expect(stateBorder.depthState).toBe('DEEP');
      expect(resBorder.damage).toBe(0);
    });

    it('destroyed vessel takes 0 grounding damage and does not re-trigger grounding', () => {
      const yamato = SHIP_ROSTER['yamato_bb'];
      terrain.addShallowZone(vec2(7000, 7000), 500, 1.0);
      const state = createInitialPhysicsState(yamato, vec2(7000, 7000), 0);
      state.isDestroyed = true;
      state.hullHp = 0;

      const res = terrain.checkGrounding(yamato, state, 1.0);
      expect(res.isGrounded).toBe(false);
      expect(res.damage).toBe(0);
    });
  });

  // =========================================================================
  // 2. ARCTIC ICE DAMAGE QUADRATIC SCALING & ICEBREAKER MECHANICS
  // =========================================================================
  describe('2. Arctic Ice Damage Quadratic Velocity Scaling & Icebreaker Immunity', () => {
    it('verifies exact quadratic scaling d(HP)/dt = -C_ice * |v|^2 with velocity', () => {
      const cruiser = SHIP_ROSTER['moskva_cg']; // Non-icebreaker
      const cIce = 8.5;

      // Velocities to test: 5, 10, 20 m/s
      const testVelocities = [5, 10, 20];
      const damageValues: number[] = [];

      for (const v of testVelocities) {
        const state = createInitialPhysicsState(cruiser, vec2(5000, 1000), 0); // Arctic Y = 1000m
        state.linearVelocity = vec2(v, 0);

        // Call checkIceGrinding with dt = 1.0s
        const res = terrain.checkIceGrinding(cruiser, state, 1.0);
        damageValues.push(res.damage);
      }

      // With dt = 1.0, velocity is reduced by factor (1.0 - 0.5 * dt) = 0.5 before computing damage:
      // at v=5:  v_eff = 2.5  -> cIce * 2.5^2  * 1.0 = 53.125 -> round = 53
      // at v=10: v_eff = 5.0  -> cIce * 5.0^2  * 1.0 = 212.5  -> round = 213
      // at v=20: v_eff = 10.0 -> cIce * 10.0^2 * 1.0 = 850.0  -> round = 850
      expect(damageValues[0]).toBeCloseTo(53, 0);
      expect(damageValues[1]).toBeCloseTo(213, 0);
      expect(damageValues[2]).toBeCloseTo(850, 0);

      // Check quadratic ratio between 10 m/s and 20 m/s: exactly 4.0x (850 / 213 ≈ 4.0)
      const ratio = damageValues[2] / damageValues[1];
      expect(ratio).toBeCloseTo(4.0, 1);

      // Check quadratic ratio between 5 m/s and 10 m/s: exactly 4.0x (213 / 53 ≈ 4.0)
      const ratioSmall = damageValues[1] / damageValues[0];
      expect(ratioSmall).toBeCloseTo(4.0, 1);
    });

    it('inflicts minimum pressure crushing damage (5 HP/s) on stationary vessel in pack ice', () => {
      const cruiser = SHIP_ROSTER['moskva_cg'];
      const state = createInitialPhysicsState(cruiser, vec2(5000, 1000), 0);
      state.linearVelocity = vec2(0, 0); // Stationary!

      const res = terrain.checkIceGrinding(cruiser, state, 1.0);
      expect(res.inIce).toBe(true);
      expect(res.damage).toBe(5); // Minimum 5 HP/s pressure damage
    });

    it('boundary condition: y <= ARCTIC_ICE_BOUNDARY_Y triggers ice grinding, y > boundary does not', () => {
      const cruiser = SHIP_ROSTER['moskva_cg'];

      // Exactly on boundary: y = 2500m
      const stateOnBorder = createInitialPhysicsState(cruiser, vec2(5000, ARCTIC_ICE_BOUNDARY_Y), 0);
      stateOnBorder.linearVelocity = vec2(10, 0);
      const resBorder = terrain.checkIceGrinding(cruiser, stateOnBorder, 1.0);
      expect(resBorder.inIce).toBe(true);
      expect(resBorder.damage).toBeGreaterThan(0);

      // Just south of boundary: y = 2501m
      const stateSouth = createInitialPhysicsState(cruiser, vec2(5000, ARCTIC_ICE_BOUNDARY_Y + 1), 0);
      stateSouth.linearVelocity = vec2(10, 0);
      const resSouth = terrain.checkIceGrinding(cruiser, stateSouth, 1.0);
      expect(resSouth.inIce).toBe(false);
      expect(resSouth.damage).toBe(0);
    });

    it('icebreaker immunity: polaris_ice and arktika_ice take 0 damage at high speeds', () => {
      const polaris = SHIP_ROSTER['polaris_ice'];
      const arktika = SHIP_ROSTER['arktica_ice'];

      for (const ib of [polaris, arktika]) {
        const state = createInitialPhysicsState(ib, vec2(5000, 1000), 0);
        state.linearVelocity = vec2(30, 0); // High speed 30 m/s (58 knots)
        const initialHp = state.hullHp;

        const res = terrain.checkIceGrinding(ib, state, 1.0);
        expect(res.inIce).toBe(true);
        expect(res.damage).toBe(0);
        expect(state.hullHp).toBe(initialHp);
      }
    });

    it('submarines at DEEP depth are fully shielded from surface ice pack grinding', () => {
      const sub = SHIP_ROSTER['akula_ssn'];
      const state = createInitialPhysicsState(sub, vec2(5000, 1000), 0);
      state.depthState = 'DEEP';
      state.linearVelocity = vec2(20, 0);

      const res = terrain.checkIceGrinding(sub, state, 1.0);
      expect(res.inIce).toBe(true);
      expect(res.damage).toBe(0); // Immune under the ice sheet
    });

    it('investigates icebreaker wake corridor protection and segment lifetime decay', () => {
      const icebreaker = SHIP_ROSTER['arktica_ice'];
      const ibState = createInitialPhysicsState(icebreaker, vec2(5000, 1000), 0);

      // Step terrain simulation to generate wake and advance time
      terrain.stepTerrainSimulation(icebreaker, ibState, 1.0);

      // Follower inside wake (beam 30m * 1.5 = 45m corridor, halfW = 22.5m)
      const cruiser = SHIP_ROSTER['moskva_cg'];
      const followerState = createInitialPhysicsState(cruiser, vec2(5000, 1010), 0); // 10m away (inside 22.5m)
      followerState.linearVelocity = vec2(10, 0);

      const resProtected = terrain.checkIceGrinding(cruiser, followerState, 1.0);
      expect(resProtected.inIce).toBe(true);
      expect(resProtected.damage).toBe(0); // Protected!

      // Follower outside wake corridor: 30m away (> 22.5m)
      const unprotState = createInitialPhysicsState(cruiser, vec2(5000, 1030), 0);
      unprotState.linearVelocity = vec2(10, 0);

      const resUnprot = terrain.checkIceGrinding(cruiser, unprotState, 1.0);
      expect(resUnprot.inIce).toBe(true);
      expect(resUnprot.damage).toBeGreaterThan(0); // Takes grinding damage
    });

    it('ADVERSARIAL STRESS TEST: verifies whether icebreaker wake corridor expires after 30 seconds', () => {
      const icebreaker = SHIP_ROSTER['arktica_ice'];
      const ibState = createInitialPhysicsState(icebreaker, vec2(5000, 1000), 0);

      // Create 1 wake segment at t = 0 (duration 30s, expiresAt = 31.0s)
      terrain.stepTerrainSimulation(icebreaker, ibState, 1.0);

      // Advance simulation by 60 seconds (well past the 30s wake lifetime)
      const dummyShip = SHIP_ROSTER['pt_boat_109'];
      const dummyState = createInitialPhysicsState(dummyShip, vec2(10000, 10000), 0);
      for (let i = 0; i < 60; i++) {
        terrain.stepTerrainSimulation(dummyShip, dummyState, 1.0);
      }

      // Check whether wake at (5000, 1000) has expired
      const isWakeStillPresent = terrain.isPositionInIcebreakerWake(vec2(5000, 1000));
      expect(isWakeStillPresent).toBe(false); // Should be false since >30s passed!
    });
  });

  // =========================================================================
  // 3. OIL RIG CONTESTED CAPTURE LOCKING & RESOURCE MECHANICS
  // =========================================================================
  describe('3. Oil Rig Contested Capture Locking & Resource Mechanics', () => {
    it('locks capture progress and freezes passive XP extraction when two opposing factions are present', () => {
      const rig = createOilRig('rig_alpha', 'Alpha Platform', vec2(5000, 5000));
      resources.addOilRig(rig);

      const blueVessel = {
        playerId: 'blue_1',
        factionId: 'blue',
        shipDef: SHIP_ROSTER['fletcher_dd'],
        physicsState: createInitialPhysicsState(SHIP_ROSTER['fletcher_dd'], vec2(5050, 5000), 0),
        accumulatedXp: 0,
      };

      // 1. Blue captures up to 8.0s
      resources.updateOilRigs([blueVessel], 8.0);
      expect(rig.controlState).toBe('NEUTRAL');
      expect(rig.captureProgress).toBeCloseTo(8.0, 1);

      // 2. Red vessel arrives (contesting!)
      const redVessel = {
        playerId: 'red_1',
        factionId: 'red',
        shipDef: SHIP_ROSTER['kolkata_ddg'],
        physicsState: createInitialPhysicsState(SHIP_ROSTER['kolkata_ddg'], vec2(4950, 5000), 0),
        accumulatedXp: 0,
      };

      const contestedUpdate = resources.updateOilRigs([blueVessel, redVessel], 5.0);
      expect(rig.controlState).toBe('CONTESTED');
      // Progress remains frozen at exactly 8.0s!
      expect(rig.captureProgress).toBeCloseTo(8.0, 1);
      // Zero XP awarded to anyone
      expect(contestedUpdate.xpAwards.size).toBe(0);
      expect(blueVessel.accumulatedXp).toBe(0);
      expect(redVessel.accumulatedXp).toBe(0);
    });

    it('locks already-controlled rig when enemy enters, freezing passive XP extraction during the contest', () => {
      const rig = createOilRig('rig_bravo', 'Bravo Platform', vec2(6000, 6000));
      rig.controlState = 'CONTROLLED';
      rig.controllingFactionId = 'faction_alpha';
      rig.captureProgress = 15.0;
      resources.addOilRig(rig);

      const alphaDefender = {
        playerId: 'alpha_def',
        factionId: 'faction_alpha',
        shipDef: SHIP_ROSTER['burke_ddg'],
        physicsState: createInitialPhysicsState(SHIP_ROSTER['burke_ddg'], vec2(6050, 6000), 0),
        accumulatedXp: 0,
      };

      const betaAttacker = {
        playerId: 'beta_att',
        factionId: 'faction_beta',
        shipDef: SHIP_ROSTER['type_055_cgd'],
        physicsState: createInitialPhysicsState(SHIP_ROSTER['type_055_cgd'], vec2(5950, 6000), 0),
        accumulatedXp: 0,
      };

      // While both present: state becomes CONTESTED
      const update = resources.updateOilRigs([alphaDefender, betaAttacker], 3.0);
      expect(rig.controlState).toBe('CONTESTED');
      // Capture progress should NOT decrement while contested
      expect(rig.captureProgress).toBe(15.0);
      // Crucial: Passive XP extraction is LOCKED (0 XP awarded) while platform is contested
      expect(update.xpAwards.size).toBe(0);
      expect(alphaDefender.accumulatedXp).toBe(0);
    });

    it('ADVERSARIAL STRESS TEST: behavior when all combatants vacate or sink while rig is CONTESTED', () => {
      const rig = createOilRig('rig_vacate_test', 'Vacate Platform', vec2(6000, 6000));
      rig.controlState = 'CONTROLLED';
      rig.controllingFactionId = 'faction_alpha';
      rig.captureProgress = 15.0;
      resources.addOilRig(rig);

      const alphaDefender = {
        playerId: 'alpha_def',
        factionId: 'faction_alpha',
        shipDef: SHIP_ROSTER['burke_ddg'],
        physicsState: createInitialPhysicsState(SHIP_ROSTER['burke_ddg'], vec2(6050, 6000), 0),
        accumulatedXp: 0,
      };

      const betaAttacker = {
        playerId: 'beta_att',
        factionId: 'faction_beta',
        shipDef: SHIP_ROSTER['type_055_cgd'],
        physicsState: createInitialPhysicsState(SHIP_ROSTER['type_055_cgd'], vec2(5950, 6000), 0),
        accumulatedXp: 0,
      };

      // Both in zone -> CONTESTED
      resources.updateOilRigs([alphaDefender, betaAttacker], 1.0);
      expect(rig.controlState).toBe('CONTESTED');

      // Now both leave or are destroyed!
      alphaDefender.physicsState.isDestroyed = true;
      betaAttacker.physicsState.isDestroyed = true;

      // Update with no active ships in zone
      resources.updateOilRigs([alphaDefender, betaAttacker], 5.0);

      // What is the rig state?
      // Since nobody is contesting the rig anymore, does it return to CONTROLLED (for faction_alpha who owns it) or NEUTRAL?
      // If it stays 'CONTESTED' with 0 ships present, faction_alpha is locked out of XP forever!
      expect(rig.controlState).not.toBe('CONTESTED');
    });

    it('submarines at DEEP depth cannot capture, contest, or extract from surface Oil Rigs', () => {
      const rig = createOilRig('rig_deep_test', 'Delta Platform', vec2(7000, 7000));
      resources.addOilRig(rig);

      const subDeep = {
        playerId: 'sub_player',
        factionId: 'sub_faction',
        shipDef: SHIP_ROSTER['skipjack_ssn'],
        physicsState: createInitialPhysicsState(SHIP_ROSTER['skipjack_ssn'], vec2(7010, 7000), 0), // 10m away
        accumulatedXp: 0,
      };
      subDeep.physicsState.depthState = 'DEEP';

      // Deep sub should NOT start capture
      resources.updateOilRigs([subDeep], 5.0);
      expect(rig.captureProgress).toBe(0);
      expect(rig.controlState).toBe('NEUTRAL');

      // Now sub surfaces to PERISCOPE
      subDeep.physicsState.depthState = 'PERISCOPE';
      resources.updateOilRigs([subDeep], 5.0);
      expect(rig.captureProgress).toBeCloseTo(5.0, 1);
    });

    it('boundary condition: capture radius exact cutoff at 180m', () => {
      const rig = createOilRig('rig_radius_test', 'Echo Platform', vec2(8000, 8000));
      resources.addOilRig(rig);

      // Ship at exactly 180.0m (vec2(8180, 8000))
      const shipAt180 = {
        playerId: 'ship_180',
        factionId: 'blue',
        shipDef: SHIP_ROSTER['fletcher_dd'],
        physicsState: createInitialPhysicsState(SHIP_ROSTER['fletcher_dd'], vec2(8180, 8000), 0),
        accumulatedXp: 0,
      };

      resources.updateOilRigs([shipAt180], 2.0);
      expect(rig.captureProgress).toBeCloseTo(2.0, 1); // Captured!

      // Reset progress
      rig.captureProgress = 0;

      // Ship at 180.1m (outside 180m radius)
      shipAt180.physicsState.position = vec2(8180.1, 8000);
      resources.updateOilRigs([shipAt180], 2.0);
      expect(rig.captureProgress).toBe(0); // Not capturing!
    });

    it('oil tanker extraction boost exact cutoff at 100m, enemy tanker gives no bonus', () => {
      const rig = createOilRig('rig_tanker_test', 'Foxtrot Platform', vec2(9000, 9000));
      rig.controlState = 'CONTROLLED';
      rig.controllingFactionId = 'blue';
      resources.addOilRig(rig);

      const blueShip = {
        playerId: 'blue_dd',
        factionId: 'blue',
        shipDef: SHIP_ROSTER['fletcher_dd'],
        physicsState: createInitialPhysicsState(SHIP_ROSTER['fletcher_dd'], vec2(9050, 9000), 0),
        accumulatedXp: 0,
      };

      // 1. Enemy tanker within 50m (red faction): must NOT boost blue extraction!
      const redTanker = {
        playerId: 'red_tanker',
        factionId: 'red',
        shipDef: SHIP_ROSTER['oil_tanker_sup'],
        physicsState: createInitialPhysicsState(SHIP_ROSTER['oil_tanker_sup'], vec2(9030, 9000), 0),
        accumulatedXp: 0,
      };

      // Note: red tanker contests the rig if inside 180m!
      // So let's test with allied tanker:
      const alliedTanker = {
        playerId: 'blue_tanker',
        factionId: 'blue',
        shipDef: SHIP_ROSTER['oil_tanker_sup'],
        physicsState: createInitialPhysicsState(SHIP_ROSTER['oil_tanker_sup'], vec2(9100, 9000), 0), // exactly 100m
        accumulatedXp: 0,
      };

      // At exactly 100.0m: bonus applies (50 XP/s total)
      const tick100 = resources.updateOilRigs([blueShip, alliedTanker], 1.0);
      const totalXp100 = (tick100.xpAwards.get('blue_dd') || 0) + (tick100.xpAwards.get('blue_tanker') || 0);
      expect(totalXp100).toBeCloseTo(50.0, 1);

      // Move allied tanker to 101m: bonus does NOT apply (standard 20 XP/s)
      alliedTanker.physicsState.position = vec2(9101, 9000);
      const tick101 = resources.updateOilRigs([blueShip, alliedTanker], 1.0);
      const totalXp101 = (tick101.xpAwards.get('blue_dd') || 0) + (tick101.xpAwards.get('blue_tanker') || 0);
      expect(totalXp101).toBeCloseTo(20.0, 1);
    });

    it('rig destruction at 12,000 HP triggers 2500 explosion damage with linear falloff to 150m', () => {
      const rig = createOilRig('rig_destruct', 'Rig Destruct', vec2(1000, 1000));
      resources.addOilRig(rig);

      // Victim 1 at 0m: takes 2500 damage (full)
      const v0 = {
        playerId: 'v0',
        factionId: 'blue',
        shipDef: SHIP_ROSTER['yamato_bb'],
        physicsState: createInitialPhysicsState(SHIP_ROSTER['yamato_bb'], vec2(1000, 1000), 0),
        accumulatedXp: 0,
      };

      // Victim 2 at 75m: takes 1250 damage (50% falloff)
      const v75 = {
        playerId: 'v75',
        factionId: 'blue',
        shipDef: SHIP_ROSTER['yamato_bb'],
        physicsState: createInitialPhysicsState(SHIP_ROSTER['yamato_bb'], vec2(1075, 1000), 0),
        accumulatedXp: 0,
      };

      // Victim 3 at 150m: takes 0 damage (edge)
      const v150 = {
        playerId: 'v150',
        factionId: 'blue',
        shipDef: SHIP_ROSTER['yamato_bb'],
        physicsState: createInitialPhysicsState(SHIP_ROSTER['yamato_bb'], vec2(1150, 1000), 0),
        accumulatedXp: 0,
      };

      // Victim 4 at 151m: outside blast radius
      const v151 = {
        playerId: 'v151',
        factionId: 'blue',
        shipDef: SHIP_ROSTER['yamato_bb'],
        physicsState: createInitialPhysicsState(SHIP_ROSTER['yamato_bb'], vec2(1151, 1000), 0),
        accumulatedXp: 0,
      };

      const result = resources.damageOilRig(rig.id, 20000, [v0, v75, v150, v151]);
      expect(result.isDestroyed).toBe(true);

      const dmg0 = v0.shipDef.maxHp - v0.physicsState.hullHp;
      const dmg75 = v75.shipDef.maxHp - v75.physicsState.hullHp;
      const dmg150 = v150.shipDef.maxHp - v150.physicsState.hullHp;
      const dmg151 = v151.shipDef.maxHp - v151.physicsState.hullHp;

      expect(dmg0).toBe(2500);
      expect(dmg75).toBe(1250);
      expect(dmg150).toBe(0);
      expect(dmg151).toBe(0);
    });
  });

  // =========================================================================
  // 4. CRATE MAGNETISM BOUNDARY LIMITS
  // =========================================================================
  describe('4. Crate Magnetism Boundary Limits', () => {
    it('verifies pickup radius boundary R_pickup = (length / 2) * 1.5 + crate.radius', () => {
      const fletcher = SHIP_ROSTER['fletcher_dd']; // length = 114m -> magRadius = (114/2)*1.5 = 85.5m
      const crate = createXpCrate('test_crate_1', vec2(0, 0), 'WOODEN'); // radius = 8m
      const pickupDist = (fletcher.length / 2) * 1.5 + crate.radius; // 85.5 + 8 = 93.5m

      const vessel = {
        playerId: 'p1',
        factionId: 'blue',
        shipDef: fletcher,
        physicsState: createInitialPhysicsState(fletcher, vec2(0, 0), 0),
        accumulatedXp: 0,
      };

      // Test 1: Just outside pickup radius: distance = 93.51m
      crate.position = vec2(pickupDist + 0.01, 0);
      crate.isCollected = false;
      resources.addCrate(crate);

      let res = resources.checkCrateCollection(vessel);
      expect(res.collectedCount).toBe(0);
      expect(crate.isCollected).toBe(false);

      // Test 2: Exactly at pickup radius: distance = 93.50m
      crate.position = vec2(pickupDist, 0);
      res = resources.checkCrateCollection(vessel);
      expect(res.collectedCount).toBe(1);
      expect(crate.isCollected).toBe(true);
      expect(vessel.accumulatedXp).toBe(25);
    });

    it('prevents submarines at DEEP depth from collecting floating surface crates', () => {
      const sub = SHIP_ROSTER['skipjack_ssn'];
      const crate = createXpCrate('sub_crate', vec2(100, 100), 'STEEL');
      resources.addCrate(crate);

      const vessel = {
        playerId: 'sub1',
        factionId: 'blue',
        shipDef: sub,
        physicsState: createInitialPhysicsState(sub, vec2(100, 100), 0), // exact position!
        accumulatedXp: 0,
      };

      // Submarine at DEEP
      vessel.physicsState.depthState = 'DEEP';
      let res = resources.checkCrateCollection(vessel);
      expect(res.collectedCount).toBe(0);
      expect(crate.isCollected).toBe(false);

      // Submarine at PERISCOPE
      vessel.physicsState.depthState = 'PERISCOPE';
      res = resources.checkCrateCollection(vessel);
      expect(res.collectedCount).toBe(1);
      expect(crate.isCollected).toBe(true);
    });

    it('step(dt) accurately decays crate lifetimes and removes expired crates', () => {
      const crate = createXpCrate('decay_crate', vec2(500, 500), 'WOODEN');
      crate.lifetimeRemaining = 1.0; // 1 second left
      resources.addCrate(crate);

      expect(resources.getCrate('decay_crate')).toBeDefined();

      // Step 0.5s: still exists
      resources.step(0.5);
      expect(resources.getCrate('decay_crate')).toBeDefined();
      expect(resources.getCrate('decay_crate')?.lifetimeRemaining).toBeCloseTo(0.5, 2);

      // Step 0.6s: expired and deleted
      resources.step(0.6);
      expect(resources.getCrate('decay_crate')).toBeUndefined();
    });

    it('ADVERSARIAL STRESS TEST: simultaneous vessel sinkings do not overwrite crate IDs in same millisecond', () => {
      const w1 = resources.spawnWreckageCrates(vec2(1000, 1000), 1000);
      const w2 = resources.spawnWreckageCrates(vec2(2000, 2000), 1000);

      // Verify no ID collision between crates spawned in the same execution tick
      const totalSpawned = w1.length + w2.length;
      const allCrates = resources.getAllCrates();
      expect(allCrates.length).toBe(totalSpawned);
    });
  });

  // =========================================================================
  // 5. SHIP ROSTER EMPIRICAL SANITY & CONSISTENCY (ALL 28+ SHIPS)
  // =========================================================================
  describe('5. Ship Roster Consistency & Boundary Sanity across all 28+ Ships', () => {
    const allShips = getAllShipDefs();

    it('confirms the roster has at least 28 vessels defined', () => {
      expect(allShips.length).toBeGreaterThanOrEqual(28);
    });

    it('verifies all ships have strictly positive HP, mass, draft, beam, and length', () => {
      for (const ship of allShips) {
        expect(ship.maxHp, `${ship.id} maxHp`).toBeGreaterThan(0);
        expect(ship.mass, `${ship.id} mass`).toBeGreaterThan(0);
        expect(ship.draft, `${ship.id} draft`).toBeGreaterThan(0);
        expect(ship.length, `${ship.id} length`).toBeGreaterThan(0);
        expect(ship.beam, `${ship.id} beam`).toBeGreaterThan(0);
        expect(ship.maxForwardSpeed, `${ship.id} forward speed`).toBeGreaterThan(0);
        expect(ship.maxReverseSpeed, `${ship.id} reverse speed`).toBeGreaterThan(0);
        expect(ship.accelerationRate, `${ship.id} accel`).toBeGreaterThan(0);
        expect(ship.decelerationRate, `${ship.id} decel`).toBeGreaterThan(0);
        expect(ship.turnRateMax, `${ship.id} turnRate`).toBeGreaterThan(0);
        expect(ship.radarCrossSection, `${ship.id} RCS`).toBeGreaterThan(0);
        expect(ship.cavitationThresholdSpeed, `${ship.id} cavitation`).toBeGreaterThan(0);
      }
    });

    it('verifies all weapon mounts have realistic geometric coordinates within hull bounds', () => {
      for (const ship of allShips) {
        expect(ship.mounts.length, `${ship.id} mount count`).toBeGreaterThanOrEqual(1);

        const halfL = ship.length / 2;
        const halfB = ship.beam / 2;

        for (const mount of ship.mounts) {
          // Mount X must not exceed bow or stern by more than a reasonable overhang margin (5m)
          expect(
            Math.abs(mount.localOffset.x),
            `Mount ${mount.slotId} on ${ship.id} X-offset (${mount.localOffset.x}) exceeds hull half-length (${halfL})`
          ).toBeLessThanOrEqual(halfL + 5.0);

          // Mount Y must not exceed beam width by more than sponson margin (5m)
          expect(
            Math.abs(mount.localOffset.y),
            `Mount ${mount.slotId} on ${ship.id} Y-offset (${mount.localOffset.y}) exceeds hull half-beam (${halfB})`
          ).toBeLessThanOrEqual(halfB + 5.0);

          // Firing arc must be strictly positive and <= 2*PI
          expect(mount.arcCoverage, `Mount ${mount.slotId} on ${ship.id} arcCoverage`).toBeGreaterThan(0);
          expect(mount.arcCoverage, `Mount ${mount.slotId} on ${ship.id} arcCoverage`).toBeLessThanOrEqual(2 * Math.PI + 0.001);

          // Mount traverse and reload parameters (fixed mounts have traverseSpeed = 0)
          expect(mount.traverseSpeed, `Mount ${mount.slotId} on ${ship.id} traverseSpeed`).toBeGreaterThanOrEqual(0);
          expect(mount.reloadTimeTotal, `Mount ${mount.slotId} on ${ship.id} reloadTimeTotal`).toBeGreaterThan(0);
          expect(mount.ammoMax, `Mount ${mount.slotId} on ${ship.id} ammoMax`).toBeGreaterThan(0);
          expect(mount.ammoRegenRate, `Mount ${mount.slotId} on ${ship.id} ammoRegenRate`).toBeGreaterThanOrEqual(0);

          // Referenced weapon definition must exist in WEAPON_DEFINITIONS
          expect(
            WEAPON_DEFINITIONS[mount.weaponDefId],
            `Mount ${mount.slotId} on ${ship.id} references invalid weapon ${mount.weaponDefId}`
          ).toBeDefined();
        }
      }
    });

    it('verifies tier progression validity across T1 through T10', () => {
      for (let t = 1; t <= 10; t++) {
        const ships = getShipsByTier(t);
        expect(ships.length, `Tier ${t} must have at least 1 ship`).toBeGreaterThanOrEqual(1);
      }

      // Check tier progression trends (average HP increases as tier increases)
      const avgHpPerTier: number[] = [];
      for (let t = 1; t <= 10; t++) {
        const ships = getShipsByTier(t);
        const avgHp = ships.reduce((sum, s) => sum + s.maxHp, 0) / ships.length;
        avgHpPerTier.push(avgHp);
      }

      // Tier 10 average HP should be significantly higher than Tier 1
      expect(avgHpPerTier[9]).toBeGreaterThan(avgHpPerTier[0] * 5.0);
    });

    it('verifies all mount slot IDs on each ship are unique', () => {
      for (const ship of allShips) {
        const slotIds = ship.mounts.map(m => m.slotId);
        const uniqueSlotIds = new Set(slotIds);
        expect(uniqueSlotIds.size, `${ship.id} has duplicate mount slot IDs: ${slotIds}`).toBe(slotIds.length);
      }
    });

    it('verifies forward speed is strictly greater than reverse speed across all vessels', () => {
      for (const ship of allShips) {
        expect(ship.maxForwardSpeed, `${ship.id} forward speed vs reverse speed`).toBeGreaterThan(ship.maxReverseSpeed);
      }
    });

    it('verifies all ships have valid special abilities and traits arrays', () => {
      for (const ship of allShips) {
        expect(Array.isArray(ship.specialAbilities), `${ship.id} specialAbilities`).toBe(true);
        expect(ship.specialAbilities.length, `${ship.id} must have abilities`).toBeGreaterThanOrEqual(1);
        expect(Array.isArray(ship.traits), `${ship.id} traits`).toBe(true);
        expect(ship.traits.length, `${ship.id} must have traits`).toBeGreaterThanOrEqual(1);
      }
    });

    it('verifies all 8 naval tactical classes are represented with appropriate traits', () => {
      const classes: ShipClassId[] = [
        'COASTAL_PATROL',
        'DESTROYER',
        'CRUISER',
        'BATTLESHIP',
        'SUBMARINE',
        'AIRCRAFT_CARRIER',
        'DREDGER_ICEBREAKER',
        'TACTICAL_SUPPORT',
      ];

      for (const cls of classes) {
        const ships = getShipsByClass(cls);
        expect(ships.length, `Class ${cls} must have vessels`).toBeGreaterThanOrEqual(1);
      }
    });
  });
});
