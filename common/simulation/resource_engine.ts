/**
 * Maritime Resource Simulation Engine (XP Crates & Offshore Oil Rigs)
 * Clean-Room implementation for NavalCommand.io
 */

import { Vector2D, vec2Distance, vec2DistanceSq } from '../math/vector2.js';
import { ShipDef } from '../models/ships.js';
import { PhysicsState } from '../models/types.js';
import { XpCrate, OilRig, createXpCrate, createOilRig } from '../models/terrain.js';

export interface PlayerVesselRef {
  playerId: string;
  factionId: string;
  shipDef: ShipDef;
  physicsState: PhysicsState;
  accumulatedXp: number;
}

let crateCounter = 0;

export class ResourceEngine {
  private crates: Map<string, XpCrate> = new Map();
  private oilRigs: Map<string, OilRig> = new Map();

  public addCrate(crate: XpCrate): void {
    this.crates.set(crate.id, crate);
  }

  public getCrate(id: string): XpCrate | undefined {
    return this.crates.get(id);
  }

  public getAllCrates(): XpCrate[] {
    return Array.from(this.crates.values());
  }

  public addOilRig(rig: OilRig): void {
    this.oilRigs.set(rig.id, rig);
  }

  public getOilRig(id: string): OilRig | undefined {
    return this.oilRigs.get(id);
  }

  public getAllOilRigs(): OilRig[] {
    return Array.from(this.oilRigs.values());
  }

  /**
   * Drops wreckage crates when a vessel is destroyed.
   * Drops 40% of vessel accumulated XP into 3-8 floating crates.
   */
  public spawnWreckageCrates(vesselPos: Vector2D, totalMatchXp: number): XpCrate[] {
    const droppedXp = Math.max(50, Math.round(totalMatchXp * 0.40));
    const crateCount = Math.min(8, Math.max(3, Math.floor(droppedXp / 75)));
    const xpPerCrate = Math.max(25, Math.floor(droppedXp / crateCount));

    const spawned: XpCrate[] = [];
    for (let i = 0; i < crateCount; i++) {
      const angle = (i * 2 * Math.PI) / crateCount;
      const dist = 15 + (i * 7);
      const pos: Vector2D = {
        x: vesselPos.x + Math.cos(angle) * dist,
        y: vesselPos.y + Math.sin(angle) * dist,
      };

      const type = xpPerCrate >= 150 ? 'MILITARY_CHEST' : xpPerCrate >= 50 ? 'STEEL' : 'WOODEN';
      const crate = createXpCrate(`crate_${Date.now()}_${++crateCounter}`, pos, type);
      crate.xpValue = xpPerCrate;
      this.addCrate(crate);
      spawned.push(crate);
    }

    return spawned;
  }

  /**
   * Checks crate collection for a vessel.
   * Uses ship length/beam magnetism: R_mag = (length / 2) * 1.5.
   */
  public checkCrateCollection(
    vessel: PlayerVesselRef
  ): { collectedCount: number; totalXpAwarded: number } {
    if (vessel.physicsState.isDestroyed || vessel.physicsState.depthState === 'DEEP') {
      return { collectedCount: 0, totalXpAwarded: 0 };
    }

    let collectedCount = 0;
    let totalXpAwarded = 0;
    const magRadius = (vessel.shipDef.length / 2) * 1.5;

    for (const [id, crate] of this.crates.entries()) {
      if (crate.isCollected) continue;

      const pickupDist = magRadius + crate.radius;
      const distSq = vec2DistanceSq(vessel.physicsState.position, crate.position);

      if (distSq <= pickupDist * pickupDist) {
        crate.isCollected = true;
        collectedCount++;
        totalXpAwarded += crate.xpValue;
        vessel.accumulatedXp += crate.xpValue;
        this.crates.delete(id);
      }
    }

    return { collectedCount, totalXpAwarded };
  }

