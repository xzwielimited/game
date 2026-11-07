/**
 * Authoritative Simulation Game Server
 * Clean-Room implementation for NavalCommand.io
 */

import { Vector2D, vec2, vec2Distance, vec2Normalize, vec2Scale, vec2Add, degToRad, shortestAngleDiff } from '../../common/math/vector2.js';
import { ShipDef, SHIP_ROSTER, getAllShipDefs } from '../../common/models/ships.js';
import { PhysicsState, SubmarineDepthState } from '../../common/models/types.js';
import { WeaponMountDef, WeaponCategory, canMountFire, fireMount, stepMountReloadAndRegen, stepMountTraverse } from '../../common/models/weapons.js';
import { createInitialPhysicsState, updateHydrodynamics, commandDepthState, toggleStealthMode } from '../../common/simulation/hydrodynamics.js';
import { ResourceEngine, PlayerVesselRef } from '../../common/simulation/resource_engine.js';
import { IslandEntity, DEFAULT_ISLAND_PRESETS, createOilRig } from '../../common/models/terrain.js';
import { SpatialGrid, SpatialEntity } from './spatial_grid.js';
import { GameLoop } from './game_loop.js';
import {
  Opcode,
  VesselStatusFlag,
  InputControlFlag,
  GameEventType,
  VesselSnapshotRecord,
  SnapshotPacket,
  InputPacket,
  EventPacket,
} from '../../common/protocol/packet_types.js';

export interface ServerVessel {
  id: number;
  name: string;
  shipDef: ShipDef;
  physics: PhysicsState;
  mounts: WeaponMountDef[];
  isBot: boolean;
  teamId: number;
  fleetId: number;
  karma: number; // -100 to 100 (100 = honorable, 0 = neutral, -100 = traitor)
  camoId: number;
  score: number;
  kills: number;
  deaths: number;
  accumulatedXp: number;
  ecmActive: boolean;
  ecmTimer: number;
  ecmCooldown: number;
  napTimers: Map<number, number>; // otherVesselId -> remaining NAP seconds
  napExpiredTimers: Map<number, number>; // otherVesselId -> seconds elapsed since NAP expired (for karma tracking)
  lastInputSequence: number;
  spawnShieldRemaining: number;
  isSinking: boolean;
  sinkingTimer: number;
  killerId?: number;
}

export interface ServerProjectile {
  id: number;
  ownerId: number;
  position: Vector2D;
  velocity: Vector2D;
  category: WeaponCategory;
  damage: number;
  maxRange: number;
  traveledDistance: number;
  targetId?: number;
  isHoming?: boolean;
  radius: number;
}

export interface SpawnVesselOptions {
  id?: number;
  name?: string;
  shipId?: string;
  position?: Vector2D;
  heading?: number;
  isBot?: boolean;
  teamId?: number;
  fleetId?: number;
  camoId?: number;
  spawnShieldDuration?: number;
}

let nextEntityId = 100;
let nextProjectileId = 10000;

export class AuthoritativeGameServer {
  public gameLoop: GameLoop;
  public spatialGrid: SpatialGrid;
  public resourceEngine: ResourceEngine;
  private vessels: Map<number, ServerVessel> = new Map();
  private projectiles: Map<number, ServerProjectile> = new Map();
  private islands: IslandEntity[] = [...DEFAULT_ISLAND_PRESETS];
  private queuedEvents: EventPacket[] = [];

  constructor(tickRate = 20) {
    this.gameLoop = new GameLoop(tickRate);
    this.spatialGrid = new SpatialGrid(250);
    this.resourceEngine = new ResourceEngine();

    // Hook game loop
    this.gameLoop.onTick((tick, dt) => this.step(dt));

    // Initialize 2 default oil rigs for contesting
    const rig1 = createOilRig('rig_alpha', 'Alpha Extraction Platform', vec2(1500, 1500));
    const rig2 = createOilRig('rig_bravo', 'Bravo Deepwater Derrick', vec2(-1500, -1500));
    this.resourceEngine.addOilRig(rig1);
    this.resourceEngine.addOilRig(rig2);
  }

