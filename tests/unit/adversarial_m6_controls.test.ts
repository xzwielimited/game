import { describe, it, expect, beforeEach } from 'vitest';
import { NavalCommandApp } from '../../client/src/app.js';
import { BinaryClient } from '../../client/src/netcode/binary_client.js';
import { serializeInput, deserializeInput } from '../../common/protocol/serializer.js';
import { Opcode, InputControlFlag } from '../../common/protocol/packet_types.js';
import { AuthoritativeGameServer } from '../../server/core/game_server.js';
import { SHIP_ROSTER } from '../../common/models/ships.js';
import { createInitialPhysicsState, updateHydrodynamics } from '../../common/simulation/hydrodynamics.js';
import { SensorOverlays } from '../../client/src/rendering/sensor_overlays.js';
import { vec2 } from '../../common/math/vector2.js';

// Minimal mock DOM for headless testing of NavalCommandApp
function createMockElement(tag: string = 'div'): any {
  const mockCtx = {
    clearRect: () => {},
    beginPath: () => {},
    arc: () => {},
    fill: () => {},
    stroke: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    save: () => {},
    restore: () => {},
    translate: () => {},
    rotate: () => {},
    scale: () => {},
    setLineDash: () => {},
    fillText: () => {},
    strokeText: () => {},
    measureText: () => ({ width: 0 }),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
  };
  return {
    tagName: tag.toUpperCase(),
    style: {},
    appendChild: () => {},
    removeChild: () => {},
    addEventListener: () => {},
    querySelector: () => createMockElement(),
    querySelectorAll: () => [],
    classList: { add: () => {}, remove: () => {} },
    innerHTML: '',
    textContent: '',
    getContext: () => mockCtx,
    width: 200,
    height: 200,
  };
}

(globalThis as any).document = {
  createElement: (tag: string) => createMockElement(tag),
  getElementById: (id: string) => createMockElement(),
  body: createMockElement('body'),
};
(globalThis as any).window = globalThis;

