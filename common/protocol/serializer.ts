/**
 * Binary Serialization & Deserialization Engine using ArrayBuffer & DataView
 * Clean-Room implementation for NavalCommand.io
 */

import {
  Opcode,
  SNAPSHOT_HEADER_BYTES,
  VESSEL_SNAPSHOT_BYTES,
  VesselSnapshotRecord,
  SnapshotPacket,
  InputPacket,
  EventPacket,
  SpawnReqPacket,
  FleetActionPacket,
  DuelActionPacket,
  LoadoutSavePacket,
  ChatPacket,
  AnyPacket,
} from './packet_types.js';

const TWO_PI = Math.PI * 2;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// Fixed-point and conversion utilities
export function coordToFixed(meters: number): number {
  const scaled = Math.round(meters * 10);
  return Math.max(-32768, Math.min(32767, scaled));
}

export function fixedToCoord(fixed: number): number {
  return fixed / 10;
}

export function velToFixed(speedMs: number): number {
  const scaled = Math.round(speedMs * 100);
  return Math.max(-32768, Math.min(32767, scaled));
}

export function fixedToVel(fixed: number): number {
  return fixed / 100;
}

export function angleToUint16(radians: number): number {
  const normalized = ((radians % TWO_PI) + TWO_PI) % TWO_PI;
  return Math.round((normalized / TWO_PI) * 65535) & 0xffff;
}

export function uint16ToAngle(val: number): number {
  return ((val & 0xffff) / 65535) * TWO_PI;
}

function writeFixedString(view: DataView, offset: number, maxBytes: number, str: string): void {
  const bytes = textEncoder.encode(str);
  const copyLen = Math.min(bytes.length, maxBytes);
  const uint8 = new Uint8Array(view.buffer, view.byteOffset + offset, maxBytes);
  uint8.fill(0);
  uint8.set(bytes.subarray(0, copyLen));
}

function readFixedString(view: DataView, offset: number, maxBytes: number): string {
  const uint8 = new Uint8Array(view.buffer, view.byteOffset + offset, maxBytes);
  let end = 0;
  while (end < maxBytes && uint8[end] !== 0) {
    end++;
  }
  return textDecoder.decode(uint8.subarray(0, end));
}

// -------------------------------------------------------------
// Vessel Snapshot Record (28 Bytes)
// -------------------------------------------------------------
export function serializeVesselRecord(
  record: VesselSnapshotRecord,
  view: DataView,
  offset: number
): void {
  // Offset 0..1: vesselId (u16)
  view.setUint16(offset + 0, record.vesselId & 0xffff, true);
  // Offset 2..3: posX (i16)
  view.setInt16(offset + 2, coordToFixed(record.posX), true);
  // Offset 4..5: posY (i16)
  view.setInt16(offset + 4, coordToFixed(record.posY), true);
  // Offset 6..7: heading (u16)
  view.setUint16(offset + 6, angleToUint16(record.heading), true);
  // Offset 8: speedKnots (u8)
  view.setUint8(offset + 8, Math.max(0, Math.min(255, Math.round(record.speedKnots))));
  // Offset 9: hullHpPct (u8)
  view.setUint8(offset + 9, Math.max(0, Math.min(100, Math.round(record.hullHpPct))));
  // Offset 10: flags (u8)
  view.setUint8(offset + 10, record.flags & 0xff);
  // Offset 11: depth (u8)
  view.setUint8(offset + 11, record.depth & 0xff);
  // Offset 12..19: mountAngles (u16[4]) -> 8 bytes
  for (let i = 0; i < 4; i++) {
    const angle = record.mountAngles[i] ?? 0;
    view.setUint16(offset + 12 + i * 2, angleToUint16(angle), true);
  }
  // Offset 20..21: velX (i16)
  view.setInt16(offset + 20, velToFixed(record.velX), true);
  // Offset 22..23: velY (i16)
  view.setInt16(offset + 22, velToFixed(record.velY), true);
  // Offset 24..25: fleetId (u16)
  view.setUint16(offset + 24, record.fleetId & 0xffff, true);
  // Offset 26..27: targetId (u16)
  view.setUint16(offset + 26, record.targetId & 0xffff, true);
}