  public getVessel(id: number): ServerVessel | undefined {
    return this.vessels.get(id);
  }

  public getAllVessels(): ServerVessel[] {
    return Array.from(this.vessels.values());
  }

  public getAllProjectiles(): ServerProjectile[] {
    return Array.from(this.projectiles.values());
  }

  public getIslands(): IslandEntity[] {
    return this.islands;
  }

  public start(): void {
    this.gameLoop.start();
  }

  public stop(): void {
    this.gameLoop.stop();
  }

  public spawnVessel(options: SpawnVesselOptions = {}): ServerVessel {
    const id = options.id ?? ++nextEntityId;
    const name = options.name ?? `Commander_${id}`;
    const shipDef = options.shipId && SHIP_ROSTER[options.shipId]
      ? SHIP_ROSTER[options.shipId]
      : SHIP_ROSTER['pt_boat_109'];

    const spawnPos = options.position ?? vec2((Math.random() - 0.5) * 400, (Math.random() - 0.5) * 400);
    const heading = options.heading ?? Math.random() * Math.PI * 2;
    const physics = createInitialPhysicsState(shipDef, spawnPos, heading);

    // Deep clone mounts for this vessel instance
    const mounts: WeaponMountDef[] = shipDef.mounts.map(m => ({ ...m }));

    const vessel: ServerVessel = {
      id,
      name,
      shipDef,
      physics,
      mounts,
      isBot: options.isBot ?? false,
      teamId: options.teamId ?? 0,
      fleetId: options.fleetId ?? 0,
      karma: 100,
      camoId: options.camoId ?? 0,
      score: 0,
      kills: 0,
      deaths: 0,
      accumulatedXp: 0,
      ecmActive: false,
      ecmTimer: 0,
      ecmCooldown: 0,
      napTimers: new Map(),
      napExpiredTimers: new Map(),
      lastInputSequence: 0,
      spawnShieldRemaining: options.spawnShieldDuration !== undefined ? options.spawnShieldDuration : 4.0,
      isSinking: false,
      sinkingTimer: 0,
    };

    this.vessels.set(id, vessel);
    this.spatialGrid.insert({
      id,
      type: 'VESSEL',
      x: physics.position.x,
      y: physics.position.y,
      radius: Math.max(shipDef.length, shipDef.beam) / 2,
      data: vessel,
    });

    return vessel;
  }

  public despawnVessel(id: number): boolean {
    const vessel = this.vessels.get(id);
    if (!vessel) return false;

    this.spatialGrid.remove(id);
    this.vessels.delete(id);
    return true;
  }

  /**
   * Enforces 15-second Non-Aggression Pact between two players (e.g. on leaving or being kicked from fleet).
   */
  public setFleetNAP(vesselIdA: number, vesselIdB: number, durationSeconds = 15.0): void {
    const vA = this.vessels.get(vesselIdA);
    const vB = this.vessels.get(vesselIdB);

    if (vA) {
      vA.napTimers.set(vesselIdB, durationSeconds);
      vA.napExpiredTimers.delete(vesselIdB);
    }
    if (vB) {
      vB.napTimers.set(vesselIdA, durationSeconds);
      vB.napExpiredTimers.delete(vesselIdA);
    }
  }

  /**
   * Evaluates if damage can be dealt from attacker to victim.
   * Enforces 15-second Non-Aggression Pact and friendly fleet rules.
   */
  public canDamage(attackerId: number, victimId: number): boolean {
    if (attackerId === victimId) return false;

    const attacker = this.vessels.get(attackerId);
    const victim = this.vessels.get(victimId);
    if (!attacker || !victim) return false;
    if (victim.physics.isDestroyed || attacker.physics.isDestroyed) return false;

    // Sinking vessels cannot deal or take damage
    if (victim.isSinking || attacker.isSinking) return false;

    // Invulnerability shield: victim cannot take damage during spawn protection
    if (victim.spawnShieldRemaining > 0) return false;

    // Active Non-Aggression Pact blocks 100% of mutual damage
    const napRemaining = attacker.napTimers.get(victimId) ?? 0;
    if (napRemaining > 0) {
      return false;
    }

    // Same fleet check (if fleet > 0)
    if (attacker.fleetId > 0 && attacker.fleetId === victim.fleetId) {
      return false;
    }

    return true;
  }

