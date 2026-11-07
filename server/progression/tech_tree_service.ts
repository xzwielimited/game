/**
 * Persistent Tech Tree, Meta-Progression & Dual-Currency Service
 * Clean-Room implementation for NavalCommand.io
 */

import { createHash } from 'node:crypto';
import { ShipDef, SHIP_ROSTER, getAllShipDefs, getShipsByTier } from '../../common/models/ships.js';

export interface PlayerProfile {
  playerId: string;
  navalCredits: number;
  totalMatches: number;
  totalKills: number;
  totalDamage: number;
  unlockedHulls: string[]; // Set of shipDef IDs
  hullMasteryXP: Record<string, number>;
  selectedLoadouts: Record<string, Record<string, string>>; // shipId -> (slotId -> moduleId)
  activeCosmetics: {
    camouflageId: number;
    fleetEmblemId: number;
    projectileTrailId: number;
  };
  checksum?: string;
}

export const TIER_CREDIT_COSTS: Record<number, number> = {
  1: 0,
  2: 200,
  3: 500,
  4: 1000,
  5: 1800,
  6: 2800,
  7: 4200,
  8: 6000,
  9: 8500,
  10: 12000,
};

// Match XP Curve benchmarks per authoritative spec (R3 / R4):
// T7: 630 XP, T8: 940 XP, T9: 1430 XP
export const SPEC_TIER_XP_CURVE: Record<number, number> = {
  1: 0,
  2: 50,
  3: 120,
  4: 240,
  5: 400,
  6: 500,
  7: 630,
  8: 940,
  9: 1430,
  10: 2200,
};

const SECRET_SALT = 'NavalCommand_AntiCheat_SecretSalt_2026';

export class TechTreeService {
  private profiles: Map<string, PlayerProfile> = new Map();

  /**
   * Generates SHA-256 HMAC anti-tamper checksum.
   */
  public generateChecksum(profile: Omit<PlayerProfile, 'checksum'>): string {
    const raw = `${profile.playerId}:${profile.navalCredits}:${profile.totalMatches}:${profile.unlockedHulls.sort().join(',')}:${SECRET_SALT}`;
    return createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Verifies anti-tamper checksum.
   */
  public verifyChecksum(profile: PlayerProfile): boolean {
    if (!profile.checksum) return false;
    const { checksum, ...rest } = profile;
    const expected = this.generateChecksum(rest);
    return checksum === expected;
  }

  /**
   * Creates or gets a persistent player profile.
   */
  public getOrCreateProfile(playerId: string): PlayerProfile {
    let profile = this.profiles.get(playerId);
    if (!profile) {
      // Default tier 1 ships are unlocked
      const defaultUnlocked = ['pt_boat_109'];
      const rawProfile: Omit<PlayerProfile, 'checksum'> = {
        playerId,
        navalCredits: 500, // Starting grant
        totalMatches: 0,
        totalKills: 0,
        totalDamage: 0,
        unlockedHulls: defaultUnlocked,
        hullMasteryXP: {},
        selectedLoadouts: {},
        activeCosmetics: {
          camouflageId: 0,
          fleetEmblemId: 0,
          projectileTrailId: 0,
        },
      };

      profile = {
        ...rawProfile,
        checksum: this.generateChecksum(rawProfile),
      };
      this.profiles.set(playerId, profile);
    }
    return profile;
  }

  /**
   * Checks if a specific hull is unlocked.
   */
  public isHullUnlocked(playerId: string, hullId: string): boolean {
    const profile = this.getOrCreateProfile(playerId);
    // Tier 1 ships are always unlocked
    const ship = SHIP_ROSTER[hullId];
    if (ship && ship.tier === 1) return true;
    return profile.unlockedHulls.includes(hullId);
  }

  /**
   * Unlocks a ship hull using persistent Naval Credits.
   */
  public unlockHull(playerId: string, hullId: string): { success: boolean; error?: string } {
    const ship = SHIP_ROSTER[hullId];
    if (!ship) {
      return { success: false, error: `Invalid ship ID: ${hullId}` };
    }

    const profile = this.getOrCreateProfile(playerId);
    if (profile.unlockedHulls.includes(hullId)) {
      return { success: true }; // Already unlocked
    }

    const cost = TIER_CREDIT_COSTS[ship.tier] ?? 1000;
    if (profile.navalCredits < cost) {
      return {
        success: false,
        error: `Insufficient Naval Credits: have ${profile.navalCredits}, need ${cost}`,
      };
    }

    profile.navalCredits -= cost;
    profile.unlockedHulls.push(hullId);
    profile.checksum = this.generateChecksum(profile);
    return { success: true };
  }

  /**
   * Calculates post-match persistent Naval Credits earnings:
   * CreditsEarned = floor(matchXP * 0.25 + DamageDealt * 0.05 + Kills * 50 + ObjectiveBonus)
   */
  public recordMatchResults(
    playerId: string,
    matchXP: number,
    damageDealt: number,
    kills: number,
    objectiveBonus = 0
  ): number {
    const creditsEarned = Math.floor(
      matchXP * 0.25 + damageDealt * 0.05 + kills * 50 + objectiveBonus
    );

    const profile = this.getOrCreateProfile(playerId);
    profile.navalCredits += creditsEarned;
    profile.totalMatches++;
    profile.totalKills += kills;
    profile.totalDamage += damageDealt;
    profile.checksum = this.generateChecksum(profile);

    return creditsEarned;
  }

  /**
   * Returns required Match XP for reaching a given tier in match sandbox mode.
   */
  public getRequiredMatchXpForTier(tier: number): number {
    return SPEC_TIER_XP_CURVE[tier] ?? 0;
  }
}
