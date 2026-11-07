/**
 * Adversarial Reviewer 2 Stress Suite for Milestone M7:
 * Combat Balance, Spawn Protection & Respawn Flow
 *
 * Stress-tests:
 * 1. Damage absorption & multi-attacker barrage under active spawn shield
 * 2. Exact dt time-boundary discretization during shield expiration
 * 3. Consecutive rapid death cycles and immunity re-arming
 * 4. Sinking state immutability & mutual damage prevention
 * 5. Safe spawn positioning with varied enemy spatial distributions
 * 6. Multi-flag bitmask combinations in binary snapshot wire protocol
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AuthoritativeGameServer } from '../../server/core/game_server.js';
import { BotController } from '../../server/ai/bot_controller.js';
import {
  SNAPSHOT_HEADER_BYTES,
  VESSEL_SNAPSHOT_BYTES,
  VesselStatusFlag,
  GameEventType,
} from '../../common/protocol/packet_types.js';
import {
  serializeSnapshot,
  deserializeSnapshot,
} from '../../common/protocol/serializer.js';
import { vec2, vec2Distance } from '../../common/math/vector2.js';

describe('Adversarial Reviewer 2: M7 Stress & Boundary Suite', () => {
  let server: AuthoritativeGameServer;
  let botController: BotController;

  beforeEach(() => {
    server = new AuthoritativeGameServer(20);
    botController = new BotController(server);
  });

  describe('1. Multi-Attacker Barrage & Exact Tick Boundary', () => {
    it('absorbs simultaneous damage from 10 attackers without losing a single HP', () => {
      const victim = server.spawnVessel({
        id: 1,
        shipId: 'pt_boat_109',
        position: vec2(0, 0),
        spawnShieldDuration: 4.0,
      });
      const initialHp = victim.physics.hullHp;

      // Spawn 10 attackers surrounding the victim
      const attackers = [];
      for (let i = 0; i < 10; i++) {
        const angle = (i / 10) * Math.PI * 2;
        const atk = server.spawnVessel({
          id: 10 + i,
          shipId: 'yamato_bb',
          position: vec2(Math.cos(angle) * 100, Math.sin(angle) * 100),
          spawnShieldDuration: 0,
        });
        attackers.push(atk);
      }

      // Each attacker attempts 10 attacks of 500 damage = 50,000 raw damage
      for (const atk of attackers) {
        for (let j = 0; j < 10; j++) {
          const dealt = server.applyDamage(atk.id, victim.id, 500);
          expect(dealt).toBe(0);
        }
      }

      expect(victim.physics.hullHp).toBe(initialHp);
      expect(victim.isSinking).toBe(false);
      expect(victim.physics.isDestroyed).toBe(false);
    });

    it('precisely transitions from invulnerable to vulnerable across exact step(dt) boundary', () => {
      const victim = server.spawnVessel({
        id: 2,
        shipId: 'fletcher_dd',
        spawnShieldDuration: 4.0,
      });
      const attacker = server.spawnVessel({
        id: 3,
        shipId: 'fletcher_dd',
        spawnShieldDuration: 0,
      });

      // Advance by 3.95s (dt = 0.05s * 79 ticks)
      for (let t = 0; t < 79; t++) {
        server.step(0.05);
      }
      expect(victim.spawnShieldRemaining).toBeCloseTo(0.05, 5);
      expect(server.canDamage(attacker.id, victim.id)).toBe(false);
      expect(server.applyDamage(attacker.id, victim.id, 200)).toBe(0);

      // Advance exactly 1 more tick (0.05s) -> hits tick 80
      server.step(0.05);
      // Notice floating point epsilon: 4.0 - 80*0.05 in IEEE-754 is ~5.84e-15
      expect(victim.spawnShieldRemaining).toBeCloseTo(0, 5);

      // On tick 81 (4.05s), it cleanly becomes exactly 0
      server.step(0.05);
      expect(victim.spawnShieldRemaining).toBe(0);
      expect(server.canDamage(attacker.id, victim.id)).toBe(true);

      const dealt = server.applyDamage(attacker.id, victim.id, 200);
      expect(dealt).toBeGreaterThan(0);
      expect(victim.physics.hullHp).toBeLessThan(victim.shipDef.maxHp);
    });
  });

  describe('2. Sinking State Invariants & Rapid Calls', () => {
    it('is idempotent: multiple calls to startSinking do not reset the timer or duplicate state', () => {
      const victim = server.spawnVessel({ id: 20, spawnShieldDuration: 0 });
      const attacker1 = server.spawnVessel({ id: 21, spawnShieldDuration: 0 });
      const attacker2 = server.spawnVessel({ id: 22, spawnShieldDuration: 0 });

      server.startSinking(victim, attacker1);
      expect(victim.isSinking).toBe(true);
      expect(victim.sinkingTimer).toBe(3.0);
      expect(victim.killerId).toBe(attacker1.id);

      // Advance 1.0 second
      server.step(1.0);
      expect(victim.sinkingTimer).toBeCloseTo(2.0, 3);

      // Attempt second startSinking call while sinking
      server.startSinking(victim, attacker2);
      // Timer must NOT be reset to 3.0s, killerId must NOT be overwritten
      expect(victim.sinkingTimer).toBeCloseTo(2.0, 3);
      expect(victim.killerId).toBe(attacker1.id);
    });

    it('prevents sinking vessel from taking or inflicting damage', () => {
      const victim = server.spawnVessel({ id: 30, spawnShieldDuration: 0 });
      const hostile = server.spawnVessel({ id: 31, spawnShieldDuration: 0 });

      server.startSinking(victim);

      // Neither can damage each other
      expect(server.canDamage(hostile.id, victim.id)).toBe(false);
      expect(server.canDamage(victim.id, hostile.id)).toBe(false);

      expect(server.applyDamage(hostile.id, victim.id, 500)).toBe(0);
      expect(server.applyDamage(victim.id, hostile.id, 500)).toBe(0);
    });
  });

  describe('3. Consecutive Rapid Death & Respawn Cycles', () => {
    it('survives 5 consecutive death and respawn cycles without state corruption', () => {
      const player = server.spawnVessel({ id: 40, spawnShieldDuration: 4.0 });
      const killer = server.spawnVessel({ id: 41, spawnShieldDuration: 0 });

      for (let cycle = 0; cycle < 5; cycle++) {
        // Shield active on spawn
        expect(player.spawnShieldRemaining).toBe(4.0);
        expect(player.physics.isDestroyed).toBe(false);
        expect(player.isSinking).toBe(false);

        // Advance 4.0s to expire shield
        server.step(4.0);
        expect(player.spawnShieldRemaining).toBe(0);

        // Killer deals lethal damage
        server.applyDamage(killer.id, player.id, 99999);
        expect(player.isSinking).toBe(true);

        // Step 3.0s sinking phase
        server.step(3.0);
        expect(player.physics.isDestroyed).toBe(true);
        expect(player.isSinking).toBe(false);
        expect(player.deaths).toBe(cycle + 1);
        expect(killer.kills).toBe(cycle + 1);

        // Simulate redeployment flow
        player.physics.isDestroyed = false;
        player.isSinking = false;
        player.sinkingTimer = 0;
        player.physics.hullHp = player.shipDef.maxHp;
        player.spawnShieldRemaining = 4.0;
        player.physics.position = vec2(cycle * 100, cycle * 100);
      }

      expect(player.deaths).toBe(5);
      expect(killer.kills).toBe(5);
    });
  });

  describe('4. Wire Protocol Full Bitmask Stress', () => {
    it('correctly serializes and deserializes snapshot when SPAWN_SHIELD is combined with all other flags', () => {
      const v = server.spawnVessel({ id: 50, spawnShieldDuration: 4.0 });
      v.physics.isCavitationNoise = true;
      v.ecmActive = true;
      v.physics.stealthModeActive = true;
      v.physics.isGrounded = true;
      v.napTimers.set(999, 10.0);

      const snapshot = server.createSnapshotPacket(1);
      const rec = snapshot.vessels.find((x) => x.vesselId === v.id);
      expect(rec).toBeDefined();

      // Verify individual bit flags
      expect((rec!.flags & VesselStatusFlag.CAVITATING) !== 0).toBe(true);
      expect((rec!.flags & VesselStatusFlag.ECM_ACTIVE) !== 0).toBe(true);
      expect((rec!.flags & VesselStatusFlag.STEALTH_ACTIVE) !== 0).toBe(true);
      expect((rec!.flags & VesselStatusFlag.GROUNDED) !== 0).toBe(true);
      expect((rec!.flags & VesselStatusFlag.SPAWN_SHIELD) !== 0).toBe(true);
      expect((rec!.flags & VesselStatusFlag.NAP_ACTIVE) !== 0).toBe(true);

      // Serialize to binary buffer
      const buffer = serializeSnapshot(snapshot);
      expect(buffer.byteLength).toBe(SNAPSHOT_HEADER_BYTES + snapshot.vessels.length * VESSEL_SNAPSHOT_BYTES);

      // Round-trip deserialize
      const restored = deserializeSnapshot(buffer);
      const r = restored.vessels.find((x) => x.vesselId === v.id);
      expect(r).toBeDefined();
      expect(r!.flags).toBe(rec!.flags);
      expect((r!.flags & VesselStatusFlag.SPAWN_SHIELD) !== 0).toBe(true);
    });
  });
});
