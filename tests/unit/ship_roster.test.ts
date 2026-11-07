import { describe, it, expect } from 'vitest';
import {
  SHIP_ROSTER,
  getAllShipDefs,
  getShipsByTier,
  getShipsByClass,
  getShipDef,
  getRequiredXpForTier,
  ShipClassId,
  isAngleWithinMountArc,
  stepMountTraverse,
  stepMountReloadAndRegen,
  canMountFire,
  fireMount,
  degToRad,
  WEAPON_DEFINITIONS,
} from '../../common/index.js';

describe('Feature 3: 10-Tier Ship Progression Roster (28+ Vessels across 8 Naval Classes)', () => {
  const allShips = getAllShipDefs();

  it('contains at least 25 distinct vessels across the fleet roster', () => {
    expect(allShips.length).toBeGreaterThanOrEqual(25);
    const uniqueIds = new Set(allShips.map(s => s.id));
    expect(uniqueIds.size).toBe(allShips.length);
  });

  it('covers all 10 progression tiers (Tier 1 through Tier 10)', () => {
    for (let tier = 1; tier <= 10; tier++) {
      const shipsInTier = getShipsByTier(tier);
      expect(shipsInTier.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('covers all 8 tactical naval classes with authentic doctrine vessels', () => {
    const requiredClasses: ShipClassId[] = [
      'COASTAL_PATROL',
      'DESTROYER',
      'CRUISER',
      'BATTLESHIP',
      'SUBMARINE',
      'AIRCRAFT_CARRIER',
      'DREDGER_ICEBREAKER',
      'TACTICAL_SUPPORT',
    ];

    for (const shipClass of requiredClasses) {
      const shipsInClass = getShipsByClass(shipClass);
      expect(shipsInClass.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('validates physical parameters and combat stats across all vessels', () => {
    for (const ship of allShips) {
      expect(ship.id).toBeTruthy();
      expect(ship.name).toBeTruthy();
      expect(ship.tier).toBeGreaterThanOrEqual(1);
      expect(ship.tier).toBeLessThanOrEqual(10);
      expect(ship.length).toBeGreaterThan(10);
      expect(ship.beam).toBeGreaterThan(3);
      expect(ship.mass).toBeGreaterThan(20);
      expect(ship.maxHp).toBeGreaterThanOrEqual(400);
      expect(ship.armor).toBeGreaterThanOrEqual(0);
      expect(ship.maxForwardSpeed).toBeGreaterThan(5);
      expect(ship.maxReverseSpeed).toBeGreaterThan(2);
      expect(ship.accelerationRate).toBeGreaterThan(0.2);
      expect(ship.decelerationRate).toBeGreaterThan(0.2);
      expect(ship.turnRateMax).toBeGreaterThan(0.05);
      expect(ship.draft).toBeGreaterThan(0.5);
      expect(ship.radarCrossSection).toBeGreaterThan(0);
      expect(ship.cavitationThresholdSpeed).toBeGreaterThan(4);
      expect(ship.mounts.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('verifies specialized tactical support vessels and role traits', () => {
    // 1. Mercy-class Hospital Ship
    const mercy = getShipDef('mercy_hospital');
    expect(mercy).toBeDefined();
    expect(mercy?.shipClass).toBe('TACTICAL_SUPPORT');
    expect(mercy?.traits).toContain('HOSPITAL_SHIP_HEAL');
    expect(mercy?.tier).toBe(4);

    // 2. Oil Tanker
    const tanker = getShipDef('oil_tanker_sup');
    expect(tanker).toBeDefined();
    expect(tanker?.shipClass).toBe('TACTICAL_SUPPORT');
    expect(tanker?.traits).toContain('OIL_RIG_XP_BOOST');
    expect(tanker?.tier).toBe(5);

    // 3. Oil Rig Builder
    const builder = getShipDef('rig_builder_sup');
    expect(builder).toBeDefined();
    expect(builder?.shipClass).toBe('TACTICAL_SUPPORT');
    expect(builder?.traits).toContain('OIL_RIG_BUILDER');
    expect(builder?.tier).toBe(7);
  });

  it('verifies Icebreaker vessels have ice immunity and ramming prow', () => {
    const icebreakers = allShips.filter(s => s.isIcebreaker);
    expect(icebreakers.length).toBeGreaterThanOrEqual(2);

    for (const icebreaker of icebreakers) {
      expect(icebreaker.isIcebreaker).toBe(true);
      expect(icebreaker.traits).toContain('ICEBREAKER_IMMUNITY');
      expect(
        icebreaker.traits.includes('ICE_RAMMING_PROW') ||
        icebreaker.traits.includes('NUCLEAR_RAMMING_BOW')
      ).toBe(true);
    }
  });

  it('verifies Submarines have submergence capabilities and dive traits', () => {
    const submarines = getShipsByClass('SUBMARINE');
    expect(submarines.length).toBeGreaterThanOrEqual(5);

    for (const sub of submarines) {
      expect(sub.canSubmerge).toBe(true);
      expect(sub.specialAbilities).toContain('DIVE_SURFACE');
      expect(sub.draft).toBeGreaterThanOrEqual(4.0);
    }
  });

  it('validates progression XP formula curves across all 10 tiers', () => {
    expect(getRequiredXpForTier(1)).toBe(0);
    expect(getRequiredXpForTier(2)).toBe(145);
    expect(getRequiredXpForTier(3)).toBe(330);
    expect(getRequiredXpForTier(4)).toBe(560);
    expect(getRequiredXpForTier(5)).toBe(830);
    expect(getRequiredXpForTier(6)).toBe(1150);
    expect(getRequiredXpForTier(7)).toBe(1520);
    expect(getRequiredXpForTier(8)).toBe(1950);
    expect(getRequiredXpForTier(9)).toBe(2450);
    expect(getRequiredXpForTier(10)).toBe(3100);

    // Monotonically increasing check
    for (let t = 2; t <= 10; t++) {
      expect(getRequiredXpForTier(t)).toBeGreaterThan(getRequiredXpForTier(t - 1));
    }
  });

  it('enforces port and starboard mount firing arc limits and traversal kinematics', () => {
    const fletcher = getShipDef('fletcher_dd');
    expect(fletcher).toBeDefined();

    const turret1 = fletcher!.mounts[0]; // Bow turret (baseAngle 0, arc ~280 deg)
    expect(turret1.baseAngle).toBe(0);

    // Straight ahead is inside arc
    expect(isAngleWithinMountArc(turret1, 0)).toBe(true);
    // Port 90 deg is inside arc
    expect(isAngleWithinMountArc(turret1, -Math.PI / 2)).toBe(true);
    // Starboard 90 deg is inside arc
    expect(isAngleWithinMountArc(turret1, Math.PI / 2)).toBe(true);
    // Directly aft (180 deg) should be blocked by superstructure
    expect(isAngleWithinMountArc(turret1, Math.PI)).toBe(false);

    // Test port torpedo mount on PT-109 (baseAngle -PI/2, arc 30 deg)
    const ptBoat = getShipDef('pt_boat_109')!;
    const portTorp = ptBoat.mounts.find(m => m.slotId === 'port_torp')!;
    expect(portTorp.baseAngle).toBeCloseTo(-Math.PI / 2, 2);

    expect(isAngleWithinMountArc(portTorp, -Math.PI / 2)).toBe(true);
    // Starboard side is blocked
    expect(isAngleWithinMountArc(portTorp, Math.PI / 2)).toBe(false);

    // Step traverse toward target angle
    turret1.currentAngle = 0;
    stepMountTraverse(turret1, degToRad(45), 0.5); // 0.5s rotation
    expect(turret1.currentAngle).toBeGreaterThan(0);
    expect(turret1.currentAngle).toBeLessThanOrEqual(degToRad(45));
  });

  it('handles independent mount reload timers and ammunition regeneration', () => {
    const fletcher = getShipDef('fletcher_dd')!;
    const turret = { ...fletcher.mounts[0] }; // clone for isolated test

    expect(canMountFire(turret)).toBe(true);

    // Discharge mount
    const fired = fireMount(turret);
    expect(fired).toBe(true);
    expect(turret.reloadTimeRemaining).toBe(turret.reloadTimeTotal);
    expect(turret.ammoCurrent).toBe(turret.ammoMax - 1);

    // Cannot fire while reloading
    expect(canMountFire(turret)).toBe(false);

    // Step halfway through reload
    const halfReload = turret.reloadTimeTotal / 2;
    stepMountReloadAndRegen(turret, halfReload);
    expect(turret.reloadTimeRemaining).toBeCloseTo(halfReload, 2);
    expect(canMountFire(turret)).toBe(false);

    // Complete reload
    stepMountReloadAndRegen(turret, halfReload + 0.1);
    expect(turret.reloadTimeRemaining).toBe(0);
    expect(canMountFire(turret)).toBe(true);

    // Test ammo regen from depleted pool
    turret.ammoCurrent = 15;
    stepMountReloadAndRegen(turret, 2.0);
    expect(turret.ammoCurrent).toBeGreaterThan(15);
    expect(turret.ammoCurrent).toBeCloseTo(15 + 2.0 * turret.ammoRegenRate, 1);
  });
});