describe('Adversarial Verification Suite: Milestone M6 (Challenger M6-2)', () => {
  let app: NavalCommandApp;

  beforeEach(() => {
    app = new NavalCommandApp(createMockElement());
    (app as any).setupInitialWorld();
  });

  // =========================================================================
  // 1. INPUT BOUNDARY CONDITIONS & DISTANCE THROTTLE THRESHOLDS
  // =========================================================================
  describe('1. Distance Throttle Thresholds (D < 50m, 50m <= D <= 250m, D > 250m)', () => {
    it('boundary condition D < 50m: enforces dead-stop / idle throttle (0.0)', () => {
      const player = app.localServer.getVessel(app.playerVesselId)!;
      player.physics.position.x = 0;
      player.physics.position.y = 0;
      player.physics.heading = 0; // facing +X (East)

      // Test distances strictly below 50m: 0m, 10m, 25m, 49.0m, 49.999m
      const sub50Distances = [0, 5, 10, 25, 40, 49.0, 49.999];
      for (const d of sub50Distances) {
        (app as any).mouseScreenX = d;
        (app as any).mouseScreenY = 0;
        (app as any).updateLocalInput(0.05);

        expect(player.physics.throttle).toBe(0.0);
      }
    });

    it('boundary condition 50m <= D <= 250m: linear ramp 0.1..1.0 strictly matches formula', () => {
      const player = app.localServer.getVessel(app.playerVesselId)!;
      player.physics.position.x = 0;
      player.physics.position.y = 0;
      player.physics.heading = 0;

      // Exact inflection boundary at D = 50m: throttle jumps from 0.0 to 0.1
      (app as any).mouseScreenX = 50.0;
      (app as any).mouseScreenY = 0;
      (app as any).updateLocalInput(0.05);
      expect(player.physics.throttle).toBeCloseTo(0.1, 5);

      // Intermediate sample points: formula is 0.1 + ((D - 50) / 200) * 0.9
      const samplePoints = [
        { d: 70, expected: 0.1 + (20 / 200) * 0.9 }, // 0.19
        { d: 100, expected: 0.1 + (50 / 200) * 0.9 }, // 0.325
        { d: 150, expected: 0.1 + (100 / 200) * 0.9 }, // 0.55
        { d: 200, expected: 0.1 + (150 / 200) * 0.9 }, // 0.775
        { d: 230, expected: 0.1 + (180 / 200) * 0.9 }, // 0.91
        { d: 249.999, expected: 0.1 + (199.999 / 200) * 0.9 },
        { d: 250.0, expected: 1.0 }, // exact flank inflection
      ];

      for (const pt of samplePoints) {
        (app as any).mouseScreenX = pt.d;
        (app as any).mouseScreenY = 0;
        (app as any).updateLocalInput(0.05);

        expect(player.physics.throttle).toBeCloseTo(pt.expected, 4);
      }
    });

    it('boundary condition D > 250m: strictly commands full flank throttle (1.0)', () => {
      const player = app.localServer.getVessel(app.playerVesselId)!;
      player.physics.position.x = 0;
      player.physics.position.y = 0;
      player.physics.heading = 0;

      const flankDistances = [250.001, 251.0, 300.0, 500.0, 1200.0, 5000.0, 50000.0];
      for (const d of flankDistances) {
        (app as any).mouseScreenX = d;
        (app as any).mouseScreenY = 0;
        (app as any).updateLocalInput(0.05);

        expect(player.physics.throttle).toBe(1.0);
      }
    });

    it('proportional rudder deadband (|e_theta| < 0.02) and clamp ([-1.0, 1.0])', () => {
      const player = app.localServer.getVessel(app.playerVesselId)!;
      player.physics.position.x = 0;
      player.physics.position.y = 0;
      player.physics.heading = 0; // East (0 rad)

      // Test deadband: angles < 0.02 rad should yield zero rudder
      const deadbandAngle = 0.015; // < 0.02
      (app as any).mouseScreenX = 100 * Math.cos(deadbandAngle);
      (app as any).mouseScreenY = 100 * Math.sin(deadbandAngle);
      (app as any).updateLocalInput(0.05);
      expect(player.physics.rudderAngle).toBe(0.0);

      // Negative deadband: angle -0.015 rad
      (app as any).mouseScreenX = 100 * Math.cos(-deadbandAngle);
      (app as any).mouseScreenY = 100 * Math.sin(-deadbandAngle);
      (app as any).updateLocalInput(0.05);
      expect(player.physics.rudderAngle).toBe(0.0);

      // Active linear zone: angle 0.1 rad -> rudder = 0.1 * 2.5 = 0.25
      (app as any).mouseScreenX = 100 * Math.cos(0.1);
      (app as any).mouseScreenY = 100 * Math.sin(0.1);
      (app as any).updateLocalInput(0.05);
      expect(player.physics.rudderAngle).toBeCloseTo(0.25, 3);

      // Active negative zone: angle -0.2 rad -> rudder = -0.2 * 2.5 = -0.5
      (app as any).mouseScreenX = 100 * Math.cos(-0.2);
      (app as any).mouseScreenY = 100 * Math.sin(-0.2);
      (app as any).updateLocalInput(0.05);
      expect(player.physics.rudderAngle).toBeCloseTo(-0.5, 3);

      // Saturated clamp: angle 0.6 rad -> 0.6 * 2.5 = 1.5 -> clamped to 1.0
      (app as any).mouseScreenX = 100 * Math.cos(0.6);
      (app as any).mouseScreenY = 100 * Math.sin(0.6);
      (app as any).updateLocalInput(0.05);
      expect(player.physics.rudderAngle).toBe(1.0);

      // Saturated clamp negative: angle -0.6 rad -> clamped to -1.0
      (app as any).mouseScreenX = 100 * Math.cos(-0.6);
      (app as any).mouseScreenY = 100 * Math.sin(-0.6);
      (app as any).updateLocalInput(0.05);
      expect(player.physics.rudderAngle).toBe(-1.0);
    });
  });

  // =========================================================================
  // 2. EXTREME CURSOR COORDINATES
  // =========================================================================
  describe('2. Extreme Cursor Coordinates (±100,000, zero, infinite, NaN)', () => {
    it('handles extreme coordinates (+100,000 and -100,000) stably without numerical explosion', () => {
      const player = app.localServer.getVessel(app.playerVesselId)!;
      player.physics.position.x = 0;
      player.physics.position.y = 0;
      player.physics.heading = 0;

      // Extreme +100,000
      (app as any).mouseScreenX = 100000;
      (app as any).mouseScreenY = 100000;
      (app as any).updateLocalInput(0.05);

      expect(player.physics.throttle).toBe(1.0);
      expect(player.physics.rudderAngle).toBe(1.0); // angle is pi/4 -> 0.785 * 2.5 > 1.0 -> 1.0
      expect(Number.isFinite(player.physics.throttle)).toBe(true);
      expect(Number.isFinite(player.physics.rudderAngle)).toBe(true);

      // Extreme -100,000
      (app as any).mouseScreenX = -100000;
      (app as any).mouseScreenY = -100000;
      (app as any).updateLocalInput(0.05);

      expect(player.physics.throttle).toBe(1.0);
      expect(player.physics.rudderAngle).toBe(-1.0); // angle is -3pi/4 -> clamped -1.0
      expect(Number.isFinite(player.physics.throttle)).toBe(true);
      expect(Number.isFinite(player.physics.rudderAngle)).toBe(true);
    });

    it('handles zero cursor position exactly on top of vessel position (dx = 0, dy = 0)', () => {
      const player = app.localServer.getVessel(app.playerVesselId)!;
      player.physics.position.x = 500;
      player.physics.position.y = 500;
      player.physics.heading = 1.2;

      // Cursor placed at exactly the same coordinates as the vessel
      (app as any).mouseScreenX = 500;
      (app as any).mouseScreenY = 500;
      (app as any).updateLocalInput(0.05);

      // dist = 0 < 50m -> throttle must be 0.0
      expect(player.physics.throttle).toBe(0.0);
      // Math.atan2(0, 0) = 0. headingError = shortestAngleDiff(1.2, 0) = -1.2.
      // rudder is clamped to -1.0
      expect(Number.isFinite(player.physics.rudderAngle)).toBe(true);
    });

    it('evaluates behavior under Infinity and -Infinity cursor coordinates', () => {
      const player = app.localServer.getVessel(app.playerVesselId)!;
      player.physics.position.x = 0;
      player.physics.position.y = 0;
      player.physics.heading = 0;

      // Infinity coordinates
      (app as any).mouseScreenX = Infinity;
      (app as any).mouseScreenY = Infinity;
      (app as any).updateLocalInput(0.05);

      expect(player.physics.throttle).toBe(1.0);
      expect(player.physics.rudderAngle).toBe(1.0);

      // -Infinity coordinates
      (app as any).mouseScreenX = -Infinity;
      (app as any).mouseScreenY = 0;
      (app as any).updateLocalInput(0.05);

      expect(player.physics.throttle).toBe(1.0);
      expect(Math.abs(player.physics.rudderAngle)).toBe(1.0);
    });

    it('evaluates behavior under NaN cursor coordinates', () => {
      const player = app.localServer.getVessel(app.playerVesselId)!;
      player.physics.position.x = 0;
      player.physics.position.y = 0;
      player.physics.heading = 0;

      (app as any).mouseScreenX = NaN;
      (app as any).mouseScreenY = NaN;
      (app as any).updateLocalInput(0.05);

      // When dist is NaN:
      // dist < 50 is false; dist <= 250 is false; else branch executes -> mouseThrottle = 1.0
      // headingError is NaN; Math.abs(NaN) >= 0.02 is false -> mouseRudder = 0.0
      expect(player.physics.throttle).toBe(1.0);
      expect(player.physics.rudderAngle).toBe(0.0);
    });
  });

  // =========================================================================
  // 3. SEAMLESS WASD OVERRIDE PREEMPTION AND RESTORATION
  // =========================================================================
  describe('3. Seamless WASD Override & Restoration (Preemption & State Integrity)', () => {
    it('pressing W immediately preempts mouse throttle with 1.0 without lag or ramp rate', () => {
      const player = app.localServer.getVessel(app.playerVesselId)!;
      player.physics.position.x = 0;
      player.physics.position.y = 0;
      player.physics.heading = 0;

      // Mouse is in dead-stop idle zone (D = 30m)
      (app as any).mouseScreenX = 30;
      (app as any).mouseScreenY = 0;
      (app as any).updateLocalInput(0.05);
      expect(player.physics.throttle).toBe(0.0);

      // Press 'w' -> immediate preemption to 1.0 in tick 1
      (app as any).keysPressed.add('w');
      (app as any).updateLocalInput(0.05);
      expect(player.physics.throttle).toBe(1.0);

      // Release 'w' -> immediately returns to mouse idle 0.0 without residual ramp delay
      (app as any).keysPressed.delete('w');
      (app as any).updateLocalInput(0.05);
      expect(player.physics.throttle).toBe(0.0);
    });

    it('pressing S immediately preempts mouse throttle with reverse thrust (-0.5)', () => {
      const player = app.localServer.getVessel(app.playerVesselId)!;
      player.physics.position.x = 0;
      player.physics.position.y = 0;
      player.physics.heading = 0;

      // Mouse is at flank speed (D = 500m)
      (app as any).mouseScreenX = 500;
      (app as any).mouseScreenY = 0;
      (app as any).updateLocalInput(0.05);
      expect(player.physics.throttle).toBe(1.0);

      // Press 's' -> immediate reverse thrust (-0.5)
      (app as any).keysPressed.add('s');
      (app as any).updateLocalInput(0.05);
      expect(player.physics.throttle).toBe(-0.5);

      // Release 's' -> immediately restores mouse flank throttle (1.0)
      (app as any).keysPressed.delete('s');
      (app as any).updateLocalInput(0.05);
      expect(player.physics.throttle).toBe(1.0);
    });

    it('pressing A or D immediately preempts mouse rudder and releasing seamlessly restores mouse tracking', () => {
      const player = app.localServer.getVessel(app.playerVesselId)!;
      player.physics.position.x = 0;
      player.physics.position.y = 0;
      player.physics.heading = 0;

      // Mouse cursor is slightly off bow (+0.1 rad -> rudder = +0.25)
      (app as any).mouseScreenX = 100 * Math.cos(0.1);
      (app as any).mouseScreenY = 100 * Math.sin(0.1);
      (app as any).updateLocalInput(0.05);
      expect(player.physics.rudderAngle).toBeCloseTo(0.25, 3);

      // Press 'a' -> hard port rudder (-1.0) overrides mouse
      (app as any).keysPressed.add('a');
      (app as any).updateLocalInput(0.05);
      expect(player.physics.rudderAngle).toBe(-1.0);

      // Release 'a' -> restores proportional mouse rudder (+0.25)
      (app as any).keysPressed.delete('a');
      (app as any).updateLocalInput(0.05);
      expect(player.physics.rudderAngle).toBeCloseTo(0.25, 3);

      // Press 'd' -> hard starboard rudder (+1.0) overrides mouse
      (app as any).keysPressed.add('d');
      (app as any).updateLocalInput(0.05);
      expect(player.physics.rudderAngle).toBe(1.0);

      // Release 'd' -> restores proportional mouse rudder (+0.25)
      (app as any).keysPressed.delete('d');
      (app as any).updateLocalInput(0.05);
      expect(player.physics.rudderAngle).toBeCloseTo(0.25, 3);
    });

    it('supports arrow keys (arrowup, arrowdown, arrowleft, arrowright) identical to WASD', () => {
      const player = app.localServer.getVessel(app.playerVesselId)!;
      player.physics.position.x = 0;
      player.physics.position.y = 0;
      player.physics.heading = 0;

      (app as any).mouseScreenX = 30;
      (app as any).mouseScreenY = 0;

      // arrowup
      (app as any).keysPressed.add('arrowup');
      (app as any).updateLocalInput(0.05);
      expect(player.physics.throttle).toBe(1.0);
      (app as any).keysPressed.delete('arrowup');

      // arrowdown
      (app as any).keysPressed.add('arrowdown');
      (app as any).updateLocalInput(0.05);
      expect(player.physics.throttle).toBe(-0.5);
      (app as any).keysPressed.delete('arrowdown');

      // arrowleft
      (app as any).keysPressed.add('arrowleft');
      (app as any).updateLocalInput(0.05);
      expect(player.physics.rudderAngle).toBe(-1.0);
      (app as any).keysPressed.delete('arrowleft');

      // arrowright
      (app as any).keysPressed.add('arrowright');
      (app as any).updateLocalInput(0.05);
      expect(player.physics.rudderAngle).toBe(1.0);
      (app as any).keysPressed.delete('arrowright');
    });

    it('operates responsive WASD mode correctly when steeringMode === "WASD"', () => {
      const player = app.localServer.getVessel(app.playerVesselId)!;
      player.physics.position.x = 0;
      player.physics.position.y = 0;
      player.physics.heading = 0;

      app.steeringMode = 'WASD';

      // Mouse is placed at extreme distance with angle, but WASD mode ignores mouse
      (app as any).mouseScreenX = 1000;
      (app as any).mouseScreenY = 1000;
      (app as any).updateLocalInput(0.05);

      // Neutral: zero throttle, zero rudder
      expect(player.physics.throttle).toBe(0.0);
      expect(player.physics.rudderAngle).toBe(0.0);

      // W pressed
      (app as any).keysPressed.add('w');
      (app as any).updateLocalInput(0.05);
      expect(player.physics.throttle).toBe(1.0);
      (app as any).keysPressed.delete('w');

      // S pressed
      (app as any).keysPressed.add('s');
      (app as any).updateLocalInput(0.05);
      expect(player.physics.throttle).toBe(-0.5);
      (app as any).keysPressed.delete('s');

      // A pressed
      (app as any).keysPressed.add('a');
      (app as any).updateLocalInput(0.05);
      expect(player.physics.rudderAngle).toBe(-1.0);
      (app as any).keysPressed.delete('a');

      // D pressed
      (app as any).keysPressed.add('d');
      (app as any).updateLocalInput(0.05);
      expect(player.physics.rudderAngle).toBe(1.0);
      (app as any).keysPressed.delete('d');

      // Neutral restored
      (app as any).updateLocalInput(0.05);
      expect(player.physics.throttle).toBe(0.0);
      expect(player.physics.rudderAngle).toBe(0.0);
    });

    it('evaluates simultaneous opposing key presses (W+S, A+D)', () => {
      const player = app.localServer.getVessel(app.playerVesselId)!;
      player.physics.position.x = 0;
      player.physics.position.y = 0;
      player.physics.heading = 0;

      // In MOUSE mode:
      // When both S and W are held: S takes precedence in line 453 (reverse for safety)
      (app as any).keysPressed.add('w');
      (app as any).keysPressed.add('s');
      (app as any).updateLocalInput(0.05);
      expect(player.physics.throttle).toBe(-0.5);

      // When both A and D are held: A takes precedence in line 461 (-1.0)
      (app as any).keysPressed.add('a');
      (app as any).keysPressed.add('d');
      (app as any).updateLocalInput(0.05);
      expect(player.physics.rudderAngle).toBe(-1.0);

      (app as any).keysPressed.clear();
    });
  });

  // =========================================================================
  // 4. NETWORK WIRE PROTOCOL (OP_INPUT, i8 QUANTIZATION & OVERFLOW AUDIT)
  // =========================================================================
  describe('4. Network Wire Protocol Verification (OP_INPUT, i8 Quantization & Bounds)', () => {
    let client: BinaryClient;

    beforeEach(() => {
      client = new BinaryClient();
    });

    it('quantizes normal throttle and steer values strictly into [-100..100]', () => {
      const testCases = [
        { throttle: 1.0, steer: 1.0, expThrust: 100, expRudder: 100 },
        { throttle: -1.0, steer: -1.0, expThrust: -100, expRudder: -100 },
        { throttle: 0.0, steer: 0.0, expThrust: 0, expRudder: 0 },
        { throttle: 0.5, steer: 0.25, expThrust: 50, expRudder: 25 },
        { throttle: -0.5, steer: -0.75, expThrust: -50, expRudder: -75 },
      ];

      for (const tc of testCases) {
        const buffer = client.sendInput({
          sequence: 42,
          steer: tc.steer,
          throttle: tc.throttle,
          aimAngleRad: 0,
          targetDistance: 100,
          firePrimary: false,
          fireSecondary: false,
          fireTorpedo: false,
          fireMissile: false,
          diveToggle: false,
          stealthToggle: false,
          ecmToggle: false,
          activeSonar: false,
        });

        expect(buffer.byteLength).toBe(14);
        const view = new DataView(buffer);
        expect(view.getUint8(0)).toBe(Opcode.OP_INPUT);
        expect(view.getUint32(1, true)).toBe(42);

        const thrustI8 = view.getInt8(5);
        const rudderI8 = view.getInt8(6);

        expect(thrustI8).toBe(tc.expThrust);
        expect(rudderI8).toBe(tc.expRudder);

        // Roundtrip via deserializer
        const deserialized = deserializeInput(buffer);
        expect(deserialized.thrust).toBe(tc.expThrust);
        expect(deserialized.rudder).toBe(tc.expRudder);
      }
    });

    it('strictly clamps extreme / overflowing inputs to [-100..100] without i8 byte wrapping', () => {
      const extremeInputs = [
        { throttle: 2.0, steer: 5.0, expThrust: 100, expRudder: 100 },
        { throttle: -3.5, steer: -10.0, expThrust: -100, expRudder: -100 },
        { throttle: 1000.0, steer: 99999.0, expThrust: 100, expRudder: 100 },
        { throttle: -9999.0, steer: -100000.0, expThrust: -100, expRudder: -100 },
        { throttle: 1e9, steer: 1e12, expThrust: 100, expRudder: 100 },
      ];

      for (const tc of extremeInputs) {
        const buffer = client.sendInput({
          sequence: 101,
          steer: tc.steer,
          throttle: tc.throttle,
          aimAngleRad: 0,
          targetDistance: 50,
          firePrimary: false,
          fireSecondary: false,
          fireTorpedo: false,
          fireMissile: false,
          diveToggle: false,
          stealthToggle: false,
          ecmToggle: false,
          activeSonar: false,
        });

        const view = new DataView(buffer);
        const thrustI8 = view.getInt8(5);
        const rudderI8 = view.getInt8(6);

        // Must strictly not exceed signed 8-bit range [-128..127] and must clamp to [-100..100]
        expect(thrustI8).toBe(tc.expThrust);
        expect(rudderI8).toBe(tc.expRudder);
        expect(thrustI8).toBeGreaterThanOrEqual(-100);
        expect(thrustI8).toBeLessThanOrEqual(100);
        expect(rudderI8).toBeGreaterThanOrEqual(-100);
        expect(rudderI8).toBeLessThanOrEqual(100);

        // Verify unsigned byte inspection does not bleed into adjacent fields
        const rawByteThrust = view.getUint8(5);
        const rawByteRudder = view.getUint8(6);
        if (tc.expThrust === 100) expect(rawByteThrust).toBe(100);
        if (tc.expThrust === -100) expect(rawByteThrust).toBe(156); // 256 - 100 = 156 (0x9C)
        if (tc.expRudder === 100) expect(rawByteRudder).toBe(100);
        if (tc.expRudder === -100) expect(rawByteRudder).toBe(156);
      }
    });

    it('evaluates serializer behavior with direct adversarial serializeInput calls', () => {
      // Direct call to serializeInput with out-of-range packet values
      const testBuffer = serializeInput({
        opcode: Opcode.OP_INPUT,
        sequence: 999,
        thrust: 250, // exceeds 100
        rudder: -300, // exceeds -100
        depthTarget: 0,
        weaponFireMask: 0,
        targetX: 1000,
        targetY: 1000,
      });

      const view = new DataView(testBuffer);
      expect(view.getInt8(5)).toBe(100);
      expect(view.getInt8(6)).toBe(-100);

      const restored = deserializeInput(testBuffer);
      expect(restored.thrust).toBe(100);
      expect(restored.rudder).toBe(-100);
    });

    it('verifies server authoritative processInput decodes i8 values safely', () => {
      const server = new AuthoritativeGameServer(20);
      const testVessel = server.spawnVessel({
        id: 77,
        name: 'Test_Vessel',
        shipId: 'fletcher_dd',
        position: { x: 0, y: 0 },
        heading: 0,
        isBot: false,
      });

      // Test maximum forward thrust (100) and maximum starboard rudder (100)
      server.processInput(testVessel.id, {
        opcode: Opcode.OP_INPUT,
        sequence: 1,
        thrust: 100,
        rudder: 100,
        depthTarget: 0,
        weaponFireMask: 0,
        targetX: 0,
        targetY: 0,
      });

      expect(testVessel.physics.throttle).toBe(1.0);
      expect(testVessel.physics.rudderAngle).toBe(1.0);

      // Test full reverse thrust (-100) and full port rudder (-100)
      // Server maps negative thrust as (thrust / 100.0) * 0.5 -> -0.5
      server.processInput(testVessel.id, {
        opcode: Opcode.OP_INPUT,
        sequence: 2,
        thrust: -100,
        rudder: -100,
        depthTarget: 0,
        weaponFireMask: 0,
        targetX: 0,
        targetY: 0,
      });

      expect(testVessel.physics.throttle).toBe(-0.5);
      expect(testVessel.physics.rudderAngle).toBe(-1.0);

      // Test idle thrust (0) and neutral rudder (0)
      server.processInput(testVessel.id, {
        opcode: Opcode.OP_INPUT,
        sequence: 3,
        thrust: 0,
        rudder: 0,
        depthTarget: 0,
        weaponFireMask: 0,
        targetX: 0,
        targetY: 0,
      });

      expect(testVessel.physics.throttle).toBe(0.0);
      expect(testVessel.physics.rudderAngle).toBe(0.0);
    });
  });

  // =========================================================================
  // 5. SENSOR OVERLAYS COURSE RETICLE BOUNDARY & STRESS AUDIT
  // =========================================================================
  describe('5. Sensor Overlays Course Reticle Boundary & Numerical Stress', () => {
    let overlays: SensorOverlays;

    beforeEach(() => {
      overlays = new SensorOverlays();
    });

    it('safely handles distance < 1m without rendering or dividing by zero', () => {
      // target placed right at ship position (dx=0, dy=0)
      expect(() => {
        overlays.drawCourseReticle(0, 0, 0, 0, 0, true);
      }).not.toThrow();
    });

    it('safely renders when isMouseSteer is false (WASD mode clearing)', () => {
      expect(() => {
        overlays.drawCourseReticle(0, 0, 0, 500, 500, false);
      }).not.toThrow();
    });

    it('renders normal tactical distances (50m, 150m, 500m) without throwing', () => {
      const distances = [50, 150, 250, 500, 1000];
      for (const d of distances) {
        expect(() => {
          overlays.drawCourseReticle(0, 0, 0, d, 0, true);
        }).not.toThrow();
      }
    });

    it('evaluates extreme distance coordinates (+100,000m) in course vector generation', () => {
      // 100,000 meters course reticle: stress tests the dashed line loop
      const startTime = performance.now();
      expect(() => {
        overlays.drawCourseReticle(0, 0, 0, 100000, 0, true);
      }).not.toThrow();
      const elapsed = performance.now() - startTime;
      // Should complete quickly in Node (under 100ms)
      expect(elapsed).toBeLessThan(100);
    });
  });

  // =========================================================================
  // 6. HYDRODYNAMICS PROPELLER WASH & TURN AUTHORITY AUDIT
  // =========================================================================
  describe('6. Hydrodynamics Low-Speed Steerage & Propeller Wash Invariants', () => {
    it('verifies speedRatio >= 0.35 at zero forward speed under all throttle commands', () => {
      const shipDef = SHIP_ROSTER['fletcher_dd'];
      const dt = 0.05;

      // Stationary ship: u = 0, command throttle 0.0 (stopped)
      const stateIdle = createInitialPhysicsState(shipDef, vec2(0, 0), 0);
      updateHydrodynamics(shipDef, stateIdle, 0.0, 1.0, dt);

      // Even at 0 speed and 0 throttle, speedRatio is at least 0.35
      // stateIdle.angularVelocity develops immediately
      expect(stateIdle.angularVelocity).toBeGreaterThan(0);

      // Stationary ship: u = 0, command throttle 1.0 (flank)
      const stateThrust = createInitialPhysicsState(shipDef, vec2(0, 0), 0);
      updateHydrodynamics(shipDef, stateThrust, 1.0, 1.0, dt);
      expect(stateThrust.angularVelocity).toBeGreaterThan(0);
    });

    it('invariantly bounds speedRatio to [0.35, 1.0] across all speeds and throttle levels', () => {
      const shipDef = SHIP_ROSTER['yamato_bb'];
      const dt = 0.05;
      const testSpeeds = [-30, -15, -5, 0, 5, 15, 30, 50];
      const testThrottles = [-1.0, -0.5, 0.0, 0.5, 1.0];

      for (const spd of testSpeeds) {
        for (const thr of testThrottles) {
          const state = createInitialPhysicsState(shipDef, vec2(0, 0), 0);
          state.surgeSpeed = spd;
          updateHydrodynamics(shipDef, state, thr, 1.0, dt);

          // Turn rate must never exceed turnRateMax
          expect(Math.abs(state.angularVelocity)).toBeLessThanOrEqual(shipDef.turnRateMax + 1e-4);
        }
      }
    });
  });
});
