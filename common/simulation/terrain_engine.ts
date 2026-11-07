/**
 * Bathymetric Grounding, Arctic Ice Grinding & Terrain Simulation Engine
 * Clean-Room implementation for NavalCommand.io
 */

import { Vector2D, vec2Length, vec2DistanceSq } from '../math/vector2.js';
import { Polygon, isPointInsidePolygon } from '../math/polygon.js';
import { ShipDef } from '../models/ships.js';
import { PhysicsState } from '../models/types.js';
import {
  TerrainBiome,
  IslandEntity,
  ARCTIC_ICE_BOUNDARY_Y,
  DEFAULT_ISLAND_PRESETS,
} from '../models/terrain.js';

export interface IceWakeSegment {
  position: Vector2D;
  width: number;
  expiresAt: number; // timestamp in seconds
}

export interface TerrainModification {
  id: string;
  type: 'EXCAVATE' | 'DEPOSIT';
  center: Vector2D;
  radius: number;
  targetDepth: number;
  createdAt: number;
}

export class TerrainEngine {
  private islands: IslandEntity[] = [];
  private wakeSegments: IceWakeSegment[] = [];
  private currentTime = 0;

  // Dynamic shallow water zones (e.g. sandbars, lagoons, straits)
  private shallowZones: { center: Vector2D; radius: number; depth: number }[] = [];
  private modifications: TerrainModification[] = [];

  constructor(islands: IslandEntity[] = DEFAULT_ISLAND_PRESETS) {
    this.islands = islands;
    this.initDefaultShallowZones();
  }

  private initDefaultShallowZones(): void {
    // Default littoral shallow regions (depth 1.0m to 6.0m)
    this.shallowZones.push(
      { center: { x: 3200, y: 5500 }, radius: 1200, depth: 3.0 },
      { center: { x: 7500, y: 7000 }, radius: 1500, depth: 4.5 },
      { center: { x: 12000, y: 11500 }, radius: 1600, depth: 2.5 },
      { center: { x: 9000, y: 3500 }, radius: 1000, depth: 1.5 }
    );
  }

  public addIsland(island: IslandEntity): void {
    this.islands.push(island);
  }

  public getIslands(): IslandEntity[] {
    return this.islands;
  }

  public addShallowZone(center: Vector2D, radius: number, depth: number): void {
    this.shallowZones.push({ center, radius, depth });
  }

  /**
   * Dredges an excavated channel, raising water depth to targetDepth (default 15.0m - deep water).
   */
  public excavateChannel(center: Vector2D, radius: number, targetDepth = 15.0): TerrainModification {
    const mod: TerrainModification = {
      id: `excavate_${this.currentTime}_${this.modifications.length + 1}`,
      type: 'EXCAVATE',
      center: { ...center },
      radius,
      targetDepth,
      createdAt: this.currentTime,
    };
    this.modifications.push(mod);
    return mod;
  }

  /**
   * Deposits sand or silt, reducing water depth to targetDepth (default 2.0m - shallow water sandbar).
   */
  public depositSand(center: Vector2D, radius: number, targetDepth = 2.0): TerrainModification {
    const mod: TerrainModification = {
      id: `deposit_${this.currentTime}_${this.modifications.length + 1}`,
      type: 'DEPOSIT',
      center: { ...center },
      radius,
      targetDepth,
      createdAt: this.currentTime,
    };
    this.modifications.push(mod);
    return mod;
  }

  public getModifications(): TerrainModification[] {
    return this.modifications;
  }

  public clearModifications(): void {
    this.modifications = [];
  }

