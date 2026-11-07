/**
 * Three Playable Game Modes Controller (FFA Sandbox, 15-Min KOTH/Convoy Escort, 1v1 Duel Arena)
 * Clean-Room implementation for NavalCommand.io (Milestone M3)
 *
 * Implements R3 Specifications:
 * 1. Free-For-All / Fleet Sandbox: Open-world progression from Tier 1 to Tier 10
 *    following balanced XP curves (630 XP for Tier 7, 940 XP for Tier 8, 1,430 XP for Tier 9).
 * 2. King of the Hill & Convoy Escort: Structured 15-minute (900s) team objective matches
 *    where two factions battle to control strategic maritime sectors or escort/intercept an Oil Tanker convoy.
 * 3. 1v1 Private Battle Arena: Direct duel challenge & acceptance, isolated arena teleportation
 *    while keeping global chat connected, bonus XP to winner, and return to original map coordinates.
 */

import { Vector2D, vec2Distance } from '../math/vector2.js';

export type GameModeId = 'FFA_SANDBOX' | 'KOTH_CONVOY' | 'DUEL_ARENA';

// Balanced Sandbox Tier XP Curve (R3 Specification: T7 = 630, T8 = 940, T9 = 1430)
export const SANDBOX_TIER_XP_THRESHOLDS: Record<number, number> = {
  1: 0,
  2: 60,
  3: 140,
  4: 250,
  5: 380,
  6: 500,
  7: 630,
  8: 940,
  9: 1430,
  10: 2100,
};

export function getSandboxTierForXp(xp: number): number {
  let highestTier = 1;
  for (let tier = 1; tier <= 10; tier++) {
    if (xp >= SANDBOX_TIER_XP_THRESHOLDS[tier]) {
      highestTier = tier;
    } else {
      break;
    }
  }
  return highestTier;
}

// ============================================================================
// MODE 2: 15-MINUTE KING OF THE HILL & CONVOY ESCORT
// ============================================================================

export type FactionTeam = 'BLUE_TASK_FORCE' | 'RED_ARMADA';

export interface KothSectorState {
  center: Vector2D;
  radiusMeters: number;
  controllingTeam: FactionTeam | 'NEUTRAL' | 'CONTESTED';
  captureProgress: number; // -100 (Red) to +100 (Blue)
}

export interface ConvoyTankerState {
  id: string;
  position: Vector2D;
  destination: Vector2D;
  speedMs: number;
  hullHp: number;
  maxHp: number;
  escortingTeam: FactionTeam;
  reachedDestination: boolean;
  isSunk: boolean;
}

export interface KothConvoyMatchState {
  matchDurationTotalSeconds: number;     // 900s (15 minutes)
  matchTimeRemainingSeconds: number;
  blueScore: number;
  redScore: number;
  scoreLimit: number;                    // 1000 points
  sector: KothSectorState;
  convoy: ConvoyTankerState;
  isCompleted: boolean;
  winner: FactionTeam | 'DRAW' | null;
}

// ============================================================================
// MODE 3: 1V1 PRIVATE BATTLE ARENA
// ============================================================================

export const ARENA_ISOLATED_CENTER: Vector2D = { x: 24000, y: 24000 };
export const ARENA_SPAWN_OFFSET_METERS = 350;
export const DUEL_WINNER_BONUS_XP = 350;

export interface DuelChallenge {
  challengeId: string;
  challengerId: string;
  targetId: string;
  createdAt: number;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'COMPLETED';
}

export interface ActiveDuelSession {
  duelId: string;
  player1Id: string;
  player2Id: string;
  player1SavedCoords: Vector2D;
  player2SavedCoords: Vector2D;
  player1ArenaCoords: Vector2D;
  player2ArenaCoords: Vector2D;
  globalChatConnected: boolean;
  elapsedSeconds: number;
  isCompleted: boolean;
  winnerId?: string;
}

export interface DuelPlayerRef {
  id: string;
  position: Vector2D;
  hullHp: number;
  maxHp: number;
  xp: number;
  inDuelArena: boolean;
}

export class GameModeController {
  public currentMode: GameModeId = 'FFA_SANDBOX';
  public kothMatch: KothConvoyMatchState;
  private challenges: Map<string, DuelChallenge> = new Map();
  private activeDuels: Map<string, ActiveDuelSession> = new Map();
  private globalChatLog: Array<{ sender: string; message: string; fromArena: boolean }> = [];
  private nextDuelSeq = 1;

  constructor() {
    this.kothMatch = this.createInitialKothConvoyState();
  }

