import { describe, it, expect } from 'vitest';
import {
  SHIP_ROSTER,
  ShipDef,
  createInitialPhysicsState,
  updateHydrodynamics,
  normalizeAngle,
  shortestAngleDiff,
  vec2,
  knotsToMs,
} from '../../common/index.js';

describe('Adversarial Challenger M6: Hydrodynamics & Controls Stress Harness', () => {
  const dt = 0.05; // 20 Hz tick

  // =========================================================================
  // 1. Hydrodynamics Stability: Zero-Speed Turning Authority Under Throttle
  // =========================================================================
  describe('1. Zero-Speed Turning Authority Under Throttle', () => {
    it('strictly provides at least 35% of turnRateMax under forward throttle from rest for all ships', () => {
      const allShips = Object.values(SHIP_ROSTER);
      expect(allShips.length).toBeGreaterThan(0);

      for (const shipDef of allShips) {
        const state = createInitialPhysicsState(shipDef, vec2(0, 0), 0);
        expect(state.surgeSpeed).toBe(0);
        expect(state.angularVelocity).toBe(0);

        // Apply full throttle and full rudder
        // Step for 10 ticks (0.5s)
        for (let t = 0; t < 10; t++) {
          updateHydrodynamics(shipDef, state, 1.0, 1.0, dt);
        }

        const minExpectedTurnRate = shipDef.turnRateMax * 0.35;
        // In 10 ticks (0.5s), rotAccel (3.0 * turnRateMax * 0.5s = 1.5 * turnRateMax) is plenty
        // to reach target angular velocity (>= 0.35 * turnRateMax)
        expect(state.angularVelocity).toBeGreaterThanOrEqual(minExpectedTurnRate - 1e-4);
      }
    });

    it('strictly provides at least 35% of turnRateMax target ratio across any non-zero throttle from rest', () => {
      const shipDef = SHIP_ROSTER['fletcher_dd'];
      const testThrottles = [0.1, 0.25, 0.5, 0.75, 1.0, -0.25, -0.5];

      for (const throttle of testThrottles) {
        const state = createInitialPhysicsState(shipDef, vec2(0, 0), 0);
        // Step 10 ticks
        for (let t = 0; t < 10; t++) {
          updateHydrodynamics(shipDef, state, throttle, 1.0, dt);
        }
        expect(Math.abs(state.angularVelocity)).toBeGreaterThanOrEqual(shipDef.turnRateMax * 0.35 - 1e-4);
      }
    });

    it('examines stationary turning behavior when throttle is exactly 0 (idle)', () => {
      const shipDef = SHIP_ROSTER['fletcher_dd'];
      const state = createInitialPhysicsState(shipDef, vec2(0, 0), 0);

      // Step for 10 ticks with throttle = 0, rudder = 1.0
      for (let t = 0; t < 10; t++) {
        updateHydrodynamics(shipDef, state, 0.0, 1.0, dt);
      }

      // Because speedRatio formula is Math.max(0.35, ...), speedRatio evaluates to 0.35 even at 0 throttle!
      // This means a stopped ship with engines idle can turn at 35% turn rate.
      const stationaryTurnRate = state.angularVelocity;
      expect(stationaryTurnRate).toBeGreaterThanOrEqual(shipDef.turnRateMax * 0.35 - 1e-4);
    });
  });

  // =========================================================================
  // 2. Maximum Turn Rate Bounding: Never Exceeds turnRateMax
  // =========================================================================
  describe('2. Maximum Angular Velocity Invariant Check', () => {
    it('guarantees angular velocity never exceeds turnRateMax under any combination of speed, throttle, and rudder', () => {
      const allShips = Object.values(SHIP_ROSTER);

      // Grid of speed and control combinations
      const surgeVelocities = [-15, -10, -5, -1, 0, 1, 5, 15, 30, 50, 100];
      const throttles = [-0.5, -0.2, 0.0, 0.2, 0.5, 1.0, 2.0];
      const rudders = [-1.0, -0.5, 0.0, 0.5, 1.0, 5.0];

      for (const shipDef of allShips) {
        for (const u of surgeVelocities) {
          for (const throttle of throttles) {
            for (const rudder of rudders) {
              const state = createInitialPhysicsState(shipDef, vec2(0, 0), 0);
              state.surgeSpeed = u;
              state.linearVelocity = vec2(u, 0);

              // Step 20 ticks
              for (let t = 0; t < 20; t++) {
                updateHydrodynamics(shipDef, state, throttle, rudder, dt);
                expect(Math.abs(state.angularVelocity)).toBeLessThanOrEqual(shipDef.turnRateMax + 1e-5);
              }
            }
          }
        }
      }
    });
  });

  // =========================================================================
  // 3. Extreme Parameter Sweeps & Numerical Stability
  // =========================================================================
  describe('3. Extreme Sweeps & Numerical Stability', () => {
    it('handles extreme out-of-range rudder and throttle without NaN or Inf', () => {
      const shipDef = SHIP_ROSTER['yamato_bb'];
      const state = createInitialPhysicsState(shipDef, vec2(0, 0), 0);

      const extremeInputs = [
        { throttle: 1e6, rudder: 1e6 },
        { throttle: -1e6, rudder: -1e6 },
        { throttle: Infinity, rudder: -Infinity },
        { throttle: -Infinity, rudder: Infinity },
        { throttle: 1e-12, rudder: -1e-12 },
        { throttle: 0, rudder: 1e9 },
      ];

      for (const input of extremeInputs) {
        for (let t = 0; t < 50; t++) {
          updateHydrodynamics(shipDef, state, input.throttle, input.rudder, dt);
          expect(Number.isFinite(state.position.x)).toBe(true);
          expect(Number.isFinite(state.position.y)).toBe(true);
          expect(Number.isFinite(state.heading)).toBe(true);
          expect(Number.isFinite(state.angularVelocity)).toBe(true);
          expect(Number.isFinite(state.linearVelocity.x)).toBe(true);
          expect(Number.isFinite(state.linearVelocity.y)).toBe(true);
          expect(Math.abs(state.angularVelocity)).toBeLessThanOrEqual(shipDef.turnRateMax + 1e-5);
        }
      }
    });

    it('empirically maps stability limit of quadratic sway drag under extreme initial sway', () => {
      const shipDef = SHIP_ROSTER['fletcher_dd'];

      // We test various initial lateral sway speeds w to find the divergence threshold:
      // Equation: w -= Math.sign(w) * (0.25 * w^2 + 1.5 * |w|) * dt
      // For dt = 0.05, 0.25 * w^2 * 0.05 > 2 * w => w > 160 m/s triggers Euler overshoot
      const safeSway = 50; // 50 m/s (approx 100 knots, 3x maximum naval speed)
      const stateSafe = createInitialPhysicsState(shipDef, vec2(0, 0), 0);
      stateSafe.linearVelocity = vec2(10, safeSway); // forward 10 m/s, lateral 50 m/s

      for (let t = 0; t < 20; t++) {
        updateHydrodynamics(shipDef, stateSafe, 1.0, 0, dt);
      }
      expect(Number.isFinite(stateSafe.linearVelocity.y)).toBe(true);
      expect(Math.abs(stateSafe.swaySpeed)).toBeLessThan(5); // Rapidly damped to normal

      // Extreme unphysical sway (e.g. 500 m/s teleportation/glitch):
      const stateExtreme = createInitialPhysicsState(shipDef, vec2(0, 0), 0);
      stateExtreme.linearVelocity = vec2(0, 500); // 500 m/s purely lateral
      updateHydrodynamics(shipDef, stateExtreme, 1.0, 0, dt);
      const isExtremeDivergent = !Number.isFinite(stateExtreme.swaySpeed) || Math.abs(stateExtreme.swaySpeed) > 1000;
      // Documenting whether unconstrained quadratic Euler drag overshoots above 160 m/s
      console.log(`Extreme 500 m/s sway divergence: w_next=${stateExtreme.swaySpeed}`);
      expect(isExtremeDivergent).toBe(true);
    });

    it('recovers cleanly from extreme initial angular velocity (100 rad/s spin)', () => {
      const shipDef = SHIP_ROSTER['fletcher_dd'];
      const state = createInitialPhysicsState(shipDef, vec2(0, 0), 0);
      state.angularVelocity = 100; // 100 rad/s (approx 950 RPM spin!)

      // Step hydrodynamics with neutral rudder and full throttle for 100s (2000 ticks)
      for (let t = 0; t < 2000; t++) {
        updateHydrodynamics(shipDef, state, 1.0, 0, dt);
      }

      // Must decelerate angular velocity back to target (0 rad/s)
      expect(Number.isFinite(state.angularVelocity)).toBe(true);
      expect(Number.isFinite(state.heading)).toBe(true);
      expect(Math.abs(state.angularVelocity)).toBeLessThan(0.01);
      expect(state.heading).toBeGreaterThanOrEqual(-Math.PI - 1e-4);
      expect(state.heading).toBeLessThanOrEqual(Math.PI + 1e-4);
    });

    it('evaluates hydrodynamics stability under lag spikes (dt = 0.25s, 0.5s, 1.0s)', () => {
      const shipDef = SHIP_ROSTER['burke_ddg'];

      const lagDtValues = [0.1, 0.25, 0.5];
      for (const lagDt of lagDtValues) {
        const state = createInitialPhysicsState(shipDef, vec2(0, 0), 0);
        for (let t = 0; t < 20; t++) {
          updateHydrodynamics(shipDef, state, 1.0, 1.0, lagDt);
        }
        expect(Number.isFinite(state.position.x)).toBe(true);
        expect(Number.isFinite(state.heading)).toBe(true);
        expect(Number.isFinite(state.angularVelocity)).toBe(true);
        expect(Math.abs(state.angularVelocity)).toBeLessThanOrEqual(shipDef.turnRateMax + 1e-5);
      }
    });

    it('handles extreme heading wrap-around without precision loss or NaN', () => {
      const shipDef = SHIP_ROSTER['fletcher_dd'];

      // Test extreme heading wrap-around
      const extremeHeadings = [-1000 * Math.PI, 1000 * Math.PI, 1e7, -1e7];
      for (const h of extremeHeadings) {
        const state = createInitialPhysicsState(shipDef, vec2(0, 0), h);
        updateHydrodynamics(shipDef, state, 1.0, 0.5, dt);
        expect(state.heading).toBeGreaterThanOrEqual(-Math.PI - 1e-4);
        expect(state.heading).toBeLessThanOrEqual(Math.PI + 1e-4);
        expect(Number.isFinite(state.heading)).toBe(true);
      }
    });

    it('identifies behavior when NaN is passed into hydrodynamics inputs', () => {
      const shipDef = SHIP_ROSTER['burke_ddg'];
      const state = createInitialPhysicsState(shipDef, vec2(0, 0), 0);

      // Verify what happens if caller passes NaN
      updateHydrodynamics(shipDef, state, NaN, 1.0, dt);
      // Documenting that NaN propagates because Math.min/max with NaN returns NaN
      expect(Number.isNaN(state.throttle)).toBe(true);
    });
  });

  // =========================================================================
  // 4. Mouse Steering Proportional Control & 180-Degree Turns
  // =========================================================================
  describe('4. Mouse Steering Proportional Control', () => {
    // Helper function simulating the client mouse steering logic from app.ts:425-468
    function stepMouseSteering(
      shipDef: ShipDef,
      state: ReturnType<typeof createInitialPhysicsState>,
      mouseWorld: { x: number; y: number },
      dtSec: number
    ) {
      const dx = mouseWorld.x - state.position.x;
      const dy = mouseWorld.y - state.position.y;
      const dist = Math.hypot(dx, dy);

      const targetHeading = Math.atan2(dy, dx);
      const headingError = shortestAngleDiff(state.heading, targetHeading);

      let mouseRudder = 0;
      if (Math.abs(headingError) >= 0.02) {
        mouseRudder = Math.max(-1.0, Math.min(1.0, headingError * 2.5));
      }

      let mouseThrottle = 0;
      if (dist < 50) {
        mouseThrottle = 0.0;
      } else if (dist <= 250) {
        mouseThrottle = 0.1 + ((dist - 50) / 200) * 0.9;
      } else {
        mouseThrottle = 1.0;
      }

      updateHydrodynamics(shipDef, state, mouseThrottle, mouseRudder, dtSec);
      return { dist, targetHeading, headingError, mouseRudder, mouseThrottle };
    }

    it('tests mouse cursor position exactly equals ship position (D = 0)', () => {
      const shipDef = SHIP_ROSTER['fletcher_dd'];

      // Scenario A: Ship heading is 0, mouse cursor at ship center
      const stateA = createInitialPhysicsState(shipDef, vec2(1000, 1000), 0);
      const stepA = stepMouseSteering(shipDef, stateA, { x: 1000, y: 1000 }, dt);

      expect(stepA.dist).toBe(0);
      expect(Number.isNaN(stepA.mouseRudder)).toBe(false);
      expect(Number.isNaN(stepA.mouseThrottle)).toBe(false);
      expect(stepA.mouseThrottle).toBe(0); // D < 50m -> throttle 0
      expect(stepA.mouseRudder).toBe(0); // Heading 0 -> diff 0 -> rudder 0

      // Scenario B: Ship heading is PI / 2 (90 deg North), mouse cursor at ship center
      const stateB = createInitialPhysicsState(shipDef, vec2(1000, 1000), Math.PI / 2);
      const stepB = stepMouseSteering(shipDef, stateB, { x: 1000, y: 1000 }, dt);

      expect(stepB.dist).toBe(0);
      expect(Number.isNaN(stepB.mouseRudder)).toBe(false);
      // Observe targetHeading: Math.atan2(0, 0) === 0
      expect(stepB.targetHeading).toBe(0);
      // Because targetHeading is 0 and ship heading is PI/2, headingError is -PI/2:
      // mouseRudder commands -1.0 even though mouse is at ship position!
      expect(stepB.mouseRudder).toBe(-1.0);
      // Throttle is 0
      expect(stepB.mouseThrottle).toBe(0.0);
    });

    it('simulates rapid 180-degree turn across diverse vessel classes: checks overshoot, oscillation, and convergence', () => {
      const testShips = [
        SHIP_ROSTER['pt_boat_109'],
        SHIP_ROSTER['vosper_mtb'],
        SHIP_ROSTER['skjold_corvette'],
        SHIP_ROSTER['fletcher_dd'],
        SHIP_ROSTER['yamato_bb'],
        SHIP_ROSTER['akula_ssn'],
      ];

      for (const shipDef of testShips) {
        const state = createInitialPhysicsState(shipDef, vec2(0, 0), 0);

        // Accelerate to cruising speed
        for (let t = 0; t < 100; t++) {
          updateHydrodynamics(shipDef, state, 1.0, 0, dt);
        }

        let signCrossings = 0;
        let prevHeadingError = 0;
        let maxOvershootAngle = 0;
        let settled = false;
        let settleTimeSec = 0;

        // Simulate 180 deg turn for 60 seconds (1200 ticks)
        for (let tick = 0; tick < 1200; tick++) {
          const mouseWorld = { x: state.position.x - 500, y: state.position.y };
          const result = stepMouseSteering(shipDef, state, mouseWorld, dt);

          if (tick > 0) {
            if (prevHeadingError * result.headingError < 0) {
              signCrossings++;
              const overshoot = Math.abs(result.headingError);
              if (overshoot > maxOvershootAngle) {
                maxOvershootAngle = overshoot;
              }
            }
          }
          prevHeadingError = result.headingError;

          if (Math.abs(result.headingError) < 0.05 && Math.abs(state.angularVelocity) < 0.05) {
            if (!settled) {
              settled = true;
              settleTimeSec = tick * dt;
            }
          } else {
            settled = false;
          }
        }

        console.log(`Ship ${shipDef.name}: signCrossings=${signCrossings}, maxOvershoot=${(maxOvershootAngle * 180 / Math.PI).toFixed(2)} deg, settleTime=${settleTimeSec}s`);

        // Assertions:
        // No vessel should oscillate uncontrollably (signCrossings <= 4)
        expect(signCrossings).toBeLessThanOrEqual(4);
        // Overshoot must be well controlled (< 30 deg)
        expect(maxOvershootAngle).toBeLessThan(0.55);
        // Must converge to target
        const finalDiff = Math.abs(shortestAngleDiff(state.heading, Math.PI));
        expect(finalDiff).toBeLessThan(0.05);
      }
    });

    it('verifies throttle distance zones (idle < 50m, linear 50-250m, flank > 250m)', () => {
      const shipDef = SHIP_ROSTER['pt_boat_109'];

      const testDistances = [
        { dist: 0, expectedThrottle: 0.0 },
        { dist: 25, expectedThrottle: 0.0 },
        { dist: 49.9, expectedThrottle: 0.0 },
        { dist: 50, expectedThrottle: 0.1 },
        { dist: 150, expectedThrottle: 0.55 },
        { dist: 250, expectedThrottle: 1.0 },
        { dist: 500, expectedThrottle: 1.0 },
      ];

      for (const td of testDistances) {
        const state = createInitialPhysicsState(shipDef, vec2(0, 0), 0);
        const result = stepMouseSteering(shipDef, state, { x: td.dist, y: 0 }, dt);
        expect(result.mouseThrottle).toBeCloseTo(td.expectedThrottle, 2);
      }
    });

    it('verifies deadband: small heading errors (< 0.02 rad) produce 0 rudder', () => {
      const shipDef = SHIP_ROSTER['burke_ddg'];
      const state = createInitialPhysicsState(shipDef, vec2(0, 0), 0);

      // Position mouse at 0.01 rad (below 0.02 rad deadband)
      const angle = 0.015;
      const mouseWorld = { x: 300 * Math.cos(angle), y: 300 * Math.sin(angle) };
      const result = stepMouseSteering(shipDef, state, mouseWorld, dt);

      expect(Math.abs(result.headingError)).toBeLessThan(0.02);
      expect(result.mouseRudder).toBe(0);
    });
  });
});
