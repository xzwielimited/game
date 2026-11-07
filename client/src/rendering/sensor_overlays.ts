/**
 * Dynamic Sensor Overlays & Decluttered Firing Arcs
 * Clean-Room procedural vector implementation using PixiJS v8.
 * Radar sweeps, sonar ping pulses, dashed range rings, and annular donut firing arcs.
 * Hidden by default to keep the ocean around vessels 100% clean and unobscured.
 */

import { Container, Graphics } from 'pixi.js';

export interface FiringArcState {
  baseAngle: number;       // Radians relative to ship heading
  arcCoverage: number;     // Total arc sweep radians
  currentAngle: number;    // Current relative turret angle
  isLoaded: boolean;
  isOnBearing: boolean;
  isObstructed?: boolean;
}

export class SensorOverlays {
  public readonly container: Container;
  private readonly sweepGraphics: Graphics;
  private readonly rangeRingsGraphics: Graphics;
  private readonly firingArcsGraphics: Graphics;
  private readonly courseGraphics: Graphics;

  // Hidden by default for clean mk48.io-style combat view! Toggleable via [V] key.
  public isOverlayVisible: boolean = false;

  private radarAngle: number = 0;
  private sonarPulseRadius: number = 0;
  private sonarMaxRadius: number = 600;
  private isSonarActive: boolean = false;

  constructor() {
    this.container = new Container();
    this.sweepGraphics = new Graphics();
    this.rangeRingsGraphics = new Graphics();
    this.firingArcsGraphics = new Graphics();
    this.courseGraphics = new Graphics();

    this.container.addChild(this.rangeRingsGraphics);
    this.container.addChild(this.courseGraphics);
    this.container.addChild(this.firingArcsGraphics);
    this.container.addChild(this.sweepGraphics);
  }

  public toggleOverlay(): boolean {
    this.isOverlayVisible = !this.isOverlayVisible;
    if (!this.isOverlayVisible) {
      this.clearTacticalOverlays();
    }
    return this.isOverlayVisible;
  }

  public clearTacticalOverlays(): void {
    this.sweepGraphics.clear();
    this.rangeRingsGraphics.clear();
    this.firingArcsGraphics.clear();
  }

  /**
   * Helper to draw tactical dashed stipple rings.
   */
  private drawDashedRing(
    g: Graphics,
    cx: number,
    cy: number,
    radius: number,
    color: number,
    alpha: number
  ): void {
    const circum = 2 * Math.PI * radius;
    const dashCount = Math.max(20, Math.floor(circum / 36));
    const step = (2 * Math.PI) / dashCount;
    const dashLen = step * 0.55;

    for (let i = 0; i < dashCount; i++) {
      const start = i * step;
      const end = start + dashLen;
      g.beginPath();
      g.arc(cx, cy, radius, start, end);
      g.stroke({ color, width: 1.2, alpha });
    }
  }

  /**
   * Draw visual, radar, and sonar range rings centered at player vessel.
   * Rendered as subtle dashed rings so combat field remains clean.
   */
  public drawRangeRings(
    x: number,
    y: number,
    visualRange: number = 350,
    radarRange: number = 700,
    sonarRange: number = 500
  ): void {
    const g = this.rangeRingsGraphics;
    g.clear();

    if (!this.isOverlayVisible) return;

    // 1. Visual Range Ring (Subtle Dashed White)
    this.drawDashedRing(g, x, y, visualRange, 0xffffff, 0.18);

    // 2. Radar Range Ring (Emerald Green Dashed)
    this.drawDashedRing(g, x, y, radarRange, 0x00e676, 0.22);

    // 3. Sonar Range Ring (Cyan Dashed)
    this.drawDashedRing(g, x, y, sonarRange, 0x00e5ff, 0.2);
  }

  /**
   * Draw weapon firing arcs as annular donut sectors with an inner hull deadzone.
   * Leaves ship hull and overhead indicators 100% clean and unobscured.
   */
  public drawFiringArcs(
    shipX: number,
    shipY: number,
    shipHeading: number,
    arcs: FiringArcState[],
    arcRadius: number = 180,
    shipLength: number = 100
  ): void {
    const g = this.firingArcsGraphics;
    g.clear();

    if (!this.isOverlayVisible) return;

    // Inner hull deadzone: donut cutout around vessel perimeter
    const innerRadius = Math.max(32, shipLength * 0.58 + 10);
    const outerRadius = Math.max(innerRadius + 40, arcRadius);

    for (const arc of arcs) {
      const worldCenterAngle = shipHeading + arc.baseAngle;
      const startAngle = worldCenterAngle - arc.arcCoverage * 0.5;
      const endAngle = worldCenterAngle + arc.arcCoverage * 0.5;

      let arcColor = 0x00e676; // Ready
      let arcAlpha = 0.08;

      if (arc.isObstructed) {
        arcColor = 0xff1744; // Obstructed
        arcAlpha = 0.14;
      } else if (!arc.isLoaded || !arc.isOnBearing) {
        arcColor = 0xffab00; // Reloading / traversing
        arcAlpha = 0.10;
      }

      // 1. Annular Donut Sector (Deadzone over hull)
      g.beginPath();
      g.arc(shipX, shipY, outerRadius, startAngle, endAngle);
      g.arc(shipX, shipY, innerRadius, endAngle, startAngle, true);
      g.closePath();
      g.fill({ color: arcColor, alpha: arcAlpha });
      g.stroke({ color: arcColor, width: 1.0, alpha: arcAlpha * 2.5 });

      // 2. Gun bore-sight pointer line originating from inner deadzone boundary
      const currentWorldAngle = shipHeading + arc.currentAngle;
      const barrelStartX = shipX + Math.cos(currentWorldAngle) * innerRadius;
      const barrelStartY = shipY + Math.sin(currentWorldAngle) * innerRadius;
      const barrelTargetX = shipX + Math.cos(currentWorldAngle) * (outerRadius * 0.98);
      const barrelTargetY = shipY + Math.sin(currentWorldAngle) * (outerRadius * 0.98);

      g.moveTo(barrelStartX, barrelStartY);
      g.lineTo(barrelTargetX, barrelTargetY);
      g.stroke({ color: arcColor, width: 1.5, alpha: 0.65 });
    }
  }

