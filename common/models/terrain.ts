/**
 * Terrain Biomes, Depth Zones, XP Crates & Oil Rigs
 * Clean-Room implementation for NavalCommand.io
 */

import { Vector2D, vec2 } from '../math/vector2.js';
import { Polygon } from '../math/polygon.js';

export type TerrainBiome =
  | 'DEEP_WATER'
  | 'SHALLOW_WATER'
  | 'ISLAND'
  | 'ARCTIC_ICE';

export const MAP_DIMENSION = 16384; // 16.384 km x 16.384 km
export const ARCTIC_ICE_BOUNDARY_Y = 2500; // Northern sector Y <= 2500m

export interface IslandEntity {
  id: string;
  name?: string;
  polygon: Polygon;
  elevation: number;
}

export type XpCrateType = 'WOODEN' | 'STEEL' | 'MILITARY_CHEST';

export interface XpCrate {
  id: string;
  position: Vector2D;
  type: XpCrateType;
  xpValue: number;
  radius: number;           // collision / pickup radius (meters)
  lifetimeRemaining: number;// seconds before despawn
  isCollected: boolean;
}

export function createXpCrate(id: string, position: Vector2D, type: XpCrateType = 'WOODEN'): XpCrate {
  switch (type) {
    case 'STEEL':
      return {
        id,
        position: { ...position },
        type,
        xpValue: 75,
        radius: 12,
        lifetimeRemaining: 180,
        isCollected: false,
      };
    case 'MILITARY_CHEST':
      return {
        id,
        position: { ...position },
        type,
        xpValue: 200,
        radius: 16,
        lifetimeRemaining: 300,
        isCollected: false,
      };
    case 'WOODEN':
    default:
      return {
        id,
        position: { ...position },
        type: 'WOODEN',
        xpValue: 25,
        radius: 8,
        lifetimeRemaining: 120,
        isCollected: false,
      };
  }
}

export type OilRigControlState = 'NEUTRAL' | 'CONTROLLED' | 'CONTESTED';

export interface OilRig {
  id: string;
  name: string;
  position: Vector2D;
  size: Vector2D;                   // 36m x 36m footprint
  captureRadius: number;            // 180m
  controlState: OilRigControlState;
  controllingFactionId?: string;
  controllingPlayerId?: string;
  captureProgress: number;          // 0 to 15.0 seconds
  captureProgressRequired: number;  // 15.0 seconds
  maxHp: number;                    // 12,000 HP
  currentHp: number;
  armor: number;                    // 40 armor
  isDestroyed: boolean;
  respawnTimer: number;             // 300s (5 min) when destroyed
  baseXpRate: number;               // 20 XP / second
  oilTankerBonusMultiplier: number; // +1.50 -> +150% = 50 XP/s total
  explosionRadius: number;          // 150m
  explosionDamage: number;          // 2500 damage
}

export function createOilRig(
  id: string,
  name: string,
  position: Vector2D
): OilRig {
  return {
    id,
    name,
    position: { ...position },
    size: vec2(36, 36),
    captureRadius: 180,
    controlState: 'NEUTRAL',
    captureProgress: 0,
    captureProgressRequired: 15.0,
    maxHp: 12000,
    currentHp: 12000,
    armor: 40,
    isDestroyed: false,
    respawnTimer: 0,
    baseXpRate: 20,
    oilTankerBonusMultiplier: 1.50,
    explosionRadius: 150,
    explosionDamage: 2500,
  };
}

/**
 * Procedural Island Archipelago presets for testing and map generation
 */
export const DEFAULT_ISLAND_PRESETS: IslandEntity[] = [
  {
    id: 'island_north_bastion',
    name: 'North Bastion Atoll',
    elevation: 45,
    polygon: {
      vertices: [
        { x: 3000, y: 4000 },
        { x: 3400, y: 3900 },
        { x: 3700, y: 4300 },
        { x: 3500, y: 4700 },
        { x: 2900, y: 4600 },
      ],
    },
  },
  {
    id: 'island_central_citadel',
    name: 'Central Fortress Atoll',
    elevation: 60,
    polygon: {
      vertices: [
        { x: 8000, y: 8000 },
        { x: 8600, y: 7800 },
        { x: 9000, y: 8400 },
        { x: 8700, y: 9100 },
        { x: 7900, y: 8800 },
      ],
    },
  },
  {
    id: 'island_south_archipelago',
    name: 'South Coral Reef',
    elevation: 20,
    polygon: {
      vertices: [
        { x: 12000, y: 13000 },
        { x: 12500, y: 12800 },
        { x: 12900, y: 13400 },
        { x: 12300, y: 13800 },
        { x: 11800, y: 13500 },
      ],
    },
  },
];