  // --------------------------------------------------------------------------
  // 1. SANDBOX PROGRESSION
  // --------------------------------------------------------------------------
  public evaluateSandboxProgression(currentXp: number, addedXp: number): {
    newXp: number;
    previousTier: number;
    newTier: number;
    leveledUp: boolean;
  } {
    const previousTier = getSandboxTierForXp(currentXp);
    const newXp = currentXp + addedXp;
    const newTier = getSandboxTierForXp(newXp);
    return {
      newXp,
      previousTier,
      newTier,
      leveledUp: newTier > previousTier,
    };
  }

  // --------------------------------------------------------------------------
  // 2. 15-MINUTE KING OF THE HILL & CONVOY ESCORT
  // --------------------------------------------------------------------------
  public createInitialKothConvoyState(): KothConvoyMatchState {
    return {
      matchDurationTotalSeconds: 900.0, // 15 minutes
      matchTimeRemainingSeconds: 900.0,
      blueScore: 0,
      redScore: 0,
      scoreLimit: 1000,
      sector: {
        center: { x: 0, y: 0 },
        radiusMeters: 600,
        controllingTeam: 'NEUTRAL',
        captureProgress: 0,
      },
      convoy: {
        id: 'convoy_tanker_alpha',
        position: { x: -2000, y: 0 },
        destination: { x: 2000, y: 0 },
        speedMs: 8.0, // ~15.5 knots convoy speed
        hullHp: 8000,
        maxHp: 8000,
        escortingTeam: 'BLUE_TASK_FORCE',
        reachedDestination: false,
        isSunk: false,
      },
      isCompleted: false,
      winner: null,
    };
  }

  public startKothConvoyMatch(): KothConvoyMatchState {
    this.currentMode = 'KOTH_CONVOY';
    this.kothMatch = this.createInitialKothConvoyState();
    return this.kothMatch;
  }

  /**
   * Steps the 15-minute KOTH & Convoy Escort match clock, sector control, and convoy transit.
   */
  public stepKothConvoyMatch(
    dt: number,
    vessels: Array<{ id: string; team: FactionTeam; position: Vector2D; isDestroyed: boolean }>
  ): KothConvoyMatchState {
    const m = this.kothMatch;
    if (m.isCompleted) return m;

    m.matchTimeRemainingSeconds = Math.max(0, m.matchTimeRemainingSeconds - dt);

    // 1. Evaluate ships inside strategic KOTH sector
    let blueInSector = 0;
    let redInSector = 0;
    for (const v of vessels) {
      if (v.isDestroyed) continue;
      if (vec2Distance(v.position, m.sector.center) <= m.sector.radiusMeters) {
        if (v.team === 'BLUE_TASK_FORCE') blueInSector++;
        else if (v.team === 'RED_ARMADA') redInSector++;
      }
    }

    if (blueInSector > 0 && redInSector > 0) {
      m.sector.controllingTeam = 'CONTESTED';
    } else if (blueInSector > 0) {
      m.sector.captureProgress = Math.min(100, m.sector.captureProgress + 15 * dt);
      if (m.sector.captureProgress >= 100) {
        m.sector.controllingTeam = 'BLUE_TASK_FORCE';
      }
    } else if (redInSector > 0) {
      m.sector.captureProgress = Math.max(-100, m.sector.captureProgress - 15 * dt);
      if (m.sector.captureProgress <= -100) {
        m.sector.controllingTeam = 'RED_ARMADA';
      }
    }

    // Award sector control points (2.5 pts/sec)
    if (m.sector.controllingTeam === 'BLUE_TASK_FORCE') {
      m.blueScore += 2.5 * dt;
    } else if (m.sector.controllingTeam === 'RED_ARMADA') {
      m.redScore += 2.5 * dt;
    }

    // 2. Step Oil Tanker Convoy movement toward strait destination
    if (!m.convoy.isSunk && !m.convoy.reachedDestination) {
      if (m.convoy.hullHp <= 0) {
        m.convoy.isSunk = true;
        m.redScore += 350; // Red Armada intercept bonus!
      } else {
        const dx = m.convoy.destination.x - m.convoy.position.x;
        const dy = m.convoy.destination.y - m.convoy.position.y;
        const dist = Math.hypot(dx, dy);
        const stepDist = m.convoy.speedMs * dt;

        if (dist <= stepDist) {
          m.convoy.position = { ...m.convoy.destination };
          m.convoy.reachedDestination = true;
          m.blueScore += 400; // Blue Task Force convoy delivery bonus!
        } else {
          m.convoy.position.x += (dx / dist) * stepDist;
          m.convoy.position.y += (dy / dist) * stepDist;
        }
      }
    }

    // 3. Check match completion conditions
    if (m.blueScore >= m.scoreLimit) {
      m.isCompleted = true;
      m.winner = 'BLUE_TASK_FORCE';
    } else if (m.redScore >= m.scoreLimit) {
      m.isCompleted = true;
      m.winner = 'RED_ARMADA';
    } else if (m.matchTimeRemainingSeconds <= 0) {
      m.isCompleted = true;
      if (m.blueScore > m.redScore) m.winner = 'BLUE_TASK_FORCE';
      else if (m.redScore > m.blueScore) m.winner = 'RED_ARMADA';
      else m.winner = 'DRAW';
    }

    return m;
  }

