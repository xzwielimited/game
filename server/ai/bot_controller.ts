/**
 * Autonomous AI Bot Controller with 5-Whisker Island Avoidance
 * Clean-Room implementation for NavalCommand.io
 */

import { Vector2D, vec2, vec2Distance, shortestAngleDiff, normalizeAngle, degToRad } from '../../common/math/vector2.js';
import { isPointInsidePolygon } from '../../common/math/polygon.js';
import { AuthoritativeGameServer, ServerVessel } from '../core/game_server.js';
import { commandDepthState, toggleStealthMode } from '../../common/simulation/hydrodynamics.js';
import { canMountFire } from '../../common/models/weapons.js';
import { XpCrate, OilRig } from '../../common/models/terrain.js';

export interface WhiskerSensor {
  angleOffsetRad: number;
  length: number;
}

export class BotController {
  private server: AuthoritativeGameServer;
  private botIds: Set<number> = new Set();

  // 5-Whisker sensor configuration
  private whiskers: WhiskerSensor[] = [
    { angleOffsetRad: 0, length: 140 },              // Center
    { angleOffsetRad: degToRad(-25), length: 110 },   // Left shallow
    { angleOffsetRad: degToRad(25), length: 110 },    // Right shallow
    { angleOffsetRad: degToRad(-60), length: 75 },    // Left wide
    { angleOffsetRad: degToRad(60), length: 75 },     // Right wide
  ];

  constructor(server: AuthoritativeGameServer) {
    this.server = server;
  }

  public registerBot(vesselId: number): void {
    this.botIds.add(vesselId);
  }

  public unregisterBot(vesselId: number): void {
    this.botIds.delete(vesselId);
  }

  public getBotCount(): number {
    return this.botIds.size;
  }

  /**
   * Casts a single sensor whisker and returns distance to first island obstacle (or Infinity).
   */
  public castWhisker(
    botPos: Vector2D,
    heading: number,
    whisker: WhiskerSensor
  ): number {
    const rayAngle = normalizeAngle(heading + whisker.angleOffsetRad);
    const cosA = Math.cos(rayAngle);
    const sinA = Math.sin(rayAngle);

    const islands = this.server.getIslands();
    const samples = 6;
    const step = whisker.length / samples;

    for (let i = 1; i <= samples; i++) {
      const dist = i * step;
      const testPoint: Vector2D = {
        x: botPos.x + cosA * dist,
        y: botPos.y + sinA * dist,
      };

      for (const island of islands) {
        if (isPointInsidePolygon(testPoint, island.polygon)) {
          return dist;
        }
      }
    }

    return Number.POSITIVE_INFINITY;
  }

  /**
   * Main AI decision tick for all registered bots.
   */
  public update(dt: number): void {
    for (const botId of this.botIds) {
      const bot = this.server.getVessel(botId);
      if (!bot || bot.physics.isDestroyed) continue;

      this.stepBotBehavior(bot, dt);
    }
  }