  /**
   * Updates Oil Rig capture state machines and extracts passive XP for controlling factions.
   */
  public updateOilRigs(
    vessels: PlayerVesselRef[],
    dt: number
  ): { xpAwards: Map<string, number>; detonations: OilRig[] } {
    const xpAwards = new Map<string, number>();
    const detonations: OilRig[] = [];

    for (const rig of this.oilRigs.values()) {
      // 1. Respawn timer if destroyed
      if (rig.isDestroyed) {
        rig.respawnTimer -= dt;
        if (rig.respawnTimer <= 0) {
          rig.isDestroyed = false;
          rig.currentHp = rig.maxHp;
          rig.controlState = 'NEUTRAL';
          rig.controllingFactionId = undefined;
          rig.controllingPlayerId = undefined;
          rig.captureProgress = 0;
        }
        continue;
      }

      // 2. Identify vessels within capture perimeter (180m)
      const nearbyVessels = vessels.filter(v => {
        if (v.physicsState.isDestroyed) return false;
        // Submarines at DEEP depth cannot capture surface rigs
        if (v.physicsState.depthState === 'DEEP') return false;
        return vec2Distance(v.physicsState.position, rig.position) <= rig.captureRadius;
      });

      // Group nearby vessels by faction
      const factionsPresent = new Set<string>();
      for (const v of nearbyVessels) {
        factionsPresent.add(v.factionId || v.playerId);
      }

      if (factionsPresent.size === 0) {
        // No vessels in capture zone
        if (rig.controllingFactionId) {
          rig.controlState = 'CONTROLLED';
        } else {
          // If neutral and partially charged, slowly decay progress
          if (rig.controlState === 'NEUTRAL' && rig.captureProgress > 0) {
            rig.captureProgress = Math.max(0, rig.captureProgress - 0.5 * dt);
          } else if (rig.controlState === 'CONTESTED') {
            rig.controlState = 'NEUTRAL';
          }
        }
      } else if (factionsPresent.size > 1) {
        // Multiple opposing factions in zone -> CONTESTED (freeze capture progress)
        rig.controlState = 'CONTESTED';
      } else {
        // Exactly one faction in capture zone
        const singleFaction = Array.from(factionsPresent)[0];
        const primaryVessel = nearbyVessels.find(v => (v.factionId || v.playerId) === singleFaction);

        if (rig.controllingFactionId === singleFaction && rig.controlState === 'CONTROLLED') {
          // Already controlled by this faction: maintain full capture progress
          rig.captureProgress = rig.captureProgressRequired;
        } else if (rig.controllingFactionId && rig.controllingFactionId !== singleFaction) {
          // Enemy owns the rig: de-capture first
          rig.captureProgress -= dt;
          if (rig.captureProgress <= 0) {
            rig.controlState = 'NEUTRAL';
            rig.controllingFactionId = undefined;
            rig.controllingPlayerId = undefined;
            rig.captureProgress = 0;
          }
        } else {
          // Neutral rig: charge capture progress
          rig.captureProgress += dt;
          if (rig.captureProgress >= rig.captureProgressRequired) {
            rig.captureProgress = rig.captureProgressRequired;
            rig.controlState = 'CONTROLLED';
            rig.controllingFactionId = singleFaction;
            rig.controllingPlayerId = primaryVessel?.playerId;
          }
        }
      }

      // 3. Passive XP extraction if controlled
      if (rig.controlState === 'CONTROLLED' && rig.controllingFactionId) {
        let xpRate = rig.baseXpRate; // 20 XP/s

        // Check if an allied Oil Tanker is within 100m of the rig
        const tankerNearby = vessels.some(v => {
          if (v.physicsState.isDestroyed) return false;
          const isAllied = (v.factionId || v.playerId) === rig.controllingFactionId;
          const isTanker = v.shipDef.traits.includes('OIL_RIG_XP_BOOST') || v.shipDef.id === 'oil_tanker_sup';
          if (isAllied && isTanker) {
            return vec2Distance(v.physicsState.position, rig.position) <= 100.0;
          }
          return false;
        });

        if (tankerNearby) {
          // +150% extraction bonus: 20 * 2.5 = 50 XP/s total
          xpRate *= (1 + rig.oilTankerBonusMultiplier);
        }

        const xpThisTick = xpRate * dt;

        // Split or award XP to controlling faction members
        const alliedMembers = vessels.filter(
          v => !v.physicsState.isDestroyed && (v.factionId || v.playerId) === rig.controllingFactionId
        );

        if (alliedMembers.length > 0) {
          const xpPerMember = xpThisTick / alliedMembers.length;
          for (const member of alliedMembers) {
            member.accumulatedXp += xpPerMember;
            const current = xpAwards.get(member.playerId) || 0;
            xpAwards.set(member.playerId, current + xpPerMember);
          }
        }
      }
    }

    return { xpAwards, detonations };
  }

  /**
   * Applies damage to an Oil Rig and handles fuel explosion on destruction.
   */
  public damageOilRig(
    rigId: string,
    damage: number,
    vessels: PlayerVesselRef[]
  ): { isDestroyed: boolean; explosionVictims: PlayerVesselRef[] } {
    const rig = this.oilRigs.get(rigId);
    if (!rig || rig.isDestroyed) {
      return { isDestroyed: false, explosionVictims: [] };
    }

    const netDamage = Math.max(1, Math.round(damage * (100 / (100 + rig.armor))));
    rig.currentHp = Math.max(0, rig.currentHp - netDamage);

    if (rig.currentHp <= 0) {
      rig.isDestroyed = true;
      rig.respawnTimer = 300.0; // 5 minutes
      rig.controlState = 'NEUTRAL';
      rig.controllingFactionId = undefined;
      rig.controllingPlayerId = undefined;

      // Fuel explosion: 2,500 damage in 150m radius
      const explosionVictims: PlayerVesselRef[] = [];
      for (const vessel of vessels) {
        if (vessel.physicsState.isDestroyed) continue;
        const dist = vec2Distance(vessel.physicsState.position, rig.position);
        if (dist <= rig.explosionRadius) {
          const falloff = 1 - (dist / rig.explosionRadius);
          const explDamage = Math.round(rig.explosionDamage * falloff);
          vessel.physicsState.hullHp = Math.max(0, vessel.physicsState.hullHp - explDamage);
          if (vessel.physicsState.hullHp <= 0) vessel.physicsState.isDestroyed = true;
          explosionVictims.push(vessel);
        }
      }

      return { isDestroyed: true, explosionVictims };
    }

    return { isDestroyed: false, explosionVictims: [] };
  }

  /**
   * Steps the resource engine (crate lifetime decay & cleanup).
   */
  public step(dt: number): void {
    for (const [id, crate] of this.crates.entries()) {
      crate.lifetimeRemaining -= dt;
      if (crate.lifetimeRemaining <= 0 || crate.isCollected) {
        this.crates.delete(id);
      }
    }
  }
}