  // --------------------------------------------------------------------------
  // 3. 1V1 PRIVATE BATTLE ARENA
  // --------------------------------------------------------------------------
  public sendDuelChallenge(challengerId: string, targetId: string): DuelChallenge {
    const challengeId = `duel_req_${this.nextDuelSeq++}`;
    const challenge: DuelChallenge = {
      challengeId,
      challengerId,
      targetId,
      createdAt: Date.now(),
      status: 'PENDING',
    };
    this.challenges.set(challengeId, challenge);
    return challenge;
  }

  /**
   * Accepts a 1v1 duel challenge, saves both players' original coordinates on the main map,
   * and teleports both into the isolated Battle Arena while keeping global chat connected.
   */
  public acceptDuelChallenge(
    challengeId: string,
    player1: DuelPlayerRef,
    player2: DuelPlayerRef
  ): ActiveDuelSession | null {
    const challenge = this.challenges.get(challengeId);
    if (!challenge || challenge.status !== 'PENDING') return null;

    challenge.status = 'ACCEPTED';

    const savedP1 = { ...player1.position };
    const savedP2 = { ...player2.position };

    const arenaP1: Vector2D = {
      x: ARENA_ISOLATED_CENTER.x - ARENA_SPAWN_OFFSET_METERS,
      y: ARENA_ISOLATED_CENTER.y,
    };
    const arenaP2: Vector2D = {
      x: ARENA_ISOLATED_CENTER.x + ARENA_SPAWN_OFFSET_METERS,
      y: ARENA_ISOLATED_CENTER.y,
    };

    // Teleport both players into isolated arena and restore full combat readiness
    player1.position = { ...arenaP1 };
    player2.position = { ...arenaP2 };
    player1.hullHp = player1.maxHp;
    player2.hullHp = player2.maxHp;
    player1.inDuelArena = true;
    player2.inDuelArena = true;

    const session: ActiveDuelSession = {
      duelId: `arena_${challengeId}`,
      player1Id: player1.id,
      player2Id: player2.id,
      player1SavedCoords: savedP1,
      player2SavedCoords: savedP2,
      player1ArenaCoords: arenaP1,
      player2ArenaCoords: arenaP2,
      globalChatConnected: true,
      elapsedSeconds: 0,
      isCompleted: false,
    };

    this.activeDuels.set(session.duelId, session);
    return session;
  }

  /**
   * Sends a global chat message (confirming players inside the 1v1 Arena stay connected to global chat).
   */
  public sendGlobalChatMessage(senderId: string, message: string, inDuelArena = false): void {
    this.globalChatLog.push({
      sender: senderId,
      message,
      fromArena: inDuelArena,
    });
  }

  public getGlobalChatLog(): Array<{ sender: string; message: string; fromArena: boolean }> {
    return this.globalChatLog;
  }

  /**
   * Resolves an active 1v1 duel when one player sinks the other:
   * Awards bonus XP to the winner and returns the victor (and loser) to their exact original map coordinates.
   */
  public resolveDuel(
    duelId: string,
    winner: DuelPlayerRef,
    loser: DuelPlayerRef
  ): { completed: boolean; xpAwarded: number; winnerReturnedCoords: Vector2D } {
    const session = this.activeDuels.get(duelId);
    if (!session || session.isCompleted) {
      return { completed: false, xpAwarded: 0, winnerReturnedCoords: winner.position };
    }

    session.isCompleted = true;
    session.winnerId = winner.id;

    // Award bonus XP to victor
    winner.xp += DUEL_WINNER_BONUS_XP;
    winner.hullHp = winner.maxHp;

    // Return both players to their saved coordinates on the main map
    const winnerSaved =
      winner.id === session.player1Id ? session.player1SavedCoords : session.player2SavedCoords;
    const loserSaved =
      loser.id === session.player1Id ? session.player1SavedCoords : session.player2SavedCoords;

    winner.position = { ...winnerSaved };
    loser.position = { ...loserSaved };
    winner.inDuelArena = false;
    loser.inDuelArena = false;

    return {
      completed: true,
      xpAwarded: DUEL_WINNER_BONUS_XP,
      winnerReturnedCoords: { ...winner.position },
    };
  }
}