export function deserializeVesselRecord(view: DataView, offset: number): VesselSnapshotRecord {
  const vesselId = view.getUint16(offset + 0, true);
  const posX = fixedToCoord(view.getInt16(offset + 2, true));
  const posY = fixedToCoord(view.getInt16(offset + 4, true));
  const heading = uint16ToAngle(view.getUint16(offset + 6, true));
  const speedKnots = view.getUint8(offset + 8);
  const hullHpPct = view.getUint8(offset + 9);
  const flags = view.getUint8(offset + 10);
  const depth = view.getUint8(offset + 11);

  const mountAngles: [number, number, number, number] = [
    uint16ToAngle(view.getUint16(offset + 12, true)),
    uint16ToAngle(view.getUint16(offset + 14, true)),
    uint16ToAngle(view.getUint16(offset + 16, true)),
    uint16ToAngle(view.getUint16(offset + 18, true)),
  ];

  const velX = fixedToVel(view.getInt16(offset + 20, true));
  const velY = fixedToVel(view.getInt16(offset + 22, true));
  const fleetId = view.getUint16(offset + 24, true);
  const targetId = view.getUint16(offset + 26, true);

  return {
    vesselId,
    posX,
    posY,
    heading,
    speedKnots,
    hullHpPct,
    flags,
    depth,
    mountAngles,
    velX,
    velY,
    fleetId,
    targetId,
  };
}

// -------------------------------------------------------------
// OP_SNAPSHOT (0x01)
// -------------------------------------------------------------
export function serializeSnapshot(packet: SnapshotPacket): ArrayBuffer {
  const count = packet.vessels.length;
  const totalBytes = SNAPSHOT_HEADER_BYTES + count * VESSEL_SNAPSHOT_BYTES;
  const buffer = new ArrayBuffer(totalBytes);
  const view = new DataView(buffer);

  view.setUint8(0, Opcode.OP_SNAPSHOT);
  view.setUint8(1, packet.flags & 0xff);
  view.setUint32(2, packet.serverTick, true);
  view.setUint16(6, packet.ackSequence & 0xffff, true);
  view.setUint16(8, count & 0xffff, true);
  view.setUint16(10, packet.worldTimeSeconds & 0xffff, true);

  for (let i = 0; i < count; i++) {
    const offset = SNAPSHOT_HEADER_BYTES + i * VESSEL_SNAPSHOT_BYTES;
    serializeVesselRecord(packet.vessels[i], view, offset);
  }

  return buffer;
}

export function deserializeSnapshot(bufferOrView: ArrayBuffer | DataView): SnapshotPacket {
  const view =
    bufferOrView instanceof DataView
      ? bufferOrView
      : new DataView(bufferOrView);

  const opcode = view.getUint8(0);
  if (opcode !== Opcode.OP_SNAPSHOT) {
    throw new Error(`Expected opcode OP_SNAPSHOT (0x01), got ${opcode}`);
  }

  const flags = view.getUint8(1);
  const serverTick = view.getUint32(2, true);
  const ackSequence = view.getUint16(6, true);
  const entityCount = view.getUint16(8, true);
  const worldTimeSeconds = view.getUint16(10, true);

  const vessels: VesselSnapshotRecord[] = [];
  for (let i = 0; i < entityCount; i++) {
    const offset = SNAPSHOT_HEADER_BYTES + i * VESSEL_SNAPSHOT_BYTES;
    if (offset + VESSEL_SNAPSHOT_BYTES <= view.byteLength) {
      vessels.push(deserializeVesselRecord(view, offset));
    }
  }

  return {
    opcode: Opcode.OP_SNAPSHOT,
    flags,
    serverTick,
    ackSequence,
    entityCount,
    worldTimeSeconds,
    vessels,
  };
}

// -------------------------------------------------------------
// OP_INPUT (0x02) - 14 Bytes
// -------------------------------------------------------------
export function serializeInput(packet: InputPacket): ArrayBuffer {
  const buffer = new ArrayBuffer(14);
  const view = new DataView(buffer);

  view.setUint8(0, Opcode.OP_INPUT);
  view.setUint32(1, packet.sequence, true);
  view.setInt8(5, Math.max(-100, Math.min(100, Math.round(packet.thrust))));
  view.setInt8(6, Math.max(-100, Math.min(100, Math.round(packet.rudder))));
  view.setUint8(7, packet.depthTarget & 0xff);
  view.setUint16(8, packet.weaponFireMask & 0xffff, true);
  view.setInt16(10, coordToFixed(packet.targetX), true);
  view.setInt16(12, coordToFixed(packet.targetY), true);

  return buffer;
}

