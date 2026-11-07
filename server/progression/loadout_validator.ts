/**
 * Modular Loadout Customization, Tactical Modules & Cosmetic Skin Validator
 * Clean-Room implementation for NavalCommand.io (Milestone M4)
 *
 * Implements R4 Specifications:
 * - Modular Loadout Customization: Allows players to customize weapon slots and tactical modules
 *   on unlocked hulls before spawning (e.g., trading torpedo tubes for additional SAM batteries,
 *   upgraded towed sonar, or ECM pods) with strict server-side validation.
 * - Naval Camouflage Skins & Fleet Emblems: Cosmetics registry and equip verification.
 */

import { ShipDef, SHIP_ROSTER } from '../../common/models/ships.js';
import { WeaponMountDef, WEAPON_DEFINITIONS, createWeaponMount } from '../../common/models/weapons.js';
import { TechTreeService } from './tech_tree_service.js';

export interface TacticalModuleDef {
  moduleId: string;
  name: string;
  type: 'WEAPON_SWAP' | 'SENSOR_UPGRADE' | 'DEFENSE_POD';
  replacementWeaponDefId?: string;
  sonarRangeBonusFactor?: number;
  grantsEcmAbility?: boolean;
  minTier: number;
}

export const TACTICAL_MODULES: Record<string, TacticalModuleDef> = {
  mod_sam_battery: {
    moduleId: 'mod_sam_battery',
    name: 'RIM-162 ESSM VLS SAM Battery Swap',
    type: 'WEAPON_SWAP',
    replacementWeaponDefId: 'sam_interceptor',
    minTier: 3,
  },
  mod_ciws_phalanx: {
    moduleId: 'mod_ciws_phalanx',
    name: '20mm Phalanx CIWS Point-Defense Swap',
    type: 'WEAPON_SWAP',
    replacementWeaponDefId: 'ciws_phalanx_20mm',
    minTier: 3,
  },
  mod_rbu_rockets: {
    moduleId: 'mod_rbu_rockets',
    name: 'RBU-6000 ASW Rocket Mortar Swap',
    type: 'WEAPON_SWAP',
    replacementWeaponDefId: 'rocket_barrage_rbu',
    minTier: 3,
  },
  mod_homing_torpedo: {
    moduleId: 'mod_homing_torpedo',
    name: 'Mark 48 Acoustic Homing Torpedo Swap',
    type: 'WEAPON_SWAP',
    replacementWeaponDefId: 'torpedo_acoustic_homing',
    minTier: 2,
  },
  mod_asroc_launcher: {
    moduleId: 'mod_asroc_launcher',
    name: 'ASROC Standoff Rocket Torpedo Swap',
    type: 'WEAPON_SWAP',
    replacementWeaponDefId: 'rocket_torpedo_asroc',
    minTier: 4,
  },
  mod_towed_sonar: {
    moduleId: 'mod_towed_sonar',
    name: 'AN/SQR-19 Towed Array Sonar (+60% Sonar Range)',
    type: 'SENSOR_UPGRADE',
    sonarRangeBonusFactor: 1.60,
    minTier: 3,
  },
  mod_ecm_pod: {
    moduleId: 'mod_ecm_pod',
    name: 'AN/SLQ-32 Electronic Jamming Pod',
    type: 'DEFENSE_POD',
    grantsEcmAbility: true,
    minTier: 3,
  },
};

export interface CamouflageSkinDef {
  id: number;
  code: 'HAZE_GREY' | 'DAZZLE' | 'ARCTIC_SPLINTER' | 'STEALTH_CARBON';
  name: string;
  costCredits: number;
}

export const CAMOUFLAGE_SKINS: Record<number, CamouflageSkinDef> = {
  0: { id: 0, code: 'HAZE_GREY', name: 'Standard Haze Grey', costCredits: 0 },
  1: { id: 1, code: 'DAZZLE', name: 'North Atlantic Dazzle', costCredits: 400 },
  2: { id: 2, code: 'ARCTIC_SPLINTER', name: 'Arctic Ice Splinter', costCredits: 600 },
  3: { id: 3, code: 'STEALTH_CARBON', name: 'Stealth Carbon Matte', costCredits: 1000 },
};

export interface CustomLoadoutConfig {
  shipId: string;
  slotModules: Record<number, string>; // slotIndex -> moduleId
  camouflageId: number;
  fleetEmblemId?: number;
}

export interface AppliedVesselLoadout {
  shipDef: ShipDef;
  mounts: WeaponMountDef[];
  sonarRangeMultiplier: number;
  hasEcmJammer: boolean;
  camouflage: CamouflageSkinDef;
}

export class LoadoutValidator {
  private techTree: TechTreeService;

  constructor(techTree: TechTreeService) {
    this.techTree = techTree;
  }