  /**
   * Queries the bathymetric water depth at world coordinates (x, y).
   * Default ocean depth is 35m (DEEP).
   * Shallow zones have depth 1m - 12m.
   * If on land/island, depth is 0m.
   * Dynamic dredger modifications alter local bathymetry.
   */
  public getWaterDepthAt(x: number, y: number): number {
    const pt: Vector2D = { x, y };

    // Check island polygons (depth = 0)
    for (const island of this.islands) {
      if (isPointInsidePolygon(pt, island.polygon)) {
        return 0;
      }
    }

    // Base depth: evaluate shallow zones or deep ocean default (35m)
    let depth = 35.0;
    for (const zone of this.shallowZones) {
      const distSq = vec2DistanceSq(pt, zone.center);
      if (distSq <= zone.radius * zone.radius) {
        const dist = Math.sqrt(distSq);
        const ratio = dist / zone.radius;
        // Depth gradient: deeper toward edge, shallower toward center
        const zoneDepth = zone.depth + (35.0 - zone.depth) * (ratio * ratio);
        if (zoneDepth < depth) {
          depth = zoneDepth;
        }
      }
    }

    // Apply active terrain modifications (excavations increase depth, deposits reduce depth)
    for (const mod of this.modifications) {
      const distSq = vec2DistanceSq(pt, mod.center);
      if (distSq <= mod.radius * mod.radius) {
        const dist = Math.sqrt(distSq);
        const factor = 1.0 - (dist / mod.radius); // 1.0 at center, 0.0 at edge
        if (mod.type === 'EXCAVATE') {
          if (depth < mod.targetDepth) {
            depth = depth + (mod.targetDepth - depth) * factor;
          }
        } else if (mod.type === 'DEPOSIT') {
          if (depth > mod.targetDepth) {
            depth = depth - (depth - mod.targetDepth) * factor;
          }
        }
      }
    }

    return depth;
  }

  /**
   * Evaluates the terrain biome at world coordinates (x, y).
   */
  public getBiomeAt(x: number, y: number): TerrainBiome {
    const pt: Vector2D = { x, y };

    for (const island of this.islands) {
      if (isPointInsidePolygon(pt, island.polygon)) {
        return 'ISLAND';
      }
    }

    if (y <= ARCTIC_ICE_BOUNDARY_Y) {
      return 'ARCTIC_ICE';
    }

    const depth = this.getWaterDepthAt(x, y);
    if (depth <= 12.0) {
      return 'SHALLOW_WATER';
    }

    return 'DEEP_WATER';
  }

  /**
   * Adds an icebreaker wake segment that remains navigable for non-icebreakers for 30s.
   */
  public recordIcebreakerWake(pos: Vector2D, width: number, durationSeconds = 30.0): void {
    this.wakeSegments.push({
      position: { ...pos },
      width,
      expiresAt: this.currentTime + durationSeconds,
    });
  }

  /**
   * Checks if a point is within a navigable icebreaker wake corridor.
   */
  public isPositionInIcebreakerWake(pos: Vector2D): boolean {
    for (const seg of this.wakeSegments) {
      if (this.currentTime >= seg.expiresAt) continue;
      const distSq = vec2DistanceSq(pos, seg.position);
      const halfW = seg.width / 2;
      if (distSq <= halfW * halfW) {
        return true;
      }
    }
    return false;
  }