export function deserializeInput(bufferOrView: ArrayBuffer | DataView): InputPacket {
  const view =
    bufferOrView instanceof DataView
      ? bufferOrView
      : new DataView(bufferOrView);

  const opcode = view.getUint8(0);
  if (opcode !== Opcode.OP_INPUT) {
    throw new Error(`Expected opcode OP_INPUT (0x02), got ${opcode}`);
  }

  const sequence = view.getUint32(1, true);
  const thrust = view.getInt8(5);
  const rudder = view.getInt8(6);
  const depthTarget = view.getUint8(7);
  const weaponFireMask = view.getUint16(8, true);
  const targetX = fixedToCoord(view.getInt16(10, true));
  const targetY = fixedToCoord(view.getInt16(12, true));

  return {
    opcode: Opcode.OP_INPUT,
    sequence,
    thrust,
    rudder,
    depthTarget,
    weaponFireMask,
    targetX,
    targetY,
  };
}

// -------------------------------------------------------------
// OP_EVENT (0x03) - 10 Bytes
// -------------------------------------------------------------
export function serializeEvent(packet: EventPacket): ArrayBuffer {
  const buffer = new ArrayBuffer(10);
  const view = new DataView(buffer);

  view.setUint8(0, Opcode.OP_EVENT);
  view.setUint8(1, packet.eventType & 0xff);
  view.setUint16(2, packet.sourceId & 0xffff, true);
  view.setUint16(4, packet.targetId & 0xffff, true);
  view.setUint32(6, packet.data, true);

  return buffer;
}

export function deserializeEvent(bufferOrView: ArrayBuffer | DataView): EventPacket {
  const view =
    bufferOrView instanceof DataView
      ? bufferOrView
      : new DataView(bufferOrView);

  const opcode = view.getUint8(0);
  if (opcode !== Opcode.OP_EVENT) {
    throw new Error(`Expected opcode OP_EVENT (0x03), got ${opcode}`);
  }

  return {
    opcode: Opcode.OP_EVENT,
    eventType: view.getUint8(1),
    sourceId: view.getUint16(2, true),
    targetId: view.getUint16(4, true),
    data: view.getUint32(6, true),
  };
}

// -------------------------------------------------------------
// OP_SPAWN_REQ (0x04) - 7 Bytes
// -------------------------------------------------------------
export function serializeSpawnReq(packet: SpawnReqPacket): ArrayBuffer {
  const buffer = new ArrayBuffer(7);
  const view = new DataView(buffer);

  view.setUint8(0, Opcode.OP_SPAWN_REQ);
  view.setUint8(1, packet.shipClassId & 0xff);
  view.setUint8(2, packet.camoId & 0xff);
  view.setUint32(3, packet.loadoutMask, true);

  return buffer;
}

export function deserializeSpawnReq(bufferOrView: ArrayBuffer | DataView): SpawnReqPacket {
  const view =
    bufferOrView instanceof DataView
      ? bufferOrView
      : new DataView(bufferOrView);

  const opcode = view.getUint8(0);
  if (opcode !== Opcode.OP_SPAWN_REQ) {
    throw new Error(`Expected opcode OP_SPAWN_REQ (0x04), got ${opcode}`);
  }

  return {
    opcode: Opcode.OP_SPAWN_REQ,
    shipClassId: view.getUint8(1),
    camoId: view.getUint8(2),
    loadoutMask: view.getUint32(3, true),
  };
}

// -------------------------------------------------------------
// OP_FLEET_ACTION (0x05) - 4 Bytes
// -------------------------------------------------------------
export function serializeFleetAction(packet: FleetActionPacket): ArrayBuffer {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);

  view.setUint8(0, Opcode.OP_FLEET_ACTION);
  view.setUint8(1, packet.action & 0xff);
  view.setUint16(2, packet.targetId & 0xffff, true);

  return buffer;
}

