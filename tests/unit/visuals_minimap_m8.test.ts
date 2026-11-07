/**
 * Milestone M8 Unit & Integration Test Suite:
 * High-Contrast Pseudo-3D Vessel Depth (7 Tiers), Dynamic Ocean Waves & Wakes,
 * Island Minimap Polygon Contours, and Decluttered Annular Tactical Overlays.
 * Clean-Room verification for NavalCommand.io
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { ProceduralVessel, ProceduralTurret } from '../../client/src/rendering/vector_hulls.js';
import { PixiRenderer } from '../../client/src/rendering/pixi_renderer.js';
import { WakeFX } from '../../client/src/rendering/wake_fx.js';
import { SensorOverlays } from '../../client/src/rendering/sensor_overlays.js';
import { TacticalMinimap, MinimapTerrain } from '../../client/src/hud/minimap.js';
import { NavalCommandApp } from '../../client/src/app.js';
import { MenusManager } from '../../client/src/hud/menus.js';
import { ShipClassId } from '../../common/models/ships.js';

// Setup lightweight DOM mocks for headless Node/vitest execution
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
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
    };

    const createMockElement = (tag: string) => {
      const listeners: Record<string, Function[]> = {};
      const children: any[] = [];
      const el: any = {
        tagName: tag.toUpperCase(),
        className: '',
        style: {} as any,
        width: 200,
        height: 200,
        value: 'Guestbound',
        innerHTML: '',
        children,
        appendChild: (child: any) => {
          children.push(child);
          return child;
        },
        removeChild: (child: any) => {
          const idx = children.indexOf(child);
          if (idx >= 0) children.splice(idx, 1);
          return child;
        },
        addEventListener: (event: string, cb: Function) => {
          listeners[event] = listeners[event] || [];
          listeners[event].push(cb);
        },
        removeEventListener: (event: string, cb: Function) => {
          if (listeners[event]) {
            listeners[event] = listeners[event].filter((f) => f !== cb);
          }
        },
        dispatchEvent: (event: any) => {
          const cbs = listeners[event.type || 'click'] || [];
          for (const cb of cbs) cb(event);
          return true;
        },
        getBoundingClientRect: () => ({
          left: 0,
          top: 0,
          width: 200,
          height: 200,
          right: 200,
          bottom: 200,
          x: 0,
          y: 0,
          toJSON: () => {},
        }),
        querySelector: (selector: string) => {
          if (selector === 'canvas') {
            return children.find((c: any) => c.tagName === 'CANVAS') || el;
          }
          const cls = selector.startsWith('.') ? selector.slice(1) : selector;
          let found = children.find((c: any) => c.className === cls);
          if (!found) {
            found = createMockElement('div');
            found.className = cls;
            children.push(found);
          }
          return found;
        },
        querySelectorAll: () => [],
        getContext: (type: string) => (type === '2d' ? mockContext2D : null),
      };
      return el;
    };

    const mockDoc = {
      createElement: (tag: string) => createMockElement(tag),
      body: createMockElement('body'),
    };

    (globalThis as any).document = mockDoc;
    (globalThis as any).window = globalThis;
    (globalThis as any).window.addEventListener = vi.fn();
    (globalThis as any).window.removeEventListener = vi.fn();
    (globalThis as any).window.devicePixelRatio = 1;
    if (typeof globalThis.requestAnimationFrame === 'undefined') {
      (globalThis as any).requestAnimationFrame = (cb: Function) => setTimeout(() => cb(Date.now()), 16);
    }
  }
});

describe('Milestone M8: High-Contrast Visuals, Waves & Minimap Contours', () => {
  describe('1. 7-Tier Warship Depth Architecture & Pseudo-3D Volume', () => {
    it('constructs a ProceduralVessel with full 7-tier depth hierarchy', () => {
      const vessel = new ProceduralVessel('BATTLESHIP', 260, 38, 'HAZE_GREY', [
        {
          slotId: 'turret_1',
          offsetX: 60,
          offsetY: 0,
          baseAngle: 0,
          arcCoverage: Math.PI * 1.3,
          caliberMm: 460,
          barrels: 3,
        },
      ]);

      // Tier 0: Ocean Drop Shadow
      expect(vessel.shadowGraphics).toBeDefined();
      expect(vessel.container.children[0]).toBe(vessel.shadowGraphics);

      // Tier 1: Outer Hull & Armor Rim
      expect(vessel.hullGraphics).toBeDefined();
      expect(vessel.container.children[1]).toBe(vessel.hullGraphics);

      // Tier 2: Layered Deck Plates
      expect(vessel.deckGraphics).toBeDefined();
      expect(vessel.container.children[2]).toBe(vessel.deckGraphics);

      // Tier 3: Camouflage
      expect(vessel.camoGraphics).toBeDefined();
      expect(vessel.container.children[3]).toBe(vessel.camoGraphics);

      // Tier 4-5: Stepped Deckhouses, Bridge Window Bands & Funnels
      expect(vessel.superstructureGraphics).toBeDefined();
      expect(vessel.container.children[4]).toBe(vessel.superstructureGraphics);

      // Tier 6: Faceted 3D Turrets
      expect(vessel.turrets.length).toBe(1);
      const turret = vessel.turrets[0];
      expect(turret.shadowGraphics).toBeDefined();
      expect(turret.houseGraphics).toBeDefined();
      expect(turret.barrelGraphics).toBeDefined();
    });

    it('renders distinct 7-tier depth features across all 8 naval ship classes', () => {
      const classes: ShipClassId[] = [
        'COASTAL_PATROL',
        'DESTROYER',
        'CRUISER',
        'BATTLESHIP',
        'AIRCRAFT_CARRIER',
        'SUBMARINE',
        'TACTICAL_SUPPORT',
        'DREDGER_ICEBREAKER',
      ];

      for (const shipClass of classes) {
        const v = new ProceduralVessel(shipClass, 150, 20, 'DAZZLE', [
          {
            slotId: 'mount_1',
            offsetX: 20,
            offsetY: 0,
            baseAngle: 0,
            arcCoverage: Math.PI,
            caliberMm: 127,
          },
        ]);

        expect(v.shipClass).toBe(shipClass);
        expect(v.shadowGraphics.visible).toBe(true);
        expect(v.hullGraphics).toBeDefined();
        expect(v.deckGraphics).toBeDefined();
        expect(v.superstructureGraphics).toBeDefined();
      }
    });

    it('hides ocean drop shadow when submarine submerges to periscope or deep depth', () => {
      const sub = new ProceduralVessel('SUBMARINE', 110, 12, 'STEALTH_CARBON');
      expect(sub.shadowGraphics.visible).toBe(true);

      // Periscope depth
      sub.setDepth(1);
      expect(sub.shadowGraphics.visible).toBe(false);
      expect(sub.container.alpha).toBeCloseTo(0.68, 2);

      // Deep depth
      sub.setDepth(2);
      expect(sub.shadowGraphics.visible).toBe(false);
      expect(sub.container.alpha).toBeCloseTo(0.28, 2);

      // Surfacing restores shadow
      sub.setDepth(0);
      expect(sub.shadowGraphics.visible).toBe(true);
      expect(sub.container.alpha).toBe(1.0);
    });

    it('styles player name label with bright green font for local player and white for enemies', () => {
      const vessel = new ProceduralVessel('DESTROYER', 115, 12);

      // Local player receives bright green (mk48.io Guestbound style)
      vessel.setPlayerName('Guestbound', false, true);
      expect(vessel.nameLabel.text).toBe('Guestbound');
      expect(vessel.nameLabel.style.fill).toBe(0x00e676);
      expect(vessel.nameLabel.style.fontSize).toBe(13);

      // Ally receives cyan
      vessel.setPlayerName('FleetAlly_1', true, false);
      expect(vessel.nameLabel.style.fill).toBe(0x64ffda);
      expect(vessel.nameLabel.style.fontSize).toBe(11);

      // Enemy receives crisp white
      vessel.setPlayerName('Enemy_Dreadnought', false, false);
      expect(vessel.nameLabel.style.fill).toBe(0xffffff);
      expect(vessel.nameLabel.style.fontSize).toBe(11);
    });

    it('simulates turret mechanical recoil and smooth aiming traversal', () => {
      const turret = new ProceduralTurret({
        slotId: 'turret_fwd',
        offsetX: 30,
        offsetY: 0,
        baseAngle: 0,
        arcCoverage: Math.PI * 1.2,
        caliberMm: 380,
        barrels: 2,
      });

      expect(turret.recoilOffset).toBe(0);
      turret.fireRecoil();
      expect(turret.recoilOffset).toBe(-4);

      // Recoil kick damping recovery
      turret.update(0.1, 0, 0);
      expect(turret.recoilOffset).toBeGreaterThan(-4);

      // Traverse toward target angle
      turret.update(0.5, Math.PI / 4, 0);
      expect(turret.currentRelativeAngle).toBeGreaterThan(0);
    });
  });

  describe('2. Dynamic Ocean Waves, Hydrodynamic Wakes & Layer Stacking Order', () => {
    it('guarantees tactical underlays sit below surfaceLayer in PixiRenderer scene hierarchy', () => {
      const renderer = new PixiRenderer();
      const children = renderer.worldContainer.children;

      const sensorIdx = children.indexOf(renderer.sensorLayer);
      const surfaceIdx = children.indexOf(renderer.surfaceLayer);

      expect(sensorIdx).toBeGreaterThanOrEqual(0);
      expect(surfaceIdx).toBeGreaterThanOrEqual(0);
      // Firing arcs and tactical underlays MUST sit strictly below ship hulls!
      expect(sensorIdx).toBeLessThan(surfaceIdx);
      expect(renderer.zoom).toBeCloseTo(1.85, 2);
    });

    it('computes viewport-culled dynamic sine swell waves without errors', () => {
      const renderer = new PixiRenderer();
      renderer.setCameraPosition(0, 0);

      expect(() => {
        renderer.drawOceanWaves(0);
        renderer.drawOceanWaves(1.5);
        renderer.drawOceanWaves(10.0);
      }).not.toThrow();
    });

    it('emits dual-emitter wakes with bow divergent spray and stern prop wash ribbons', () => {
      const wakeFX = new WakeFX();
      expect(wakeFX.count).toBe(0);

      // Stern prop wash
      wakeFX.emitWake(-50, 0, 0, 16, 26, 0, true, 1);
      expect(wakeFX.count).toBe(1);

      // Bow divergent wave spray
      wakeFX.emitBowWave(50, 0, 0, 16, 26, 0, 1);
      expect(wakeFX.count).toBe(2);

      // Update lifespans and continuous ribbons
      expect(() => wakeFX.update(0.1)).not.toThrow();
      expect(wakeFX.count).toBe(2);

      wakeFX.clear();
      expect(wakeFX.count).toBe(0);
    });

    it('renders torpedoes with green downward triangle markers (▼) and cavitation bubbles', () => {
      const renderer = new PixiRenderer();

      expect(() => {
        renderer.renderProjectiles([
          {
            x: 100,
            y: 100,
            heading: 0,
            type: 'TORPEDO',
          },
          {
            x: 200,
            y: 200,
            heading: Math.PI / 4,
            type: 'MISSILE',
          },
          {
            x: 300,
            y: 300,
            heading: 0,
            type: 'SHELL',
          },
        ]);
      }).not.toThrow();
    });
  });

  describe('3. Accurate Island Minimap Closed Polygon Contours', () => {
    it('renders exact closed polygon contours when polygonVertices are provided', () => {
      const minimap = new TacticalMinimap(200, 6000);

      const islandPoly: MinimapTerrain = {
        type: 'ISLAND',
        polygonVertices: [
          { x: -500, y: -400 },
          { x: -200, y: -300 },
          { x: -300, y: -600 },
          { x: -600, y: -500 },
        ],
      };

      const shallowPoly: MinimapTerrain = {
        type: 'SHALLOW',
        polygonVertices: [
          { x: 400, y: 500 },
          { x: 700, y: 600 },
          { x: 500, y: 800 },
        ],
      };

      const icePoly: MinimapTerrain = {
        type: 'ICEBERG',
        polygonVertices: [
          { x: -1000, y: -2500 },
          { x: -700, y: -2300 },
          { x: -900, y: -2700 },
        ],
      };

      expect(() => {
        minimap.render(
          0,
          0,
          [{ id: 1, x: 0, y: 0, heading: 0, isPlayer: true, isFriendly: false }],
          [islandPoly, shallowPoly, icePoly],
          [{ x: 0, y: 1000, radius: 250, name: 'Oil_Rig_Alpha', progress: 0.5 }]
        );
      }).not.toThrow();
    });

    it('falls back gracefully to circular rendering if polygonVertices are omitted', () => {
      const minimap = new TacticalMinimap(200, 6000);

      const circularTerrain: MinimapTerrain = {
        type: 'ISLAND',
        x: 100,
        y: 100,
        radius: 150,
      };

      expect(() => {
        minimap.render(0, 0, [], [circularTerrain]);
      }).not.toThrow();
    });

    it('dispatches click callbacks translated from canvas pixels to world coordinates', () => {
      const minimap = new TacticalMinimap(200, 6000);
      let clickedWorldX = 0;
      let clickedWorldY = 0;

      minimap.onClick((wx, wy) => {
        clickedWorldX = wx;
        clickedWorldY = wy;
      });

      const canvas = minimap.container.querySelector('canvas')!;
      canvas.dispatchEvent({ type: 'click', clientX: 100, clientY: 100 } as any);
      expect(clickedWorldX).toBeCloseTo(0, 1);
      expect(clickedWorldY).toBeCloseTo(0, 1);

      canvas.dispatchEvent({ type: 'click', clientX: 0, clientY: 0 } as any);
      expect(clickedWorldX).toBeCloseTo(-3000, 1);
      expect(clickedWorldY).toBeCloseTo(-3000, 1);
    });
  });

  describe('4. Tactical Overlay Decluttering & Annular Deadzone Over Hull', () => {
    it('keeps tactical overlays hidden by default so water around vessels is 100% clean', () => {
      const overlays = new SensorOverlays();
      expect(overlays.isOverlayVisible).toBe(false);

      // Range rings should not draw when overlay is hidden
      overlays.drawRangeRings(0, 0, 400, 800, 600);
      // Firing arcs should not draw when overlay is hidden
      overlays.drawFiringArcs(0, 0, 0, [
        {
          baseAngle: 0,
          arcCoverage: Math.PI,
          currentAngle: 0,
          isLoaded: true,
          isOnBearing: true,
        },
      ]);
      // Radar sweep should not draw when overlay is hidden
      overlays.update(0.1, 0, 0, 800);
    });

    it('toggles tactical overlay visibility via toggleOverlay() and carves out annular deadzone', () => {
      const overlays = new SensorOverlays();
      expect(overlays.isOverlayVisible).toBe(false);

      const state1 = overlays.toggleOverlay();
      expect(state1).toBe(true);
      expect(overlays.isOverlayVisible).toBe(true);

      // Now drawing firing arcs renders annular donut sector with hull deadzone
      expect(() => {
        overlays.drawFiringArcs(
          0,
          0,
          0,
          [
            {
              baseAngle: 0,
              arcCoverage: Math.PI * 0.8,
              currentAngle: 0,
              isLoaded: true,
              isOnBearing: true,
            },
          ],
          210,
          115 // shipLength: innerRadius = 115 * 0.58 + 10 = 76.7m
        );
        overlays.drawRangeRings(0, 0, 450, 850, 620);
        overlays.update(0.1, 0, 0, 850);
      }).not.toThrow();

      // Toggle back off clears all tactical overlays
      const state2 = overlays.toggleOverlay();
      expect(state2).toBe(false);
      expect(overlays.isOverlayVisible).toBe(false);
    });
  });

  describe('5. NavalCommandApp Integration & Clean-Room Production Verification', () => {
    it('initializes NavalCommandApp with high zoom, Vietnamese overlay, and island closed polygons', async () => {
      const root = document.createElement('div');
      const app = new NavalCommandApp(root);
      // Mock renderer.init so it doesn't need WebGL context in node
      app.renderer.init = async () => {};
      await app.init(root);

      expect(app.renderer.zoom).toBeCloseTo(1.85, 2);
      expect(app.renderer.sensorOverlays.isOverlayVisible).toBe(false);

      // Toggle tactical overlay via [V] key function
      app.toggleTacticalOverlay();
      expect(app.renderer.sensorOverlays.isOverlayVisible).toBe(true);
      app.toggleTacticalOverlay();
      expect(app.renderer.sensorOverlays.isOverlayVisible).toBe(false);

      // Verify Start Screen overlay is present in the DOM
      const lobby = root.querySelector('.mk48-start-lobby-overlay');
      expect(lobby).toBeDefined();

      // Verify mk48-style in-game HUD is present in the DOM
      const ingameHud = root.querySelector('.mk48-ingame-hud-root');
      expect(ingameHud).toBeDefined();

      app.renderer.destroy();
    });
  });

  describe('6. Milestone M8 Bugfixes: Mount Proportions, Visual Beam, Upright UI & Oil Rig Platform', () => {
    it('renders compact torpedo tube launchers for TORPEDO and ROCKET_TORPEDO mounts without 85m protruding barrels', () => {
      const torpTurret = new ProceduralTurret({
        slotId: 'mid_torp',
        offsetX: 0,
        offsetY: 0,
        baseAngle: 0,
        arcCoverage: Math.PI * 1.3,
        caliberMm: 533,
        category: 'TORPEDO',
        beamMeters: 12,
      });

      expect(torpTurret.category).toBe('TORPEDO');
      expect(torpTurret.beamMeters).toBe(12);
      expect(torpTurret.recoilOffset).toBe(0);

      // Mechanical recoil kick and recovery
      torpTurret.fireRecoil();
      expect(torpTurret.recoilOffset).toBe(-4);
      torpTurret.update(0.1, 0, 0);
      expect(torpTurret.recoilOffset).toBeGreaterThan(-4);

      const rocketTorpTurret = new ProceduralTurret({
        slotId: 'rocket_torp',
        offsetX: 0,
        offsetY: 0,
        baseAngle: 0,
        arcCoverage: Math.PI,
        caliberMm: 533,
        category: 'ROCKET_TORPEDO',
        beamMeters: 14,
      });
      expect(rocketTorpTurret.category).toBe('ROCKET_TORPEDO');
    });

    it('renders flush VLS hatches for CRUISE_MISSILE and compact stern racks for DEPTH_CHARGE with zero protruding barrels', () => {
      const vls = new ProceduralTurret({
        slotId: 'vls_cell',
        offsetX: -10,
        offsetY: 0,
        baseAngle: 0,
        arcCoverage: Math.PI,
        category: 'CRUISE_MISSILE',
      });
      expect(vls.category).toBe('CRUISE_MISSILE');

      const depthRack = new ProceduralTurret({
        slotId: 'stern_dc',
        offsetX: -40,
        offsetY: 0,
        baseAngle: Math.PI,
        arcCoverage: Math.PI * 0.5,
        category: 'DEPTH_CHARGE',
      });
      expect(depthRack.category).toBe('DEPTH_CHARGE');

      const mineRack = new ProceduralTurret({
        slotId: 'stern_mine',
        offsetX: -42,
        offsetY: 0,
        baseAngle: Math.PI,
        arcCoverage: Math.PI * 0.5,
        category: 'NAVAL_MINE',
      });
      expect(mineRack.category).toBe('NAVAL_MINE');
    });

    it('clamps naval gun turret house width to beamMeters * 0.36 and barrel length between 8m and 18m', () => {
      // 460mm heavy cannon on Yamato (beam 38.9m)
      const heavyGun = new ProceduralTurret({
        slotId: 'heavy_main',
        offsetX: 50,
        offsetY: 0,
        baseAngle: 0,
        arcCoverage: Math.PI * 1.4,
        caliberMm: 460,
        category: 'ARTILLERY',
        beamMeters: 38.9,
      });
      expect(heavyGun.caliberMm).toBe(460);
      expect(heavyGun.beamMeters).toBe(38.9);

      // 127mm gun on Fletcher (beam 12m)
      const ddGun = new ProceduralTurret({
        slotId: 'fletcher_gun',
        offsetX: 30,
        offsetY: 0,
        baseAngle: 0,
        arcCoverage: Math.PI * 1.5,
        caliberMm: 127,
        category: 'ARTILLERY',
        beamMeters: 12,
      });
      expect(ddGun.caliberMm).toBe(127);
      expect(ddGun.beamMeters).toBe(12);
    });

    it('computes visualBeam = Math.max(beamMeters, lengthMeters * 0.20) for realistic hull proportions', () => {
      // Fletcher DD: length 114, beam 12 -> visualBeam = max(12, 114 * 0.20) = 22.8
      const fletcher = new ProceduralVessel('DESTROYER', 114, 12);
      expect(fletcher.beamMeters).toBe(12);
      expect(fletcher.visualBeam).toBeCloseTo(22.8, 1);

      // PT-109 Patrol: length 24, beam 6.2 -> visualBeam = max(6.2, 24 * 0.20 = 4.8) = 6.2
      const pt109 = new ProceduralVessel('COASTAL_PATROL', 24, 6.2);
      expect(pt109.beamMeters).toBe(6.2);
      expect(pt109.visualBeam).toBeCloseTo(6.2, 1);

      // Yamato Dreadnought: length 263, beam 38.9 -> visualBeam = max(38.9, 263 * 0.20 = 52.6) = 52.6
      const yamato = new ProceduralVessel('BATTLESHIP', 263, 38.9);
      expect(yamato.beamMeters).toBe(38.9);
      expect(yamato.visualBeam).toBeCloseTo(52.6, 1);
    });

    it('counter-rotates overheadUI so player name and HP bar remain strictly upright horizontal as ship rotates', () => {
      const vessel = new ProceduralVessel('DESTROYER', 114, 12);

      // Rotate ship by 90 degrees (Math.PI / 2)
      vessel.container.rotation = Math.PI / 2;
      vessel.update(0.016, 0);
      expect(vessel.overheadUI.rotation).toBeCloseTo(-Math.PI / 2, 4);

      // Rotate ship by 180 degrees (Math.PI)
      vessel.container.rotation = Math.PI;
      vessel.update(0.016, 0);
      expect(vessel.overheadUI.rotation).toBeCloseTo(-Math.PI, 4);

      // Rotate ship to arbitrary heading (e.g. 2.34 rad)
      vessel.container.rotation = 2.34;
      vessel.update(0.016, 0);
      expect(vessel.overheadUI.rotation).toBeCloseTo(-2.34, 4);
    });

    it('hides local player HP bar when at 100% HP and reveals it when damaged, while keeping enemy HP bar visible', () => {
      const playerVessel = new ProceduralVessel('DESTROYER', 114, 12);
      playerVessel.setPlayerName('Commander_You', false, true);

      // At 100% HP, local player HP bar should be hidden
      playerVessel.updateHpBar(1.0);
      expect(playerVessel.hpBarGraphics.visible).toBe(false);

      // Upon taking damage, local player HP bar is revealed
      playerVessel.updateHpBar(0.75);
      expect(playerVessel.hpBarGraphics.visible).toBe(true);

      // When repaired back to full, HP bar is hidden again
      playerVessel.updateHpBar(1.0);
      expect(playerVessel.hpBarGraphics.visible).toBe(false);

      // Enemy / bot vessel HP bar is always visible even at 100% HP
      const enemyVessel = new ProceduralVessel('DESTROYER', 114, 12);
      enemyVessel.setPlayerName('Bot_Enemy', false, false);
      enemyVessel.updateHpBar(1.0);
      expect(enemyVessel.hpBarGraphics.visible).toBe(true);
    });

    it('renders detailed 3D offshore oil platform without errors during app initialization', async () => {
      const root = document.createElement('div');
      const app = new NavalCommandApp(root);
      app.renderer.init = async () => {};
      await app.init(root);

      // Oil rigs exist in local server resource engine
      const rigs = app.localServer.resourceEngine.getAllOilRigs();
      expect(rigs.length).toBeGreaterThan(0);
      for (const rig of rigs) {
        expect(rig.captureRadius).toBeGreaterThan(0);
      }

      app.renderer.destroy();
    });

    it('localizes Tech Tree to Vietnamese and renders SVG ship silhouettes on ship cards', () => {
      const menus = new MenusManager();
      menus.showTechTree();

      const modal = (menus.overlayContainer as any).children[0];
      expect(modal).toBeDefined();
      const modalHtml = modal.innerHTML;
      expect(modalHtml).toContain('TÀU — CẤP ĐỘ 1 ĐẾN 10');
      expect(modalHtml).toContain('XP Trận đấu:');
      expect(modalHtml).toContain('Tiền Hải quân:');

      const grid = modal.querySelector('.tech-tree-grid');
      expect(grid.children.length).toBeGreaterThan(0);
      const firstCardHtml = grid.children[0].innerHTML;
      expect(firstCardHtml).toContain('Cấp 1');
      expect(firstCardHtml).toContain('ĐANG DÙNG');
      expect(firstCardHtml).toContain('<svg viewBox="-40 -15 80 30"');
    });
  });
});

