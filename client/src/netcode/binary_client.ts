/**
 * High-Performance Binary WebSocket Client
 * Clean-Room implementation for NavalCommand.io
 * Uses canonical 28-byte vessel snapshot protocol from common/protocol/serializer.ts
 */

import {
  Opcode,
  VesselStatusFlag,
  InputControlFlag,
  SnapshotPacket,
  EventPacket,
} from '../../../common/protocol/packet_types.js';
import {
  deserializeSnapshot,
  serializeInput,
  serializeSpawnReq,
  deserializeEvent,
} from '../../../common/protocol/serializer.js';

export const OP_SERVER_SNAPSHOT = Opcode.OP_SNAPSHOT;
export const OP_CLIENT_INPUT = Opcode.OP_INPUT;
export const OP_GAME_EVENT = Opcode.OP_EVENT;
export const OP_SPAWN_REQ = Opcode.OP_SPAWN_REQ;

export interface EntitySnapshot {
  entityId: number;
  hullTypeId: number;
  depthState: number; // 0 = SURFACE, 1 = PERISCOPE, 2 = DEEP
  x: number;          // meters
  y: number;          // meters
  vx: number;         // m/s
  vy: number;         // m/s
  heading: number;    // radians
  turretAngle: number;// radians
  currentHealth: number;
  maxHealth: number;
  statusBitflags: number;
  karmaScore: number;
  fleetId: number;
  isCavitating: boolean;
  isFiring: boolean;
  ecmActive: boolean;
  sonarActive: boolean;
  nonAggressionTimer: boolean;
}

export interface WorldSnapshot {
  serverTick: number;
  ackInputSequence: number;
  worldTimeSeconds: number;
  timestamp: number;
  entities: EntitySnapshot[];
}

export interface ClientInputData {
  sequence: number;
  steer: number;     // -1.0 to 1.0
  throttle: number;  // -1.0 to 1.0
  aimAngleRad: number;
  targetDistance: number;
  targetX?: number;
  targetY?: number;
  depthTarget?: number;
  firePrimary: boolean;
  fireSecondary: boolean;
  fireTorpedo: boolean;
  fireMissile: boolean;
  diveToggle: boolean;
  stealthToggle: boolean;
  ecmToggle: boolean;
  activeSonar: boolean;
}

export type SnapshotCallback = (snapshot: WorldSnapshot) => void;
export type EventCallback = (event: EventPacket) => void;
export type SpawnCallback = (entityId: number, startX: number, startY: number) => void;

export class BinaryClient {
  private ws: WebSocket | null = null;
  private url: string = '';
  private isConnected: boolean = false;
  private onSnapshotCb: SnapshotCallback | null = null;
  private onEventCb: EventCallback | null = null;
  private onSpawnCb: SpawnCallback | null = null;

  public pingMs: number = 0;

  constructor() {}

  public connect(url: string): Promise<boolean> {
    this.url = url;
    return new Promise((resolve) => {
      try {
        if (typeof WebSocket === 'undefined') {
          resolve(false);
          return;
        }

        this.ws = new WebSocket(url);
        this.ws.binaryType = 'arraybuffer';

        this.ws.onopen = () => {
          this.isConnected = true;
          resolve(true);
        };

        this.ws.onclose = () => {
          this.isConnected = false;
        };

        this.ws.onerror = () => {
          this.isConnected = false;
          resolve(false);
        };

        this.ws.onmessage = (event: MessageEvent) => {
          if (event.data instanceof ArrayBuffer) {
            this.handleBinaryMessage(event.data);
          }
        };
      } catch {
        this.isConnected = false;
        resolve(false);
      }
    });
  }

  public onSnapshot(cb: SnapshotCallback): void {
    this.onSnapshotCb = cb;
  }

  public onEvent(cb: EventCallback): void {
    this.onEventCb = cb;
  }

  public onSpawn(cb: SpawnCallback): void {
    this.onSpawnCb = cb;
  }

