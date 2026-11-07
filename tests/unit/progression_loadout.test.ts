/**
 * Milestone M4 Unit Tests: Meta-Progression, Tech Tree, Modular Loadouts, Camo Skins & Web Portal SDK
 * Clean-Room Test Suite for NavalCommand.io
 */

import { describe, it, expect } from 'vitest';
import { TechTreeService } from '../../server/progression/tech_tree_service.js';
import {
  LoadoutValidator,
  CAMOUFLAGE_SKINS,
} from '../../server/progression/loadout_validator.js';
import { StandaloneMockSDK } from '../../client/src/sdk/mock_sdk.js';

describe('M4: Meta-Progression, Modular Loadouts, Camouflage Skins & Web Portal SDK', () => {
  describe('1. Tech Tree Unlocking & Persistent Naval Credits with Anti-Tamper Checksum', () => {
    it('awards post-match Naval Credits, unlocks ships across tiers, and validates SHA-256 anti-tamper checksums', () => {
      const techTree = new TechTreeService();
      const playerId = 'admiral_nelson';

      const profile = techTree.getOrCreateProfile(playerId);
      expect(profile.navalCredits).toBe(500);
      expect(techTree.isHullUnlocked(playerId, 'pt_boat_109')).toBe(true);
      expect(techTree.isHullUnlocked(playerId, 'fletcher_dd')).toBe(false);
      expect(techTree.verifyChecksum(profile)).toBe(true);

      // Record match results to earn persistent Naval Credits
      const earned = techTree.recordMatchResults(playerId, 1200, 8000, 4, 250);
      expect(earned).toBeGreaterThan(800);
      expect(profile.navalCredits).toBe(500 + earned);

      // Unlock Tier 3 Fletcher Destroyer (cost 500 credits)
      const unlockRes = techTree.unlockHull(playerId, 'fletcher_dd');
      expect(unlockRes.success).toBe(true);
      expect(techTree.isHullUnlocked(playerId, 'fletcher_dd')).toBe(true);
      expect(techTree.verifyChecksum(profile)).toBe(true);

      // Tampering with credits invalidates the SHA-256 checksum
      const tampered = { ...profile, navalCredits: 999999 };
      expect(techTree.verifyChecksum(tampered)).toBe(false);
    });
  });

  describe('2. Modular Loadout Customization & Camouflage Skin Application', () => {
    it('customizes weapon hardpoint slots (swapping torpedo tubes for SAMs/RBU rockets, adding Towed Sonar & ECM) and applies Camouflage Skins to spawned vessels', () => {
      const techTree = new TechTreeService();
      const validator = new LoadoutValidator(techTree);
      const playerId = 'capt_hawkins';

      // Grant credits and unlock Tier 3 Fletcher DD
      techTree.recordMatchResults(playerId, 2000, 10000, 5, 500);
      expect(techTree.unlockHull(playerId, 'fletcher_dd').success).toBe(true);

      // Reject loadout on a locked Tier 8 ship
      const lockedAttempt = validator.saveCustomLoadout(playerId, {
        shipId: 'bismarck_bb',
        slotModules: { 0: 'mod_sam_battery' },
        camouflageId: 1,
      });
      expect(lockedAttempt.valid).toBe(false);

      // Save custom loadout on unlocked Fletcher DD:
      // Swap Slot 2 (torpedo mount) for RIM-162 SAM Battery, add Towed Sonar Array & ECM Pod, equip Arctic Splinter Camo
      const saveRes = validator.saveCustomLoadout(playerId, {
        shipId: 'fletcher_dd',
        slotModules: {
          2: 'mod_sam_battery',
          3: 'mod_towed_sonar',
          4: 'mod_ecm_pod',
        },
        camouflageId: 2, // ARCTIC_SPLINTER
        fleetEmblemId: 3,
      });
      expect(saveRes.valid).toBe(true);

      // Spawn vessel with applied custom loadout
      const applied = validator.applyLoadoutToVessel(playerId, 'fletcher_dd');
      expect(applied.mounts[2].weaponDefId).toBe('sam_interceptor');
      expect(applied.mounts[2].category).toBe('SAM_CIWS');
      expect(applied.sonarRangeMultiplier).toBeCloseTo(1.60, 2);
      expect(applied.hasEcmJammer).toBe(true);
      expect(applied.shipDef.specialAbilities).toContain('ECM_JAMMING');
      expect(applied.camouflage.code).toBe(CAMOUFLAGE_SKINS[2].code);
    });
  });

  describe('3. Web Portal SDK Adapter Layer (CrazyGames / Poki / Playgama / Y8)', () => {
    it('executes lifecycle hooks, commercialBreak(), rewardedBreak() callbacks, and happyTime()', async () => {
      const sdk = new StandaloneMockSDK(5);
      expect(await sdk.init()).toBe(true);

      sdk.gameplayStart();
      expect(sdk.isGameplayActive()).toBe(true);

      sdk.gameplayStop();
      await sdk.commercialBreak();
      expect(sdk.commercialBreakCount).toBe(1);
      expect(sdk.isAdPlaying()).toBe(false);

      let rewardGranted = false;
      const rewardedSuccess = await sdk.rewardedBreak({
        rewardType: 'VIP_TRIAL_SHIP',
        onRewardGranted: () => {
          rewardGranted = true;
        },
        onAdSkippedOrFailed: () => {},
      });

      expect(rewardedSuccess).toBe(true);
      expect(rewardGranted).toBe(true);
      expect(sdk.rewardedBreakCount).toBe(1);
      expect(sdk.lastRewardType).toBe('VIP_TRIAL_SHIP');

      sdk.happyTime(2.0);
      expect(sdk.happyTimeCount).toBe(2.0);
    });
  });
});
