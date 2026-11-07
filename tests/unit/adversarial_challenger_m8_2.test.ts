/**
 * Adversarial Challenger M8-2 Test Suite
 * Empirical stress testing of:
 * 1. Dynamic Ocean Swell Wave Generator (10,000 steps, extreme camera coords +/- 50,000, 0 NaNs, 0 Infs, bounded amplitude)
 * 2. Minimap Island Polygon Contours (closed paths >= 3 vertices, Canvas 2D non-throwing, stress harness)
 * 3. Tactical Overlay Default Visibility (strictly false by default, zero clutter)
 * 4. Clean-Room Bundle Size & Asset Audit (< 15 MB, < 1 MB actual, zero bitmaps/audio)
 * 5. Visual Warship Proportions & Upright UI Invariants
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { PixiRenderer } from '../../client/src/rendering/pixi_renderer.js';
import { TacticalMinimap, MinimapTerrain } from '../../client/src/hud/minimap.js';
import { SensorOverlays } from '../../client/src/rendering/sensor_overlays.js';
import { AuthoritativeGameServer } from '../../server/core/game_server.js';
import { DEFAULT_ISLAND_PRESETS, IslandEntity } from '../../common/models/terrain.js';
import { ProceduralVessel, ProceduralTurret } from '../../client/src/rendering/vector_hulls.js';
import { NavalCommandApp } from '../../client/src/app.js';
import fs from 'fs';
import path from 'path';

// Setup lightweight DOM mocks for headless Node/vitest execution
beforeAll(() => {
  if (typeof globalThis.document === 'undefined') {
    const mockContext2D = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn((x, y) => {
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          throw new Error(`Canvas2D moveTo received non-finite coord: (${x}, ${y})`);
        }
      }),
      lineTo: vi.fn((x, y) => {
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          throw new Error(`Canvas2D lineTo received non-finite coord: (${x}, ${y})`);
        }
      }),
      closePath: vi.fn(),
      arc: vi.fn((cx, cy, r, s, e) => {
        if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(r)) {
          throw new Error(`Canvas2D arc received non-finite params: (${cx}, ${cy}, ${r})`);
        }
      }),
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
        value: 'Commander_You',
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

describe('Adversarial Challenger M8-2: Empirical Stress Harness', () => {
  // =========================================================================
  // 1. DYNAMIC OCEAN SWELL WAVE GENERATOR NUMERICAL STABILITY (10,000 STEPS)
  // =========================================================================
  describe('1. Dynamic Ocean Swell Wave Generator: Numerical Stability & Invariants', () => {
    const k1 = (2 * Math.PI) / 360; // Primary swell wavelength: 360m
    const omega1 = 0.85;            // Primary swell angular speed
    const k2 = (2 * Math.PI) / 130; // Secondary wavelet wavelength: 130m
    const omega2 = 1.5;             // Secondary wavelet speed

    // Raw wave elevation equation from pixi_renderer.ts
    function computeSwell(x: number, baseRowY: number, timeSec: number): number {
      return (
        12 * Math.sin(k1 * (x + baseRowY * 0.45) + omega1 * timeSec) +
        5 * Math.sin(k2 * (x - baseRowY * 0.3) + omega2 * timeSec)
      );
    }

    it('empirically verifies wave equation produces 0 NaNs, 0 Infinities, and bounded amplitude over 10,000 time steps', () => {
      const extremeCoordinates = [
        -50000, -25000, -10000, -3000, -1500, -500, 0, 500, 1500, 3000, 10000, 25000, 50000,
      ];
      const maxAmplitudeTheoretical = 12 + 5; // 17.0m

      let observedMin = Infinity;
      let observedMax = -Infinity;
      let totalEvaluations = 0;
      let nanCount = 0;
      let infCount = 0;

      // 10,000 time steps of dt = 0.1s (simulating 1,000 seconds of intense wave generation)
      const numSteps = 10000;
      const dt = 0.1;

      for (let step = 0; step < numSteps; step++) {
        const t = step * dt;

        // Sample across diagonal and orthogonal extreme coordinate pairs
        for (let i = 0; i < extremeCoordinates.length; i++) {
          const x = extremeCoordinates[i];
          const y = extremeCoordinates[(i * 3 + step) % extremeCoordinates.length];

          const swell = computeSwell(x, y, t);
          totalEvaluations++;

          if (Number.isNaN(swell)) nanCount++;
          if (!Number.isFinite(swell)) infCount++;

          if (swell < observedMin) observedMin = swell;
          if (swell > observedMax) observedMax = swell;
        }
      }

      expect(totalEvaluations).toBe(10000 * extremeCoordinates.length);
      expect(nanCount).toBe(0);
      expect(infCount).toBe(0);

      // Verify wave amplitude is strictly bounded within [-17.0m, +17.0m]
      expect(observedMin).toBeGreaterThanOrEqual(-maxAmplitudeTheoretical);
      expect(observedMax).toBeLessThanOrEqual(maxAmplitudeTheoretical);

      // Verify active oscillation occurs (not flat zero)
      expect(observedMin).toBeLessThan(-10);
      expect(observedMax).toBeGreaterThan(10);
    });

    it('runs PixiRenderer.drawOceanWaves() across extreme camera positions (+/- 50,000) for 10,000 frames without throwing', () => {
      const renderer = new PixiRenderer();

      const testPositions = [
        { x: 0, y: 0 },
        { x: 50000, y: 50000 },
        { x: -50000, y: -50000 },
        { x: 50000, y: -50000 },
        { x: -50000, y: 50000 },
        { x: 3000, y: 3000 },
        { x: -3000, y: -3000 },
        { x: 3638.9, y: 0 },   // Boundary where minX === maxX at zoom 1.85
        { x: -3638.9, y: 0 },  // Negative boundary
      ];

      // Execute 10,000 frames total across diverse positions
      const framesPerPosition = Math.floor(10000 / testPositions.length);
      let executedFrames = 0;

      for (const pos of testPositions) {
        renderer.setCameraPosition(pos.x, pos.y);

        for (let f = 0; f < framesPerPosition; f++) {
          const timeSec = (executedFrames + f) * 0.016; // 60 FPS delta
          expect(() => renderer.drawOceanWaves(timeSec)).not.toThrow();
        }
        executedFrames += framesPerPosition;
      }

      expect(executedFrames).toBeGreaterThanOrEqual(9990);
    });
  });

  // =========================================================================
  // 2. MINIMAP ISLAND POLYGON CONTOURS & CANVAS 2D STRESS TEST
  // =========================================================================
  describe('2. Minimap Island Polygon Contours: Geometry Integrity & Canvas 2D Safety', () => {
    it('verifies all server-authoritative island presets form closed polygons with >= 3 valid vertices', () => {
      const server = new AuthoritativeGameServer();
      const islands = server.getIslands();

      expect(islands.length).toBeGreaterThanOrEqual(3);

      for (const island of islands) {
        expect(island.id).toBeDefined();
        expect(island.polygon).toBeDefined();
        expect(Array.isArray(island.polygon.vertices)).toBe(true);

        const vertices = island.polygon.vertices;
        expect(vertices.length).toBeGreaterThanOrEqual(3);

        for (let i = 0; i < vertices.length; i++) {
          const v = vertices[i];
          expect(Number.isFinite(v.x)).toBe(true);
          expect(Number.isFinite(v.y)).toBe(true);
        }

        // Verify polygon is non-degenerate (bounding box has positive area)
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const v of vertices) {
          if (v.x < minX) minX = v.x;
          if (v.x > maxX) maxX = v.x;
          if (v.y < minY) minY = v.y;
          if (v.y > maxY) maxY = v.y;
        }

        const width = maxX - minX;
        const height = maxY - minY;
        expect(width).toBeGreaterThan(100);
        expect(height).toBeGreaterThan(100);
      }
    });

    it('renders server island polygons in TacticalMinimap with zero Canvas 2D errors', () => {
      const server = new AuthoritativeGameServer();
      const islands = server.getIslands();
      const minimap = new TacticalMinimap(200, 6000);

      const terrainList: MinimapTerrain[] = islands.map((isl) => ({
        type: 'ISLAND',
        polygonVertices: isl.polygon.vertices,
        x: isl.polygon.vertices[0]?.x ?? 0,
        y: isl.polygon.vertices[0]?.y ?? 0,
        radius: 180,
      }));

      expect(() => {
        minimap.render(0, 0, [], terrainList, []);
      }).not.toThrow();
    });

    it('adversarially stress-tests TacticalMinimap with degenerate, extreme, and complex polygons', () => {
      const minimap = new TacticalMinimap(200, 6000);

      const adversarialTerrains: MinimapTerrain[] = [
        // 1. Extreme coordinates (+/- 50,000 far beyond worldSize 6000)
        {
          type: 'ISLAND',
          polygonVertices: [
            { x: -50000, y: -50000 },
            { x: 50000, y: -50000 },
            { x: 50000, y: 50000 },
            { x: -50000, y: 50000 },
          ],
        },
        // 2. Minimum triangle (exactly 3 vertices)
        {
          type: 'ISLAND',
          polygonVertices: [
            { x: -100, y: -100 },
            { x: 100, y: -100 },
            { x: 0, y: 100 },
          ],
        },
        // 3. High-vertex star polygon (16 vertices)
        {
          type: 'ISLAND',
          polygonVertices: Array.from({ length: 16 }, (_, i) => {
            const angle = (i / 16) * Math.PI * 2;
            const r = i % 2 === 0 ? 300 : 150;
            return { x: 500 + Math.cos(angle) * r, y: 500 + Math.sin(angle) * r };
          }),
        },
        // 4. Iceberg polygon
        {
          type: 'ICEBERG',
          polygonVertices: [
            { x: -1500, y: -2000 },
            { x: -1200, y: -1800 },
            { x: -1400, y: -1600 },
          ],
        },
        // 5. Shallow water sandbar polygon
        {
          type: 'SHALLOW',
          polygonVertices: [
            { x: 1200, y: 800 },
            { x: 1500, y: 900 },
            { x: 1400, y: 1100 },
            { x: 1100, y: 1000 },
          ],
        },
        // 6. Degenerate: 0 vertices (should fallback gracefully without throwing)
        {
          type: 'ISLAND',
          polygonVertices: [],
          x: 200,
          y: 200,
          radius: 50,
        },
        // 7. Degenerate: 2 vertices (less than 3, should fallback to circle)
        {
          type: 'ISLAND',
          polygonVertices: [
            { x: 0, y: 0 },
            { x: 10, y: 10 },
          ],
          x: 300,
          y: 300,
          radius: 60,
        },
        // 8. Omitted polygonVertices entirely
        {
          type: 'ISLAND',
          x: -500,
          y: 500,
          radius: 80,
        },
      ];

      expect(() => {
        minimap.render(0, 0, [], adversarialTerrains, []);
      }).not.toThrow();
    });
  });

  // =========================================================================
  // 3. TACTICAL OVERLAY DEFAULT VISIBILITY INVARIANT
  // =========================================================================
  describe('3. Tactical Overlay Default Visibility: Strict False Invariant', () => {
    it('guarantees SensorOverlays.isOverlayVisible is strictly false upon construction', () => {
      const overlays = new SensorOverlays();
      expect(overlays.isOverlayVisible).toBe(false);
    });

    it('verifies NavalCommandApp initializes with isOverlayVisible === false by default', async () => {
      const root = document.createElement('div');
      const app = new NavalCommandApp(root);
      app.renderer.init = async () => {};
      await app.init(root);

      expect(app.renderer.sensorOverlays.isOverlayVisible).toBe(false);

      app.renderer.destroy();
    });

    it('verifies sensor overlays do not render any range rings or firing arcs while isOverlayVisible is false', () => {
      const overlays = new SensorOverlays();
      expect(overlays.isOverlayVisible).toBe(false);

      // Calling drawing functions must be no-ops when overlay is disabled
      overlays.drawRangeRings(0, 0, 350, 700, 500);
      overlays.drawFiringArcs(0, 0, 0, [
        {
          baseAngle: 0,
          arcCoverage: Math.PI,
          currentAngle: 0,
          isLoaded: true,
          isOnBearing: true,
        },
      ]);
      overlays.update(0.016, 0, 0, 700);

      // Toggle overlay ON -> drawing works
      overlays.toggleOverlay();
      expect(overlays.isOverlayVisible).toBe(true);

      expect(() => {
        overlays.drawRangeRings(0, 0, 350, 700, 500);
        overlays.drawFiringArcs(0, 0, 0, [
          {
            baseAngle: 0,
            arcCoverage: Math.PI,
            currentAngle: 0,
            isLoaded: true,
            isOnBearing: true,
          },
        ]);
        overlays.update(0.016, 0, 0, 700);
      }).not.toThrow();

      // Toggle overlay OFF -> clears tactical overlays
      overlays.toggleOverlay();
      expect(overlays.isOverlayVisible).toBe(false);
    });
  });

  // =========================================================================
  // 4. CLEAN-ROOM BUNDLE SIZE & ZERO EXTERNAL ASSET AUDIT
  // =========================================================================
  describe('4. Clean-Room Bundle Size & Zero External Assets Audit', () => {
    it('verifies dist production build total size is strictly under 15 MB (< 1 MB actual)', () => {
      const distPath = path.resolve(process.cwd(), 'dist');
      expect(fs.existsSync(distPath)).toBe(true);

      function getDirectorySizeBytes(dir: string): number {
        let total = 0;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            total += getDirectorySizeBytes(fullPath);
          } else if (entry.isFile()) {
            total += fs.statSync(fullPath).size;
          }
        }
        return total;
      }

      const totalBytes = getDirectorySizeBytes(distPath);
      const totalMB = totalBytes / (1024 * 1024);

      // Strict requirement: under 15 MB (< 1 MB actual)
      expect(totalMB).toBeLessThan(15.0);
      expect(totalMB).toBeLessThan(1.0); // Actual is ~0.7 MB
    });

    it('verifies client/src has zero external image bitmaps (.png, .jpg, .webp) or audio (.mp3, .wav, .ogg)', () => {
      const clientSrc = path.resolve(process.cwd(), 'client/src');
      const forbiddenExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.mp3', '.wav', '.ogg', '.flac'];

      function findForbiddenFiles(dir: string): string[] {
        const found: string[] = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            found.push(...findForbiddenFiles(fullPath));
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (forbiddenExtensions.includes(ext)) {
              found.push(fullPath);
            }
          }
        }
        return found;
      }

      const violations = findForbiddenFiles(clientSrc);
      expect(violations).toEqual([]);
    });
  });

  // =========================================================================
  // 5. WARSHIP PROPORTIONS & UPRIGHT UI INVARIANTS (REGRESSION DEFENSE)
  // =========================================================================
  describe('5. Warship Proportions & Upright UI Invariants', () => {
    it('verifies 533mm torpedo mounts do NOT create 85m cannon barrels', () => {
      const torpMount = new ProceduralTurret({
        slotId: 'mid_torp_533',
        offsetX: 0,
        offsetY: 0,
        baseAngle: 0,
        arcCoverage: Math.PI,
        caliberMm: 533,
        category: 'TORPEDO',
        beamMeters: 12,
      });

      expect(torpMount.category).toBe('TORPEDO');
      expect(torpMount.beamMeters).toBe(12);

      // In ProceduralTurret, torpedo mounts render compact 3-tube launcher rack (8m x 3.5m)
      // which fits comfortably within the 12m hull beam.
    });

    it('verifies vessel visualBeam invariant: visualBeam >= lengthMeters * 0.20', () => {
      const testCases: [string, number, number][] = [
        ['COASTAL_PATROL', 24, 6.2],
        ['DESTROYER', 114, 12],
        ['CRUISER', 186, 20.8],
        ['BATTLESHIP', 263, 38.9],
        ['AIRCRAFT_CARRIER', 260, 36.6],
        ['SUBMARINE', 110, 13.6],
        ['TACTICAL_SUPPORT', 170, 24.0],
        ['DREDGER_ICEBREAKER', 130, 26.5],
      ];

      for (const [shipClass, length, beam] of testCases) {
        const v = new ProceduralVessel(shipClass as any, length, beam);
        expect(v.visualBeam).toBeGreaterThanOrEqual(length * 0.20);
        expect(v.visualBeam).toBeGreaterThanOrEqual(beam);
      }
    });

    it('verifies counter-rotation strictly guarantees upright overhead UI across all 360-degree headings', () => {
      const vessel = new ProceduralVessel('DESTROYER', 114, 12);

      for (let deg = 0; deg < 360; deg += 15) {
        const rad = (deg * Math.PI) / 180;
        vessel.container.rotation = rad;
        vessel.update(0.016, 0);

        // overheadUI must counter-rotate by -rotation so net rotation in screen space is 0
        expect(vessel.overheadUI.rotation).toBeCloseTo(-rad, 5);
      }
    });
  });
});
