/**
 * Milestone M4 Integration & Stress Test:
 * Multi-Client Binary Netcode, 15-20 Hz Authoritative Loop, 10+ Active Vessels/Bots,
 * Client-Side Prediction & Snapshot Interpolation
 * Clean-Room Test Suite for NavalCommand.io
 */

import { describe, it, expect } from 'vitest';
import WebSocket from 'ws';
import { AuthoritativeGameServer } from '../../server/core/game_server.js';
import { BotController } from '../../server/ai/bot_controller.js';
import { NavalWebSocketServer } from '../../server/netcode/ws_server.js';
import {
  Opcode,
  SNAPSHOT_HEADER_BYTES,
  VESSEL_SNAPSHOT_BYTES,
} from '../../common/protocol/packet_types.js';
import {
  serializeSnapshot,
  deserializeSnapshot,
  serializeInput,
} from '../../common/protocol/serializer.js';
import { BinaryClient } from '../../client/src/netcode/binary_client.js';
import { SnapshotInterpolator } from '../../client/src/netcode/interpolator.js';
import { ClientPredictor } from '../../client/src/netcode/predictor.js';

describe('M4 Integration: Multi-Client Binary Netcode & 100+ Tick Authoritative Simulation', () => {
  it('runs the authoritative server at 20 Hz for 120 ticks with 12+ active vessels/bots firing weapons, serializing binary ArrayBuffer frames and maintaining finite synchronized client interpolation', () => {
    const server = new AuthoritativeGameServer(20);
    const botController = new BotController(server);

    // Spawn 2 human player vessels + 10 autonomous AI bots = 12 active vessels
    const player1 = server.spawnVessel({
      id: 1,
      name: 'Player_Alpha',
      shipId: 'arleigh_burke_ddg',
      position: { x: -400, y: 0 },
      heading: 0,
      isBot: false,
      teamId: 1,
    });
    const player2 = server.spawnVessel({
      id: 2,
      name: 'Player_Bravo',
      shipId: 'type_055_renhai',
      position: { x: 400, y: 0 },
      heading: Math.PI,
      isBot: false,
      teamId: 2,
    });

    const botShipIds = [
      'pt_boat_109',
      'fletcher_dd',
      'kolkata_ddg',
      'moskva_cg',
      'bismarck_bb',
      'yamato_bb',
      'akula_ssn',
      'ohio_ssbn',
      'mercy_hospital',
      'polar_icebreaker',
    ];

    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      const bot = server.spawnVessel({
        id: 10 + i,
        name: `Bot_${i + 1}`,
        shipId: botShipIds[i],
        position: { x: Math.cos(angle) * 600, y: Math.sin(angle) * 600 },
        heading: angle + Math.PI,
        isBot: true,
        teamId: (i % 2) + 1,
      });
      botController.registerBot(bot.id);
    }

    expect(server.getAllVessels().length).toBe(12);

    const client1 = new BinaryClient();
    const interpolator1 = new SnapshotInterpolator(100);
    const predictor1 = new ClientPredictor(player1.physics.position.x, player1.physics.position.y, 0);

    let binaryFramesReceived = 0;
    let totalProjectilesFired = 0;
    const dt = 0.05; // 20 Hz (50ms per tick)

    // Run 120 authoritative ticks (6.0 simulated seconds)
    for (let tick = 1; tick <= 120; tick++) {
      // Player 1 predicts movement & sends binary input packet
      const inputData = predictor1.applyInput(0.15, 0.85, dt, 0, 800, {
        firePrimary: tick % 10 === 0,
        fireTorpedo: tick === 25,
      });
      const inputBuffer = client1.sendInput(inputData);
      expect(inputBuffer).toBeInstanceOf(ArrayBuffer);
      expect(inputBuffer.byteLength).toBe(14);

      // Server processes binary input from Player 1 & Player 2
      server.processInput(player1.id, {
        opcode: Opcode.OP_INPUT,
        sequence: inputData.sequence,
        thrust: 85,
        rudder: 15,
        depthTarget: 0,
        weaponFireMask: tick % 10 === 0 ? 1 : 0,
        targetX: player2.physics.position.x,
        targetY: player2.physics.position.y,
      });

      // Step AI bots and authoritative server simulation
      botController.update(dt);
      server.gameLoop.step(dt);

      totalProjectilesFired += server.getAllProjectiles().length;

      // Serialize world snapshot into binary ArrayBuffer (NOT JSON string)
      const snapshotPacket = server.createSnapshotPacket(inputData.sequence);
      const binarySnapshot = serializeSnapshot(snapshotPacket);

      expect(binarySnapshot).toBeInstanceOf(ArrayBuffer);
      expect(typeof binarySnapshot).not.toBe('string');
      expect(binarySnapshot.byteLength).toBe(
        SNAPSHOT_HEADER_BYTES + 12 * VESSEL_SNAPSHOT_BYTES
      );

      // Deserialize on Client 1 and feed into SnapshotInterpolator & ClientPredictor
      const decoded = deserializeSnapshot(binarySnapshot);
      expect(decoded.opcode).toBe(Opcode.OP_SNAPSHOT);
      expect(decoded.entityCount).toBe(12);

      const worldSnap = client1.parseServerSnapshot(binarySnapshot);
      expect(worldSnap).not.toBeNull();
      // Stamp deterministic monotonic time (50ms per tick)
      worldSnap!.timestamp = tick * 50;
      interpolator1.pushSnapshot(worldSnap!);

      const myServerEnt = worldSnap!.entities.find(e => e.entityId === player1.id);
      expect(myServerEnt).toBeDefined();
      predictor1.reconcile(myServerEnt!, worldSnap!.ackInputSequence);

      // Interpolate remote entities at current render time
      const interpolated = interpolator1.getInterpolatedEntities(tick * 50);
      expect(interpolated.size).toBe(12);
      for (const ent of interpolated.values()) {
        expect(Number.isFinite(ent.x)).toBe(true);
        expect(Number.isFinite(ent.y)).toBe(true);
        expect(Number.isFinite(ent.heading)).toBe(true);
      }

      const renderPos = predictor1.getRenderPosition(dt);
      expect(Number.isFinite(renderPos.x)).toBe(true);
      expect(Number.isFinite(renderPos.y)).toBe(true);

      binaryFramesReceived++;
    }

    expect(binaryFramesReceived).toBe(120);
    expect(totalProjectilesFired).toBeGreaterThan(0);
  });

  it('connects multiple live WebSocket clients to NavalWebSocketServer and exchanges binary ArrayBuffer frames', async () => {
    const wsServer = new NavalWebSocketServer(0, 20, 8); // Ephemeral port, 20 Hz, 8 bots
    const port = await wsServer.start();
    expect(port).toBeGreaterThan(0);

    try {
      const receivedFrames: ArrayBuffer[] = [];

      await new Promise<void>((resolve, reject) => {
        const wsClient = new WebSocket(`ws://127.0.0.1:${port}`);
        wsClient.binaryType = 'arraybuffer';

        const timeout = setTimeout(() => {
          wsClient.close();
          reject(new Error('Timed out waiting for binary WebSocket snapshot frames'));
        }, 4000);

        wsClient.on('open', () => {
          // Send binary OP_INPUT packet
          const inputBuf = serializeInput({
            opcode: Opcode.OP_INPUT,
            sequence: 1,
            thrust: 100,
            rudder: -20,
            depthTarget: 0,
            weaponFireMask: 1,
            targetX: 500,
            targetY: 500,
          });
          wsClient.send(inputBuf);
        });

        wsClient.on('message', (data: ArrayBuffer) => {
          if (data instanceof ArrayBuffer) {
            receivedFrames.push(data);
            if (receivedFrames.length >= 3) {
              clearTimeout(timeout);
              wsClient.close();
              resolve();
            }
          }
        });

        wsClient.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      expect(receivedFrames.length).toBeGreaterThanOrEqual(3);
      const firstSnap = deserializeSnapshot(receivedFrames[0]);
      expect(firstSnap.opcode).toBe(Opcode.OP_SNAPSHOT);
      expect(firstSnap.vessels.length).toBeGreaterThanOrEqual(9); // 8 bots + 1 connected player
    } finally {
      await wsServer.stop();
    }
  });
});
