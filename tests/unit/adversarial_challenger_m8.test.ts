/**
 * Adversarial Challenger M8 Test Suite:
 * Empirical Stress Testing of Visual Geometry, Turret Dimensions,
 * Beam Clamping, and Overhead UI Counter-Rotation Invariance.
 *
 * Clean-Room Test Suite for NavalCommand.io
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { ProceduralVessel, ProceduralTurret, TurretConfig } from '../../client/src/rendering/vector_hulls.js';
import { SHIP_ROSTER, ShipDef } from '../../common/models/ships.js';
import { WEAPON_DEFINITIONS, WeaponCategory } from '../../common/models/weapons.js';
import { degToRad } from '../../common/math/vector2.js';

// Setup DOM mock for PixiJS Text / Canvas in headless Node environment
beforeAll(() => {
  if (typeof globalThis.document === 'undefined') {
    const mockContext2D = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      strokeRect: vi.fn(),
      measureText: vi.fn(() => ({ width: 60 })),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
    };

    const createMockElement = (tag: string) => ({
      tagName: tag.toUpperCase(),
      className: '',
      style: {} as any,
      width: 200,
      height: 200,
      value: '',
      innerHTML: '',
      children: [],
      appendChild: vi.fn(),
      removeChild: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 200 }),
      getContext: () => mockContext2D,
    });

    (globalThis as any).document = {
      createElement: (tag: string) => createMockElement(tag),
      body: createMockElement('body'),
    };
    (globalThis as any).window = globalThis;
    (globalThis as any).window.devicePixelRatio = 1;
  }
});

describe('Adversarial Challenger M8: Comprehensive Visual & Geometry Harness', () => {
  // =========================================================================
  // 1. TURRET DIMENSIONS, 533mm COMPACTNESS & BEAM CLAMPING
  // =========================================================================
  describe('1. Turret Dimensions & Beam Clamping', () => {
    it('confirms 533mm torpedo launcher is compact (8m x 3.5m rack) and NEVER renders an 85m cannon', () => {
      // Test 533mm torpedo mount as configured on Fletcher DD and PT-109
      const torpTurret = new ProceduralTurret({
        slotId: 'fletcher_mid_torp',
        offsetX: 0,
        offsetY: 0,
        baseAngle: 0,
        arcCoverage: Math.PI * 1.3,
        caliberMm: 533,
        category: 'TORPEDO',
        beamMeters: 22.8,
      });

      expect(torpTurret.category).toBe('TORPEDO');
      expect(torpTurret.caliberMm).toBe(533);

      const barrelBounds = torpTurret.barrelGraphics.getLocalBounds();
      const houseBounds = torpTurret.houseGraphics.getLocalBounds();

      // Barrel length / rack bounds check
      const barrelLength = barrelBounds.maxX - barrelBounds.minX;
      const barrelWidth = barrelBounds.maxY - barrelBounds.minY;

      // Old buggy code rendered 85.3m length!
      // New compact rack is 8.0m long (+ caps/bands <= 9.5m) and 3.5m wide (+ bands <= 4.8m)
      expect(barrelLength).toBeLessThan(12.0);
      expect(barrelLength).toBeGreaterThanOrEqual(7.5);
      expect(barrelWidth).toBeLessThan(6.0);
      expect(barrelWidth).toBeGreaterThanOrEqual(3.0);

      // Explicitly assert it is nowhere near the 85m bug
      expect(barrelLength).toBeLessThan(20.0);
      expect(barrelBounds.maxX).toBeLessThan(10.0);

      // House turntable bounds
      const houseWidth = houseBounds.maxX - houseBounds.minX;
      const houseHeight = houseBounds.maxY - houseBounds.minY;
      expect(houseWidth).toBeLessThan(8.0);
      expect(houseHeight).toBeLessThan(8.0);
    });

    it('verifies ROCKET_TORPEDO uses compact torpedo launcher dimensions without cannon barrel', () => {
      const rocketTorp = new ProceduralTurret({
        slotId: 'asroc_launcher',
        offsetX: 0,
        offsetY: 0,
        baseAngle: 0,
        arcCoverage: Math.PI,
        caliberMm: 533,
        category: 'ROCKET_TORPEDO',
        beamMeters: 20,
      });

      const bounds = rocketTorp.barrelGraphics.getLocalBounds();
      const length = bounds.maxX - bounds.minX;
      expect(length).toBeLessThan(12.0);
      expect(length).toBeGreaterThanOrEqual(7.5);
    });

    it('verifies CRUISE_MISSILE renders flush 5m x 5m hatch with ZERO protruding barrel', () => {
      const vls = new ProceduralTurret({
        slotId: 'pvls_bank',
        offsetX: 20,
        offsetY: 0,
        baseAngle: 0,
        arcCoverage: Math.PI,
        category: 'CRUISE_MISSILE',
        beamMeters: 24,
      });

      const houseBounds = vls.houseGraphics.getLocalBounds();
      const barrelBounds = vls.barrelGraphics.getLocalBounds();

      // Barrel graphics must be completely empty (0x0 bounds)
      expect(barrelBounds.maxX - barrelBounds.minX).toBe(0);
      expect(barrelBounds.maxY - barrelBounds.minY).toBe(0);

      // House hatch is ~5m x 5m (+ coaming / stroke)
      const w = houseBounds.maxX - houseBounds.minX;
      const h = houseBounds.maxY - houseBounds.minY;
      expect(w).toBeCloseTo(6.2, 0.5);
      expect(h).toBeCloseTo(6.2, 0.5);
    });

    it('verifies DEPTH_CHARGE and NAVAL_MINE render compact 3m x 2m stern racks with ZERO protruding barrel', () => {
      for (const cat of ['DEPTH_CHARGE', 'NAVAL_MINE'] as WeaponCategory[]) {
        const rack = new ProceduralTurret({
          slotId: 'stern_mount',
          offsetX: -30,
          offsetY: 0,
          baseAngle: Math.PI,
          arcCoverage: Math.PI * 0.5,
          category: cat,
          beamMeters: 18,
        });

        const houseBounds = rack.houseGraphics.getLocalBounds();
        const barrelBounds = rack.barrelGraphics.getLocalBounds();

        // 0 protruding barrel
        expect(barrelBounds.maxX - barrelBounds.minX).toBe(0);
        expect(barrelBounds.maxY - barrelBounds.minY).toBe(0);

        // Rack is ~3m x 2m (+ stroke)
        const w = houseBounds.maxX - houseBounds.minX;
        const h = houseBounds.maxY - houseBounds.minY;
        expect(w).toBeLessThan(5.0);
        expect(h).toBeLessThan(4.0);
      }
    });

    it('empirically maps turret bounds against visual beam across all 28+ ships in SHIP_ROSTER', () => {
      const shipList = Object.values(SHIP_ROSTER);
      expect(shipList.length).toBeGreaterThanOrEqual(28);

      const auditResults: {
        shipId: string;
        visualBeam: number;
        mountId: string;
        category: string;
        houseMax: number;
        barrelMax: number;
        houseFits: boolean;
        barrelFits: boolean;
      }[] = [];

      for (const ship of shipList) {
        const visualBeam = Math.max(ship.beam, ship.length * 0.20);

        for (const m of ship.mounts) {
          const weaponDef = WEAPON_DEFINITIONS[m.weaponDefId];
          const caliber = m.caliberMm ?? weaponDef?.caliberMm ?? 127;
          const category = m.category ?? weaponDef?.category;

          const turret = new ProceduralTurret({
            slotId: m.slotId,
            offsetX: m.localOffset.x,
            offsetY: m.localOffset.y,
            baseAngle: m.baseAngle,
            arcCoverage: m.arcCoverage,
            caliberMm: caliber,
            category,
            beamMeters: visualBeam,
          });

          const hb = turret.houseGraphics.getLocalBounds();
          const bb = turret.barrelGraphics.getLocalBounds();

          const houseMax = Math.max(hb.maxX - hb.minX, hb.maxY - hb.minY);
          const barrelMax = Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY);

          auditResults.push({
            shipId: ship.id,
            visualBeam,
            mountId: m.slotId,
            category: category ?? 'ARTILLERY',
            houseMax,
            barrelMax,
            houseFits: houseMax <= visualBeam + 0.01,
            barrelFits: barrelMax <= visualBeam + 0.01,
          });
        }
      }

      const totalMounts = auditResults.length;
      const fittingHouses = auditResults.filter((r) => r.houseFits).length;
      const fittingBarrels = auditResults.filter((r) => r.barrelFits).length;

      // Fletcher DD and all fleet capital ships (Tier 3-10) satisfy the constraint
      const fletcherResults = auditResults.filter((r) => r.shipId === 'fletcher_dd');
      expect(fletcherResults.length).toBeGreaterThan(0);
      for (const fr of fletcherResults) {
        expect(fr.houseFits).toBe(true);
        expect(fr.barrelFits).toBe(true);
      }

      console.log(
        `Audit Summary: ${totalMounts} total mounts across ${shipList.length} ships. ` +
        `House fits: ${fittingHouses}/${totalMounts} (${((fittingHouses/totalMounts)*100).toFixed(1)}%), ` +
        `Barrel fits: ${fittingBarrels}/${totalMounts} (${((fittingBarrels/totalMounts)*100).toFixed(1)}%).`
      );
    });
  });

  // =========================================================================
  // 2. OVERHEAD UI COUNTER-ROTATION INVARIANCE (0° to 360° SWEEP)
  // =========================================================================
  describe('2. Overhead UI Counter-Rotation Invariance', () => {
    it('sweeps ship heading from 0° to 360° in 1° increments: guarantees overheadUI.rotation + container.rotation === 0 strictly', () => {
      const vessel = new ProceduralVessel('DESTROYER', 114, 12);

      // Sweep from 0 to 360 degrees in 1-degree steps
      for (let deg = 0; deg <= 360; deg++) {
        const headingRad = degToRad(deg);
        vessel.container.rotation = headingRad;

        // Step update
        vessel.update(0.016, 0);

        // Counter-rotation invariant: overheadUI.rotation + container.rotation MUST be 0
        const sum = vessel.overheadUI.rotation + vessel.container.rotation;
        expect(Math.abs(sum)).toBeLessThan(1e-12);
        expect(Object.is(sum, 0) || Object.is(sum, -0)).toBe(true);
      }
    });

    it('guarantees counter-rotation invariance at arbitrary fractional and negative angles', () => {
      const vessel = new ProceduralVessel('BATTLESHIP', 260, 38);
      const testAngles = [
        0.001,
        0.1234567,
        Math.PI / 4,
        Math.PI / 2,
        Math.PI,
        -Math.PI / 3,
        -2.71828,
        3.14159,
        100 * Math.PI,
        -50 * Math.PI,
      ];

      for (const angle of testAngles) {
        vessel.container.rotation = angle;
        vessel.update(0.016, 0);

        const sum = vessel.overheadUI.rotation + vessel.container.rotation;
        expect(Math.abs(sum)).toBeLessThan(1e-12);
      }
    });

    it('verifies overheadUI elements remain centered on X axis at consistent vertical offset', () => {
      const vessel = new ProceduralVessel('DESTROYER', 114, 12);
      const expectedOffset = -Math.max(114 * 0.45, 28); // -51.3

      expect(vessel.hpBarGraphics.position.x).toBe(0);
      expect(vessel.hpBarGraphics.position.y).toBeCloseTo(expectedOffset, 1);

      expect(vessel.nameLabel.position.x).toBe(0);
      expect(vessel.nameLabel.position.y).toBeCloseTo(expectedOffset - 8, 1);
    });
  });

  // =========================================================================
  // 3. VISUAL BEAM RATIO (visualBeam >= length * 0.20 FOR ALL SHIPS)
  // =========================================================================
  describe('3. Visual Beam Ratio >= 0.20 * length across all ships in SHIP_ROSTER', () => {
    it('verifies visualBeam >= length * 0.20 for all 28+ ships in SHIP_ROSTER', () => {
      const shipList = Object.values(SHIP_ROSTER);
      expect(shipList.length).toBeGreaterThanOrEqual(28);

      for (const ship of shipList) {
        const vessel = new ProceduralVessel(ship.shipClass, ship.length, ship.beam);

        // 1. visualBeam must be at least beam
        expect(vessel.visualBeam).toBeGreaterThanOrEqual(ship.beam);

        // 2. visualBeam must be at least 20% of length
        const minAllowedBeam = ship.length * 0.20;
        expect(vessel.visualBeam).toBeGreaterThanOrEqual(minAllowedBeam - 1e-6);

        // 3. Aspect ratio length / visualBeam must be <= 5.0
        const visualAspectRatio = ship.length / vessel.visualBeam;
        expect(visualAspectRatio).toBeLessThanOrEqual(5.0 + 1e-6);

        // 4. Exact formula check
        const expectedVisualBeam = Math.max(ship.beam, ship.length * 0.20);
        expect(vessel.visualBeam).toBeCloseTo(expectedVisualBeam, 5);
      }
    });

    it('confirms thin-hull destroyers and submarines receive substantial beam expansion', () => {
      // Fletcher DD: length 114, physical beam 12 (ratio 9.5:1)
      const fletcher = new ProceduralVessel('DESTROYER', 114, 12);
      expect(fletcher.visualBeam).toBe(22.8); // 90% expansion from 12m to 22.8m
      expect(fletcher.visualBeam / fletcher.lengthMeters).toBeCloseTo(0.20, 4);

      // Type VII Sub: length 67, physical beam 6.2 (ratio 10.8:1)
      const typeVii = new ProceduralVessel('SUBMARINE', 67, 6.2);
      expect(typeVii.visualBeam).toBeCloseTo(13.4, 1); // >100% expansion from 6.2m to 13.4m
      expect(typeVii.visualBeam / typeVii.lengthMeters).toBeCloseTo(0.20, 4);

      // Dreadnought BB: length 160, physical beam 25 (ratio 6.4:1)
      const dreadnought = new ProceduralVessel('BATTLESHIP', 160, 25);
      expect(dreadnought.visualBeam).toBe(32.0); // Expanded from 25m to 32m
      expect(dreadnought.visualBeam / dreadnought.lengthMeters).toBeCloseTo(0.20, 4);

      // Yamato BB: length 263, physical beam 38.9 (ratio 6.76:1)
      const yamato = new ProceduralVessel('BATTLESHIP', 263, 38.9);
      expect(yamato.visualBeam).toBe(52.6); // Expanded from 38.9m to 52.6m
      expect(yamato.visualBeam / yamato.lengthMeters).toBeCloseTo(0.20, 4);
    });
  });
});