export function deserializeFleetAction(bufferOrView: ArrayBuffer | DataView): FleetActionPacket {
  const view =
    bufferOrView instanceof DataView
      ? bufferOrView
      : new DataView(bufferOrView);

  const opcode = view.getUint8(0);
  if (opcode !== Opcode.OP_FLEET_ACTION) {
    throw new Error(`Expected opcode OP_FLEET_ACTION (0x05), got ${opcode}`);
  }

  return {
    opcode: Opcode.OP_FLEET_ACTION,
    action: view.getUint8(1),
    targetId: view.getUint16(2, true),
  };
}

// -------------------------------------------------------------
// OP_DUEL_ACTION (0x06) - 4 Bytes
// -------------------------------------------------------------
export function serializeDuelAction(packet: DuelActionPacket): ArrayBuffer {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);

  view.setUint8(0, Opcode.OP_DUEL_ACTION);
  view.setUint8(1, packet.action & 0xff);
  view.setUint16(2, packet.targetPlayerId & 0xffff, true);

  return buffer;
}

export function deserializeDuelAction(bufferOrView: ArrayBuffer | DataView): DuelActionPacket {
  const view =
    bufferOrView instanceof DataView
      ? bufferOrView
      : new DataView(bufferOrView);

  const opcode = view.getUint8(0);
  if (opcode !== Opcode.OP_DUEL_ACTION) {
    throw new Error(`Expected opcode OP_DUEL_ACTION (0x06), got ${opcode}`);
  }

  return {
    opcode: Opcode.OP_DUEL_ACTION,
    action: view.getUint8(1),
    targetPlayerId: view.getUint16(2, true),
  };
}

// -------------------------------------------------------------
// OP_LOADOUT_SAVE (0x07) - 14 Bytes
// -------------------------------------------------------------
export function serializeLoadoutSave(packet: LoadoutSavePacket): ArrayBuffer {
  const buffer = new ArrayBuffer(14);
  const view = new DataView(buffer);

  view.setUint8(0, Opcode.OP_LOADOUT_SAVE);
  view.setUint8(1, packet.shipId & 0xff);
  for (let i = 0; i < 4; i++) {
    view.setUint8(2 + i, packet.slotIndices[i] & 0xff);
  }
  for (let i = 0; i < 4; i++) {
    view.setUint16(6 + i * 2, packet.moduleIds[i] & 0xffff, true);
  }

  return buffer;
}

export function deserializeLoadoutSave(bufferOrView: ArrayBuffer | DataView): LoadoutSavePacket {
  const view =
    bufferOrView instanceof DataView
      ? bufferOrView
      : new DataView(bufferOrView);

  const opcode = view.getUint8(0);
  if (opcode !== Opcode.OP_LOADOUT_SAVE) {
    throw new Error(`Expected opcode OP_LOADOUT_SAVE (0x07), got ${opcode}`);
  }

  const shipId = view.getUint8(1);
  const slotIndices: [number, number, number, number] = [
    view.getUint8(2),
    view.getUint8(3),
    view.getUint8(4),
    view.getUint8(5),
  ];
  const moduleIds: [number, number, number, number] = [
    view.getUint16(6, true),
    view.getUint16(8, true),
    view.getUint16(10, true),
    view.getUint16(12, true),
  ];

  return {
    opcode: Opcode.OP_LOADOUT_SAVE,
    shipId,
    slotIndices,
    moduleIds,
  };
}

// -------------------------------------------------------------
// OP_CHAT (0x08) - 82 Bytes
// -------------------------------------------------------------
export function serializeChat(packet: ChatPacket): ArrayBuffer {
  const buffer = new ArrayBuffer(82);
  const view = new DataView(buffer);

  view.setUint8(0, Opcode.OP_CHAT);
  view.setUint8(1, packet.channel & 0xff);
  writeFixedString(view, 2, 16, packet.senderName);
  writeFixedString(view, 18, 64, packet.message);

  return buffer;
}

export function deserializeChat(bufferOrView: ArrayBuffer | DataView): ChatPacket {
  const view =
    bufferOrView instanceof DataView
      ? bufferOrView
      : new DataView(bufferOrView);

  const opcode = view.getUint8(0);
  if (opcode !== Opcode.OP_CHAT) {
    throw new Error(`Expected opcode OP_CHAT (0x08), got ${opcode}`);
  }

  const channel = view.getUint8(1);
  const senderName = readFixedString(view, 2, 16);
  const message = readFixedString(view, 18, 64);

  return {
    opcode: Opcode.OP_CHAT,
    channel,
    senderName,
    message,
  };
}
