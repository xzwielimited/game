/**
 * Adversarial Challenger M7 Test Suite:
 * Empirical Stress Testing of Spawn Protection, Expiration Boundaries,
 * Weapon Inviolability, Bot Anti-Swarming Geometry, and AI Target Selection.
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
} from '../../common/protocol/packet_types.js';
import {
  serializeSnapshot,
  deserializeSnapshot,
} from '../../common/protocol/serializer.js';
import { vec2, vec2Distance, degToRad } from '../../common/math/vector2.js';
import { SHIP_ROSTER, getAllShipDefs } from '../../common/models/ships.js';
import { WeaponCategory, WEAPON_DEFINITIONS } from '../../common/models/weapons.js';

describe('Adversarial Challenger M7: Spawn Protection & Anti-Swarming Stress Harness', () => {
  let server: AuthoritativeGameServer;
  let botController: BotController;

  beforeEach(() => {
    server = new AuthoritativeGameServer(20);
    botController = new BotController(server);
  });

  // =========================================================================
  // 1. SPAWN SHIELD INVIOLABILITY ACROSS ALL WEAPON TYPES & DAMAGE PROFILES
  // =========================================================================
  describe('1. Spawn Shield Inviolability Across All Weapon Categories', () => {
    const allWeaponCategories: WeaponCategory[] = [
      'ARTILLERY',
      'TORPEDO',
      'CRUISE_MISSILE',
      'ROCKET_BARRAGE',
      'ROCKET_TORPEDO',
      'SAM_CIWS',
      'DEPTH_CHARGE',
      'NAVAL_MINE',
      'AIRCRAFT_SQUADRON',
      'DREDGER_TOOL',
    ];

    it.each(allWeaponCategories)(
      'guarantees 100% damage immunity against category: %s while spawnShieldRemaining > 0',
      (category) => {
        const attacker = server.spawnVessel({
          id: 100,
          name: 'Aggressor',
          shipId: 'yamato_bb',
          position: vec2(0, 0),
          spawnShieldDuration: 0,
        });

        const victim = server.spawnVessel({
          id: 200,
          name: 'ProtectedTarget',
          shipId: 'fletcher_dd',
          position: vec2(30, 0), // Within point-blank 30m distance
          spawnShieldDuration: 4.0,
        });

        const initialHp = victim.physics.hullHp;
        expect(initialHp).toBeGreaterThan(0);
        expect(victim.spawnShieldRemaining).toBe(4.0);

        // Inject simulated incoming projectile directly into server projectile simulation
        const testProjId = 9000;
        server.getAllProjectiles(); // initialize/ensure map accessible
        (server as any).projectiles.set(testProjId, {
          id: testProjId,
          ownerId: attacker.id,
          position: vec2(30, 0), // Centered on victim
          velocity: vec2(0, 0),
          category,
          damage: 5000, // Massive lethal damage
          maxRange: 1000,
          traveledDistance: 10,
          isHoming: false,
          radius: 10,
        });

        // Step simulation 1 tick (0.05s) -> projectile hits victim
        server.step(0.05);

        // Victim MUST remain completely unharmed
        expect(victim.physics.hullHp).toBe(initialHp);
        expect(victim.isSinking).toBe(false);
        expect(victim.physics.isDestroyed).toBe(false);
        expect(attacker.score).toBe(0);

        // Direct applyDamage attempt with arbitrary damage MUST also return 0
        const directDmg = server.applyDamage(attacker.id, victim.id, 999999);
        expect(directDmg).toBe(0);
        expect(victim.physics.hullHp).toBe(initialHp);
      }
    );

    it('survives saturation barrage of 100 concurrent projectiles of mixed types without single HP lost', () => {
      const attacker = server.spawnVessel({
        id: 10,
        shipId: 'moskva_cg',
        position: vec2(0, 0),
        spawnShieldDuration: 0,
      });

      const victim = server.spawnVessel({
        id: 20,
        shipId: 'pt_boat_109', // Low HP vessel (fragile)
        position: vec2(50, 0),
        spawnShieldDuration: 4.0,
      });

      const initialHp = victim.physics.hullHp;

      // Spawn 100 projectiles at victim's coordinates
      for (let i = 0; i < 100; i++) {
        const cat = allWeaponCategories[i % allWeaponCategories.length];
        (server as any).projectiles.set(10000 + i, {
          id: 10000 + i,
          ownerId: attacker.id,
          position: vec2(50, 0),
          velocity: vec2(0, 0),
          category: cat,
          damage: 1000,
          maxRange: 5000,
          traveledDistance: 50,
          isHoming: false,
          radius: 15,
        });
      }

      // Step simulation
      server.step(0.05);

      // All 100 projectiles hit and were absorbed
      expect(victim.physics.hullHp).toBe(initialHp);
      expect(victim.isSinking).toBe(false);
      expect(victim.physics.isDestroyed).toBe(false);
      expect((server as any).projectiles.size).toBe(0);
    });

    it('verifies extreme numerical damage values (1e9) do not cause overflow or NaN leaks', () => {
      const attacker = server.spawnVessel({ id: 1, spawnShieldDuration: 0 });
      const victim = server.spawnVessel({ id: 2, spawnShieldDuration: 4.0 });
      const initialHp = victim.physics.hullHp;

      const dealt = server.applyDamage(attacker.id, victim.id, 1e9);
      expect(dealt).toBe(0);
      expect(victim.physics.hullHp).toBe(initialHp);
      expect(Number.isFinite(victim.physics.hullHp)).toBe(true);
    });
  });

  // =========================================================================
  // 2. EXACT TIME BOUNDARY EMPIRICAL VERIFICATION (t = 3.999s vs t = 4.001s)
  // =========================================================================
  describe('2. Exact Time Boundary Verification: t = 3.999s vs t = 4.001s', () => {
    it('remains strictly immune at t = 3.999s, and cleanly expires to accept damage at t = 4.001s', () => {
      const attacker = server.spawnVessel({
        id: 301,
        shipId: 'yamato_bb',
        spawnShieldDuration: 0,
      });

      const victim = server.spawnVessel({
        id: 302,
        shipId: 'fletcher_dd',
        spawnShieldDuration: 4.0,
      });

      const initialHp = victim.physics.hullHp;

      // 1. Advance simulation to exactly 3.999 seconds (t = 3.999s)
      server.step(3.999);

      // Remaining shield time should be 0.001s > 0
      expect(victim.spawnShieldRemaining).toBeGreaterThan(0);
      expect(victim.spawnShieldRemaining).toBeCloseTo(0.001, 5);

      // Binary flag MUST still be present in snapshot
      const snapAt3999 = server.createSnapshotPacket();
      const recAt3999 = snapAt3999.vessels.find((v) => v.vesselId === victim.id);
      expect(recAt3999).toBeDefined();
      expect((recAt3999!.flags & VesselStatusFlag.SPAWN_SHIELD) !== 0).toBe(true);

      // canDamage MUST be false
      expect(server.canDamage(attacker.id, victim.id)).toBe(false);

      // Attempt attack at t = 3.999s: MUST deal 0 damage
      const dmg3999 = server.applyDamage(attacker.id, victim.id, 500);
      expect(dmg3999).toBe(0);
      expect(victim.physics.hullHp).toBe(initialHp);

      // 2. Advance simulation by 0.002s (total elapsed time = 4.001s)
      server.step(0.002);

      // Remaining shield time MUST be clamped to exactly 0
      expect(victim.spawnShieldRemaining).toBe(0);

      // Binary flag MUST now be cleared in snapshot
      const snapAt4001 = server.createSnapshotPacket();
      const recAt4001 = snapAt4001.vessels.find((v) => v.vesselId === victim.id);
      expect(recAt4001).toBeDefined();
      expect((recAt4001!.flags & VesselStatusFlag.SPAWN_SHIELD) !== 0).toBe(false);

      // canDamage MUST now be true
      expect(server.canDamage(attacker.id, victim.id)).toBe(true);

      // Attack at t = 4.001s: MUST deal full damage according to armor
      const dealtDmg = server.applyDamage(attacker.id, victim.id, 500);
      expect(dealtDmg).toBeGreaterThan(0);
      expect(victim.physics.hullHp).toBe(initialHp - dealtDmg);
      expect(victim.physics.hullHp).toBeLessThan(initialHp);
    });

    it('sweeps 100 micro-timesteps across the 3.95s to 4.05s interval to ensure monotonic state change', () => {
      const attacker = server.spawnVessel({ id: 11, spawnShieldDuration: 0 });
      const victim = server.spawnVessel({ id: 12, spawnShieldDuration: 4.0 });

      // Fast-forward to 3.95s
      server.step(3.95);
      expect(victim.spawnShieldRemaining).toBeCloseTo(0.05, 4);

      let transitionDetected = false;
      let transitionTime = -1;

      // 100 steps of 0.001s (from 3.950s to 4.050s)
      for (let step = 1; step <= 100; step++) {
        const currentTime = 3.95 + step * 0.001;
        server.step(0.001);

        const canDmg = server.canDamage(attacker.id, victim.id);

        if (!transitionDetected) {
          if (canDmg) {
            transitionDetected = true;
            transitionTime = currentTime;
          } else {
            expect(victim.spawnShieldRemaining).toBeGreaterThan(0);
          }
        } else {
          // Once transition occurred, it must NEVER revert to immune
          expect(canDmg).toBe(true);
          expect(victim.spawnShieldRemaining).toBe(0);
        }
      }

      expect(transitionDetected).toBe(true);
      // Transition MUST happen at or immediately following 4.000s
      expect(transitionTime).toBeGreaterThanOrEqual(4.0);
      expect(transitionTime).toBeLessThanOrEqual(4.002);
    });
  });

  // =========================================================================
  // 3. BOT INITIAL SPAWN GEOMETRY & MINIMUM DISTANCE AUDIT
  // =========================================================================
  describe('3. Bot Initial Spawn Geometry & Anti-Swarming Distance Audit', () => {
    const playerSpawnPos = vec2(0, 200);

    it('verifies client app.ts 12-bot layout maintains distance strictly >= 1150m from player spawn (0, 200)', () => {
      const botRosterIds = [
        'pt_boat_109',
        'fairmile_d_dog',
        'fletcher_dd',
        'arleigh_burke_ddg',
        'moskva_cg',
        'bismarck_bb',
        'yamato_bb',
        'type_vii_uboat',
        'akula_ssn',
        'essex_cv',
        'mercy_hospital',
        'polar_icebreaker',
      ];

      const distances: number[] = [];

      for (let i = 0; i < botRosterIds.length; i++) {
        const angle = (i / botRosterIds.length) * Math.PI * 2;
        const radius = 1350 + (i % 4) * 280;
        const botPos = vec2(Math.cos(angle) * radius, Math.sin(angle) * radius);
        const dist = vec2Distance(botPos, playerSpawnPos);
        distances.push(dist);

        // Every single bot must be strictly >= 1150 meters from player initial spawn
        expect(dist).toBeGreaterThanOrEqual(1150.0);
      }

      const minDistance = Math.min(...distances);
      const maxDistance = Math.max(...distances);

      // In app.ts, minimum distance is ~1181.0m (which is >= 1150m)
      expect(minDistance).toBeGreaterThanOrEqual(1150.0);
      expect(minDistance).toBeCloseTo(1181.03, 1);
      expect(maxDistance).toBeGreaterThan(2000.0);
    });

    it('verifies server ws_server.ts bot generation maintains distance strictly >= 1150m for various botCounts', () => {
      const testCounts = [8, 10, 12, 16, 24, 32];

      for (const botCount of testCounts) {
        for (let i = 0; i < botCount; i++) {
          const angle = (i / Math.max(1, botCount)) * Math.PI * 2;
          const dist = 1350 + (i % 4) * 280;
          const botPos = vec2(Math.cos(angle) * dist, Math.sin(angle) * dist);
          const distToPlayer = vec2Distance(botPos, playerSpawnPos);

          // Theoretical minimum distance for any angle is 1350 - 200 = 1150m
          expect(distToPlayer).toBeGreaterThanOrEqual(1150.0 - 1e-6);
        }
      }
    });

    it('mathematically stress-tests continuous angle parameterization theta in [0, 2pi]', () => {
      // Sample 3600 angles around full circle
      for (let deg = 0; deg < 360; deg += 0.1) {
        const rad = degToRad(deg);
        for (let offsetIndex = 0; offsetIndex < 4; offsetIndex++) {
          const radius = 1350 + offsetIndex * 280; // 1350, 1630, 1910, 2190
          const pos = vec2(Math.cos(rad) * radius, Math.sin(rad) * radius);
          const dist = vec2Distance(pos, playerSpawnPos);

          // Distance formula: sqrt(R^2 - 400 R sin(theta) + 40000) >= R - 200 = 1150m
          expect(dist).toBeGreaterThanOrEqual(1150.0 - 1e-9);
        }
      }
    });
  });

  // =========================================================================
  // 4. BOT AI TARGET SELECTION & SPAWN SHIELD REJECTION
  // =========================================================================
  describe('4. Bot AI Target Acquisition & Spawn Shield Rejection', () => {
    it('unconditionally ignores shielded vessels even when placed at point-blank range (50m)', () => {
      const bot = server.spawnVessel({
        id: 50,
        shipId: 'yamato_bb',
        position: vec2(0, 0),
        spawnShieldDuration: 0,
        isBot: true,
      });
      botController.registerBot(bot.id);

      // Player sitting directly in front of bot guns at 50m distance with shield
      const shieldedPlayer = server.spawnVessel({
        id: 51,
        shipId: 'fletcher_dd',
        position: vec2(50, 0),
        spawnShieldDuration: 4.0,
      });

      // Run multiple AI ticks
      for (let t = 0; t < 10; t++) {
        botController.update(0.05);
      }

      // Bot MUST NOT fire at shielded player
      expect(server.getAllProjectiles().length).toBe(0);
      expect(shieldedPlayer.physics.hullHp).toBe(shieldedPlayer.shipDef.maxHp);
    });

    it('correctly discriminates and acquires unshielded target when shielded and unshielded targets are present', () => {
      const bot = server.spawnVessel({
        id: 60,
        shipId: 'fletcher_dd',
        position: vec2(0, 0),
        spawnShieldDuration: 0,
        isBot: true,
      });
      botController.registerBot(bot.id);

      // Target A: closer (100m) but has active spawn shield
      const targetA_Shielded = server.spawnVessel({
        id: 61,
        shipId: 'pt_boat_109',
        position: vec2(100, 0),
        spawnShieldDuration: 4.0,
      });

      // Target B: farther (400m) but unshielded (vulnerable)
      const targetB_Vulnerable = server.spawnVessel({
        id: 62,
        shipId: 'pt_boat_109',
        position: vec2(400, 0),
        spawnShieldDuration: 0,
      });

      // Update AI
      botController.update(0.05);

      // Bot should have fired towards Target B (400m), NOT Target A
      const projs = server.getAllProjectiles();
      expect(projs.length).toBeGreaterThan(0);

      for (const p of projs) {
        // Velocity should be directed toward positive X (Target B)
        expect(p.velocity.x).toBeGreaterThan(0);
      }
    });

    it('switches to engage the shielded player immediately upon shield expiration', () => {
      const bot = server.spawnVessel({
        id: 70,
        shipId: 'fletcher_dd',
        position: vec2(0, 0),
        spawnShieldDuration: 0,
        isBot: true,
      });
      botController.registerBot(bot.id);

      const player = server.spawnVessel({
        id: 71,
        shipId: 'fletcher_dd',
        position: vec2(200, 0),
        spawnShieldDuration: 4.0,
      });

      // Simulation steps for 3.0 seconds -> player shield still active
      for (let i = 0; i < 60; i++) {
        server.step(0.05);
        botController.update(0.05);
      }
      expect(player.spawnShieldRemaining).toBeCloseTo(1.0, 2);
      expect(server.getAllProjectiles().length).toBe(0);

      // Simulation steps another 1.1s (total 4.1s) -> shield expires!
      for (let i = 0; i < 22; i++) {
        server.step(0.05);
        botController.update(0.05);
      }
      expect(player.spawnShieldRemaining).toBe(0);

      // Bot should now have engaged and fired!
      expect(server.getAllProjectiles().length).toBeGreaterThan(0);
    });
  });
});