  /**
   * Applies damage to a victim vessel and tracks Karma & Kills.
   */
  public applyDamage(attackerId: number, victimId: number, rawDamage: number): number {
    if (!this.canDamage(attackerId, victimId)) return 0;

    const attacker = this.vessels.get(attackerId);
    const victim = this.vessels.get(victimId);
    if (!attacker || !victim) return 0;

    // If victim was a recent former fleetmate (within 30 seconds after NAP expiration),
    // penalize attacker Karma score!
    const timeSinceNapExpired = attacker.napExpiredTimers.get(victimId);
    if (timeSinceNapExpired !== undefined && timeSinceNapExpired < 30.0) {
      attacker.karma = Math.max(-100, attacker.karma - 25);
      this.queuedEvents.push({
        opcode: Opcode.OP_EVENT,
        eventType: GameEventType.KARMA_PENALTY,
        sourceId: attacker.id,
        targetId: victim.id,
        data: Math.abs(attacker.karma),
      });
    }

    // Armor damage mitigation
    const armorMitigation = 100 / (100 + victim.shipDef.armor);
    const netDamage = Math.max(1, Math.round(rawDamage * armorMitigation));

    victim.physics.hullHp = Math.max(0, victim.physics.hullHp - netDamage);
    attacker.score += Math.round(netDamage * 0.1);

    this.queuedEvents.push({
      opcode: Opcode.OP_EVENT,
      eventType: GameEventType.HIT,
      sourceId: attacker.id,
      targetId: victim.id,
      data: netDamage,
    });

    if (victim.physics.hullHp <= 0 && !victim.isSinking && !victim.physics.isDestroyed) {
      this.startSinking(victim, attacker);
    }

    return netDamage;
  }

  public startSinking(victim: ServerVessel, killer?: ServerVessel): void {
    if (victim.isSinking || victim.physics.isDestroyed) return;
    victim.isSinking = true;
    victim.sinkingTimer = 3.0;
    victim.killerId = killer ? killer.id : undefined;
    victim.physics.throttle = 0;
    victim.physics.rudderAngle = 0;
  }

  public destroyVessel(victim: ServerVessel, killer?: ServerVessel): void {
    victim.isSinking = false;
    victim.sinkingTimer = 0;
    victim.physics.isDestroyed = true;
    victim.deaths++;

    if (killer) {
      killer.kills++;
      killer.score += 500;
      killer.accumulatedXp += 250;
    }

    // Spawn wreckage crates
    this.resourceEngine.spawnWreckageCrates(victim.physics.position, victim.accumulatedXp);

    this.queuedEvents.push({
      opcode: Opcode.OP_EVENT,
      eventType: GameEventType.SINK,
      sourceId: killer ? killer.id : 0,
      targetId: victim.id,
      data: killer ? killer.score : 0,
    });
  }

