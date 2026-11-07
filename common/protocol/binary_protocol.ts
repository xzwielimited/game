/**
 * Unified Binary Wire Protocol Dispatcher
 * Clean-Room implementation for NavalCommand.io
 */

import {
  Opcode,
  SNAPSHOT_HEADER_BYTES,
  VESSEL_SNAPSHOT_BYTES,
  AnyPacket,
  SnapshotPacket,
  InputPacket,
  EventPacket,
  SpawnReqPacket,
  FleetActionPacket,
  DuelActionPacket,
  LoadoutSavePacket,
  ChatPacket,
} from './packet_types.js';

import {
  serializeSnapshot,
  deserializeSnapshot,
  serializeInput,
  deserializeInput,
  serializeEvent,
  deserializeEvent,
  serializeSpawnReq,
  deserializeSpawnReq,
  serializeFleetAction,
  deserializeFleetAction,
  serializeDuelAction,
  deserializeDuelAction,
  serializeLoadoutSave,
  deserializeLoadoutSave,
  serializeChat,
  deserializeChat,
} from './serializer.js';

export * from './packet_types.js';
export * from './serializer.js';

export function getPacketOpcode(buffer: ArrayBuffer | Uint8Array | DataView): Opcode {
  let view: DataView;
  if (buffer instanceof DataView) {
    view = buffer;
  } else if (buffer instanceof ArrayBuffer) {
    view = new DataView(buffer);
  } else {
    view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }
  if (view.byteLength < 1) {
    throw new Error('Buffer too small to read opcode');
  }
  return view.getUint8(0) as Opcode;
}

export function encodePacket(packet: AnyPacket): ArrayBuffer {
  switch (packet.opcode) {
    case Opcode.OP_SNAPSHOT:
      return serializeSnapshot(packet);
    case Opcode.OP_INPUT:
      return serializeInput(packet);
    case Opcode.OP_EVENT:
      return serializeEvent(packet);
    case Opcode.OP_SPAWN_REQ:
      return serializeSpawnReq(packet);
    case Opcode.OP_FLEET_ACTION:
      return serializeFleetAction(packet);
    case Opcode.OP_DUEL_ACTION:
      return serializeDuelAction(packet);
    case Opcode.OP_LOADOUT_SAVE:
      return serializeLoadoutSave(packet);
    case Opcode.OP_CHAT:
      return serializeChat(packet);
    default:
      throw new Error(`Unsupported packet opcode: ${(packet as AnyPacket).opcode}`);
  }
}

export function decodePacket(buffer: ArrayBuffer | Uint8Array | DataView): AnyPacket {
  let view: DataView;
  if (buffer instanceof DataView) {
    view = buffer;
  } else if (buffer instanceof ArrayBuffer) {
    view = new DataView(buffer);
  } else {
    view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }

  const opcode = view.getUint8(0);
  switch (opcode) {
    case Opcode.OP_SNAPSHOT:
      return deserializeSnapshot(view);
    case Opcode.OP_INPUT:
      return deserializeInput(view);
    case Opcode.OP_EVENT:
      return deserializeEvent(view);
    case Opcode.OP_SPAWN_REQ:
      return deserializeSpawnReq(view);
    case Opcode.OP_FLEET_ACTION:
      return deserializeFleetAction(view);
    case Opcode.OP_DUEL_ACTION:
      return deserializeDuelAction(view);
    case Opcode.OP_LOADOUT_SAVE:
      return deserializeLoadoutSave(view);
    case Opcode.OP_CHAT:
      return deserializeChat(view);
    default:
      throw new Error(`Unknown opcode received: 0x${opcode.toString(16)}`);
  }
}
