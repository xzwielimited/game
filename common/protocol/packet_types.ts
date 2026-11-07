/**
 * Compact Binary Wire Protocol Types & Packet Definitions
 * Clean-Room implementation for NavalCommand.io
 */

export enum Opcode {
  OP_SNAPSHOT = 0x01,
  OP_INPUT = 0x02,
  OP_EVENT = 0x03,
  OP_SPAWN_REQ = 0x04,
  OP_FLEET_ACTION = 0x05,
  OP_DUEL_ACTION = 0x06,
  OP_LOADOUT_SAVE = 0x07,
  OP_CHAT = 0x08,
}

export const SNAPSHOT_HEADER_BYTES = 12;
export const VESSEL_SNAPSHOT_BYTES = 28;

export enum VesselStatusFlag {
  CAVITATING = 1 << 0,
  FIRING = 1 << 1,
  ECM_ACTIVE = 1 << 2,
  STEALTH_ACTIVE = 1 << 3,
  GROUNDED = 1 << 4,
  SONAR_ACTIVE = 1 << 5,
  SPAWN_SHIELD = 1 << 5,
  DESTROYED = 1 << 6,
  NAP_ACTIVE = 1 << 7,
}

export enum InputControlFlag {
  FIRE_PRIMARY = 1 << 0,
  FIRE_SECONDARY = 1 << 1,
  FIRE_TORPEDO = 1 << 2,
  FIRE_MISSILE = 1 << 3,
  DIVE_TOGGLE = 1 << 4,
  STEALTH_TOGGLE = 1 << 5,
  ECM_TOGGLE = 1 << 6,
  SONAR_PING = 1 << 7,
}

export enum GameEventType {
  NONE = 0,
  HIT = 1,
  SINK = 2,
  CRATE_COLLECT = 3,
  RIG_CAPTURE = 4,
  ECM_PULSE = 5,
  SONAR_BUOY_DEPLOY = 6,
  REPAIR_PULSE = 7,
  KARMA_PENALTY = 8,
  SPAWN_SHIELD = 9,
  RESPAWN = 10,
}

export enum FleetActionType {
  CREATE = 1,
  JOIN = 2,
  INVITE = 3,
  LEAVE = 4,
  KICK = 5,
}

export enum DuelActionType {
  CHALLENGE = 1,
  ACCEPT = 2,
  DECLINE = 3,
  CANCEL = 4,
  COMPLETED = 5,
}

export enum ChatChannel {
  GLOBAL = 0,
  FLEET = 1,
  DUEL = 2,
  SYSTEM = 3,
}

/**
 * 28-Byte Compact Vessel Snapshot Record
 * Fixed byte offsets:
 * 0..1:   vesselId (u16)
 * 2..3:   posX (i16) - fixed point: meters * 10
 * 4..5:   posY (i16) - fixed point: meters * 10
 * 6..7:   heading (u16) - 0..65535 mapped to [0, 2*PI)
 * 8:      speedKnots (u8)
 * 9:      hullHpPct (u8) - 0..100
 * 10:     flags (u8) - VesselStatusFlag bitmask
 * 11:     depth (u8) - 0: SURFACE, 1: PERISCOPE, 2: DEEP
 * 12..19: mountAngles (u16[4]) - 4 mount angles mapped to [0, 2*PI)
 * 20..21: velX (i16) - fixed point: (m/s) * 100
 * 22..23: velY (i16) - fixed point: (m/s) * 100
 * 24..25: fleetId (u16)
 * 26..27: targetId (u16)
 * Total: 28 bytes per vessel
 */
export interface VesselSnapshotRecord {
  vesselId: number;
  posX: number;          // Logical meters
  posY: number;          // Logical meters
  heading: number;       // Radians [0, 2*PI)
  speedKnots: number;
  hullHpPct: number;     // 0..100
  flags: number;         // Bitflags
  depth: number;         // 0=SURFACE, 1=PERISCOPE, 2=DEEP
  mountAngles: [number, number, number, number]; // Radians [0, 2*PI)
  velX: number;          // m/s
  velY: number;          // m/s
  fleetId: number;
  targetId: number;
}

export interface SnapshotPacket {
  opcode: Opcode.OP_SNAPSHOT;
  flags: number;
  serverTick: number;
  ackSequence: number;
  entityCount: number;
  worldTimeSeconds: number;
  vessels: VesselSnapshotRecord[];
}

export interface InputPacket {
  opcode: Opcode.OP_INPUT;
  sequence: number;      // u32
  thrust: number;        // i8 (-100..100)
  rudder: number;        // i8 (-100..100)
  depthTarget: number;   // u8 (0, 1, 2)
  weaponFireMask: number;// u16
  targetX: number;       // i16 meters * 10
  targetY: number;       // i16 meters * 10
}

export interface EventPacket {
  opcode: Opcode.OP_EVENT;
  eventType: number;     // u8 (GameEventType)
  sourceId: number;      // u16
  targetId: number;      // u16
  data: number;          // u32
}

export interface SpawnReqPacket {
  opcode: Opcode.OP_SPAWN_REQ;
  shipClassId: number;   // u8
  camoId: number;        // u8
  loadoutMask: number;   // u32
}

export interface FleetActionPacket {
  opcode: Opcode.OP_FLEET_ACTION;
  action: number;        // u8 (FleetActionType)
  targetId: number;      // u16
}

export interface DuelActionPacket {
  opcode: Opcode.OP_DUEL_ACTION;
  action: number;        // u8 (DuelActionType)
  targetPlayerId: number;// u16
}

export interface LoadoutSavePacket {
  opcode: Opcode.OP_LOADOUT_SAVE;
  shipId: number;        // u8
  slotIndices: [number, number, number, number]; // u8[4]
  moduleIds: [number, number, number, number];   // u16[4]
}

export interface ChatPacket {
  opcode: Opcode.OP_CHAT;
  channel: number;       // u8 (ChatChannel)
  senderName: string;    // max 16 chars
  message: string;       // max 64 chars
}

export type AnyPacket =
  | SnapshotPacket
  | InputPacket
  | EventPacket
  | SpawnReqPacket
  | FleetActionPacket
  | DuelActionPacket
  | LoadoutSavePacket
  | ChatPacket;