  /**
   * Processes player / client input.
   */
  public processInput(vesselId: number, input: InputPacket): void {
    const vessel = this.vessels.get(vesselId);
    if (!vessel || vessel.physics.isDestroyed || vessel.isSinking) return;

    vessel.lastInputSequence = input.sequence;

    // Convert thrust and rudder from i8 [-100..100] to float [-0.5..1.0] and [-1.0..1.0]
    const throttle = input.thrust >= 0 ? input.thrust / 100.0 : (input.thrust / 100.0) * 0.5;
    const rudder = input.rudder / 100.0;

    vessel.physics.throttle = throttle;
    vessel.physics.rudderAngle = rudder;

    // Submarine depth toggle
    if (input.depthTarget !== undefined) {
      const depthState: SubmarineDepthState =
        input.depthTarget === 2 ? 'DEEP' : input.depthTarget === 1 ? 'PERISCOPE' : 'SURFACE';
      commandDepthState(vessel.shipDef, vessel.physics, depthState);
    }

    // Stealth toggle
    if (input.weaponFireMask & InputControlFlag.STEALTH_TOGGLE) {
      toggleStealthMode(vessel.shipDef, vessel.physics);
    }

    // ECM toggle
    if (input.weaponFireMask & InputControlFlag.ECM_TOGGLE) {
      this.activateECM(vessel);
    }

    // Fire weapon triggers
    const targetCoords = vec2(input.targetX, input.targetY);
    if (input.weaponFireMask & InputControlFlag.FIRE_PRIMARY) {
      this.fireMount(vessel.id, 0, targetCoords);
    }
    if (input.weaponFireMask & InputControlFlag.FIRE_SECONDARY) {
      this.fireMount(vessel.id, 1, targetCoords);
    }
    if (input.weaponFireMask & InputControlFlag.FIRE_TORPEDO) {
      // Find first torpedo mount
      const torpIdx = vessel.mounts.findIndex(m => m.category === 'TORPEDO' || m.category === 'ROCKET_TORPEDO');
      if (torpIdx >= 0) this.fireMount(vessel.id, torpIdx, targetCoords);
    }
    if (input.weaponFireMask & InputControlFlag.FIRE_MISSILE) {
      // Find first missile mount
      const misIdx = vessel.mounts.findIndex(m => m.category === 'CRUISE_MISSILE' || m.category === 'SAM_CIWS');
      if (misIdx >= 0) this.fireMount(vessel.id, misIdx, targetCoords);
    }
  }

  public activateECM(vessel: ServerVessel): boolean {
    if (!vessel.shipDef.traits.includes('ECM_JAMMING') && !vessel.shipDef.specialAbilities.includes('ECM_JAMMING')) {
      return false;
    }
    if (vessel.ecmCooldown > 0 || vessel.ecmActive) {
      return false;
    }

    vessel.ecmActive = true;
    vessel.ecmTimer = 5.0; // 5 seconds active
    vessel.ecmCooldown = 25.0; // 25 seconds cooldown

    this.queuedEvents.push({
      opcode: Opcode.OP_EVENT,
      eventType: GameEventType.ECM_PULSE,
      sourceId: vessel.id,
      targetId: 0,
      data: 5,
    });
    return true;
  }

  public fireMount(vesselId: number, mountIndex: number, targetCoords: Vector2D, overrideHoming?: boolean): boolean {
    const vessel = this.vessels.get(vesselId);
    if (!vessel || vessel.physics.isDestroyed || vessel.isSinking) return false;

    const mount = vessel.mounts[mountIndex];
    if (!mount) return false;

    // Check submarine depth rules: cruise missiles cannot be fired from DEEP depth
    if (vessel.physics.depthState === 'DEEP' && mount.category === 'CRUISE_MISSILE') {
      return false;
    }

    if (!canMountFire(mount)) return false;

    const fired = fireMount(mount);
    if (!fired) return false;

    // Calculate projectile launch vector
    const mountWorldPos: Vector2D = {
      x: vessel.physics.position.x + mount.localOffset.x * Math.cos(vessel.physics.heading) - mount.localOffset.y * Math.sin(vessel.physics.heading),
      y: vessel.physics.position.y + mount.localOffset.x * Math.sin(vessel.physics.heading) + mount.localOffset.y * Math.cos(vessel.physics.heading),
    };

    const aimDir = vec2Normalize(vec2(targetCoords.x - mountWorldPos.x, targetCoords.y - mountWorldPos.y));
    const speed = mount.projectileSpeed || 200;
    const velocity = vec2Scale(aimDir, speed);

    const isHoming = overrideHoming !== undefined
      ? overrideHoming
      : (mount.category === 'TORPEDO' && (mount.weaponDefId.includes('acoustic') || mount.weaponDefId.includes('homing')));

    const projId = ++nextProjectileId;
    const projectile: ServerProjectile = {
      id: projId,
      ownerId: vessel.id,
      position: mountWorldPos,
      velocity,
      category: mount.category,
      damage: mount.baseDamage || 50,
      maxRange: mount.maxRange || 1000,
      traveledDistance: 0,
      isHoming,
      radius: mount.category === 'TORPEDO' ? 4 : 2,
    };

    this.projectiles.set(projId, projectile);
    return true;
  }

