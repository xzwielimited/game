/**
 * PixiJS v8 Application Renderer & Camera Viewport
 * Clean-Room implementation for NavalCommand.io
 * Coordinates vibrant marine ocean background, dynamic multi-harmonic sine swell waves,
 * terrain layers, vector vessels, wakes, torpedo indicators, and sensor overlays.
 */

import { Application, Container, Graphics } from 'pixi.js';
import { WakeFX } from './wake_fx.js';
import { VectorParticleSystem } from './particle_system.js';
import { SensorOverlays } from './sensor_overlays.js';
import { ProceduralVessel } from './vector_hulls.js';

export class PixiRenderer {
  public app: Application | null = null;
  public readonly worldContainer: Container;

  // Scene layer hierarchy (Tactical underlay sits BELOW surfaceLayer to guarantee 100% clean hulls)
  public readonly oceanLayer: Container;
  public readonly terrainLayer: Container;
  public readonly wakeLayer: Container;
  public readonly sensorLayer: Container;       // Layer 3: Tactical underlay (BELOW surfaceLayer)
  public readonly submergedLayer: Container;    // Layer 4: Submarines
  public readonly surfaceLayer: Container;      // Layer 5: Surface Warships (Unobscured!)
  public readonly projectilesLayer: Container;  // Layer 6: Torpedoes, Shells, Missiles
  public readonly particleLayer: Container;     // Layer 7: Explosions & Splashes
  public readonly worldUILayer: Container;      // Layer 8: World UI

  // Subsystems
  public readonly wakeFX: WakeFX;
  public readonly particles: VectorParticleSystem;
  public readonly sensorOverlays: SensorOverlays;

  // Procedural background & waves
  private oceanGridGraphics: Graphics;
  private oceanWaveGraphics: Graphics;
  private projectileGraphics: Graphics;
  private elapsedTimeSec: number = 0;

  // Camera state (Default zoom ~1.85 so warships are crisp, large and prominent)
  public cameraX: number = 0;
  public cameraY: number = 0;
  public zoom: number = 1.85;
  public minZoom: number = 0.4;
  public maxZoom: number = 3.2;

  private isInitialized: boolean = false;

  constructor() {
    this.worldContainer = new Container();

    this.oceanLayer = new Container();
    this.terrainLayer = new Container();
    this.wakeLayer = new Container();
    this.sensorLayer = new Container();
    this.submergedLayer = new Container();
    this.surfaceLayer = new Container();
    this.projectilesLayer = new Container();
    this.particleLayer = new Container();
    this.worldUILayer = new Container();

    this.wakeFX = new WakeFX();
    this.particles = new VectorParticleSystem();
    this.sensorOverlays = new SensorOverlays();

    this.oceanGridGraphics = new Graphics();
    this.oceanWaveGraphics = new Graphics();
    this.projectileGraphics = new Graphics();

    this.oceanLayer.addChild(this.oceanGridGraphics);
    this.oceanLayer.addChild(this.oceanWaveGraphics);
    this.wakeLayer.addChild(this.wakeFX.container);
    this.sensorLayer.addChild(this.sensorOverlays.container);
    this.projectilesLayer.addChild(this.projectileGraphics);
    this.particleLayer.addChild(this.particles.container);

    // Guaranteed Z-Order: Tactical underlays sit beneath vessel surface layer!
    this.worldContainer.addChild(this.oceanLayer);        // 0
    this.worldContainer.addChild(this.terrainLayer);      // 1
    this.worldContainer.addChild(this.wakeLayer);         // 2
    this.worldContainer.addChild(this.sensorLayer);       // 3: Tactical underlay
    this.worldContainer.addChild(this.submergedLayer);    // 4
    this.worldContainer.addChild(this.surfaceLayer);      // 5: Clean warships!
    this.worldContainer.addChild(this.projectilesLayer);  // 6
    this.worldContainer.addChild(this.particleLayer);     // 7
    this.worldContainer.addChild(this.worldUILayer);      // 8
  }

  /**
   * Initialize PixiJS v8 Application onto parent container / canvas.
   * Uses vibrant royal/marine blue ocean matching mk48.io screenshots (#1c487a).
   */
  public async init(parentElement: HTMLElement): Promise<void> {
    if (this.isInitialized) return;

    this.app = new Application();
    await this.app.init({
      resizeTo: parentElement,
      backgroundColor: 0x1c487a, // Vibrant marine blue ocean (matching mk48.io)
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
    });

    parentElement.appendChild(this.app.canvas);
    this.app.stage.addChild(this.worldContainer);

    this.drawOceanGrid();
    this.isInitialized = true;
  }