  /**
   * Draw tactical mouse course direction reticle and dashed heading vector.
   */
  public drawCourseReticle(
    shipX: number,
    shipY: number,
    shipHeading: number,
    targetX: number,
    targetY: number,
    isMouseSteer: boolean
  ): void {
    const g = this.courseGraphics;
    g.clear();

    if (!isMouseSteer) return;

    const dx = targetX - shipX;
    const dy = targetY - shipY;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return;

    const targetAngle = Math.atan2(dy, dx);
    const cosA = Math.cos(targetAngle);
    const sinA = Math.sin(targetAngle);

    // 1. Subtle idle (50m) and flank speed (250m) zones (only when tactical overlay enabled)
    if (this.isOverlayVisible) {
      g.circle(shipX, shipY, 50);
      g.stroke({
        color: 0x00e5ff,
        width: 1,
        alpha: 0.08,
      });

      g.circle(shipX, shipY, 250);
      g.stroke({
        color: 0x00e5ff,
        width: 1,
        alpha: 0.06,
      });
    }

    // 2. Dashed tactical course vector from bow toward cursor
    const startDist = 26;
    const endDist = Math.max(startDist, dist);
    const dashLen = 12;
    const gapLen = 10;
    const stepLen = dashLen + gapLen;

    let currentD = startDist;
    while (currentD + dashLen <= endDist) {
      const x1 = shipX + cosA * currentD;
      const y1 = shipY + sinA * currentD;
      const x2 = shipX + cosA * (currentD + dashLen);
      const y2 = shipY + sinA * (currentD + dashLen);

      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      currentD += stepLen;
    }
    g.stroke({
      color: 0x00e5ff,
      width: 1.4,
      alpha: 0.35,
    });

    // 3. Subtle course reticle at target position
    g.circle(targetX, targetY, 7);
    g.stroke({
      color: 0x00e5ff,
      width: 1.4,
      alpha: 0.65,
    });

    g.circle(targetX, targetY, 2);
    g.fill({
      color: 0x00e5ff,
      alpha: 0.75,
    });

    // Crosshair tick marks
    const tickInner = 9;
    const tickOuter = 14;
    g.moveTo(targetX + tickInner, targetY);
    g.lineTo(targetX + tickOuter, targetY);
    g.moveTo(targetX - tickInner, targetY);
    g.lineTo(targetX - tickOuter, targetY);
    g.moveTo(targetX, targetY - tickInner);
    g.lineTo(targetX, targetY - tickOuter);
    g.moveTo(targetX, targetY + tickInner);
    g.lineTo(targetX, targetY + tickOuter);
    g.stroke({
      color: 0x00e5ff,
      width: 1.2,
      alpha: 0.6,
    });
  }

  /**
   * Trigger active sonar acoustic ping animation.
   */
  public triggerSonarPing(maxRadius: number = 600): void {
    this.isSonarActive = true;
    this.sonarPulseRadius = 10;
    this.sonarMaxRadius = maxRadius;
  }

  /**
   * Step radar sweep angle and sonar acoustic pulse expansion.
   */
  public update(dt: number, shipX: number, shipY: number, radarRange: number = 700): void {
    const g = this.sweepGraphics;
    g.clear();

    // 1. Radar sweep rotation (only if overlay enabled)
    if (this.isOverlayVisible) {
      this.radarAngle = (this.radarAngle + Math.PI * dt) % (2 * Math.PI);

      const trailAngle = 0.22;
      g.moveTo(shipX, shipY);
      g.arc(shipX, shipY, radarRange, this.radarAngle - trailAngle, this.radarAngle);
      g.closePath();
      g.fill({ color: 0x00e676, alpha: 0.08 });

      const sweepEndX = shipX + Math.cos(this.radarAngle) * radarRange;
      const sweepEndY = shipY + Math.sin(this.radarAngle) * radarRange;
      g.moveTo(shipX, shipY);
      g.lineTo(sweepEndX, sweepEndY);
      g.stroke({ color: 0x69f0ae, width: 1.6, alpha: 0.55 });
    }

    // 2. Active Sonar acoustic pulse (always visible if ping triggered)
    if (this.isSonarActive) {
      this.sonarPulseRadius += dt * 320;
      if (this.sonarPulseRadius >= this.sonarMaxRadius) {
        this.isSonarActive = false;
        this.sonarPulseRadius = 0;
      } else {
        const pulseAlpha = Math.max(0, 1.0 - this.sonarPulseRadius / this.sonarMaxRadius) * 0.7;
        g.circle(shipX, shipY, this.sonarPulseRadius);
        g.stroke({
          color: 0x00e5ff,
          width: 2.2,
          alpha: pulseAlpha,
        });
      }
    }
  }

  public clear(): void {
    this.sweepGraphics.clear();
    this.rangeRingsGraphics.clear();
    this.firingArcsGraphics.clear();
    this.courseGraphics.clear();
  }
}