  /**
   * Step the authoritative simulation for one timestep dt.
   */
  public step(dt: number): void {
    // 1. Step vessels: hydrodynamics, weapon reload, NAP timers, ECM, spawn protection, sinking
    for (const vessel of this.vessels.values()) {
      // Step spawn protection shield timer
      if (vessel.spawnShieldRemaining > 0) {
        vessel.spawnShieldRemaining = Math.max(0, vessel.spawnShieldRemaining - dt);
      }

      // Step authoritative sinking state
      if (vessel.isSinking) {
        vessel.physics.throttle = 0;
        vessel.physics.rudderAngle = 0;
        vessel.sinkingTimer -= dt;
        if (vessel.sinkingTimer <= 0) {
          const killer = vessel.killerId ? this.vessels.get(vessel.killerId) : undefined;
          this.destroyVessel(vessel, killer);
        }
      }

      if (!vessel.physics.isDestroyed && !vessel.isSinking) {
        updateHydrodynamics(
          vessel.shipDef,
          vessel.physics,
          vessel.physics.throttle,
          vessel.physics.rudderAngle,
          dt
        );

        // Step mounts
        for (const mount of vessel.mounts) {
          stepMountReloadAndRegen(mount, dt);
        }

        // Mercy hospital healing passive ability
        if (vessel.shipDef.traits.includes('HOSPITAL_SHIP_HEAL') && !vessel.physics.isDestroyed) {
          const allies = this.spatialGrid.queryRadius(vessel.physics.position.x, vessel.physics.position.y, 120);
          for (const ent of allies) {
            if (ent.type === 'VESSEL' && ent.id !== vessel.id) {
              const allyVessel = this.vessels.get(ent.id as number);
              if (allyVessel && !allyVessel.physics.isDestroyed && allyVessel.fleetId === vessel.fleetId && allyVessel.physics.hullHp < allyVessel.shipDef.maxHp) {
                allyVessel.physics.hullHp = Math.min(allyVessel.shipDef.maxHp, allyVessel.physics.hullHp + 25 * dt);
              }
            }
          }
        }
      }

      // Step ECM timers
      if (vessel.ecmActive) {
        vessel.ecmTimer -= dt;
        if (vessel.ecmTimer <= 0) {
          vessel.ecmActive = false;
        }
      }
      if (vessel.ecmCooldown > 0) {
        vessel.ecmCooldown = Math.max(0, vessel.ecmCooldown - dt);
      }

      // Step NAP countdown
      for (const [targetId, remaining] of vessel.napTimers.entries()) {
        const nextTime = remaining - dt;
        if (nextTime <= 0) {
          vessel.napTimers.delete(targetId);
          vessel.napExpiredTimers.set(targetId, 0); // Start tracking time since expiration
        } else {
          vessel.napTimers.set(targetId, nextTime);
        }
      }

      // Step NAP expired elapsed timers (for karma tracking window)
      for (const [targetId, elapsed] of vessel.napExpiredTimers.entries()) {
        vessel.napExpiredTimers.set(targetId, elapsed + dt);
      }

      // Update position in spatial grid
      this.spatialGrid.update({
        id: vessel.id,
        type: 'VESSEL',
        x: vessel.physics.position.x,
        y: vessel.physics.position.y,
        radius: Math.max(vessel.shipDef.length, vessel.shipDef.beam) / 2,
        data: vessel,
      });
    }

    // 2. Step projectiles & collision detection
    for (const [projId, proj] of this.projectiles.entries()) {
      // Acoustic / active homing guidance for torpedoes
      if (proj.isHoming && (proj.category === 'TORPEDO' || proj.category === 'ROCKET_TORPEDO')) {
        const candidates = this.spatialGrid.queryRadius(proj.position.x, proj.position.y, 700);
        let bestTarget: ServerVessel | null = null;
        let bestDist = Infinity;
        const currentHeading = Math.atan2(proj.velocity.y, proj.velocity.x);

        for (const ent of candidates) {
          if (ent.type !== 'VESSEL' || ent.id === proj.ownerId) continue;
          const targetVessel = this.vessels.get(ent.id as number);
          if (!targetVessel || targetVessel.physics.isDestroyed || targetVessel.isSinking) continue;

          // Do not lock onto friendly fleet allies
          const ownerVessel = this.vessels.get(proj.ownerId);
          if (ownerVessel && ownerVessel.fleetId > 0 && ownerVessel.fleetId === targetVessel.fleetId) {
            continue;
          }

          const dx = targetVessel.physics.position.x - proj.position.x;
          const dy = targetVessel.physics.position.y - proj.position.y;
          const d = Math.hypot(dx, dy);
          const bearing = Math.atan2(dy, dx);
          const angleDiff = Math.abs(shortestAngleDiff(currentHeading, bearing));

          // Forward seeker cone: within +/- 75 degrees (1.3 radians)
          if (angleDiff <= 1.3 && d < bestDist) {
            bestDist = d;
            bestTarget = targetVessel;
          }
        }

        if (bestTarget) {
          const dx = bestTarget.physics.position.x - proj.position.x;
          const dy = bestTarget.physics.position.y - proj.position.y;
          const targetHeading = Math.atan2(dy, dx);
          const angleDiff = shortestAngleDiff(currentHeading, targetHeading);
          // Turn rate: 1.2 rad/s (~69 deg/s)
          const maxTurn = 1.2 * dt;
          const turn = Math.max(-maxTurn, Math.min(maxTurn, angleDiff));
          const newHeading = currentHeading + turn;
          const speed = Math.hypot(proj.velocity.x, proj.velocity.y);
          proj.velocity.x = Math.cos(newHeading) * speed;
          proj.velocity.y = Math.sin(newHeading) * speed;
        }
      }

      const stepDist = Math.sqrt(proj.velocity.x * proj.velocity.x + proj.velocity.y * proj.velocity.y) * dt;
      proj.position.x += proj.velocity.x * dt;
      proj.position.y += proj.velocity.y * dt;
      proj.traveledDistance += stepDist;

      if (proj.traveledDistance >= proj.maxRange) {
        this.projectiles.delete(projId);
        continue;
      }

      // Check hits against vessels via spatial grid
      const nearby = this.spatialGrid.queryRadius(proj.position.x, proj.position.y, 40);
      let hit = false;

      for (const ent of nearby) {
        if (ent.type !== 'VESSEL' || ent.id === proj.ownerId) continue;
        const targetVessel = this.vessels.get(ent.id as number);
        if (!targetVessel || targetVessel.physics.isDestroyed) continue;

        // Submarine depth immunity check:
        // Artillery & rockets cannot hit submarines at DEEP depth (only depth charges, torpedoes, rocket torpedoes can)
        if (targetVessel.physics.depthState === 'DEEP') {
          const canHitDeep = proj.category === 'DEPTH_CHARGE' || proj.category === 'TORPEDO' || proj.category === 'ROCKET_TORPEDO';
          if (!canHitDeep) continue;
        }

        // ECM deflection check: active ECM deflects guided missiles 85% of the time
        if (targetVessel.ecmActive && proj.category === 'CRUISE_MISSILE') {
          if (Math.random() < 0.85) {
            // Deflected! Missile explodes harmlessly away
            hit = true;
            break;
          }
        }

        const dist = vec2Distance(proj.position, targetVessel.physics.position);
        const hitRadius = (targetVessel.shipDef.beam + targetVessel.shipDef.length) / 4;
        if (dist <= hitRadius) {
          this.applyDamage(proj.ownerId, targetVessel.id, proj.damage);
          hit = true;
          break;
        }
      }

      if (hit) {
        this.projectiles.delete(projId);
      }
    }

    // 3. Step resources: crates & oil rigs
    this.resourceEngine.step(dt);

    // Convert vessels to PlayerVesselRef for resource engine
    const vesselRefs: PlayerVesselRef[] = Array.from(this.vessels.values()).map(v => ({
      playerId: String(v.id),
      factionId: String(v.fleetId || v.teamId || v.id),
      shipDef: v.shipDef,
      physicsState: v.physics,
      accumulatedXp: v.accumulatedXp,
    }));

    // Crate collections
    for (const vRef of vesselRefs) {
      const { collectedCount, totalXpAwarded } = this.resourceEngine.checkCrateCollection(vRef);
      if (collectedCount > 0) {
        const v = this.vessels.get(Number(vRef.playerId));
        if (v) {
          v.accumulatedXp += totalXpAwarded;
          v.score += totalXpAwarded;
          // Heal hull 10% on crate pickup
          v.physics.hullHp = Math.min(v.shipDef.maxHp, v.physics.hullHp + v.shipDef.maxHp * 0.1);
          this.queuedEvents.push({
            opcode: Opcode.OP_EVENT,
            eventType: GameEventType.CRATE_COLLECT,
            sourceId: v.id,
            targetId: 0,
            data: totalXpAwarded,
          });
        }
      }
    }

    // Oil rig captures and passive XP extraction
    const { xpAwards } = this.resourceEngine.updateOilRigs(vesselRefs, dt);
    for (const [pId, xp] of xpAwards.entries()) {
      const v = this.vessels.get(Number(pId));
      if (v) {
        v.accumulatedXp += xp;
        v.score += Math.round(xp);
      }
    }
  }