  /**
   * Draw static ocean boundary and subtle coordinate grid.
   */
  public drawOceanGrid(): void {
    const g = this.oceanGridGraphics;
    g.clear();

    const mapSize = 6000;
    const half = mapSize * 0.5;
    const step = 300;

    // Soft coordinate grid lines
    for (let x = -half; x <= half; x += step) {
      g.moveTo(x, -half);
      g.lineTo(x, half);
      g.stroke({
        color: 0x245588,
        width: 1,
        alpha: 0.3,
      });
    }

    for (let y = -half; y <= half; y += step) {
      g.moveTo(-half, y);
      g.lineTo(half, y);
      g.stroke({
        color: 0x245588,
        width: 1,
        alpha: 0.3,
      });
    }

    // World boundary outline
    g.rect(-half, -half, mapSize, mapSize);
    g.stroke({
      color: 0x00e676,
      width: 2.5,
      alpha: 0.6,
    });
  }

  /**
   * Viewport-culled procedural dynamic multi-harmonic sine swell waves & foam glints.
   * Runs smoothly at 60+ FPS with zero external bitmap textures!
   */
  public drawOceanWaves(timeSec: number): void {
    const g = this.oceanWaveGraphics;
    g.clear();

    const sw = this.app ? this.app.screen.width : 1920;
    const sh = this.app ? this.app.screen.height : 1080;
    const pad = 120;
    const viewHalfW = (sw * 0.5) / this.zoom + pad;
    const viewHalfH = (sh * 0.5) / this.zoom + pad;

    // Viewport cull bounds in world coordinates
    const minX = Math.max(-3000, this.cameraX - viewHalfW);
    const maxX = Math.min(3000, this.cameraX + viewHalfW);
    const minY = Math.max(-3000, this.cameraY - viewHalfH);
    const maxY = Math.min(3000, this.cameraY + viewHalfH);

    const waveSpacing = 95;
    const startY = Math.floor(minY / waveSpacing) * waveSpacing;
    const endY = Math.ceil(maxY / waveSpacing) * waveSpacing;

    const segmentStep = 60;
    const k1 = (2 * Math.PI) / 360; // Primary swell wavelength: 360m
    const omega1 = 0.85;            // Primary swell angular speed
    const k2 = (2 * Math.PI) / 130; // Secondary wavelet wavelength: 130m
    const omega2 = 1.5;             // Secondary wavelet speed

    for (let baseRowY = startY; baseRowY <= endY; baseRowY += waveSpacing) {
      // Primary swell ribbon
      let isFirst = true;
      for (let x = minX; x <= maxX; x += segmentStep) {
        const swell = 12 * Math.sin(k1 * (x + baseRowY * 0.45) + omega1 * timeSec) +
                      5 * Math.sin(k2 * (x - baseRowY * 0.3) + omega2 * timeSec);
        const y = baseRowY + swell;

        if (isFirst) {
          g.moveTo(x, y);
          isFirst = false;
        } else {
          g.lineTo(x, y);
        }
      }
      g.stroke({
        color: 0x24588f,
        width: 2.0,
        alpha: 0.45,
      });

      // Shimmering foam glints along wave crest peaks
      const crestPhase = (baseRowY * 0.008 + timeSec * 0.7) % 1.0;
      if (crestPhase > 0.4 && crestPhase < 0.8) {
        const crestX = minX + ((baseRowY * 73 + timeSec * 45) % (maxX - minX));
        const crestY = baseRowY + 12 * Math.sin(k1 * crestX + omega1 * timeSec);
        if (crestX >= minX && crestX <= maxX) {
          g.moveTo(crestX - 16, crestY - 1);
          g.lineTo(crestX + 16, crestY + 1);
          g.stroke({
            color: 0xebf8ff,
            width: 1.8,
            alpha: 0.55 * (1.0 - Math.abs(crestPhase - 0.6) / 0.2),
          });
        }
      }
    }
  }

  /**
   * Center camera smoothly on target world coordinates.
   */
  public setCameraPosition(x: number, y: number, smoothLerp: number = 1.0): void {
    if (smoothLerp >= 1.0) {
      this.cameraX = x;
      this.cameraY = y;
    } else {
      this.cameraX += (x - this.cameraX) * smoothLerp;
      this.cameraY += (y - this.cameraY) * smoothLerp;
    }

    this.updateViewportTransform();
  }