  /**
   * Simulates bathymetric grounding checks and hull grinding against shallow seabed.
   */
  public checkGrounding(
    shipDef: ShipDef,
    state: PhysicsState,
    dt: number
  ): { isGrounded: boolean; damage: number } {
    if (state.isDestroyed) {
      return { isGrounded: false, damage: 0 };
    }

    // Shallow draft immunity trait (e.g. PT boats, Vosper MTB)
    if (shipDef.traits.includes('SHALLOW_DRAFT_IMMUNITY')) {
      state.isGrounded = false;
      return { isGrounded: false, damage: 0 };
    }

    const depth = this.getWaterDepthAt(state.position.x, state.position.y);
    const draftDeficit = shipDef.draft - depth;

    // Submarine shallow water dive restriction: cannot enter DEEP in shallow water (< 25m)
    if (shipDef.canSubmerge && state.depthState === 'DEEP' && depth < 25.0) {
      // Submarine hits seabed: force return to periscope depth and take collision damage
      state.depthState = 'PERISCOPE';
      state.targetDepthState = 'PERISCOPE';
      state.currentDepth = -5.0;
      const subDamage = Math.round(shipDef.maxHp * 0.05 * dt); // 5% HP damage
      state.hullHp = Math.max(0, state.hullHp - subDamage);
      if (state.hullHp <= 0) state.isDestroyed = true;
      return { isGrounded: true, damage: subDamage };
    }

    if (draftDeficit > 0) {
      state.isGrounded = true;

      // Catastrophic grounding: if draft deficit > 1.5m, ship is beached
      if (draftDeficit > 1.5) {
        state.linearVelocity = { x: 0, y: 0 };
        state.angularVelocity = 0;
        state.speedKnots = 0;
      } else {
        // Friction force slows down ship
        const friction = Math.min(1.0, 3.5 * draftDeficit * dt);
        state.linearVelocity.x *= 1 - friction;
        state.linearVelocity.y *= 1 - friction;
      }

      // Hull grounding damage: 2% max HP per second
      const damage = Math.round(shipDef.maxHp * 0.02 * dt);
      state.hullHp = Math.max(0, state.hullHp - damage);
      if (state.hullHp <= 0) state.isDestroyed = true;

      return { isGrounded: true, damage };
    }

    state.isGrounded = false;
    return { isGrounded: false, damage: 0 };
  }

  /**
   * Simulates Arctic ice grinding hull damage and speed penalties for non-icebreakers.
   */
  public checkIceGrinding(
    shipDef: ShipDef,
    state: PhysicsState,
    dt: number
  ): { inIce: boolean; damage: number } {
    if (state.isDestroyed) {
      return { inIce: false, damage: 0 };
    }

    const inArcticBiome = state.position.y <= ARCTIC_ICE_BOUNDARY_Y;
    if (!inArcticBiome) {
      return { inIce: false, damage: 0 };
    }

    // Icebreaker hull trait: immune to ice damage, creates wake channel
    if (shipDef.isIcebreaker || shipDef.traits.includes('ICEBREAKER_IMMUNITY')) {
      // Record wake channel
      this.recordIcebreakerWake(state.position, shipDef.beam * 1.5, 30.0);
      return { inIce: true, damage: 0 };
    }

    // Submarines submerged deep under pack ice are safe from surface ice grinding
    if (state.depthState === 'DEEP') {
      return { inIce: true, damage: 0 };
    }

    // Non-icebreaker checking if traveling inside an icebreaker wake channel
    if (this.isPositionInIcebreakerWake(state.position)) {
      return { inIce: true, damage: 0 }; // Protected inside cleared corridor!
    }

    // Unprotected vessel in pack ice:
    // Speed penalty: 50% max speed reduction
    state.linearVelocity.x *= Math.max(0.4, 1.0 - 0.5 * dt);
    state.linearVelocity.y *= Math.max(0.4, 1.0 - 0.5 * dt);

    // Grinding damage: d(HP)/dt = -C_ice * |v|^2 (C_ice = 8.5)
    const speedMs = vec2Length(state.linearVelocity);
    const speedSq = speedMs * speedMs;
    const cIce = 8.5;
    const damage = Math.max(5 * dt, cIce * speedSq * dt); // minimum 5 HP/s pressure damage

    const finalDamage = Math.round(damage);
    state.hullHp = Math.max(0, state.hullHp - finalDamage);
    if (state.hullHp <= 0) state.isDestroyed = true;

    return { inIce: true, damage: finalDamage };
  }

  /**
   * Steps the entire terrain simulation for a vessel.
   */
  public stepTerrainSimulation(shipDef: ShipDef, state: PhysicsState, dt: number): void {
    this.currentTime += dt;

    // Prune expired wake segments regardless of array length
    this.wakeSegments = this.wakeSegments.filter(w => w.expiresAt > this.currentTime);

    this.checkGrounding(shipDef, state, dt);
    this.checkIceGrinding(shipDef, state, dt);
  }
}
