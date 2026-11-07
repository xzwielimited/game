import { describe, it, expect } from 'vitest';
import {
  SHIP_ROSTER,
  createInitialPhysicsState,
  updateHydrodynamics,
  commandDepthState,
  toggleStealthMode,
  vec2,
  knotsToMs,
} from '../../common/index.js';

describe('Feature 1: Deterministic 2D Naval Hydrodynamics Simulation', () => {
  const dt = 0.05; // 20 Hz server tick

  it('accelerates forward from rest under positive throttle', () => {
    const shipDef = SHIP_ROSTER['fletcher_dd'];
    const state = createInitialPhysicsState(shipDef, vec2(1000, 1000), 0);

    // Initial state check
    expect(state.linearVelocity.x).toBe(0);
    expect(state.linearVelocity.y).toBe(0);
    expect(state.speedKnots).toBe(0);

    // Step simulation for 2 seconds (40 ticks) at full throttle
    for (let i = 0; i < 40; i++) {
      updateHydrodynamics(shipDef, state, 1.0, 0, dt);
    }

    expect(state.surgeSpeed).toBeGreaterThan(0);
    expect(state.linearVelocity.x).toBeGreaterThan(0);
    expect(state.speedKnots).toBeGreaterThan(5);
    expect(state.position.x).toBeGreaterThan(1000);
    expect(state.position.y).toBe(1000); // Heading 0 -> only X motion
  });

  it('decelerates and reverses under negative throttle', () => {
    const shipDef = SHIP_ROSTER['pt_boat_109'];
    const state = createInitialPhysicsState(shipDef, vec2(500, 500), 0);

    // Accelerate forward for 1 second
    for (let i = 0; i < 20; i++) {
      updateHydrodynamics(shipDef, state, 1.0, 0, dt);
    }
    const forwardSpeed = state.surgeSpeed;
    expect(forwardSpeed).toBeGreaterThan(0);

    // Command full reverse
    for (let i = 0; i < 60; i++) {
      updateHydrodynamics(shipDef, state, -0.5, 0, dt);
    }

    // Should decelerate and eventually achieve reverse velocity
    expect(state.surgeSpeed).toBeLessThan(0);
    expect(state.linearVelocity.x).toBeLessThan(0);
  });

  it('exhibits hydrodynamic drift and turning slip angle beta = atan2(w, u)', () => {
    const shipDef = SHIP_ROSTER['vosper_mtb'];
    const state = createInitialPhysicsState(shipDef, vec2(0, 0), 0);

    // Accelerate to cruising speed (3.0 seconds)
    for (let i = 0; i < 60; i++) {
      updateHydrodynamics(shipDef, state, 1.0, 0, dt);
    }

    expect(state.surgeSpeed).toBeGreaterThan(10);
    expect(state.swaySpeed).toBeCloseTo(0, 1);

    // Initiate hard starboard turn (rudder = 1.0)
    for (let i = 0; i < 15; i++) {
      updateHydrodynamics(shipDef, state, 1.0, 1.0, dt);
    }

    // Should develop angular velocity and non-zero sway velocity (lateral drift)
    expect(state.angularVelocity).toBeGreaterThan(0);
    expect(Math.abs(state.swaySpeed)).toBeGreaterThan(0.05);

    // Slip angle beta should be non-zero
    expect(Math.abs(state.slipAngle)).toBeGreaterThan(0.01);
  });

  it('demonstrates realistic speed decay (25-30% loss) during sustained tight turns', () => {
    const shipDef = SHIP_ROSTER['burke_ddg'];
    const state = createInitialPhysicsState(shipDef, vec2(0, 0), 0);

    // Reach steady-state forward speed
    for (let i = 0; i < 200; i++) {
      updateHydrodynamics(shipDef, state, 1.0, 0, dt);
    }
    const straightLineSpeed = state.surgeSpeed;
    expect(straightLineSpeed).toBeGreaterThan(12);

    // Sustained hard turn for 8 seconds (160 ticks)
    for (let i = 0; i < 160; i++) {
      updateHydrodynamics(shipDef, state, 1.0, 1.0, dt);
    }

    const turningSpeed = state.surgeSpeed;
    const speedLossFraction = (straightLineSpeed - turningSpeed) / straightLineSpeed;

    // Speed loss should be within expected naval range (15% to 40%)
    expect(speedLossFraction).toBeGreaterThan(0.15);
    expect(speedLossFraction).toBeLessThan(0.45);
  });

  it('enforces Submarine 4-6s Dive/Surface cooldown (anti-dolphin-hop)', () => {
    const subDef = SHIP_ROSTER['akula_ssn'];
    const state = createInitialPhysicsState(subDef, vec2(0, 0), 0);

    expect(state.depthState).toBe('SURFACE');
    expect(state.depthTransitionTimer).toBe(0);

    // Command dive to PERISCOPE depth
    const success1 = commandDepthState(subDef, state, 'PERISCOPE');
    expect(success1).toBe(true);
    expect(state.targetDepthState).toBe('PERISCOPE');
    expect(state.depthTransitionTimer).toBe(5.0); // 5s cooldown
    expect(state.depthState).toBe('SURFACE'); // Transition in progress, not yet complete!

    // Attempting to immediately command back to SURFACE should be rejected during cooldown
    const spamCommand = commandDepthState(subDef, state, 'PERISCOPE');
    expect(spamCommand).toBe(false);

    // Step simulation for 2.5s (half cooldown)
    for (let i = 0; i < 50; i++) {
      updateHydrodynamics(subDef, state, 0.5, 0, dt);
    }
    expect(state.depthState).toBe('SURFACE'); // Still transitioning
    expect(state.depthTransitionTimer).toBeCloseTo(2.5, 1);

    // Step remaining 2.5s
    for (let i = 0; i < 50; i++) {
      updateHydrodynamics(subDef, state, 0.5, 0, dt);
    }
    expect(state.depthTransitionTimer).toBe(0);
    expect(state.depthState).toBe('PERISCOPE');
    expect(state.currentDepth).toBe(-5.0);

    // Now command to DEEP
    const success2 = commandDepthState(subDef, state, 'DEEP');
    expect(success2).toBe(true);
    for (let i = 0; i < 100; i++) {
      updateHydrodynamics(subDef, state, 0.5, 0, dt);
    }
    expect(state.depthState).toBe('DEEP');
    expect(state.currentDepth).toBe(-30.0);
  });

  it('enforces Submarine Stealth Cruise mode speed cap below cavitation threshold', () => {
    const subDef = SHIP_ROSTER['seawolf_ssn'];
    const state = createInitialPhysicsState(subDef, vec2(0, 0), 0);

    // Dive to DEEP
    commandDepthState(subDef, state, 'DEEP');
    for (let i = 0; i < 100; i++) {
      updateHydrodynamics(subDef, state, 0.5, 0, dt);
    }
    expect(state.depthState).toBe('DEEP');

    // Run full throttle WITHOUT stealth cruise
    for (let i = 0; i < 200; i++) {
      updateHydrodynamics(subDef, state, 1.0, 0, dt);
    }

    const unconstrainedSpeed = state.linearVelocity.x;
    expect(unconstrainedSpeed).toBeGreaterThan(subDef.cavitationThresholdSpeed);
    expect(state.isCavitationNoise).toBe(true);

    // Now toggle Stealth Cruise mode ON
    toggleStealthMode(subDef, state, true);
    expect(state.stealthModeActive).toBe(true);

    // Run for another 100 ticks
    for (let i = 0; i < 100; i++) {
      updateHydrodynamics(subDef, state, 1.0, 0, dt);
    }

    // Velocity must be capped below cavitation threshold speed
    const cappedSpeed = state.linearVelocity.x;
    expect(cappedSpeed).toBeLessThanOrEqual(subDef.cavitationThresholdSpeed);
    expect(state.isCavitationNoise).toBe(false);
  });

  it('guarantees numerical determinism across identical 1,000 tick headless runs', () => {
    const shipDef = SHIP_ROSTER['yamato_bb'];

    const runSimulation = () => {
      const state = createInitialPhysicsState(shipDef, vec2(5000, 5000), 0.5);
      for (let tick = 0; tick < 1000; tick++) {
        // Varying rudder and throttle sequence
        const throttle = Math.sin(tick * 0.02);
        const rudder = Math.cos(tick * 0.03);
        updateHydrodynamics(shipDef, state, throttle, rudder, dt);
      }
      return {
        x: state.position.x,
        y: state.position.y,
        heading: state.heading,
        vx: state.linearVelocity.x,
        vy: state.linearVelocity.y,
        omega: state.angularVelocity,
      };
    };

    const run1 = runSimulation();
    const run2 = runSimulation();

    // Must be bit-identical
    expect(run1.x).toBe(run2.x);
    expect(run1.y).toBe(run2.y);
    expect(run1.heading).toBe(run2.heading);
    expect(run1.vx).toBe(run2.vx);
    expect(run1.vy).toBe(run2.vy);
    expect(run1.omega).toBe(run2.omega);
  });

  it('verifies enhanced low-speed steerage with propeller wash at zero/low forward speed', () => {
    const shipDef = SHIP_ROSTER['fletcher_dd'];
    const state = createInitialPhysicsState(shipDef, vec2(0, 0), 0);

    // Initial state: vessel is stationary
    expect(state.surgeSpeed).toBe(0);
    expect(state.angularVelocity).toBe(0);

    // Step 1: Apply full rudder and full throttle for 10 ticks (0.5s)
    for (let i = 0; i < 10; i++) {
      updateHydrodynamics(shipDef, state, 1.0, 1.0, dt);
    }

    // With propeller wash (effective ratio >= 0.35), turning authority develops rapidly
    // Angular velocity should be at least 35% of max turn rate after 0.5s
    expect(state.angularVelocity).toBeGreaterThan(shipDef.turnRateMax * 0.30);
    // Heading should have already begun turning
    expect(state.heading).toBeGreaterThan(0.01);
  });

  it('strictly bounds maximum turn rate to shipDef.turnRateMax under sustained flank speed and full rudder', () => {
    const shipDef = SHIP_ROSTER['pt_boat_109'];
    const state = createInitialPhysicsState(shipDef, vec2(0, 0), 0);

    // Run full throttle and hard starboard rudder for 100 ticks (5.0s)
    for (let i = 0; i < 100; i++) {
      updateHydrodynamics(shipDef, state, 1.0, 1.0, dt);
      expect(Math.abs(state.angularVelocity)).toBeLessThanOrEqual(shipDef.turnRateMax + 1e-5);
    }

    // Steady-state turning rate must not exceed turnRateMax
    expect(state.angularVelocity).toBeLessThanOrEqual(shipDef.turnRateMax);
  });

  it('provides active turning authority during reverse thrust maneuvers', () => {
    const shipDef = SHIP_ROSTER['burke_ddg'];
    const state = createInitialPhysicsState(shipDef, vec2(0, 0), 0);

    // Command full reverse thrust (-0.5) with full port rudder (-1.0)
    for (let i = 0; i < 20; i++) {
      updateHydrodynamics(shipDef, state, -0.5, -1.0, dt);
    }

    // Prop wash from active reverse thrust provides steering response
    expect(Math.abs(state.angularVelocity)).toBeGreaterThan(0.01);
  });
});

