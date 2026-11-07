/**
 * Milestone M3 Unit Tests: All 3 Playable Game Modes
 * (1) Free-For-All / Fleet Sandbox XP Progression (Tiers 1-10)
 * (2) 15-Minute King of the Hill & Convoy Escort
 * (3) 1v1 Private Battle Arena (Challenge, Teleport, Global Chat, Bonus XP, Return to Original Coords)
 * Clean-Room Test Suite for NavalCommand.io
 */

import { describe, it, expect } from 'vitest';
import {
  GameModeController,
  SANDBOX_TIER_XP_THRESHOLDS,
  getSandboxTierForXp,
  ARENA_ISOLATED_CENTER,
  DUEL_WINNER_BONUS_XP,
  DuelPlayerRef,
} from '../../common/models/game_modes.js';

describe('M3: Three Playable Game Modes', () => {
  describe('1. Free-For-All / Fleet Sandbox Mode (Tiers 1-10 XP Progression)', () => {
    it('enforces balanced XP curve benchmarks (630 XP for Tier 7, 940 XP for Tier 8, 1,430 XP for Tier 9)', () => {
      expect(SANDBOX_TIER_XP_THRESHOLDS[7]).toBe(630);
      expect(SANDBOX_TIER_XP_THRESHOLDS[8]).toBe(940);
      expect(SANDBOX_TIER_XP_THRESHOLDS[9]).toBe(1430);

      expect(getSandboxTierForXp(0)).toBe(1);
      expect(getSandboxTierForXp(630)).toBe(7);
      expect(getSandboxTierForXp(940)).toBe(8);
      expect(getSandboxTierForXp(1430)).toBe(9);
      expect(getSandboxTierForXp(2200)).toBe(10);

      const controller = new GameModeController();
      const prog = controller.evaluateSandboxProgression(500, 150); // 500 (T6) -> 650 (T7)
      expect(prog.previousTier).toBe(6);
      expect(prog.newTier).toBe(7);
      expect(prog.leveledUp).toBe(true);
    });
  });

  describe('2. 15-Minute King of the Hill & Convoy Escort Mode', () => {
    it('tracks 900-second match clock, strategic sector capture scoring, and Oil Tanker convoy transit', () => {
      const controller = new GameModeController();
      const match = controller.startKothConvoyMatch();
      expect(match.matchDurationTotalSeconds).toBe(900);
      expect(match.matchTimeRemainingSeconds).toBe(900);

      // Place Blue Task Force vessels inside central sector (0, 0)
      const blueFleet = [
        { id: 'b1', team: 'BLUE_TASK_FORCE' as const, position: { x: 100, y: 100 }, isDestroyed: false },
        { id: 'b2', team: 'BLUE_TASK_FORCE' as const, position: { x: -50, y: 80 }, isDestroyed: false },
      ];

      // Step 10 seconds -> Blue captures sector and earns points while convoy advances
      controller.stepKothConvoyMatch(10.0, blueFleet);
      expect(match.sector.controllingTeam).toBe('BLUE_TASK_FORCE');
      expect(match.convoy.position.x).toBeGreaterThan(-2000);

      // Step another 40 seconds -> Blue accumulates sector score
      controller.stepKothConvoyMatch(40.0, blueFleet);
      expect(match.blueScore).toBeGreaterThan(50);

      // Step until convoy reaches strait destination (4000m total at 8 m/s = 500s total)
      controller.stepKothConvoyMatch(460.0, blueFleet);
      expect(match.convoy.reachedDestination).toBe(true);
      expect(match.isCompleted).toBe(true);
      expect(match.winner).toBe('BLUE_TASK_FORCE');
    });
  });

  describe('3. 1v1 Private Battle Arena Mode', () => {
    it('accepts duel challenge, teleports players to isolated arena with global chat connected, awards winner XP, and returns to original map coordinates', () => {
      const controller = new GameModeController();

      const player1: DuelPlayerRef = {
        id: 'commander_alpha',
        position: { x: -1250, y: 3400 },
        hullHp: 2100,
        maxHp: 3200,
        xp: 400,
        inDuelArena: false,
      };

      const player2: DuelPlayerRef = {
        id: 'commander_bravo',
        position: { x: 820, y: -1950 },
        hullHp: 1800,
        maxHp: 3200,
        xp: 550,
        inDuelArena: false,
      };

      // 1. Send & accept direct 1v1 challenge
      const challenge = controller.sendDuelChallenge(player1.id, player2.id);
      expect(challenge.status).toBe('PENDING');

      const session = controller.acceptDuelChallenge(challenge.challengeId, player1, player2);
      expect(session).not.toBeNull();
      expect(session!.globalChatConnected).toBe(true);

      // Both players are teleported to isolated arena coordinates and restored to full HP
      expect(player1.inDuelArena).toBe(true);
      expect(player2.inDuelArena).toBe(true);
      expect(player1.hullHp).toBe(player1.maxHp);
      expect(player2.hullHp).toBe(player2.maxHp);
      expect(Math.abs(player1.position.x - ARENA_ISOLATED_CENTER.x)).toBeLessThanOrEqual(500);
      expect(Math.abs(player2.position.x - ARENA_ISOLATED_CENTER.x)).toBeLessThanOrEqual(500);

      // 2. Verify global chat remains connected during the arena duel
      controller.sendGlobalChatMessage(player1.id, 'Good luck in the 1v1 duel!', true);
      const chatLog = controller.getGlobalChatLog();
      expect(chatLog.length).toBe(1);
      expect(chatLog[0].fromArena).toBe(true);

      // 3. Player 1 wins the duel -> receives bonus XP and returns to exact original coordinates (-1250, 3400)
      const resolution = controller.resolveDuel(session!.duelId, player1, player2);
      expect(resolution.completed).toBe(true);
      expect(resolution.xpAwarded).toBe(DUEL_WINNER_BONUS_XP);
      expect(player1.xp).toBe(400 + DUEL_WINNER_BONUS_XP);
      expect(player1.inDuelArena).toBe(false);
      expect(player2.inDuelArena).toBe(false);
      expect(player1.position).toEqual({ x: -1250, y: 3400 });
      expect(player2.position).toEqual({ x: 820, y: -1950 });
    });
  });
});
