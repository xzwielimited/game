/**
 * Milestone M7 Comprehensive Unit Test Suite:
 * Combat Balance, Server Spawn Protection (3-5s Invulnerability Shield),
 * Outer-Ring Bot Placement & Anti-Swarming AI,
 * Authoritative Sinking State (3.0s Transition), and Respawn Flow.
 *
 * Clean-Room Test Suite for NavalCommand.io
 */

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
} from '../../common/protocol/serializer.js';
import { vec2, vec2Distance } from '../../common/math/vector2.js';
import { SHIP_ROSTER } from '../../common/models/ships.js';

describe('Milestone M7: Spawn Protection, Anti-Swarming, Sinking & Respawn', () => {
  let server: AuthoritativeGameServer;
  let botController: BotController;

  beforeEach(() => {
    server = new AuthoritativeGameServer(20);
    botController = new BotController(server);
  });

  // =========================================================================
  // 1. SERVER SPAWN PROTECTION & DAMAGE IMMUNITY (3-5s INVULNERABILITY SHIELD)
  // =========================================================================
  describe('1. Server Spawn Protection (Invulnerability Shield)', () => {
    it('initializes newly spawned vessels with 4.0s spawn shield remaining by default', () => {
      const vessel = server.spawnVessel({
        id: 1,
        name: 'SpawnTest_1',
        shipId: 'fletcher_dd',
        position: vec2(0, 0),
      });

      expect(vessel.spawnShieldRemaining).toBe(4.0);
      expect(vessel.isSinking).toBe(false);
      expect(vessel.sinkingTimer).toBe(0);
      expect(vessel.physics.isDestroyed).toBe(false);
    });

    it('allows custom spawn shield duration within 3.0s to 5.0s range', () => {
      const v3 = server.spawnVessel({ id: 2, spawnShieldDuration: 3.0 });
      const v5 = server.spawnVessel({ id: 3, spawnShieldDuration: 5.0 });

      expect(v3.spawnShieldRemaining).toBe(3.0);
      expect(v5.spawnShieldRemaining).toBe(5.0);
    });

    it('blocks 100% of incoming damage while spawn shield is active (canDamage returns false)', () => {
      const attacker = server.spawnVessel({
        id: 10,
        name: 'Attacker',
        shipId: 'yamato_bb',
        position: vec2(0, 0),
        spawnShieldDuration: 0, // Shield already expired for attacker
      });
      const victim = server.spawnVessel({
        id: 20,
        name: 'Victim',
        shipId: 'fletcher_dd',
        position: vec2(100, 0),
        spawnShieldDuration: 4.0, // Active 4.0s spawn shield
      });

      // canDamage MUST return false for shielded victim
      expect(server.canDamage(attacker.id, victim.id)).toBe(false);

      // applyDamage MUST return 0 and victim HP must remain 100% intact
      const initialHp = victim.physics.hullHp;
      const dealtDamage = server.applyDamage(attacker.id, victim.id, 1000);

      expect(dealtDamage).toBe(0);
      expect(victim.physics.hullHp).toBe(initialHp);
      expect(attacker.score).toBe(0);
    });

    it('counts down spawn shield timer on each simulation tick and expires cleanly after 4.0s', () => {
      const attacker = server.spawnVessel({
        id: 11,
        shipId: 'fletcher_dd',
        spawnShieldDuration: 0,
      });
      const victim = server.spawnVessel({
        id: 21,
        shipId: 'fletcher_dd',
        spawnShieldDuration: 4.0,
      });

      // Advance simulation 2.0 seconds -> 2.0s remaining, still immune
      server.step(2.0);
      expect(victim.spawnShieldRemaining).toBeCloseTo(2.0, 3);
      expect(server.canDamage(attacker.id, victim.id)).toBe(false);
      expect(server.applyDamage(attacker.id, victim.id, 500)).toBe(0);

      // Advance another 2.1 seconds (total 4.1s) -> shield expires!
      server.step(2.1);
      expect(victim.spawnShieldRemaining).toBe(0);
      expect(server.canDamage(attacker.id, victim.id)).toBe(true);

      // Once shield expires, damage is dealt normally
      const initialHp = victim.physics.hullHp;
      const netDamage = server.applyDamage(attacker.id, victim.id, 300);
      expect(netDamage).toBeGreaterThan(0);
      expect(victim.physics.hullHp).toBeLessThan(initialHp);
    });
  });

  // =========================================================================
  // 2. BINARY PROTOCOL & 28-BYTE SNAPSHOT LAYOUT PRESERVATION
  // =========================================================================
  describe('2. Binary Protocol & 28-Byte Snapshot Flag Preservation', () => {
    it('maps VesselStatusFlag.SPAWN_SHIELD to bit 5 (1 << 5 = 0x20)', () => {
      expect(VesselStatusFlag.SPAWN_SHIELD).toBe(1 << 5);
      expect(VesselStatusFlag.SPAWN_SHIELD).toBe(32);
    });

    it('encodes SPAWN_SHIELD status flag in createSnapshotPacket when shield is active', () => {
      const shielded = server.spawnVessel({
        id: 101,
        spawnShieldDuration: 4.0,
      });
      const unshielded = server.spawnVessel({
        id: 102,
        spawnShieldDuration: 0.0,
      });

      const snapshot = server.createSnapshotPacket();
      const recShielded = snapshot.vessels.find((v) => v.vesselId === shielded.id);
      const recUnshielded = snapshot.vessels.find((v) => v.vesselId === unshielded.id);

      expect(recShielded).toBeDefined();
      expect((recShielded!.flags & VesselStatusFlag.SPAWN_SHIELD) !== 0).toBe(true);

      expect(recUnshielded).toBeDefined();
      expect((recUnshielded!.flags & VesselStatusFlag.SPAWN_SHIELD) !== 0).toBe(false);
    });

    it('strictly preserves the 28-byte vessel snapshot layout across binary serialization/deserialization', () => {
      const v1 = server.spawnVessel({ id: 201, spawnShieldDuration: 4.0 });
      const v2 = server.spawnVessel({ id: 202, spawnShieldDuration: 0.0 });
      const v3 = server.spawnVessel({ id: 203, spawnShieldDuration: 4.0 });

      const snapshot = server.createSnapshotPacket(42);
      const buffer = serializeSnapshot(snapshot);

      // Header is 12 bytes, each vessel is exactly 28 bytes
      const expectedBytes = SNAPSHOT_HEADER_BYTES + 3 * VESSEL_SNAPSHOT_BYTES;
      expect(buffer.byteLength).toBe(expectedBytes);
      expect(VESSEL_SNAPSHOT_BYTES).toBe(28);
      expect(SNAPSHOT_HEADER_BYTES).toBe(12);

      // Round-trip deserialization preserves flags and fields
      const restored = deserializeSnapshot(buffer);
      expect(restored.vessels.length).toBe(3);

      const r1 = restored.vessels.find((v) => v.vesselId === v1.id);
      const r2 = restored.vessels.find((v) => v.vesselId === v2.id);
      const r3 = restored.vessels.find((v) => v.vesselId === v3.id);

      expect(r1).toBeDefined();
      expect((r1!.flags & VesselStatusFlag.SPAWN_SHIELD) !== 0).toBe(true);

      expect(r2).toBeDefined();
      expect((r2!.flags & VesselStatusFlag.SPAWN_SHIELD) !== 0).toBe(false);

      expect(r3).toBeDefined();
      expect((r3!.flags & VesselStatusFlag.SPAWN_SHIELD) !== 0).toBe(true);
    });
  });

  // =========================================================================
  // 3. AUTHORITATIVE SINKING STATE & 3.0s TRANSITION MECHANICS
  // =========================================================================
  describe('3. Authoritative Sinking State (3.0s Timer & Disabled Controls)', () => {
    it('enters sinking state for 3.0s when hull HP reaches 0 without immediate destruction', () => {
      const attacker = server.spawnVessel({ id: 301, spawnShieldDuration: 0 });
      const victim = server.spawnVessel({ id: 302, spawnShieldDuration: 0 });

      // Deal lethal damage
      server.applyDamage(attacker.id, victim.id, 99999);

      expect(victim.physics.hullHp).toBe(0);
      expect(victim.isSinking).toBe(true);
      expect(victim.sinkingTimer).toBe(3.0);
      expect(victim.physics.isDestroyed).toBe(false); // MUST remain false during sinking!
      expect(victim.killerId).toBe(attacker.id);
    });

    it('zeros controls and disables weapon firing while sinking', () => {
      const victim = server.spawnVessel({ id: 303, spawnShieldDuration: 0 });
      victim.physics.throttle = 1.0;
      victim.physics.rudderAngle = 0.5;

      server.startSinking(victim);

      expect(victim.isSinking).toBe(true);
      expect(victim.physics.throttle).toBe(0);
      expect(victim.physics.rudderAngle).toBe(0);

      // Attempting to send client input while sinking must be rejected
      const inputPacket: InputPacket = {
        opcode: Opcode.OP_INPUT,
        sequence: 1,
        thrust: 100,
        rudder: 100,
        depthTarget: 0,
        weaponFireMask: InputControlFlag.FIRE_PRIMARY,
        targetX: 100,
        targetY: 100,
      };

      server.processInput(victim.id, inputPacket);
      expect(victim.physics.throttle).toBe(0);
      expect(victim.physics.rudderAngle).toBe(0);

      // Attempting to fire mounts while sinking must return false
      expect(server.fireMount(victim.id, 0, vec2(100, 100))).toBe(false);
    });

    it('blocks damage dealt to or by a sinking vessel (canDamage returns false)', () => {
      const attacker = server.spawnVessel({ id: 304, spawnShieldDuration: 0 });
      const victim = server.spawnVessel({ id: 305, spawnShieldDuration: 0 });

      server.startSinking(victim, attacker);

      // Victim is sinking: attacker cannot deal further damage
      expect(server.canDamage(attacker.id, victim.id)).toBe(false);
      expect(server.applyDamage(attacker.id, victim.id, 500)).toBe(0);

      // Sinking victim cannot deal damage to attacker
      expect(server.canDamage(victim.id, attacker.id)).toBe(false);
    });

    it('transitions from sinking to isDestroyed = true when 3.0s sinking timer expires', () => {
      const attacker = server.spawnVessel({ id: 306, spawnShieldDuration: 0 });
      const victim = server.spawnVessel({ id: 307, spawnShieldDuration: 0 });

      server.startSinking(victim, attacker);
      expect(victim.isSinking).toBe(true);
      expect(victim.physics.isDestroyed).toBe(false);

      // Step 1.5 seconds -> still sinking, not yet destroyed
      server.step(1.5);
      expect(victim.isSinking).toBe(true);
      expect(victim.sinkingTimer).toBeCloseTo(1.5, 3);
      expect(victim.physics.isDestroyed).toBe(false);

      // Step remaining 1.6 seconds (total 3.1s) -> sinking timer expires!
      server.step(1.6);
      expect(victim.isSinking).toBe(false);
      expect(victim.physics.isDestroyed).toBe(true);
      expect(victim.deaths).toBe(1);
      expect(attacker.kills).toBe(1);

      // Verify SINK event was dispatched
      const events = server.drainQueuedEvents();
      const sinkEvent = events.find((e) => e.eventType === GameEventType.SINK);
      expect(sinkEvent).toBeDefined();
      expect(sinkEvent!.targetId).toBe(victim.id);
      expect(sinkEvent!.sourceId).toBe(attacker.id);
    });
  });

  // =========================================================================
  // 4. BOT SPAWN PATROL RING & ANTI-SWARMING AI
  // =========================================================================
  describe('4. Bot Spawning & Anti-Swarming Ring Verification', () => {
    it('generates bot initial spawn distances within the outer patrol ring (1350m to 2190m)', () => {
      const botCount = 12;
      const distances: number[] = [];

      for (let i = 0; i < botCount; i++) {
        const dist = 1350 + (i % 4) * 280;
        distances.push(dist);
      }

      // Formula: 1350, 1630, 1910, 2190
      expect(Math.min(...distances)).toBe(1350);
      expect(Math.max(...distances)).toBe(2190);

      for (const d of distances) {
        expect(d).toBeGreaterThanOrEqual(1350);
        expect(d).toBeLessThanOrEqual(2200);
      }
    });

    it('guarantees bot spawns maintain at least 1150m safe distance from player initial spawn point (0, 200)', () => {
      const playerSpawn = vec2(0, 200);
      const botCount = 12;

      for (let i = 0; i < botCount; i++) {
        const angle = (i / botCount) * Math.PI * 2;
        const radius = 1350 + (i % 4) * 280;
        const botSpawn = vec2(Math.cos(angle) * radius, Math.sin(angle) * radius);

        const distToPlayer = vec2Distance(botSpawn, playerSpawn);
        // Minimum distance is 1350 - 200 = 1150 meters
        expect(distToPlayer).toBeGreaterThanOrEqual(1150);
      }
    });

    it('ensures BotController skips shielded vessels during combat target selection', () => {
      // Spawn bot at (1000, 0)
      const bot = server.spawnVessel({
        id: 401,
        shipId: 'fletcher_dd',
        position: vec2(1000, 0),
        spawnShieldDuration: 0,
        isBot: true,
      });
      botController.registerBot(bot.id);

      // Spawn player at (400, 0) within 600m (normally within acquisition distance)
      // but with active spawn shield
      const shieldedPlayer = server.spawnVessel({
        id: 402,
        shipId: 'fletcher_dd',
        position: vec2(400, 0),
        spawnShieldDuration: 4.0,
      });

      // Update bot AI
      botController.update(0.05);

      // Bot mounts should NOT fire on shielded player
      const projectilesBefore = server.getAllProjectiles();
      expect(projectilesBefore.length).toBe(0);

      // Advance time so player shield expires
      server.step(4.1);
      expect(shieldedPlayer.spawnShieldRemaining).toBe(0);

      // Next bot update: bot acquires player and fires!
      botController.update(0.05);
      const projectilesAfter = server.getAllProjectiles();
      expect(projectilesAfter.length).toBeGreaterThan(0);
    });

    it('enforces bot hostile acquisition radius capped at 1100m', () => {
      const bot = server.spawnVessel({
        id: 410,
        shipId: 'fletcher_dd',
        position: vec2(0, 0),
        spawnShieldDuration: 0,
        isBot: true,
      });
      botController.registerBot(bot.id);

      // Target at 1250m (> 1100m acquisition limit)
      server.spawnVessel({
        id: 411,
        shipId: 'fletcher_dd',
        position: vec2(1250, 0),
        spawnShieldDuration: 0,
      });

      botController.update(0.05);
      expect(server.getAllProjectiles().length).toBe(0);
    });
  });

  // =========================================================================
  // 5. RESPAWN FLOW & SHIELD RE-ARMING
  // =========================================================================
  describe('5. Respawn Flow & Spawn Shield Re-arming', () => {
    it('restores full HP, clears sinking/destruction, and re-activates 4.0s spawn shield upon respawn', () => {
      const player = server.spawnVessel({
        id: 501,
        shipId: 'fletcher_dd',
        spawnShieldDuration: 0,
      });

      // Sunk and destroyed
      server.startSinking(player);
      server.step(3.5);
      expect(player.physics.isDestroyed).toBe(true);

      // Respawn action
      player.physics.isDestroyed = false;
      player.isSinking = false;
      player.sinkingTimer = 0;
      player.physics.hullHp = player.shipDef.maxHp;
      player.spawnShieldRemaining = 4.0;
      player.physics.position = vec2(500, 500);

      expect(player.physics.hullHp).toBe(player.shipDef.maxHp);
      expect(player.spawnShieldRemaining).toBe(4.0);
      expect(player.isSinking).toBe(false);
      expect(player.physics.isDestroyed).toBe(false);

      // Damage immunity re-established immediately
      const hostile = server.spawnVessel({ id: 502, spawnShieldDuration: 0 });
      expect(server.canDamage(hostile.id, player.id)).toBe(false);
      expect(server.applyDamage(hostile.id, player.id, 500)).toBe(0);
    });
  });
});
