/**
 * Authoritative Binary WebSocket Server (15-20 Hz)
 * Clean-Room implementation for NavalCommand.io (Milestone M4)
 *
 * Uses `ws` WebSocketServer to broadcast 28-byte binary vessel snapshots (`ArrayBuffer`)
 * and process binary client inputs, spawns, fleet actions, 1v1 duels, loadouts, and chat.
 */

import { WebSocketServer, WebSocket } from 'ws';
import { AuthoritativeGameServer, ServerVessel } from '../core/game_server.js';
import { BotController } from '../ai/bot_controller.js';
import { TechTreeService } from '../progression/tech_tree_service.js';
import { LoadoutValidator } from '../progression/loadout_validator.js';
import { getAllShipDefs } from '../../common/models/ships.js';
import {
  Opcode,
  FleetActionType,
} from '../../common/protocol/packet_types.js';
import {
  serializeSnapshot,
  serializeEvent,
  deserializeInput,
  deserializeSpawnReq,
  deserializeFleetAction,
  deserializeDuelAction,
  deserializeLoadoutSave,
  deserializeChat,
  serializeChat,
} from '../../common/protocol/serializer.js';

export interface ClientSession {
  ws: WebSocket;
  playerId: string;
  vesselId: number;
  lastAckSequence: number;
}

export class NavalWebSocketServer {
  public readonly gameServer: AuthoritativeGameServer;
  public readonly botController: BotController;
  public readonly techTree: TechTreeService;
  public readonly loadoutValidator: LoadoutValidator;
  private wss: WebSocketServer | null = null;
  private sessions: Map<WebSocket, ClientSession> = new Map();
  private port: number;
  private nextClientSeq = 1;

  constructor(port = 8080, tickRate = 20, botCount = 10) {
    this.port = port;
    this.gameServer = new AuthoritativeGameServer(tickRate);
    this.botController = new BotController(this.gameServer);
    this.techTree = new TechTreeService();
    this.loadoutValidator = new LoadoutValidator(this.techTree);

    // Spawn initial AI bots across diverse naval classes
    const allShips = getAllShipDefs();
    for (let i = 0; i < botCount; i++) {
      const botShip = allShips[i % allShips.length];
      const angle = (i / Math.max(1, botCount)) * Math.PI * 2;
      const dist = 1350 + (i % 4) * 280;
      const vessel = this.gameServer.spawnVessel({
        name: `Bot_${botShip.name.split(' ')[0]}_${i + 1}`,
        shipId: botShip.id,
        position: { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist },
        heading: angle + Math.PI,
        isBot: true,
        teamId: (i % 2) + 1,
      });
      this.botController.registerBot(vessel.id);
    }

    // Hook tick callback to update AI bots and broadcast binary snapshots
    this.gameServer.gameLoop.onTick((_tick, dt) => {
      this.botController.update(dt);
      this.broadcastWorldSnapshot();
    });
  }

  public start(): Promise<number> {
    return new Promise((resolve) => {
      this.wss = new WebSocketServer({ port: this.port }, () => {
        const address = this.wss?.address();
        const boundPort = typeof address === 'object' && address ? address.port : this.port;
        this.port = boundPort;
        this.gameServer.start();
        resolve(boundPort);
      });

      this.wss.on('connection', (ws: WebSocket) => {
        this.handleConnection(ws);
      });
    });
  }

  public stop(): Promise<void> {
    this.gameServer.stop();
    for (const session of this.sessions.values()) {
      try {
        session.ws.close();
      } catch {
        // Ignore close errors
      }
    }
    this.sessions.clear();

    return new Promise((resolve) => {
      if (!this.wss) {
        resolve();
        return;
      }
      this.wss.close(() => {
        this.wss = null;
        resolve();
      });
    });
  }

  public getPort(): number {
    return this.port;
  }

  public getSessionCount(): number {
    return this.sessions.size;
  }

  private handleConnection(ws: WebSocket): void {
    const clientNum = this.nextClientSeq++;
    const playerId = `player_${clientNum}`;
    const vessel = this.gameServer.spawnVessel({
      name: `Capt_${clientNum}`,
      shipId: 'fletcher_dd',
      isBot: false,
    });

    const session: ClientSession = {
      ws,
      playerId,
      vesselId: vessel.id,
      lastAckSequence: 0,
    };
    this.sessions.set(ws, session);

    // Send initial binary snapshot immediately on connect
    const initialSnap = this.gameServer.createSnapshotPacket(0);
    const snapBuf = serializeSnapshot(initialSnap);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(snapBuf);
    }