  /**
   * Serialize and transmit 14-byte OP_INPUT packet via common serializer.
   */
  public sendInput(input: ClientInputData): ArrayBuffer {
    let weaponFireMask = 0;
    if (input.firePrimary) weaponFireMask |= InputControlFlag.FIRE_PRIMARY;
    if (input.fireSecondary) weaponFireMask |= InputControlFlag.FIRE_SECONDARY;
    if (input.fireTorpedo) weaponFireMask |= InputControlFlag.FIRE_TORPEDO;
    if (input.fireMissile) weaponFireMask |= InputControlFlag.FIRE_MISSILE;
    if (input.diveToggle) weaponFireMask |= InputControlFlag.DIVE_TOGGLE;
    if (input.stealthToggle) weaponFireMask |= InputControlFlag.STEALTH_TOGGLE;
    if (input.ecmToggle) weaponFireMask |= InputControlFlag.ECM_TOGGLE;
    if (input.activeSonar) weaponFireMask |= InputControlFlag.SONAR_PING;

    const targetX = input.targetX ?? Math.cos(input.aimAngleRad) * input.targetDistance;
    const targetY = input.targetY ?? Math.sin(input.aimAngleRad) * input.targetDistance;

    const buffer = serializeInput({
      opcode: Opcode.OP_INPUT,
      sequence: input.sequence,
      thrust: Math.round(Math.max(-1, Math.min(1, input.throttle)) * 100),
      rudder: Math.round(Math.max(-1, Math.min(1, input.steer)) * 100),
      depthTarget: input.depthTarget ?? 0,
      weaponFireMask,
      targetX,
      targetY,
    });

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(buffer);
    }
    return buffer;
  }

  /**
   * Send spawn request (OP_SPAWN_REQ = 0x04)
   */
  public sendSpawnRequest(shipClassIndex: number, camoIndex: number, loadoutMask: number = 0): ArrayBuffer {
    const buffer = serializeSpawnReq({
      opcode: Opcode.OP_SPAWN_REQ,
      shipClassId: shipClassIndex,
      camoId: camoIndex,
      loadoutMask,
    });

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(buffer);
    }
    return buffer;
  }

  /**
   * Parse incoming binary frames according to 1-byte opcode.
   */
  public handleBinaryMessage(buffer: ArrayBuffer): void {
    if (buffer.byteLength < 1) return;
    const view = new DataView(buffer);
    const opcode = view.getUint8(0);

    if (opcode === Opcode.OP_SNAPSHOT) {
      this.parseServerSnapshot(view);
    } else if (opcode === Opcode.OP_EVENT && buffer.byteLength >= 10) {
      const ev = deserializeEvent(view);
      if (this.onEventCb) this.onEventCb(ev);
    }
  }

  /**
   * Parse 28-byte entity records from authoritative snapshot packet.
   */
  public parseServerSnapshot(viewOrBuffer: DataView | ArrayBuffer): WorldSnapshot | null {
    const view = viewOrBuffer instanceof DataView ? viewOrBuffer : new DataView(viewOrBuffer);
    if (view.byteLength < 12) return null;

    const packet: SnapshotPacket = deserializeSnapshot(view);
    const entities: EntitySnapshot[] = packet.vessels.map((v) => ({
      entityId: v.vesselId,
      hullTypeId: 0,
      depthState: v.depth,
      x: v.posX,
      y: v.posY,
      vx: v.velX,
      vy: v.velY,
      heading: v.heading,
      turretAngle: v.mountAngles[0] ?? 0,
      currentHealth: v.hullHpPct,
      maxHealth: 100,
      statusBitflags: v.flags,
      karmaScore: 100,
      fleetId: v.fleetId,
      isCavitating: (v.flags & VesselStatusFlag.CAVITATING) !== 0,
      isFiring: (v.flags & VesselStatusFlag.FIRING) !== 0,
      ecmActive: (v.flags & VesselStatusFlag.ECM_ACTIVE) !== 0,
      sonarActive: (v.flags & VesselStatusFlag.SONAR_ACTIVE) !== 0,
      nonAggressionTimer: (v.flags & VesselStatusFlag.NAP_ACTIVE) !== 0,
    }));

    const snapshot: WorldSnapshot = {
      serverTick: packet.serverTick,
      ackInputSequence: packet.ackSequence,
      worldTimeSeconds: packet.worldTimeSeconds,
      timestamp: performance.now(),
      entities,
    };

    if (this.onSnapshotCb) {
      this.onSnapshotCb(snapshot);
    }

    return snapshot;
  }

  public disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
    }
  }

  public get connected(): boolean {
    return this.isConnected;
  }
}