  /**
   * Validates and saves a custom loadout for a player's unlocked ship hull.
   */
  public saveCustomLoadout(
    playerId: string,
    config: CustomLoadoutConfig
  ): { valid: boolean; error?: string } {
    const ship = SHIP_ROSTER[config.shipId];
    if (!ship) {
      return { valid: false, error: `Unknown ship hull: ${config.shipId}` };
    }

    if (!this.techTree.isHullUnlocked(playerId, config.shipId)) {
      return { valid: false, error: `Hull ${config.shipId} is locked for player ${playerId}` };
    }

    if (!(config.camouflageId in CAMOUFLAGE_SKINS)) {
      return { valid: false, error: `Invalid camouflage ID: ${config.camouflageId}` };
    }

    for (const [slotStr, moduleId] of Object.entries(config.slotModules)) {
      const slotIdx = Number(slotStr);
      const mod = TACTICAL_MODULES[moduleId];
      if (!mod) {
        return { valid: false, error: `Unknown tactical module: ${moduleId}` };
      }
      if (ship.tier < mod.minTier) {
        return {
          valid: false,
          error: `Module ${moduleId} requires Tier ${mod.minTier}+, ship is Tier ${ship.tier}`,
        };
      }
      if (mod.type === 'WEAPON_SWAP' && (slotIdx < 0 || slotIdx >= ship.mounts.length)) {
        return { valid: false, error: `Weapon slot index ${slotIdx} out of bounds for ${ship.id}` };
      }
    }

    const profile = this.techTree.getOrCreateProfile(playerId);
    const slotRecord: Record<string, string> = {};
    for (const [k, v] of Object.entries(config.slotModules)) {
      slotRecord[k] = v;
    }
    profile.selectedLoadouts[config.shipId] = slotRecord;
    profile.activeCosmetics.camouflageId = config.camouflageId;
    if (config.fleetEmblemId !== undefined) {
      profile.activeCosmetics.fleetEmblemId = config.fleetEmblemId;
    }
    profile.checksum = this.techTree.generateChecksum(profile);

    return { valid: true };
  }

  /**
   * Applies a player's saved custom loadout to a newly spawned vessel,
   * modifying weapon hardpoint slots, sonar range multipliers, ECM abilities, and camouflage skins.
   */
  public applyLoadoutToVessel(playerId: string, shipId: string): AppliedVesselLoadout {
    const baseShip = SHIP_ROSTER[shipId] ?? SHIP_ROSTER['pt_boat_109'];
    const profile = this.techTree.getOrCreateProfile(playerId);
    const savedSlots = profile.selectedLoadouts[baseShip.id] ?? {};

    // Clone weapon mounts and apply any weapon swaps
    const mounts: WeaponMountDef[] = baseShip.mounts.map(m => ({
      ...m,
      localOffset: { ...m.localOffset },
    }));

    let sonarRangeMultiplier = 1.0;
    let hasEcmJammer =
      baseShip.traits.includes('ECM_JAMMING') || baseShip.specialAbilities.includes('ECM_JAMMING');

    for (const [slotStr, moduleId] of Object.entries(savedSlots)) {
      const slotIdx = Number(slotStr);
      const mod = TACTICAL_MODULES[moduleId];
      if (!mod) continue;

      if (
        mod.type === 'WEAPON_SWAP' &&
        mod.replacementWeaponDefId &&
        WEAPON_DEFINITIONS[mod.replacementWeaponDefId] &&
        slotIdx >= 0 &&
        slotIdx < mounts.length
      ) {
        const existingMount = mounts[slotIdx];
        mounts[slotIdx] = createWeaponMount(
          existingMount.slotId,
          mod.replacementWeaponDefId,
          existingMount.localOffset,
          existingMount.baseAngle,
          existingMount.arcCoverage
        );
      } else if (mod.type === 'SENSOR_UPGRADE' && mod.sonarRangeBonusFactor) {
        sonarRangeMultiplier = Math.max(sonarRangeMultiplier, mod.sonarRangeBonusFactor);
      } else if (mod.type === 'DEFENSE_POD' && mod.grantsEcmAbility) {
        hasEcmJammer = true;
      }
    }

    const camo = CAMOUFLAGE_SKINS[profile.activeCosmetics.camouflageId] ?? CAMOUFLAGE_SKINS[0];

    const customizedShipDef: ShipDef = {
      ...baseShip,
      mounts,
      specialAbilities: hasEcmJammer && !baseShip.specialAbilities.includes('ECM_JAMMING')
        ? [...baseShip.specialAbilities, 'ECM_JAMMING']
        : [...baseShip.specialAbilities],
      traits: hasEcmJammer && !baseShip.traits.includes('ECM_JAMMING')
        ? [...baseShip.traits, 'ECM_JAMMING']
        : [...baseShip.traits],
    };

    return {
      shipDef: customizedShipDef,
      mounts,
      sonarRangeMultiplier,
      hasEcmJammer,
      camouflage: camo,
    };
  }
}
