import { describe, it, expect } from 'vitest';
import {
  Opcode,
  SNAPSHOT_HEADER_BYTES,
  VESSEL_SNAPSHOT_BYTES,
  VesselStatusFlag,
  InputControlFlag,
  GameEventType,
  FleetActionType,
  DuelActionType,
  ChatChannel,
  VesselSnapshotRecord,
  SnapshotPacket,
  InputPacket,
  EventPacket,
  SpawnReqPacket,
  FleetActionPacket,
  DuelActionPacket,
  LoadoutSavePacket,
  ChatPacket,
  encodePacket,
  decodePacket,
  getPacketOpcode,
  serializeSnapshot,
  deserializeSnapshot,
  coordToFixed,
  fixedToCoord,
  velToFixed,
  fixedToVel,
  angleToUint16,
  uint16ToAngle,
} from '../../common/protocol/binary_protocol.js';

describe('Binary Wire Protocol & 28-Byte Layout Verification', () => {
  it('converts fixed-point coordinates and velocities with high precision', () => {
    // 0.1 meter resolution for coordinates
    const testCoords = [0, 125.4, -342.8, 1500.0, -2500.0];
    for (const c of testCoords) {
      const fixed = coordToFixed(c);
      const restored = fixedToCoord(fixed);
      expect(restored).toBeCloseTo(c, 1);
    }

    // 0.01 m/s resolution for velocity
    const testVels = [0, 12.34, -8.76, 45.0, -18.5];
    for (const v of testVels) {
      const fixed = velToFixed(v);
      const restored = fixedToVel(fixed);
      expect(restored).toBeCloseTo(v, 2);
    }

    // Angle mapping 0..2*PI mapped to Uint16
    const testAngles = [0, Math.PI / 4, Math.PI / 2, Math.PI, (3 * Math.PI) / 2, Math.PI * 1.99];
    for (const a of testAngles) {
      const u16 = angleToUint16(a);
      const restored = uint16ToAngle(u16);
      expect(restored).toBeCloseTo(a, 3);
    }
  });

  it('strictly enforces 28-byte vessel record layout and 12-byte snapshot header', () => {
    expect(SNAPSHOT_HEADER_BYTES).toBe(12);
    expect(VESSEL_SNAPSHOT_BYTES).toBe(28);

    const testVessel: VesselSnapshotRecord = {
      vesselId: 1042,
      posX: 145.2,
      posY: -320.6,
      heading: 1.25,
      speedKnots: 28,
      hullHpPct: 85,
      flags: VesselStatusFlag.CAVITATING | VesselStatusFlag.FIRING,
      depth: 1, // PERISCOPE
      mountAngles: [0.2, 0.4, 3.14, 1.57],
      velX: 12.5,
      velY: -4.2,
      fleetId: 3,
      targetId: 99,
    };

    const snapshot: SnapshotPacket = {
      opcode: Opcode.OP_SNAPSHOT,
      flags: 0,
      serverTick: 12045,
      ackSequence: 412,
      entityCount: 1,
      worldTimeSeconds: 602,
      vessels: [testVessel],
    };

    const buffer = serializeSnapshot(snapshot);
    expect(buffer.byteLength).toBe(12 + 28); // 40 bytes total

    const view = new DataView(buffer);
    // Header layout
    expect(view.getUint8(0)).toBe(Opcode.OP_SNAPSHOT);
    expect(view.getUint8(1)).toBe(0);
    expect(view.getUint32(2, true)).toBe(12045);
    expect(view.getUint16(6, true)).toBe(412);
    expect(view.getUint16(8, true)).toBe(1);
    expect(view.getUint16(10, true)).toBe(602);

    // Vessel record layout (offset 12..39)
    expect(view.getUint16(12, true)).toBe(1042);
    expect(fixedToCoord(view.getInt16(14, true))).toBeCloseTo(145.2, 1);
    expect(fixedToCoord(view.getInt16(16, true))).toBeCloseTo(-320.6, 1);
    expect(uint16ToAngle(view.getUint16(18, true))).toBeCloseTo(1.25, 3);
    expect(view.getUint8(20)).toBe(28); // speedKnots
    expect(view.getUint8(21)).toBe(85); // hullHpPct
    expect(view.getUint8(22)).toBe(VesselStatusFlag.CAVITATING | VesselStatusFlag.FIRING);
    expect(view.getUint8(23)).toBe(1); // depth
    expect(uint16ToAngle(view.getUint16(24, true))).toBeCloseTo(0.2, 3);
    expect(uint16ToAngle(view.getUint16(26, true))).toBeCloseTo(0.4, 3);
    expect(uint16ToAngle(view.getUint16(28, true))).toBeCloseTo(3.14, 3);
    expect(uint16ToAngle(view.getUint16(30, true))).toBeCloseTo(1.57, 3);
    expect(fixedToVel(view.getInt16(32, true))).toBeCloseTo(12.5, 2);
    expect(fixedToVel(view.getInt16(34, true))).toBeCloseTo(-4.2, 2);
    expect(view.getUint16(36, true)).toBe(3); // fleetId
    expect(view.getUint16(38, true)).toBe(99); // targetId

    // Deserialization round-trip
    const deserialized = deserializeSnapshot(buffer);
    expect(deserialized.opcode).toBe(Opcode.OP_SNAPSHOT);
    expect(deserialized.serverTick).toBe(12045);
    expect(deserialized.ackSequence).toBe(412);
    expect(deserialized.entityCount).toBe(1);
    expect(deserialized.worldTimeSeconds).toBe(602);

    const v = deserialized.vessels[0];
    expect(v.vesselId).toBe(1042);
    expect(v.posX).toBeCloseTo(145.2, 1);
    expect(v.posY).toBeCloseTo(-320.6, 1);
    expect(v.heading).toBeCloseTo(1.25, 3);
    expect(v.speedKnots).toBe(28);
    expect(v.hullHpPct).toBe(85);
    expect(v.flags).toBe(VesselStatusFlag.CAVITATING | VesselStatusFlag.FIRING);
    expect(v.depth).toBe(1);
    expect(v.mountAngles[0]).toBeCloseTo(0.2, 3);
    expect(v.mountAngles[1]).toBeCloseTo(0.4, 3);
    expect(v.mountAngles[2]).toBeCloseTo(3.14, 3);
    expect(v.mountAngles[3]).toBeCloseTo(1.57, 3);
    expect(v.velX).toBeCloseTo(12.5, 2);
    expect(v.velY).toBeCloseTo(-4.2, 2);
    expect(v.fleetId).toBe(3);
    expect(v.targetId).toBe(99);
  });

  it('correctly serializes multiple vessels into a single snapshot frame', () => {
    const vessels: VesselSnapshotRecord[] = [];
    for (let i = 0; i < 15; i++) {
      vessels.push({
        vesselId: 100 + i,
        posX: i * 20 - 150,
        posY: i * -15 + 80,
        heading: (i * 0.4) % (2 * Math.PI),
        speedKnots: 10 + i,
        hullHpPct: 100 - i * 3,
        flags: i % 2 === 0 ? VesselStatusFlag.STEALTH_ACTIVE : VesselStatusFlag.ECM_ACTIVE,
        depth: (i % 3) as 0 | 1 | 2,
        mountAngles: [0, 0.5, 1.0, 1.5],
        velX: 5.5,
        velY: 2.2,
        fleetId: i % 4,
        targetId: 200 + i,
      });
    }

    const packet: SnapshotPacket = {
      opcode: Opcode.OP_SNAPSHOT,
      flags: 1,
      serverTick: 500,
      ackSequence: 250,
      entityCount: vessels.length,
      worldTimeSeconds: 25,
      vessels,
    };

    const encoded = encodePacket(packet);
    expect(encoded.byteLength).toBe(12 + 15 * 28); // 432 bytes

    const decoded = decodePacket(encoded) as SnapshotPacket;
    expect(decoded.opcode).toBe(Opcode.OP_SNAPSHOT);
    expect(decoded.entityCount).toBe(15);
    expect(decoded.vessels.length).toBe(15);

    for (let i = 0; i < 15; i++) {
      expect(decoded.vessels[i].vesselId).toBe(100 + i);
      expect(decoded.vessels[i].posX).toBeCloseTo(vessels[i].posX, 1);
      expect(decoded.vessels[i].speedKnots).toBe(vessels[i].speedKnots);
      expect(decoded.vessels[i].flags).toBe(vessels[i].flags);
      expect(decoded.vessels[i].depth).toBe(vessels[i].depth);
    }
  });

  it('serializes and deserializes OP_INPUT (0x02) at exactly 14 bytes', () => {
    const input: InputPacket = {
      opcode: Opcode.OP_INPUT,
      sequence: 98765,
      thrust: 80,
      rudder: -45,
      depthTarget: 2, // DEEP
      weaponFireMask: InputControlFlag.FIRE_PRIMARY | InputControlFlag.FIRE_TORPEDO,
      targetX: 250.5,
      targetY: -180.2,
    };

    const encoded = encodePacket(input);
    expect(encoded.byteLength).toBe(14);
    expect(getPacketOpcode(encoded)).toBe(Opcode.OP_INPUT);

    const decoded = decodePacket(encoded) as InputPacket;
    expect(decoded.opcode).toBe(Opcode.OP_INPUT);
    expect(decoded.sequence).toBe(98765);
    expect(decoded.thrust).toBe(80);
    expect(decoded.rudder).toBe(-45);
    expect(decoded.depthTarget).toBe(2);
    expect(decoded.weaponFireMask).toBe(InputControlFlag.FIRE_PRIMARY | InputControlFlag.FIRE_TORPEDO);
    expect(decoded.targetX).toBeCloseTo(250.5, 1);
    expect(decoded.targetY).toBeCloseTo(-180.2, 1);
  });

  it('serializes and deserializes OP_EVENT (0x03) at exactly 10 bytes', () => {
    const event: EventPacket = {
      opcode: Opcode.OP_EVENT,
      eventType: GameEventType.CRATE_COLLECT,
      sourceId: 105,
      targetId: 402,
      data: 250, // XP earned
    };

    const encoded = encodePacket(event);
    expect(encoded.byteLength).toBe(10);
    expect(getPacketOpcode(encoded)).toBe(Opcode.OP_EVENT);

    const decoded = decodePacket(encoded) as EventPacket;
    expect(decoded.opcode).toBe(Opcode.OP_EVENT);
    expect(decoded.eventType).toBe(GameEventType.CRATE_COLLECT);
    expect(decoded.sourceId).toBe(105);
    expect(decoded.targetId).toBe(402);
    expect(decoded.data).toBe(250);
  });

  it('serializes and deserializes OP_SPAWN_REQ (0x04) at exactly 7 bytes', () => {
    const req: SpawnReqPacket = {
      opcode: Opcode.OP_SPAWN_REQ,
      shipClassId: 4, // Battleship
      camoId: 2,      // Arctic Splinter
      loadoutMask: 0x00ff0011,
    };

    const encoded = encodePacket(req);
    expect(encoded.byteLength).toBe(7);
    expect(getPacketOpcode(encoded)).toBe(Opcode.OP_SPAWN_REQ);

    const decoded = decodePacket(encoded) as SpawnReqPacket;
    expect(decoded.opcode).toBe(Opcode.OP_SPAWN_REQ);
    expect(decoded.shipClassId).toBe(4);
    expect(decoded.camoId).toBe(2);
    expect(decoded.loadoutMask).toBe(0x00ff0011);
  });

  it('serializes and deserializes OP_FLEET_ACTION (0x05) at exactly 4 bytes', () => {
    const action: FleetActionPacket = {
      opcode: Opcode.OP_FLEET_ACTION,
      action: FleetActionType.INVITE,
      targetId: 1045,
    };

    const encoded = encodePacket(action);
    expect(encoded.byteLength).toBe(4);
    expect(getPacketOpcode(encoded)).toBe(Opcode.OP_FLEET_ACTION);

    const decoded = decodePacket(encoded) as FleetActionPacket;
    expect(decoded.opcode).toBe(Opcode.OP_FLEET_ACTION);
    expect(decoded.action).toBe(FleetActionType.INVITE);
    expect(decoded.targetId).toBe(1045);
  });

  it('serializes and deserializes OP_DUEL_ACTION (0x06) at exactly 4 bytes', () => {
    const duel: DuelActionPacket = {
      opcode: Opcode.OP_DUEL_ACTION,
      action: DuelActionType.CHALLENGE,
      targetPlayerId: 778,
    };

    const encoded = encodePacket(duel);
    expect(encoded.byteLength).toBe(4);
    expect(getPacketOpcode(encoded)).toBe(Opcode.OP_DUEL_ACTION);

    const decoded = decodePacket(encoded) as DuelActionPacket;
    expect(decoded.opcode).toBe(Opcode.OP_DUEL_ACTION);
    expect(decoded.action).toBe(DuelActionType.CHALLENGE);
    expect(decoded.targetPlayerId).toBe(778);
  });

  it('serializes and deserializes OP_LOADOUT_SAVE (0x07) at exactly 14 bytes', () => {
    const loadout: LoadoutSavePacket = {
      opcode: Opcode.OP_LOADOUT_SAVE,
      shipId: 12,
      slotIndices: [0, 1, 2, 3],
      moduleIds: [101, 204, 305, 410],
    };

    const encoded = encodePacket(loadout);
    expect(encoded.byteLength).toBe(14);
    expect(getPacketOpcode(encoded)).toBe(Opcode.OP_LOADOUT_SAVE);

    const decoded = decodePacket(encoded) as LoadoutSavePacket;
    expect(decoded.opcode).toBe(Opcode.OP_LOADOUT_SAVE);
    expect(decoded.shipId).toBe(12);
    expect(decoded.slotIndices).toEqual([0, 1, 2, 3]);
    expect(decoded.moduleIds).toEqual([101, 204, 305, 410]);
  });

  it('serializes and deserializes OP_CHAT (0x08) at exactly 82 bytes', () => {
    const chat: ChatPacket = {
      opcode: Opcode.OP_CHAT,
      channel: ChatChannel.FLEET,
      senderName: 'Admiral_Nelson',
      message: 'Engage enemy carrier group at quadrant B-4!',
    };

    const encoded = encodePacket(chat);
    expect(encoded.byteLength).toBe(82);
    expect(getPacketOpcode(encoded)).toBe(Opcode.OP_CHAT);

    const decoded = decodePacket(encoded) as ChatPacket;
    expect(decoded.opcode).toBe(Opcode.OP_CHAT);
    expect(decoded.channel).toBe(ChatChannel.FLEET);
    expect(decoded.senderName).toBe('Admiral_Nelson');
    expect(decoded.message).toBe('Engage enemy carrier group at quadrant B-4!');
  });

  it('throws descriptive error on malformed or invalid opcode', () => {
    const corruptBuffer = new Uint8Array([0xff, 0x01, 0x02]);
    expect(() => decodePacket(corruptBuffer)).toThrow(/Unknown opcode/);

    const emptyBuffer = new Uint8Array([]);
    expect(() => getPacketOpcode(emptyBuffer)).toThrow(/Buffer too small/);
  });
});