  public setZoom(targetZoom: number): void {
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, targetZoom));
    this.updateViewportTransform();
  }

  public zoomBy(deltaFactor: number): void {
    this.setZoom(this.zoom * deltaFactor);
  }

  private updateViewportTransform(): void {
    if (!this.app) return;

    const screenWidth = this.app.screen.width;
    const screenHeight = this.app.screen.height;

    this.worldContainer.scale.set(this.zoom);
    this.worldContainer.position.set(
      screenWidth * 0.5 - this.cameraX * this.zoom,
      screenHeight * 0.5 - this.cameraY * this.zoom
    );
  }

  public screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    if (!this.app) return { x: screenX, y: screenY };
    const screenWidth = this.app.screen.width;
    const screenHeight = this.app.screen.height;

    const worldX = (screenX - screenWidth * 0.5) / this.zoom + this.cameraX;
    const worldY = (screenY - screenHeight * 0.5) / this.zoom + this.cameraY;
    return { x: worldX, y: worldY };
  }

  public worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    if (!this.app) return { x: worldX, y: worldY };
    const screenWidth = this.app.screen.width;
    const screenHeight = this.app.screen.height;

    const screenX = (worldX - this.cameraX) * this.zoom + screenWidth * 0.5;
    const screenY = (worldY - this.cameraY) * this.zoom + screenHeight * 0.5;
    return { x: screenX, y: screenY };
  }

  /**
   * Draw projectiles (torpedoes, shells, missiles) as vector shapes.
   * Renders bright green downward triangle markers (▼) above active torpedoes with white bubble trails!
   */
  public renderProjectiles(
    projectiles: Array<{
      x: number;
      y: number;
      heading: number;
      type: 'SHELL' | 'TORPEDO' | 'MISSILE' | 'MINE' | 'DEPTH_CHARGE';
    }>
  ): void {
    const g = this.projectileGraphics;
    g.clear();

    for (const p of projectiles) {
      if (p.type === 'TORPEDO') {
        const len = 12;
        const width = 2.8;
        const cos = Math.cos(p.heading);
        const sin = Math.sin(p.heading);

        // 1. Torpedo hydrodynamic cylinder body
        g.moveTo(p.x - cos * len, p.y - sin * len);
        g.lineTo(p.x + cos * len * 0.4, p.y + sin * len * 0.4);
        g.stroke({ color: 0x1f2937, width: width + 1 });

        g.circle(p.x + cos * len * 0.4, p.y + sin * len * 0.4, width * 0.6);
        g.fill({ color: 0x38ef7d });

        // 2. White propeller cavitation bubbles behind torpedo (mk48.io Screenshot 3)
        for (let b = 1; b <= 3; b++) {
          const bx = p.x - cos * (len + b * 5) + (Math.random() - 0.5) * 2;
          const by = p.y - sin * (len + b * 5) + (Math.random() - 0.5) * 2;
          g.circle(bx, by, 1.4 + b * 0.5);
          g.fill({ color: 0xffffff, alpha: 0.8 - b * 0.2 });
        }

        // 3. Bright Green Downward Triangle Marker (▼) above Torpedo (mk48.io Screenshot 3)
        const markerDist = 16;
        const mx = p.x;
        const my = p.y - markerDist;
        const triSize = 6;

        g.moveTo(mx - triSize, my - triSize);
        g.lineTo(mx + triSize, my - triSize);
        g.lineTo(mx, my);
        g.closePath();
        g.fill({ color: 0x00e676 }); // Crisp emerald green
        g.stroke({ color: 0x052e16, width: 1.2 });
      } else if (p.type === 'MISSILE') {
        // Missile: fast needle with orange thrust flame
        const len = 13;
        const cos = Math.cos(p.heading);
        const sin = Math.sin(p.heading);

        g.moveTo(p.x - cos * len, p.y - sin * len);
        g.lineTo(p.x + cos * len, p.y + sin * len);
        g.stroke({ color: 0xffffff, width: 2.5 });

        // Rocket plume flame
        g.circle(p.x - cos * len, p.y - sin * len, 3.5);
        g.fill({ color: 0xff9100 });
      } else if (p.type === 'MINE') {
        // Sea mine: spiky circular contact mine
        g.circle(p.x, p.y, 4.5);
        g.fill({ color: 0x111827 });
        g.stroke({ color: 0xff1744, width: 1.5 });
      } else {
        // Standard naval artillery shell: glowing tracer dot
        g.circle(p.x, p.y, 2.8);
        g.fill({ color: 0xffea00 });
      }
    }
  }

  public update(dt: number): void {
    this.elapsedTimeSec += dt;
    this.drawOceanWaves(this.elapsedTimeSec);
    this.wakeFX.update(dt);
    this.particles.update(dt);
  }

  public destroy(): void {
    if (this.app) {
      this.app.destroy(true, { children: true });
      this.app = null;
      this.isInitialized = false;
    }
  }
}