  private stepBotBehavior(bot: ServerVessel, dt: number): void {
    const pos = bot.physics.position;
    const heading = bot.physics.heading;

    // 1. 5-Whisker Obstacle & Island Avoidance
    const whiskerDistances = this.whiskers.map(w => this.castWhisker(pos, heading, w));
    const distCenter = whiskerDistances[0];
    const distLeftShallow = whiskerDistances[1];
    const distRightShallow = whiskerDistances[2];
    const distLeftWide = whiskerDistances[3];
    const distRightWide = whiskerDistances[4];

    let avoidanceRudder: number | null = null;
    let avoidanceThrottle: number | null = null;

    const hasObstacle = whiskerDistances.some(d => Number.isFinite(d));

    if (hasObstacle) {
      if (Number.isFinite(distCenter) && distCenter < 40) {
        // Critical danger: reverse thrust and hard turn
        avoidanceThrottle = -0.5;
        avoidanceRudder = distLeftShallow > distRightShallow ? -1.0 : 1.0;
      } else if (Number.isFinite(distCenter)) {
        // Obstacle directly ahead: turn toward side with greater clearance
        const leftClearance = Math.min(distLeftShallow, distLeftWide);
        const rightClearance = Math.min(distRightShallow, distRightWide);
        avoidanceRudder = leftClearance > rightClearance ? -1.0 : 1.0;
        avoidanceThrottle = 0.5;
      } else if (Number.isFinite(distLeftShallow) || Number.isFinite(distLeftWide)) {
        // Obstacle on left: steer right
        avoidanceRudder = 0.8;
      } else if (Number.isFinite(distRightShallow) || Number.isFinite(distRightWide)) {
        // Obstacle on right: steer left
        avoidanceRudder = -0.8;
      }
    }

    // 2. Tactical Depth Switching (Submarine Bots)
    if (bot.shipDef.canSubmerge) {
      const isDamaged = bot.physics.hullHp < bot.shipDef.maxHp * 0.45;
      if (isDamaged && bot.physics.depthState !== 'DEEP') {
        // Dive deep to evade damage
        commandDepthState(bot.shipDef, bot.physics, 'DEEP');
      } else if (!isDamaged && bot.physics.depthState === 'DEEP') {
        // Surface back to periscope for offensive capabilities
        commandDepthState(bot.shipDef, bot.physics, 'PERISCOPE');
      }

      // Activate stealth cruise when sneaking up
      if (bot.physics.depthState !== 'SURFACE' && !bot.physics.stealthModeActive) {
        toggleStealthMode(bot.shipDef, bot.physics, true);
      }
    }

    // 3. Goal Selection: Crates vs Oil Rigs vs Combat Targets
    let targetHeading: number | null = null;

    // Check nearest XP crate if injured or low level
    const nearbyCrates = this.server.resourceEngine.getAllCrates().filter(c => !c.isCollected);
    let nearestCrate: XpCrate | null = null;
    let minCrateDist = 600;

    for (const crate of nearbyCrates) {
      const d = vec2Distance(pos, crate.position);
      if (d < minCrateDist) {
        minCrateDist = d;
        nearestCrate = crate;
      }
    }

    // Check nearest Oil Rig
    const oilRigs = this.server.resourceEngine.getAllOilRigs().filter(r => !r.isDestroyed);
    let nearestRig: OilRig | null = null;
    let minRigDist = 2500;

    for (const rig of oilRigs) {
      // Check if neutral or owned by rival
      const isRivalRig = rig.controlState !== 'CONTROLLED' || rig.controllingFactionId !== String(bot.fleetId || bot.id);
      if (isRivalRig) {
        const d = vec2Distance(pos, rig.position);
        if (d < minRigDist) {
          minRigDist = d;
          nearestRig = rig;
        }
      }
    }

    if (nearestCrate && (bot.physics.hullHp < bot.shipDef.maxHp * 0.8 || !nearestRig)) {
      // Prioritize crate
      const dx = nearestCrate.position.x - pos.x;
      const dy = nearestCrate.position.y - pos.y;
      targetHeading = Math.atan2(dy, dx);
    } else if (nearestRig) {
      // Head to oil rig to contest
      const dx = nearestRig.position.x - pos.x;
      const dy = nearestRig.position.y - pos.y;
      targetHeading = Math.atan2(dy, dx);
    }

    // 4. Combat Acquisition & Target Firing
    const allVessels = this.server.getAllVessels();
    let hostileTarget: ServerVessel | null = null;
    let minHostileDist = 1100;

    for (const other of allVessels) {
      if (other.id === bot.id || other.physics.isDestroyed || other.isSinking) continue;
      if (other.spawnShieldRemaining > 0 || !this.server.canDamage(bot.id, other.id)) continue;

      const d = vec2Distance(pos, other.physics.position);
      if (d < minHostileDist) {
        minHostileDist = d;
        hostileTarget = other;
      }
    }

    if (hostileTarget) {
      const hPos = hostileTarget.physics.position;
      const dx = hPos.x - pos.x;
      const dy = hPos.y - pos.y;
      const targetAngle = Math.atan2(dy, dx);

      // If engaged in combat and not fleeing island, maneuver relative to hostile
      if (!avoidanceRudder) {
        if (minHostileDist < 300) {
          // Broadside angle (90 deg to target)
          targetHeading = normalizeAngle(targetAngle + Math.PI / 2);
        } else {
          // Close in
          targetHeading = targetAngle;
        }
      }

      // Train turrets and fire
      for (let mountIdx = 0; mountIdx < bot.mounts.length; mountIdx++) {
        const mount = bot.mounts[mountIdx];
        if (canMountFire(mount)) {
          this.server.fireMount(bot.id, mountIdx, hPos);
        }
      }

      // Activate ECM if equipped and receiving fire
      if (bot.physics.hullHp < bot.shipDef.maxHp * 0.75) {
        this.server.activateECM(bot);
      }
    }

    // 5. Apply Steering & Propulsion
    if (avoidanceRudder !== null) {
      bot.physics.rudderAngle = avoidanceRudder;
      bot.physics.throttle = avoidanceThrottle ?? 0.8;
    } else if (targetHeading !== null) {
      const headingDiff = shortestAngleDiff(heading, targetHeading);
      bot.physics.rudderAngle = Math.max(-1.0, Math.min(1.0, headingDiff * 2.5));
      bot.physics.throttle = Math.abs(headingDiff) > 1.2 ? 0.4 : 1.0;
    } else {
      // Default patrol cruise
      bot.physics.rudderAngle = 0;
      bot.physics.throttle = 0.7;
    }
  }
}
