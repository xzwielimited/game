import { describe, it, expect, beforeEach } from 'vitest';
import {
  TerrainEngine,
  ResourceEngine,
  SHIP_ROSTER,
  createInitialPhysicsState,
  createXpCrate,
  createOilRig,
  resolveShipToShipCollision,
  resolveShipToIslandCollision,
  vec2,
  vec2Distance,
  knotsToMs,
  updateHydrodynamics,
} from '../../common/index.js';

describe('Feature 2: Terrain Biomes, Bathymetric Grounding, Arctic Ice & Resources', () => {
  let terrain: TerrainEngine;
  let resources: ResourceEngine;
  const dt = 0.05;

  beforeEach(() => {
    terrain = new TerrainEngine();
    resources = new ResourceEngine();
  });

  describe('2.1 Four Distinct Terrain Biomes', () => {
    it('identifies ARCTIC_ICE biome in northern theater (y <= 2500m)', () => {
      const biome = terrain.getBiomeAt(5000, 1500);
      expect(biome).toBe('ARCTIC_ICE');
    });

    it('identifies ISLAND biome inside island polygons', () => {
      // Default island at (8000, 8000)
      const biome = terrain.getBiomeAt(8200, 8200);
      expect(biome).toBe('ISLAND');
      expect(terrain.getWaterDepthAt(8200, 8200)).toBe(0);
    });

    it('identifies SHALLOW_WATER biome in littoral sandbar regions (depth <= 12m)', () => {
      // Default shallow zone at (3200, 5500)
      const biome = terrain.getBiomeAt(3200, 5500);
      expect(biome).toBe('SHALLOW_WATER');
      expect(terrain.getWaterDepthAt(3200, 5500)).toBeLessThanOrEqual(12.0);
    });

    it('identifies DEEP_WATER biome in open ocean (y > 2500m, depth > 12m)', () => {
      const biome = terrain.getBiomeAt(10000, 6000);
      expect(biome).toBe('DEEP_WATER');
      expect(terrain.getWaterDepthAt(10000, 6000)).toBeGreaterThan(25.0);
    });
  });

  describe('2.2 Draft-Based Bathymetric Grounding System', () => {
    it('allows shallow draft vessels with SHALLOW_DRAFT_IMMUNITY to navigate shallow water safely', () => {
      const ptBoat = SHIP_ROSTER['pt_boat_109'];
      const state = createInitialPhysicsState(ptBoat, vec2(3200, 5500), 0); // Shallow zone depth ~3m

      const result = terrain.checkGrounding(ptBoat, state, dt);
      expect(result.isGrounded).toBe(false);
      expect(result.damage).toBe(0);
      expect(state.isGrounded).toBe(false);
    });

    it('grounds deep draft battleships (Yamato draft 10.8m) in shallow water, beaching hull and inflicting damage', () => {
      const yamato = SHIP_ROSTER['yamato_bb'];
      const state = createInitialPhysicsState(yamato, vec2(3200, 5500), 0); // depth 3m -> draft deficit 7.8m > 1.5m
      state.linearVelocity = vec2(10, 0);
      state.speedKnots = 20;

      const initialHp = state.hullHp;
      const result = terrain.checkGrounding(yamato, state, 1.0); // 1.0s elapsed

      expect(result.isGrounded).toBe(true);
      expect(result.damage).toBeGreaterThan(0);
      expect(state.isGrounded).toBe(true);
      // Catastrophic beaching halts velocity
      expect(state.linearVelocity.x).toBe(0);
      expect(state.speedKnots).toBe(0);
      // Takes ~2% max HP damage per second
      expect(state.hullHp).toBeLessThan(initialHp);
      expect(result.damage).toBeCloseTo(yamato.maxHp * 0.02, 0);
    });

    it('prevents submarines from diving to DEEP in shallow water and forces periscope depth with damage', () => {
      const subDef = SHIP_ROSTER['akula_ssn'];
      const state = createInitialPhysicsState(subDef, vec2(3200, 5500), 0);
      state.depthState = 'DEEP';
      state.currentDepth = -30.0;

      const initialHp = state.hullHp;
      const result = terrain.checkGrounding(subDef, state, 1.0);

      expect(result.isGrounded).toBe(true);
      expect(state.depthState).toBe('PERISCOPE'); // Forced up to periscope depth!
      expect(state.currentDepth).toBe(-5.0);
      expect(result.damage).toBeGreaterThan(0);
      expect(state.hullHp).toBeLessThan(initialHp);
    });
  });

  describe('2.3 Arctic Ice Grinding & Icebreaker Immunity', () => {
    it('inflicts continuous grinding damage and speed penalty on non-icebreaker vessels in pack ice', () => {
      const cruiser = SHIP_ROSTER['moskva_cg'];
      const state = createInitialPhysicsState(cruiser, vec2(5000, 1000), 0); // y = 1000m (Arctic)
      state.linearVelocity = vec2(16, 0); // ~31 knots

      const initialHp = state.hullHp;
      const initialVx = state.linearVelocity.x;

      const result = terrain.checkIceGrinding(cruiser, state, 1.0);

      expect(result.inIce).toBe(true);
      expect(result.damage).toBeGreaterThan(0);
      expect(state.hullHp).toBeLessThan(initialHp);
      // Speed is penalized
      expect(state.linearVelocity.x).toBeLessThan(initialVx);
    });

    it('gives Icebreakers complete immunity to ice damage and creates a cleared wake corridor', () => {
      const icebreaker = SHIP_ROSTER['polaris_ice'];
      const state = createInitialPhysicsState(icebreaker, vec2(5000, 1000), 0);
      state.linearVelocity = vec2(10, 0);

      const initialHp = state.hullHp;
      const result = terrain.checkIceGrinding(icebreaker, state, 1.0);

      expect(result.inIce).toBe(true);
      expect(result.damage).toBe(0);
      expect(state.hullHp).toBe(initialHp); // Zero ice damage!

      // Icebreaker wake should now be present at icebreaker position
      expect(terrain.isPositionInIcebreakerWake(state.position)).toBe(true);
    });

    it('protects non-icebreaker warships following behind an icebreaker in its wake channel', () => {
      const icebreaker = SHIP_ROSTER['polaris_ice'];
      const icebreakerState = createInitialPhysicsState(icebreaker, vec2(5000, 1000), 0);
      // Step icebreaker to create wake
      terrain.checkIceGrinding(icebreaker, icebreakerState, 1.0);

      // Now place non-icebreaker cruiser inside that wake corridor
      const cruiser = SHIP_ROSTER['moskva_cg'];
      const cruiserState = createInitialPhysicsState(cruiser, vec2(5000, 1000), 0);
      cruiserState.linearVelocity = vec2(10, 0);

      const initialHp = cruiserState.hullHp;
      const result = terrain.checkIceGrinding(cruiser, cruiserState, 1.0);

      expect(result.inIce).toBe(true);
      expect(result.damage).toBe(0); // Protected by icebreaker wake!
      expect(cruiserState.hullHp).toBe(initialHp);
    });
  });

  describe('2.4 Mass-Based Momentum Collisions', () => {
    it('conserves momentum and transfers kinetic energy in ship-to-ship collisions', () => {
      const bb = SHIP_ROSTER['yamato_bb']; // 72,800 tonnes, length 263
      const dd = SHIP_ROSTER['fletcher_dd']; // 2,500 tonnes, length 114

      // Bow-to-bow collision:
      // Yamato at x=100 heading 0 (bow at 231.5)
      // Fletcher at x=280 heading Math.PI (bow at 223)
      // Small overlap of 8.5m on X axis
      const stateA = createInitialPhysicsState(bb, vec2(100, 100), 0);
      stateA.linearVelocity = vec2(10, 0);

      const stateB = createInitialPhysicsState(dd, vec2(280, 100), Math.PI);
      stateB.linearVelocity = vec2(-10, 0);

      const collision = resolveShipToShipCollision(bb, stateA, dd, stateB);

      expect(collision.hasCollision).toBe(true);
      expect(collision.impulse).toBeGreaterThan(0);
      // Heavy BB should push light DD backwards (positive X velocity)
      expect(stateB.linearVelocity.x).toBeGreaterThan(0);
    });

    it('applies icebreaker ramming damage multiplier (2.5x damage, 75% reduced self-damage)', () => {
      const icebreaker = SHIP_ROSTER['arktica_ice']; // length 159 (half 79.5)
      const cruiser = SHIP_ROSTER['moskva_cg']; // length 186 (half 93)

      // Icebreaker at 200 heading 0 (bow at 279.5)
      // Cruiser at 365 heading Math.PI (bow at 272)
      // Overlap of 7.5m on X axis
      const stateA = createInitialPhysicsState(icebreaker, vec2(200, 200), 0);
      stateA.linearVelocity = vec2(12, 0);

      const stateB = createInitialPhysicsState(cruiser, vec2(365, 200), Math.PI);
      stateB.linearVelocity = vec2(-12, 0);

      const collision = resolveShipToShipCollision(icebreaker, stateA, cruiser, stateB);

      expect(collision.hasCollision).toBe(true);
      expect(collision.impulse).toBeGreaterThan(0);
      // Icebreaker deals significantly more damage to enemy than it receives
      expect(collision.damageB).toBeGreaterThan(collision.damageA * 2.0);
    });

    it('rebounds vessel semi-inelastically (e = 0.05) off static island polygon with impact damage', () => {
      const cruiser = SHIP_ROSTER['moskva_cg']; // length 186 (half 93)
      // Approach North Bastion from west: center at 2880, bow at 2973, island edge at ~2966
      const state = createInitialPhysicsState(cruiser, vec2(2880, 4200), 0);
      state.linearVelocity = vec2(15, 0);

      const island = terrain.getIslands()[0];
      const collision = resolveShipToIslandCollision(cruiser, state, island.polygon);

      expect(collision.hasCollision).toBe(true);
      // Ship rebounds with opposite or arrested forward velocity
      expect(state.linearVelocity.x).toBeLessThanOrEqual(0);
      expect(collision.damageA).toBeGreaterThan(0);
    });
  });

  describe('2.5 Maritime Resources (Floating Crates & Offshore Oil Rigs)', () => {
    it('collects floating XP crates using ship magnetism radius and awards XP', () => {
      const ptBoat = SHIP_ROSTER['pt_boat_109'];
      const state = createInitialPhysicsState(ptBoat, vec2(1000, 1000), 0);
      const playerRef = {
        playerId: 'p1',
        factionId: 'blue',
        shipDef: ptBoat,
        physicsState: state,
        accumulatedXp: 0,
      };

      const crate1 = createXpCrate('c1', vec2(1010, 1000), 'WOODEN'); // 25 XP
      const crate2 = createXpCrate('c2', vec2(1015, 1005), 'STEEL'); // 75 XP
      const farCrate = createXpCrate('c3', vec2(1500, 1500), 'MILITARY_CHEST'); // far away

      resources.addCrate(crate1);
      resources.addCrate(crate2);
      resources.addCrate(farCrate);

      const result = resources.checkCrateCollection(playerRef);
      expect(result.collectedCount).toBe(2);
      expect(result.totalXpAwarded).toBe(100);
      expect(playerRef.accumulatedXp).toBe(100);
      expect(crate1.isCollected).toBe(true);
      expect(crate2.isCollected).toBe(true);
      expect(farCrate.isCollected).toBe(false);
    });

    it('spawns wreckage crates with 40% of match XP when a vessel sinks', () => {
      const wreckage = resources.spawnWreckageCrates(vec2(2000, 2000), 1000);
      expect(wreckage.length).toBeGreaterThanOrEqual(3);

      const totalXp = wreckage.reduce((sum, c) => sum + c.xpValue, 0);
      // Should be approximately 40% of 1000 = 400 XP
      expect(totalXp).toBeCloseTo(400, -2);
    });

    it('manages Oil Rig capture state: charges over 15s when uncontested, freezes when contested', () => {
      const rig = createOilRig('rig_1', 'Alpha Rig', vec2(5000, 5000));
      resources.addOilRig(rig);

      const blueShip = {
        playerId: 'blue_1',
        factionId: 'blue',
        shipDef: SHIP_ROSTER['fletcher_dd'],
        physicsState: createInitialPhysicsState(SHIP_ROSTER['fletcher_dd'], vec2(5050, 5000), 0),
        accumulatedXp: 0,
      };

      // Tick 10 seconds uncontested
      resources.updateOilRigs([blueShip], 10.0);
      expect(rig.controlState).toBe('NEUTRAL');
      expect(rig.captureProgress).toBeCloseTo(10.0, 1);

      // Add red enemy ship into capture radius (contested!)
      const redShip = {
        playerId: 'red_1',
        factionId: 'red',
        shipDef: SHIP_ROSTER['kolkata_ddg'],
        physicsState: createInitialPhysicsState(SHIP_ROSTER['kolkata_ddg'], vec2(5020, 5020), 0),
        accumulatedXp: 0,
      };

      resources.updateOilRigs([blueShip, redShip], 5.0);
      expect(rig.controlState).toBe('CONTESTED');
      // Progress remains frozen at 10.0s during contest
      expect(rig.captureProgress).toBeCloseTo(10.0, 1);

      // Red ship leaves
      redShip.physicsState.position = vec2(8000, 8000);

      // Blue finishes capture (remaining 5 seconds)
      resources.updateOilRigs([blueShip], 5.0);
      expect(rig.controlState).toBe('CONTROLLED');
      expect(rig.controllingFactionId).toBe('blue');
    });

    it('awards passive XP (+20 XP/s) and provides +150% bonus (+50 XP/s total) with allied Oil Tanker', () => {
      const rig = createOilRig('rig_2', 'Bravo Rig', vec2(6000, 6000));
      rig.controlState = 'CONTROLLED';
      rig.controllingFactionId = 'blue';
      resources.addOilRig(rig);

      const standardShip = {
        playerId: 'blue_1',
        factionId: 'blue',
        shipDef: SHIP_ROSTER['fletcher_dd'],
        physicsState: createInitialPhysicsState(SHIP_ROSTER['fletcher_dd'], vec2(6050, 6000), 0),
        accumulatedXp: 0,
      };

      // Standard controlled rig: +20 XP/s
      const tick1 = resources.updateOilRigs([standardShip], 1.0);
      expect(tick1.xpAwards.get('blue_1')).toBeCloseTo(20.0, 1);

      // Now bring an allied Oil Tanker within 100m of the rig
      const tanker = {
        playerId: 'blue_tanker',
        factionId: 'blue',
        shipDef: SHIP_ROSTER['oil_tanker_sup'],
        physicsState: createInitialPhysicsState(SHIP_ROSTER['oil_tanker_sup'], vec2(6030, 6000), 0),
        accumulatedXp: 0,
      };

      // With tanker present: 20 * 2.5 = 50 XP/s total split among the 2 vessels (25 XP each)
      const tick2 = resources.updateOilRigs([standardShip, tanker], 1.0);
      const totalXpThisTick = (tick2.xpAwards.get('blue_1') || 0) + (tick2.xpAwards.get('blue_tanker') || 0);
      expect(totalXpThisTick).toBeCloseTo(50.0, 1);
    });

    it('detonates fuel explosion (2500 damage in 150m) upon Oil Rig destruction at 12,000 HP', () => {
      const rig = createOilRig('rig_3', 'Charlie Rig', vec2(7000, 7000));
      resources.addOilRig(rig);

      const nearbyShip = {
        playerId: 'victim_1',
        factionId: 'red',
        shipDef: SHIP_ROSTER['bismarck_bb'],
        physicsState: createInitialPhysicsState(SHIP_ROSTER['bismarck_bb'], vec2(7050, 7000), 0), // 50m away
        accumulatedXp: 0,
      };

      const initialHp = nearbyShip.physicsState.hullHp;

      // Inflict lethal damage to Oil Rig
      const result = resources.damageOilRig(rig.id, 20000, [nearbyShip]);

      expect(result.isDestroyed).toBe(true);
      expect(rig.isDestroyed).toBe(true);
      expect(rig.respawnTimer).toBe(300.0); // 5 min respawn
      expect(result.explosionVictims).toContain(nearbyShip);
      // Nearby ship takes heavy explosive blast damage
      expect(nearbyShip.physicsState.hullHp).toBeLessThan(initialHp);
      expect(initialHp - nearbyShip.physicsState.hullHp).toBeGreaterThan(1000);
    });
  });
});
