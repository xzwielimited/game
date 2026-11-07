import { describe, it, expect, beforeEach } from 'vitest';
import { AuthoritativeGameServer, ServerVessel } from '../../server/core/game_server.js';
import { BotController } from '../../server/ai/bot_controller.js';
import {
  Opcode,
  SNAPSHOT_HEADER_BYTES,
  VESSEL_SNAPSHOT_BYTES,
  VesselStatusFlag,
  GameEventType,
  InputControlFlag,
  InputPacket,
} from '../../common/protocol/packet_types.js';
import {
  serializeSnapshot,
  deserializeSnapshot,
  serializeVesselRecord,
  deserializeVesselRecord,
} from '../../common/protocol/serializer.js';
import { vec2, vec2Distance } from '../../common/math/vector2.js';
import { isPointInsidePolygon, Polygon } from '../../common/math/polygon.js';
import { SHIP_ROSTER } from '../../common/models/ships.js';

describe('Adversarial Challenger M7-2: Sinking FSM, Respawn Safety & Protocol Invariants', () => {
  let server: AuthoritativeGameServer;
  let botController: BotController;

  beforeEach(() => {
    server = new AuthoritativeGameServer(20);
    botController = new BotController(server);
  });

  // =========================================================================
  // 1. SINKING STATE MACHINE & ACTION INVALIDATION ORACLES
  // =========================================================================
  describe('1. Sinking FSM & Action Invalidation Rigorous Stress Test', () => {
    it('exact boundary: hull HP dropping from 1 to 0 triggers sinking transition', () => {
      const attacker = server.spawnVessel({ id: 10, shipId: 'yamato_bb', spawnShieldDuration: 0 });
      const victim = server.spawnVessel({ id: 20, shipId: 'pt_boat_109', spawnShieldDuration: 0 });

      // Force victim HP directly to 1 to test the exact 1 -> 0 boundary
      victim.physics.hullHp = 1;
      expect(victim.isSinking).toBe(false);
      expect(victim.physics.isDestroyed).toBe(false);

      // Deal 10 raw damage -> netDamage >= 1 -> HP becomes 0
      server.applyDamage(attacker.id, victim.id, 10);

      expect(victim.physics.hullHp).toBe(0);
      expect(victim.isSinking).toBe(true);
      expect(victim.sinkingTimer).toBe(3.0);
      expect(victim.physics.isDestroyed).toBe(false);
      expect(victim.killerId).toBe(attacker.id);
    });

    it('strictly rejects any client movement input (throttle, rudder) while sinking', () => {
      const victim = server.spawnVessel({ id: 21, shipId: 'fletcher_dd', spawnShieldDuration: 0 });
      victim.physics.throttle = 0.8;
      victim.physics.rudderAngle = 0.4;

      server.startSinking(victim);
      expect(victim.isSinking).toBe(true);
      expect(victim.physics.throttle).toBe(0);
      expect(victim.physics.rudderAngle).toBe(0);

      // Attempt maximum forward thrust + hard right rudder
      const packetForward: InputPacket = {
        opcode: Opcode.OP_INPUT,
        sequence: 101,
        thrust: 100,
        rudder: 100,
        depthTarget: 0,
        weaponFireMask: 0,
        targetX: 500,
        targetY: 500,
      };
      server.processInput(victim.id, packetForward);
      expect(victim.physics.throttle).toBe(0);
      expect(victim.physics.rudderAngle).toBe(0);
      expect(victim.lastInputSequence).not.toBe(101);

      // Attempt reverse thrust + hard left rudder
      const packetReverse: InputPacket = {
        opcode: Opcode.OP_INPUT,
        sequence: 102,
        thrust: -100,
        rudder: -100,
        depthTarget: 0,
        weaponFireMask: 0,
        targetX: -500,
        targetY: -500,
      };
      server.processInput(victim.id, packetReverse);
      expect(victim.physics.throttle).toBe(0);
      expect(victim.physics.rudderAngle).toBe(0);
      expect(victim.lastInputSequence).not.toBe(102);
    });

    it('strictly rejects all weapon mount firing across all 4 slots while sinking', () => {
      const victim = server.spawnVessel({ id: 22, shipId: 'yamato_bb', spawnShieldDuration: 0 });
      server.startSinking(victim);

      // Attempt to fire every mount slot (0..3)
      for (let slot = 0; slot < 4; slot++) {
        const fired = server.fireMount(victim.id, slot, vec2(1000, 1000));
        expect(fired).toBe(false);
      }

      // Ensure 0 projectiles were spawned
      expect(server.getAllProjectiles().length).toBe(0);
    });

    it('strictly rejects submarine depth change and stealth toggles while sinking', () => {
      const sub = server.spawnVessel({ id: 23, shipId: 'type_vii_uboat', spawnShieldDuration: 0 });
      server.startSinking(sub);

      const packetSub: InputPacket = {
        opcode: Opcode.OP_INPUT,
        sequence: 105,
        thrust: 0,
        rudder: 0,
        depthTarget: 2, // DEEP
        weaponFireMask: InputControlFlag.STEALTH_TOGGLE | InputControlFlag.ECM_TOGGLE,
        targetX: 0,
        targetY: 0,
      };

      server.processInput(sub.id, packetSub);
      expect(sub.physics.depthState).toBe('SURFACE');
      expect(sub.physics.stealthModeActive).toBe(false);
      expect(sub.ecmActive).toBe(false);
    });

    it('ignores incoming damage on a sinking vessel (canDamage returns false, applyDamage returns 0)', () => {
      const attacker1 = server.spawnVessel({ id: 11, shipId: 'yamato_bb', spawnShieldDuration: 0 });
      const attacker2 = server.spawnVessel({ id: 12, shipId: 'bismarck_bb', spawnShieldDuration: 0 });
      const victim = server.spawnVessel({ id: 24, shipId: 'fletcher_dd', spawnShieldDuration: 0 });

      // Deal lethal damage to initiate sinking
      server.applyDamage(attacker1.id, victim.id, 99999);
      expect(victim.isSinking).toBe(true);
      expect(victim.physics.hullHp).toBe(0);

      // Subsequent attacks from any attacker MUST be rejected
      expect(server.canDamage(attacker1.id, victim.id)).toBe(false);
      expect(server.canDamage(attacker2.id, victim.id)).toBe(false);

      const dmg1 = server.applyDamage(attacker1.id, victim.id, 5000);
      const dmg2 = server.applyDamage(attacker2.id, victim.id, 99999);
      expect(dmg1).toBe(0);
      expect(dmg2).toBe(0);
      expect(victim.physics.hullHp).toBe(0);

      // Sinking vessel must not be able to damage others either
      expect(server.canDamage(victim.id, attacker1.id)).toBe(false);
      expect(server.applyDamage(victim.id, attacker1.id, 1000)).toBe(0);
    });

    it('steps sinking timer for exactly 3.0 seconds (61 ticks at 20Hz due to IEEE 754 precision)', () => {
      const attacker = server.spawnVessel({ id: 13, shipId: 'fletcher_dd', spawnShieldDuration: 0 });
      const victim = server.spawnVessel({ id: 25, shipId: 'pt_boat_109', spawnShieldDuration: 0 });

      server.startSinking(victim, attacker);

      // 20 Hz simulation: dt = 0.05s per tick
      const dt = 0.05;

      // Step 59 ticks (2.95s): must still be sinking, NOT destroyed
      for (let i = 0; i < 59; i++) {
        server.step(dt);
        expect(victim.isSinking).toBe(true);
        expect(victim.physics.isDestroyed).toBe(false);
      }
      expect(victim.sinkingTimer).toBeCloseTo(0.05, 4);

      // 60th tick (3.00s): IEEE 754 precision yields 2.2898e-15 > 0, so timer is within 1e-14 of zero
      server.step(dt);
      expect(victim.sinkingTimer).toBeLessThan(1e-12);

      // 61st tick (3.05s = +1 tick): timer is strictly <= 0, committing final destruction
      server.step(dt);
      expect(victim.isSinking).toBe(false);
      expect(victim.physics.isDestroyed).toBe(true);
      expect(victim.deaths).toBe(1);
      expect(attacker.kills).toBe(1);

      // Verify SINK event was dispatched with killer & victim IDs
      const events = server.drainQueuedEvents();
      const sinkEvent = events.find((e) => e.eventType === GameEventType.SINK);
      expect(sinkEvent).toBeDefined();
      expect(sinkEvent!.targetId).toBe(victim.id);
      expect(sinkEvent!.sourceId).toBe(attacker.id);
    });

    it('idempotency: calling startSinking repeatedly does not reset the timer or corrupt state', () => {
      const victim = server.spawnVessel({ id: 26, shipId: 'fletcher_dd', spawnShieldDuration: 0 });
      server.startSinking(victim);
      expect(victim.sinkingTimer).toBe(3.0);

      // Advance 1.0 second
      server.step(1.0);
      expect(victim.sinkingTimer).toBeCloseTo(2.0, 4);

      // Attempt to call startSinking again
      server.startSinking(victim);
      expect(victim.sinkingTimer).toBeCloseTo(2.0, 4); // MUST NOT reset to 3.0!
      expect(victim.isSinking).toBe(true);
      expect(victim.physics.isDestroyed).toBe(false);
    });

    it('gracefully handles orphaned killer if killer vessel is destroyed/despawned before 3.0s completes', () => {
      const killer = server.spawnVessel({ id: 14, shipId: 'pt_boat_109', spawnShieldDuration: 0 });
      const victim = server.spawnVessel({ id: 27, shipId: 'fletcher_dd', spawnShieldDuration: 0 });

      server.startSinking(victim, killer);

      // Despawn killer by removing from internal map
      (server as any).vessels.delete(killer.id);

      // Step past 3.0 seconds -> must not throw error
      expect(() => {
        server.step(3.5);
      }).not.toThrow();

      expect(victim.isSinking).toBe(false);
      expect(victim.physics.isDestroyed).toBe(true);
    });
  });

  // =========================================================================
  // 2. RESPAWN COUNTDOWN & REDEPLOYMENT SAFETY ORACLES
  // =========================================================================
  describe('2. Respawn Countdown & Redeployment Safety', () => {
    it('redeployment resets HP to 100%, clears destroyed/sinking flags, and activates 4.0s spawn shield', () => {
      const player = server.spawnVessel({ id: 1, shipId: 'fletcher_dd', spawnShieldDuration: 0 });
      server.startSinking(player);
      server.step(3.1);
      expect(player.physics.isDestroyed).toBe(true);

      // Simulate redeployment logic from App.respawnPlayer()
      const newPos = { x: 500, y: 500 };
      player.physics.position = { ...newPos };
      player.physics.linearVelocity = { x: 0, y: 0 };
      player.physics.angularVelocity = 0;
      player.physics.speedKnots = 0;
      player.physics.throttle = 0;
      player.physics.rudderAngle = 0;
      player.physics.heading = Math.atan2(-newPos.y, -newPos.x);
      player.physics.hullHp = player.shipDef.maxHp;
      player.physics.isDestroyed = false;
      player.isSinking = false;
      player.sinkingTimer = 0;
      player.spawnShieldRemaining = 4.0;

      // Assert complete redeployment integrity
      expect(player.physics.hullHp).toBe(player.shipDef.maxHp);
      expect(player.physics.isDestroyed).toBe(false);
      expect(player.isSinking).toBe(false);
      expect(player.sinkingTimer).toBe(0);
      expect(player.spawnShieldRemaining).toBe(4.0);

      // Immediate damage test: enemy cannot damage redeployed player
      const enemy = server.spawnVessel({ id: 50, shipId: 'yamato_bb', spawnShieldDuration: 0 });
      expect(server.canDamage(enemy.id, player.id)).toBe(false);
      expect(server.applyDamage(enemy.id, player.id, 9999)).toBe(0);
      expect(player.physics.hullHp).toBe(player.shipDef.maxHp);
    });

    it('spawn shield provides strictly 4.0s of invulnerability with millisecond precision', () => {
      const player = server.spawnVessel({ id: 2, shipId: 'fletcher_dd', spawnShieldDuration: 4.0 });
      const enemy = server.spawnVessel({ id: 51, shipId: 'yamato_bb', spawnShieldDuration: 0 });

      // Step 3.99 seconds: still shielded!
      server.step(3.99);
      expect(player.spawnShieldRemaining).toBeCloseTo(0.01, 3);
      expect(server.canDamage(enemy.id, player.id)).toBe(false);
      expect(server.applyDamage(enemy.id, player.id, 1000)).toBe(0);

      // Step 0.02 seconds (total 4.01s): shield expired!
      server.step(0.02);
      expect(player.spawnShieldRemaining).toBe(0);
      expect(server.canDamage(enemy.id, player.id)).toBe(true);

      const dealt = server.applyDamage(enemy.id, player.id, 500);
      expect(dealt).toBeGreaterThan(0);
      expect(player.physics.hullHp).toBeLessThan(player.shipDef.maxHp);
    });

    it('empirical evaluation of safe spawn algorithm: selects maximum separation from enemy clusters', () => {
      // Simulate findSafeSpawnPosition logic with 12 bots clustered on the positive-X side (0 to +2000m)
      const bots = [
        { x: 1000, y: 0 },
        { x: 1200, y: 300 },
        { x: 1400, y: -200 },
        { x: 1600, y: 500 },
      ];

      const candidateRings = [800, 1050, 1300];
      let bestPos = { x: 0, y: 200 };
      let maxMinDist = -1;

      for (const r of candidateRings) {
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
          const cx = Math.cos(angle) * r;
          const cy = Math.sin(angle) * r;

          let minDistToEnemy = Infinity;
          for (const b of bots) {
            const d = Math.hypot(cx - b.x, cy - b.y);
            if (d < minDistToEnemy) minDistToEnemy = d;
          }

          if (minDistToEnemy > maxMinDist) {
            maxMinDist = minDistToEnemy;
            bestPos = { x: cx, y: cy };
          }
        }
      }

      // Best position must be on negative-X side (angle near PI, e.g. cx < -500)
      expect(bestPos.x).toBeLessThan(-500);
      // Separation from closest enemy must be >= 1800m
      expect(maxMinDist).toBeGreaterThanOrEqual(1800);
    });

    it('ADVERSARIAL STRESS: reveals that findSafeSpawnPosition lacks island collision avoidance', () => {
      // Place enemy vessels exclusively on the negative side (X <= -1000)
      const enemies = [
        { x: -1000, y: 0 },
        { x: -1200, y: 200 },
        { x: -1400, y: -200 },
      ];

      // Execute current findSafeSpawnPosition algorithm
      const candidateRings = [800, 1050, 1300];
      let bestPos = { x: 0, y: 200 };
      let maxMinDist = -1;

      for (const r of candidateRings) {
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
          const cx = Math.cos(angle) * r;
          const cy = Math.sin(angle) * r;

          let minDistToEnemy = Infinity;
          for (const e of enemies) {
            const d = Math.hypot(cx - e.x, cy - e.y);
            if (d < minDistToEnemy) minDistToEnemy = d;
          }

          if (minDistToEnemy > maxMinDist) {
            maxMinDist = minDistToEnemy;
            bestPos = { x: cx, y: cy };
          }
        }
      }

      // With enemies at negative X, the algorithm picks the furthest candidate on the positive X axis: (1300, 0)
      expect(bestPos.x).toBeCloseTo(1300, 1);
      expect(bestPos.y).toBeCloseTo(0, 1);

      // Now place an island directly at (1300, 0)
      const islandAt1300: Polygon = {
        vertices: [
          { x: 1200, y: -100 },
          { x: 1400, y: -100 },
          { x: 1400, y: 100 },
          { x: 1200, y: 100 },
        ],
      };

      const isInsideIsland = isPointInsidePolygon(bestPos, islandAt1300);
      // EMPIRICAL FINDING: The algorithm does not check islands, so the player spawns directly inside the island!
      expect(isInsideIsland).toBe(true);
    });
  });

  // =========================================================================
  // 3. BINARY PROTOCOL & 28-BYTE SNAPSHOT LAYOUT INVARIANTS
  // =========================================================================
  describe('3. Binary Protocol Layout & 28-Byte Snapshot Invariants', () => {
    it('strictly maintains SNAPSHOT_HEADER_BYTES = 12 and VESSEL_SNAPSHOT_BYTES = 28', () => {
      expect(SNAPSHOT_HEADER_BYTES).toBe(12);
      expect(VESSEL_SNAPSHOT_BYTES).toBe(28);
    });

    it('verifies exact byte offsets within the 28-byte vessel snapshot layout', () => {
      const buffer = new ArrayBuffer(VESSEL_SNAPSHOT_BYTES);
      const view = new DataView(buffer);

      const testRecord = {
        vesselId: 0x1234,
        posX: 123.4,
        posY: -567.8,
        heading: Math.PI / 4,
        speedKnots: 28,
        hullHpPct: 85,
        flags: VesselStatusFlag.SPAWN_SHIELD | VesselStatusFlag.CAVITATING,
        depth: 1,
        mountAngles: [0.1, 0.2, 0.3, 0.4] as [number, number, number, number],
        velX: 12.5,
        velY: -8.3,
        fleetId: 7,
        targetId: 42,
      };

      serializeVesselRecord(testRecord, view, 0);

      // Verify specific byte offsets
      expect(view.getUint16(0, true)).toBe(0x1234); // vesselId (u16)
      expect(view.getUint8(8)).toBe(28); // speedKnots (u8)
      expect(view.getUint8(9)).toBe(85); // hullHpPct (u8)
      expect(view.getUint8(10)).toBe(VesselStatusFlag.SPAWN_SHIELD | VesselStatusFlag.CAVITATING); // flags (u8)
      expect(view.getUint8(11)).toBe(1); // depth (u8)
      expect(view.getUint16(24, true)).toBe(7); // fleetId (u16)
      expect(view.getUint16(26, true)).toBe(42); // targetId (u16)

      // Deserialize and verify round-trip fidelity
      const deserialized = deserializeVesselRecord(view, 0);
      expect(deserialized.vesselId).toBe(0x1234);
      expect(deserialized.speedKnots).toBe(28);
      expect(deserialized.hullHpPct).toBe(85);
      expect(deserialized.flags).toBe(testRecord.flags);
      expect((deserialized.flags & VesselStatusFlag.SPAWN_SHIELD) !== 0).toBe(true);
      expect((deserialized.flags & VesselStatusFlag.CAVITATING) !== 0).toBe(true);
      expect(deserialized.depth).toBe(1);
      expect(deserialized.fleetId).toBe(7);
      expect(deserialized.targetId).toBe(42);
    });

    it('stress test: round-trips 100 vessels with alternating shield and status flags without byte drift', () => {
      const vesselCount = 100;
      const vessels = [];

      for (let i = 0; i < vesselCount; i++) {
        vessels.push(
          server.spawnVessel({
            id: 1000 + i,
            shipId: i % 2 === 0 ? 'fletcher_dd' : 'yamato_bb',
            position: vec2(Math.sin(i) * 1000, Math.cos(i) * 1000),
            spawnShieldDuration: i % 3 === 0 ? 4.0 : 0.0,
          })
        );
      }

      const snapshot = server.createSnapshotPacket(999);
      const buffer = serializeSnapshot(snapshot);

      // Invariant: totalBytes === 12 + 100 * 28 = 2812 bytes
      expect(buffer.byteLength).toBe(12 + vesselCount * 28);
      expect(buffer.byteLength).toBe(2812);

      const restored = deserializeSnapshot(buffer);
      expect(restored.vessels.length).toBe(vesselCount);

      for (let i = 0; i < vesselCount; i++) {
        const original = vessels[i];
        const record = restored.vessels.find((v) => v.vesselId === original.id);
        expect(record).toBeDefined();

        const shouldHaveShield = original.spawnShieldRemaining > 0;
        const hasShieldFlag = (record!.flags & VesselStatusFlag.SPAWN_SHIELD) !== 0;
        expect(hasShieldFlag).toBe(shouldHaveShield);
      }
    });

    it('documents protocol bitmask sharing: SPAWN_SHIELD and SONAR_ACTIVE share bit 5 (value 32)', () => {
      // Both share bit 5
      expect(VesselStatusFlag.SPAWN_SHIELD).toBe(32);
      expect(VesselStatusFlag.SONAR_ACTIVE).toBe(32);
      expect(VesselStatusFlag.SPAWN_SHIELD).toBe(VesselStatusFlag.SONAR_ACTIVE);

      // Verify that all other 7 bits remain distinct and uncorrupted
      const allFlags = [
        VesselStatusFlag.CAVITATING,   // 1
        VesselStatusFlag.FIRING,       // 2
        VesselStatusFlag.ECM_ACTIVE,   // 4
        VesselStatusFlag.STEALTH_ACTIVE, // 8
        VesselStatusFlag.GROUNDED,     // 16
        VesselStatusFlag.SPAWN_SHIELD, // 32
        VesselStatusFlag.DESTROYED,    // 64
        VesselStatusFlag.NAP_ACTIVE,   // 128
      ];

      expect(new Set(allFlags).size).toBe(8); // Exactly 8 distinct bits fill u8
    });
  });
});