    ws.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
      let arrayBuffer: ArrayBuffer;
      if (data instanceof ArrayBuffer) {
        arrayBuffer = data;
      } else if (Buffer.isBuffer(data)) {
        const copy = new Uint8Array(data.byteLength);
        copy.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
        arrayBuffer = copy.buffer;
      } else {
        return;
      }
      this.handleBinaryPacket(session, arrayBuffer);
    });

    ws.on('close', () => {
      this.gameServer.despawnVessel(session.vesselId);
      this.sessions.delete(ws);
    });
  }

  public handleBinaryPacket(session: ClientSession, buffer: ArrayBuffer): void {
    if (buffer.byteLength < 1) return;
    const view = new DataView(buffer);
    const opcode = view.getUint8(0);

    switch (opcode) {
      case Opcode.OP_INPUT: {
        if (buffer.byteLength >= 14) {
          const input = deserializeInput(view);
          session.lastAckSequence = input.sequence;
          this.gameServer.processInput(session.vesselId, input);
        }
        break;
      }
      case Opcode.OP_SPAWN_REQ: {
        if (buffer.byteLength >= 7) {
          const req = deserializeSpawnReq(view);
          const allShips = getAllShipDefs();
          const chosenShip = allShips[req.shipClassId % allShips.length] ?? allShips[0];
          this.gameServer.despawnVessel(session.vesselId);
          const applied = this.loadoutValidator.applyLoadoutToVessel(session.playerId, chosenShip.id);
          const newVessel = this.gameServer.spawnVessel({
            name: `Capt_${session.playerId}`,
            shipId: applied.shipDef.id,
            camoId: req.camoId,
            isBot: false,
          });
          newVessel.mounts = applied.mounts;
          session.vesselId = newVessel.id;
        }
        break;
      }
      case Opcode.OP_FLEET_ACTION: {
        if (buffer.byteLength >= 4) {
          const act = deserializeFleetAction(view);
          const v = this.gameServer.getVessel(session.vesselId);
          if (v) {
            if (act.action === FleetActionType.CREATE) {
              v.fleetId = session.vesselId;
            } else if (act.action === FleetActionType.JOIN) {
              v.fleetId = act.targetId;
            } else if (act.action === FleetActionType.LEAVE) {
              const oldFleet = v.fleetId;
              v.fleetId = 0;
              for (const other of this.gameServer.getAllVessels()) {
                if (other.id !== v.id && other.fleetId === oldFleet && oldFleet > 0) {
                  this.gameServer.setFleetNAP(v.id, other.id, 15.0);
                }
              }
            }
          }
        }
        break;
      }
      case Opcode.OP_DUEL_ACTION: {
        if (buffer.byteLength >= 4) {
          deserializeDuelAction(view);
        }
        break;
      }
      case Opcode.OP_LOADOUT_SAVE: {
        if (buffer.byteLength >= 14) {
          deserializeLoadoutSave(view);
        }
        break;
      }
      case Opcode.OP_CHAT: {
        if (buffer.byteLength >= 82) {
          const chat = deserializeChat(view);
          const outBuf = serializeChat(chat);
          for (const s of this.sessions.values()) {
            if (s.ws.readyState === WebSocket.OPEN) {
              s.ws.send(outBuf);
            }
          }
        }
        break;
      }
    }
  }

  /**
   * Broadcasts compact binary OP_SNAPSHOT (28 bytes/vessel) and queued OP_EVENT frames to all clients.
   */
  public broadcastWorldSnapshot(): void {
    const events = this.gameServer.drainQueuedEvents();
    const eventBuffers = events.map(ev => serializeEvent(ev));

    for (const session of this.sessions.values()) {
      if (session.ws.readyState !== WebSocket.OPEN) continue;

      const snapshotPacket = this.gameServer.createSnapshotPacket(session.lastAckSequence);
      const binaryFrame = serializeSnapshot(snapshotPacket);
      session.ws.send(binaryFrame);

      for (const evBuf of eventBuffers) {
        session.ws.send(evBuf);
      }
    }
  }
}