  /**
   * Creates a compact binary SnapshotPacket representing current world state.
   */
  public createSnapshotPacket(ackSeq = 0): SnapshotPacket {
    const vesselRecords: VesselSnapshotRecord[] = [];

    for (const vessel of this.vessels.values()) {
      let flags = 0;
      if (vessel.physics.isCavitationNoise) flags |= VesselStatusFlag.CAVITATING;
      if (vessel.ecmActive) flags |= VesselStatusFlag.ECM_ACTIVE;
      if (vessel.physics.stealthModeActive) flags |= VesselStatusFlag.STEALTH_ACTIVE;
      if (vessel.physics.isGrounded) flags |= VesselStatusFlag.GROUNDED;
      if (vessel.spawnShieldRemaining > 0) flags |= VesselStatusFlag.SPAWN_SHIELD;
      if (vessel.physics.isDestroyed) flags |= VesselStatusFlag.DESTROYED;
      if (vessel.napTimers.size > 0) flags |= VesselStatusFlag.NAP_ACTIVE;

      const depthByte = vessel.physics.depthState === 'DEEP' ? 2 : vessel.physics.depthState === 'PERISCOPE' ? 1 : 0;
      const hpPct = Math.max(0, Math.min(100, Math.round((vessel.physics.hullHp / vessel.shipDef.maxHp) * 100)));

      const mountAngles: [number, number, number, number] = [
        vessel.mounts[0]?.currentAngle ?? 0,
        vessel.mounts[1]?.currentAngle ?? 0,
        vessel.mounts[2]?.currentAngle ?? 0,
        vessel.mounts[3]?.currentAngle ?? 0,
      ];

      vesselRecords.push({
        vesselId: vessel.id,
        posX: vessel.physics.position.x,
        posY: vessel.physics.position.y,
        heading: vessel.physics.heading,
        speedKnots: Math.round(vessel.physics.speedKnots),
        hullHpPct: hpPct,
        flags,
        depth: depthByte,
        mountAngles,
        velX: vessel.physics.linearVelocity.x,
        velY: vessel.physics.linearVelocity.y,
        fleetId: vessel.fleetId,
        targetId: 0,
      });
    }

    return {
      opcode: Opcode.OP_SNAPSHOT,
      flags: 0,
      serverTick: this.gameLoop.getCurrentTick(),
      ackSequence: ackSeq,
      entityCount: vesselRecords.length,
      worldTimeSeconds: Math.round(this.gameLoop.getWorldTimeSeconds()),
      vessels: vesselRecords,
    };
  }

  public drainQueuedEvents(): EventPacket[] {
    const events = [...this.queuedEvents];
    this.queuedEvents.length = 0;
    return events;
  }
}
