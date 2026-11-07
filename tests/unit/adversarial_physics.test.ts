import { describe, it, expect } from 'vitest';
import {
  SHIP_ROSTER,
  ShipDef,
  createInitialPhysicsState,
  updateHydrodynamics,
  commandDepthState,
  toggleStealthMode,
  resolveShipToShipCollision,
  resolveShipToIslandCollision,
  satPolygonIntersection,
  createShipOBB,
  Polygon,
  vec2,
  vec2Add,
  vec2Sub,
  vec2Scale,
  vec2Dot,
  vec2Cross,
  vec2Length,
  knotsToMs,
  msToKnots,
  degToRad,
} from '../../common/index.js';

describe('Adversarial Hydrodynamics & Physics Verification', () => {
  const dt = 0.05; // 20 Hz server tick

  // =========================================================================
  // 1. 10,000 Tick Numerical Stability & Energy Accumulation
  // =========================================================================
  describe('10,000 Tick Numerical Stability Stress Harness', () => {
    it('remains stable and finite under 10,000 ticks of full forward throttle (Yamato BB & PT-109)', () => {
      const shipsToTest = [SHIP_ROSTER['yamato_bb'], SHIP_ROSTER['pt_boat_109'], SHIP_ROSTER['skjold_corvette']];

      for (const shipDef of shipsToTest) {
        const state = createInitialPhysicsState(shipDef, vec2(1000, 1000), 0);

        for (let tick = 0; tick < 10000; tick++) {
          updateHydrodynamics(shipDef, state, 1.0, 0, dt);

          // Invariant checks
          expect(Number.isFinite(state.position.x)).toBe(true);
          expect(Number.isFinite(state.position.y)).toBe(true);
          expect(Number.isFinite(state.heading)).toBe(true);
          expect(Number.isFinite(state.linearVelocity.x)).toBe(true);
          expect(Number.isFinite(state.linearVelocity.y)).toBe(true);
          expect(Number.isFinite(state.angularVelocity)).toBe(true);
          expect(Number.isFinite(state.speedKnots)).toBe(true);
          expect(Number.isFinite(state.surgeSpeed)).toBe(true);
          expect(Number.isFinite(state.swaySpeed)).toBe(true);
          expect(Number.isFinite(state.slipAngle)).toBe(true);

          // Energy bounds check: speed must not accumulate infinitely
          expect(state.linearVelocity.x).toBeLessThanOrEqual(shipDef.maxForwardSpeed * 1.05);
          expect(state.swaySpeed).toBeCloseTo(0, 4);
        }

        // Must reach steady state near maxForwardSpeed
        expect(state.surgeSpeed).toBeCloseTo(shipDef.maxForwardSpeed, 1);
        expect(state.speedKnots).toBeCloseTo(msToKnots(shipDef.maxForwardSpeed), 1);
      }
    });

    it('remains numerically stable under 10,000 ticks of continuous maximum rudder turning', () => {
      const shipsToTest = [SHIP_ROSTER['burke_ddg'], SHIP_ROSTER['pt_boat_109'], SHIP_ROSTER['akula_ssn']];

      for (const shipDef of shipsToTest) {
        const state = createInitialPhysicsState(shipDef, vec2(5000, 5000), 0);

        for (let tick = 0; tick < 10000; tick++) {
          updateHydrodynamics(shipDef, state, 1.0, 1.0, dt);

          // State must never produce NaN or Infinity
          expect(Number.isNaN(state.position.x)).toBe(false);
          expect(Number.isNaN(state.position.y)).toBe(false);
          expect(Number.isNaN(state.heading)).toBe(false);
          expect(Number.isNaN(state.angularVelocity)).toBe(false);
          expect(Number.isNaN(state.surgeSpeed)).toBe(false);
          expect(Number.isNaN(state.swaySpeed)).toBe(false);
          expect(Number.isNaN(state.slipAngle)).toBe(false);

          // Heading must strictly remain bounded in [-PI, PI]
          expect(state.heading).toBeGreaterThanOrEqual(-Math.PI - 1e-5);
          expect(state.heading).toBeLessThanOrEqual(Math.PI + 1e-5);

          // Angular velocity must not exceed theoretical turnRateMax
          expect(Math.abs(state.angularVelocity)).toBeLessThanOrEqual(shipDef.turnRateMax * 1.05);
        }

        // Distance from spawn must be bounded (ship is turning in circles, not flying off to infinity)
        const distFromSpawn = Math.hypot(state.position.x - 5000, state.position.y - 5000);
        expect(distFromSpawn).toBeLessThan(1000);
      }
    });

    it('remains stable under 10,000 ticks of rapid throttle and rudder chatter/oscillation', () => {
      const shipDef = SHIP_ROSTER['skjold_corvette'];
      const state = createInitialPhysicsState(shipDef, vec2(0, 0), 0);

      for (let tick = 0; tick < 10000; tick++) {
        const throttle = tick % 4 === 0 ? 1.0 : (tick % 4 === 2 ? -0.5 : 0);
        const rudder = (tick % 3 === 0) ? 1.0 : ((tick % 3 === 1) ? -1.0 : 0);

        updateHydrodynamics(shipDef, state, throttle, rudder, dt);

        expect(Number.isFinite(state.position.x)).toBe(true);
        expect(Number.isFinite(state.position.y)).toBe(true);
        expect(Number.isFinite(state.linearVelocity.x)).toBe(true);
        expect(Number.isFinite(state.linearVelocity.y)).toBe(true);
        expect(Number.isFinite(state.angularVelocity)).toBe(true);
        expect(state.speedKnots).toBeLessThan(100);
      }
    });

    it('remains stable under continuous submarine depth cycling and stealth toggles for 10,000 ticks', () => {
      const subDef = SHIP_ROSTER['ohio_ssgn'];
      const state = createInitialPhysicsState(subDef, vec2(0, 0), 0);

      const depthStates = ['SURFACE', 'PERISCOPE', 'DEEP'] as const;

      for (let tick = 0; tick < 10000; tick++) {
        if (tick % 120 === 0) {
          const target = depthStates[(tick / 120) % 3];
          commandDepthState(subDef, state, target);
        }
        if (tick % 50 === 0) {
          toggleStealthMode(subDef, state, tick % 100 === 0);
        }

        updateHydrodynamics(subDef, state, 1.0, 0.5, dt);

        expect(Number.isFinite(state.currentDepth)).toBe(true);
        expect(state.currentDepth).toBeLessThanOrEqual(0);
        expect(state.currentDepth).toBeGreaterThanOrEqual(-30);
        expect(Number.isFinite(state.speedKnots)).toBe(true);
        expect(state.speedKnots).toBeLessThan(100);
      }
    });

    it('remains stable when grounded on shallow seabed for 10,000 ticks', () => {
      const shipDef = SHIP_ROSTER['yamato_bb'];
      const state = createInitialPhysicsState(shipDef, vec2(100, 100), 0);
      state.isGrounded = true;

      for (let tick = 0; tick < 10000; tick++) {
        updateHydrodynamics(shipDef, state, 1.0, 1.0, dt);

        expect(Number.isFinite(state.position.x)).toBe(true);
        expect(Number.isFinite(state.speedKnots)).toBe(true);
        expect(state.speedKnots).toBeLessThan(10);
      }
    });
  });

  // =========================================================================
  // 2. High-Speed Turning & Lateral Sway Euler Stability
  // =========================================================================
  describe('High-Speed Turning & Sway Drag Stability', () => {
    it('maintains finite bounded sway velocity when subjected to extreme lateral kick', () => {
      const shipDef = SHIP_ROSTER['skjold_corvette'];
      const state = createInitialPhysicsState(shipDef, vec2(0, 0), 0);

      state.linearVelocity = vec2(10, 30);

      for (let i = 0; i < 200; i++) {
        updateHydrodynamics(shipDef, state, 1.0, 0, dt);
        expect(Number.isFinite(state.swaySpeed)).toBe(true);
        expect(Number.isNaN(state.swaySpeed)).toBe(false);
      }

      expect(Math.abs(state.swaySpeed)).toBeLessThan(0.1);
    });

    it('tests explicit Euler stability threshold of quadratic sway drag', () => {
      const shipDef = SHIP_ROSTER['burke_ddg'];

      const testInitialSwaySpeeds = [10, 25, 50, 70];
      for (const sway0 of testInitialSwaySpeeds) {
        const state = createInitialPhysicsState(shipDef, vec2(0, 0), 0);
        state.linearVelocity = vec2(0, sway0);

        for (let t = 0; t < 50; t++) {
          updateHydrodynamics(shipDef, state, 0, 0, dt);
        }

        expect(Number.isFinite(state.swaySpeed)).toBe(true);
        expect(Math.abs(state.swaySpeed)).toBeLessThan(sway0);
      }
    });
  });

  // =========================================================================
  // 3. Degenerate SAT Polygon Collisions & Boundary Conditions
  // =========================================================================
  describe('Degenerate SAT Polygon Collisions', () => {
    it('handles identical concentric vessels without NaN or infinite forces', () => {
      const shipDef = SHIP_ROSTER['fletcher_dd'];
      const stateA = createInitialPhysicsState(shipDef, vec2(100, 100), 0);
      const stateB = createInitialPhysicsState(shipDef, vec2(100, 100), 0);

      const res = resolveShipToShipCollision(shipDef, stateA, shipDef, stateB);

      expect(res.hasCollision).toBe(true);
      expect(Number.isFinite(res.penetrationDepth)).toBe(true);
      expect(Number.isFinite(res.normal.x)).toBe(true);
      expect(Number.isFinite(res.normal.y)).toBe(true);
      expect(Number.isFinite(res.contactPoint.x)).toBe(true);
      expect(Number.isFinite(res.contactPoint.y)).toBe(true);
      expect(Number.isFinite(res.impulse)).toBe(true);

      expect(Number.isFinite(stateA.position.x)).toBe(true);
      expect(Number.isFinite(stateB.position.x)).toBe(true);

      const dist = vec2Length(vec2Sub(stateB.position, stateA.position));
      expect(dist).toBeGreaterThan(0);
    });

    it('tests zero-overlap boundary and exact touching edge contacts', () => {
      const shipDef = SHIP_ROSTER['burke_ddg'];
      const stateA = createInitialPhysicsState(shipDef, vec2(0, 0), 0);
      const stateB = createInitialPhysicsState(shipDef, vec2(155, 0), 0);

      const res = resolveShipToShipCollision(shipDef, stateA, shipDef, stateB);
      expect(res.hasCollision).toBe(false);

      stateB.position.x = 154.5;
      const resOverlap = resolveShipToShipCollision(shipDef, stateA, shipDef, stateB);
      expect(resOverlap.hasCollision).toBe(true);
      expect(resOverlap.penetrationDepth).toBeCloseTo(0.5, 1);
    });

    it('verifies SAT fix: degenerate polygon with collinear duplicate vertex does not cause phantom axis', () => {
      // Degenerate polygon with duplicate vertex creates edge (0, 0)
      const degeneratePoly: Polygon = {
        vertices: [vec2(0, 0), vec2(10, 0), vec2(10, 0), vec2(10, 10), vec2(0, 10)],
      };
      const normalPoly: Polygon = {
        vertices: [vec2(5, -5), vec2(15, -5), vec2(15, 5), vec2(5, 5)],
      };

      const res = satPolygonIntersection(degeneratePoly, normalPoly);
      // Because edge (0, 0) is ignored, degenerate vertices no longer produce phantom separating axes
      expect(res.hasCollision).toBe(true);
    });

    it('verifies longitudinal SAT overlap guard: deep penetration maintains frontal bounce rather than sideways ejection', () => {
      const defHeavy = SHIP_ROSTER['yamato_bb']; // L=263, B=38.9
      const defLight = SHIP_ROSTER['pt_boat_109']; // L=24, B=6.2
      // Deep longitudinal penetration: 13.5m penetration along X.
      const sA = createInitialPhysicsState(defHeavy, vec2(100, 100), 0);
      sA.linearVelocity = vec2(14, 0);
      const sB = createInitialPhysicsState(defLight, vec2(230, 100), Math.PI);
      sB.linearVelocity = vec2(0, 0);

      const res = resolveShipToShipCollision(defHeavy, sA, defLight, sB);
      expect(res.hasCollision).toBe(true);
      // Guarded normal aligns with ship center-to-center vector dirAB (frontal X rather than lateral Y)
      expect(res.normal.x).toBeCloseTo(1, 2);
      expect(Math.abs(res.normal.y)).toBeCloseTo(0, 2);
      // Nonzero impulse along frontal axis
      expect(res.impulse).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // 4. Extreme Mass Ratios (up to 1,456:1) & Momentum Conservation
  // =========================================================================
  describe('Extreme Mass Ratios & Momentum Conservation', () => {
    it('strictly conserves linear momentum in head-on collision', () => {
      const defA = SHIP_ROSTER['fletcher_dd']; // L=114, B=12
      const defB = SHIP_ROSTER['kolkata_ddg']; // L=163, B=17.4

      // Bow of A is at 100 + 57 = 157.
      // Bow of B is at 237 - 81.5 = 155.5.
      // Longitudinal overlap = 1.5m < 12m beam.
      const stateA = createInitialPhysicsState(defA, vec2(100, 100), 0);
      stateA.linearVelocity = vec2(15, 0);

      const stateB = createInitialPhysicsState(defB, vec2(237, 100), Math.PI);
      stateB.linearVelocity = vec2(-10, 0);

      const massA = defA.mass * 1000;
      const massB = defB.mass * 1000;

      const pTotalBeforeX = massA * stateA.linearVelocity.x + massB * stateB.linearVelocity.x;
      const pTotalBeforeY = massA * stateA.linearVelocity.y + massB * stateB.linearVelocity.y;

      const res = resolveShipToShipCollision(defA, stateA, defB, stateB);
      expect(res.hasCollision).toBe(true);
      expect(res.normal.x).toBeCloseTo(1, 2);

      const pTotalAfterX = massA * stateA.linearVelocity.x + massB * stateB.linearVelocity.x;
      const pTotalAfterY = massA * stateA.linearVelocity.y + massB * stateB.linearVelocity.y;

      // Linear momentum must be strictly conserved
      expect(pTotalAfterX).toBeCloseTo(pTotalBeforeX, 1);
      expect(pTotalAfterY).toBeCloseTo(pTotalBeforeY, 1);
    });

    it('strictly conserves linear momentum in oblique / T-bone collision', () => {
      const defA = SHIP_ROSTER['burke_ddg'];
      const defB = SHIP_ROSTER['moskva_cg'];

      // Positioned with shallow initial overlap
      const stateA = createInitialPhysicsState(defA, vec2(100, 100), 0);
      stateA.linearVelocity = vec2(12, 5);

      const stateB = createInitialPhysicsState(defB, vec2(165, 110), Math.PI / 2);
      stateB.linearVelocity = vec2(-4, -8);

      const massA = defA.mass * 1000;
      const massB = defB.mass * 1000;

      const pBeforeX = massA * stateA.linearVelocity.x + massB * stateB.linearVelocity.x;
      const pBeforeY = massA * stateA.linearVelocity.y + massB * stateB.linearVelocity.y;

      const res = resolveShipToShipCollision(defA, stateA, defB, stateB);
      expect(res.hasCollision).toBe(true);

      const pAfterX = massA * stateA.linearVelocity.x + massB * stateB.linearVelocity.x;
      const pAfterY = massA * stateA.linearVelocity.y + massB * stateB.linearVelocity.y;

      expect(pAfterX).toBeCloseTo(pBeforeX, 1);
      expect(pAfterY).toBeCloseTo(pBeforeY, 1);
    });

    it('handles extreme mass ratio of 1,323:1 (Yamato BB 72,800t vs PT-109 55t) under realistic single-tick overlap', () => {
      const defHeavy = SHIP_ROSTER['yamato_bb'];
      const defLight = SHIP_ROSTER['pt_boat_109'];

      const massHeavy = defHeavy.mass * 1000;
      const massLight = defLight.mass * 1000;
      const massRatio = massHeavy / massLight;
      expect(massRatio).toBeGreaterThan(1000); // 1323.6:1

      // Bow of Yamato at 100 + 131.5 = 231.5.
      // Stern of PT boat at 242.5 - 12 = 230.5.
      // Realistic 1.0m overlap (< 6.2m beam).
      const stateHeavy = createInitialPhysicsState(defHeavy, vec2(100, 100), 0);
      stateHeavy.linearVelocity = vec2(14, 0); // ~27 knots

      const stateLight = createInitialPhysicsState(defLight, vec2(242.5, 100), Math.PI);
      stateLight.linearVelocity = vec2(0, 0); // Stationary PT boat

      const pBeforeX = massHeavy * stateHeavy.linearVelocity.x + massLight * stateLight.linearVelocity.x;

      const res = resolveShipToShipCollision(defHeavy, stateHeavy, defLight, stateLight);
      expect(res.hasCollision).toBe(true);
      expect(res.normal.x).toBeCloseTo(1, 2);

      // Yamato should barely lose velocity (delta v < 0.05 m/s)
      expect(stateHeavy.linearVelocity.x).toBeCloseTo(14, 0);
      expect(14 - stateHeavy.linearVelocity.x).toBeLessThan(0.05);

      // Light boat is propelled forward at ~16 m/s
      expect(stateLight.linearVelocity.x).toBeGreaterThan(10);

      // Momentum conservation
      const pAfterX = massHeavy * stateHeavy.linearVelocity.x + massLight * stateLight.linearVelocity.x;
      expect(pAfterX).toBeCloseTo(pBeforeX, 1);

      // Damage check: PT-109 is obliterated
      expect(stateLight.hullHp).toBe(0);
      expect(stateLight.isDestroyed).toBe(true);

      // Ramming damage check: Yamato takes minimal damage (< 500 HP) from crushing a 55t wooden boat
      expect(res.damageA).toBeLessThan(500);
    });

    it('verifies that kinetic energy is dissipated (never created) in inelastic collision', () => {
      const defA = SHIP_ROSTER['fletcher_dd']; // L=114, B=12
      const defB = SHIP_ROSTER['burke_ddg'];   // L=155, B=20

      const massA = defA.mass * 1000;
      const massB = defB.mass * 1000;

      // Bow of A is at 100 + 57 = 157.
      // Stern of B is at 233.5 - 77.5 = 156.
      // Overlap = 1.0m (< 12m beam).
      const stateA = createInitialPhysicsState(defA, vec2(100, 100), 0);
      stateA.linearVelocity = vec2(18, 0);

      const stateB = createInitialPhysicsState(defB, vec2(233.5, 100), 0);
      stateB.linearVelocity = vec2(5, 0); // Overtaking collision

      const keLinearBefore = 0.5 * massA * vec2Dot(stateA.linearVelocity, stateA.linearVelocity) +
                             0.5 * massB * vec2Dot(stateB.linearVelocity, stateB.linearVelocity);

      const res = resolveShipToShipCollision(defA, stateA, defB, stateB);
      expect(res.hasCollision).toBe(true);
      expect(res.normal.x).toBeCloseTo(1, 2);

      const keLinearAfter = 0.5 * massA * vec2Dot(stateA.linearVelocity, stateA.linearVelocity) +
                            0.5 * massB * vec2Dot(stateB.linearVelocity, stateB.linearVelocity);

      // Total kinetic energy must decrease in an inelastic collision (e = 0.15)
      expect(keLinearAfter).toBeLessThan(keLinearBefore);
    });
  });

  // =========================================================================
  // 5. Special Vessel Hydrodynamics & Balance Invariants
  // =========================================================================
  describe('Special Vessel Hydrodynamics & Balance Invariants', () => {
    it('verifies Icebreaker ramming damage multiplier (2.5x vs 0.25x self-damage)', () => {
      const icebreakerDef = SHIP_ROSTER['polaris_ice']; // L=128, B=24
      const regularDef = SHIP_ROSTER['fletcher_dd'];     // L=114, B=12

      // Bow of Polaris at 100 + 64 = 164.
      // Bow of Fletcher at 220 - 57 = 163.
      // Overlap = 1.0m (< 12m beam).
      const stateIce = createInitialPhysicsState(icebreakerDef, vec2(100, 100), 0);
      stateIce.linearVelocity = vec2(12, 0);

      const stateReg = createInitialPhysicsState(regularDef, vec2(220, 100), Math.PI);
      stateReg.linearVelocity = vec2(-12, 0);

      const res = resolveShipToShipCollision(icebreakerDef, stateIce, regularDef, stateReg);
      expect(res.hasCollision).toBe(true);
      expect(res.normal.x).toBeCloseTo(1, 2);

      // Regular ship should receive significantly more damage than the icebreaker
      expect(res.damageB).toBeGreaterThan(res.damageA * 3);
    });

    it('verifies deep submarine vertical decoupling: DEEP submarine passes under SURFACE vessel without collision', () => {
      const subDef = SHIP_ROSTER['akula_ssn'];
      const surfDef = SHIP_ROSTER['bismarck_bb'];

      const subState = createInitialPhysicsState(subDef, vec2(500, 500), 0);
      subState.depthState = 'DEEP';
      subState.currentDepth = -30.0;

      const surfState = createInitialPhysicsState(surfDef, vec2(500, 500), 0);
      surfState.depthState = 'SURFACE';
      surfState.currentDepth = 0.0;

      const res = resolveShipToShipCollision(subDef, subState, surfDef, surfState);
      expect(res.hasCollision).toBe(false);
      expect(res.damageA).toBe(0);
      expect(res.damageB).toBe(0);
    });

    it('verifies periscope submarine DOES collide with surface vessel', () => {
      const subDef = SHIP_ROSTER['akula_ssn']; // L=110, B=13.6
      const surfDef = SHIP_ROSTER['bismarck_bb']; // L=251, B=36

      const subState = createInitialPhysicsState(subDef, vec2(100, 100), 0);
      subState.depthState = 'PERISCOPE';
      subState.currentDepth = -5.0;

      const surfState = createInitialPhysicsState(surfDef, vec2(279.5, 100), Math.PI);
      surfState.depthState = 'SURFACE';
      surfState.currentDepth = 0.0;

      const res = resolveShipToShipCollision(subDef, subState, surfDef, surfState);
      expect(res.hasCollision).toBe(true);
    });
  });
});
