/**
 * Hydrodynamic Water Wake Meshes, Bow Spray & Propeller Wash Ribbons
 * Clean-Room procedural vector implementation using PixiJS v8.
 * Simulates Kelvin wake angle (19.47°) divergent bow spray and dual-screw propeller wash ribbons.
 */

import { Container, Graphics } from 'pixi.js';

interface WakeTrailNode {
  x: number;
  y: number;
  heading: number;
  beam: number;
  speedRatio: number;
  age: number;
  maxAge: number;
  isCavitation: boolean;
  type: 'STERN' | 'BOW';
  vesselId: number;
}

interface WakeBubble {
  x: number;
  y: number;
  radius: number;
  age: number;
  maxAge: number;
  alpha: number;
}

export class WakeFX {
  public readonly container: Container;
  private readonly graphics: Graphics;
  private wakeNodes: WakeTrailNode[] = [];
  private wakeBubbles: WakeBubble[] = [];
  private readonly maxNodes: number = 800;
  private readonly maxBubbles: number = 400;

  constructor() {
    this.container = new Container();
    this.graphics = new Graphics();
    this.container.addChild(this.graphics);
  }

  /**
   * Emit stern prop wash wake nodes and turbulent cavitation bubbles.
   * @param sternX World X coordinate of vessel stern
   * @param sternY World Y coordinate of vessel stern
   * @param heading Heading angle in radians
   * @param beam Vessel beam in meters
   * @param speedKnots Speed in knots
   * @param depth 0 = Surface, 1 = Periscope, 2 = Deep
   * @param isCavitating Cavitation state
   * @param vesselId Unique ID of vessel (optional)
   */
  public emitWake(
    sternX: number,
    sternY: number,
    heading: number,
    beam: number,
    speedKnots: number,
    depth: number = 0,
    isCavitating: boolean = false,
    vesselId: number = 0
  ): void {
    if (depth >= 2) return;
    if (speedKnots < 2.0) return;

    const speedRatio = Math.min(1.6, speedKnots / 28);
    const depthScale = depth === 1 ? 0.35 : 1.0;

    const node: WakeTrailNode = {
      x: sternX,
      y: sternY,
      heading,
      beam: beam * depthScale,
      speedRatio: speedRatio * depthScale,
      age: 0,
      maxAge: 4.0 * Math.max(0.6, speedRatio),
      isCavitation: isCavitating && depth === 0,
      type: 'STERN',
      vesselId,
    };

    if (this.wakeNodes.length >= this.maxNodes) {
      this.wakeNodes.shift();
    }
    this.wakeNodes.push(node);

    // Spawn dual-screw propeller foam bubbles (matching mk48.io curved bubble trail)
    if (depth === 0 && Math.random() < 0.8) {
      const perpAngle = heading + Math.PI / 2;
      const screwOffset = beam * 0.28;
      // Port screw bubble
      this.spawnBubble(
        sternX + Math.cos(perpAngle) * screwOffset + (Math.random() - 0.5) * 3,
        sternY + Math.sin(perpAngle) * screwOffset + (Math.random() - 0.5) * 3,
        2.0 + Math.random() * 2.5 * speedRatio
      );
      // Starboard screw bubble
      this.spawnBubble(
        sternX - Math.cos(perpAngle) * screwOffset + (Math.random() - 0.5) * 3,
        sternY - Math.sin(perpAngle) * screwOffset + (Math.random() - 0.5) * 3,
        2.0 + Math.random() * 2.5 * speedRatio
      );
    }
  }

  /**
   * Emit divergent bow wave spray at the vessel stem (+length * 0.48).
   * Generates expanding Kelvin V-crests.
   */
  public emitBowWave(
    bowX: number,
    bowY: number,
    heading: number,
    beam: number,
    speedKnots: number,
    depth: number = 0,
    vesselId: number = 0
  ): void {
    if (depth >= 1) return;
    if (speedKnots < 3.5) return;

    const speedRatio = Math.min(1.8, (speedKnots - 2) / 24);

    const node: WakeTrailNode = {
      x: bowX,
      y: bowY,
      heading,
      beam: beam * 0.8,
      speedRatio,
      age: 0,
      maxAge: 2.8 * Math.max(0.5, speedRatio),
      isCavitation: false,
      type: 'BOW',
      vesselId,
    };

    if (this.wakeNodes.length >= this.maxNodes) {
      this.wakeNodes.shift();
    }
    this.wakeNodes.push(node);
  }

  private spawnBubble(x: number, y: number, radius: number): void {
    if (this.wakeBubbles.length >= this.maxBubbles) {
      this.wakeBubbles.shift();
    }
    this.wakeBubbles.push({
      x,
      y,
      radius,
      age: 0,
      maxAge: 2.8 + Math.random() * 1.5,
      alpha: 0.85,
    });
  }

  /**
   * Update lifespans and render procedural continuous vector wake ribbons.
   */
  public update(dt: number): void {
    const g = this.graphics;
    g.clear();

    const alive: WakeTrailNode[] = [];
    const KELVIN_SIN = Math.sin(0.34); // ~19.47 degrees

    // 1. Render continuous connected quad ribbons between consecutive nodes
    for (let i = 0; i < this.wakeNodes.length; i++) {
      const node = this.wakeNodes[i];
      node.age += dt;

      if (node.age < node.maxAge) {
        alive.push(node);

        const progress = node.age / node.maxAge;
        const alpha = (1.0 - progress) * (node.isCavitation ? 0.75 : 0.5) * node.speedRatio;
        if (alpha <= 0.01) continue;

        const perpAngle = node.heading + Math.PI / 2;

        if (node.type === 'BOW') {
          // Divergent V-Bow Wave Spray (Kelvin angle expansion)
          const bowSpread = node.beam * 0.4 + node.age * 16.0 * KELVIN_SIN;
          const leftX = node.x + Math.cos(perpAngle) * bowSpread - Math.cos(node.heading) * (node.age * 4);
          const leftY = node.y + Math.sin(perpAngle) * bowSpread - Math.sin(node.heading) * (node.age * 4);
          const rightX = node.x - Math.cos(perpAngle) * bowSpread - Math.cos(node.heading) * (node.age * 4);
          const rightY = node.y - Math.sin(perpAngle) * bowSpread - Math.sin(node.heading) * (node.age * 4);

          // White foaming crest points
          const crestRad = Math.max(1.5, 2.2 * node.speedRatio * (1 - progress * 0.5));
          g.circle(leftX, leftY, crestRad);
          g.circle(rightX, rightY, crestRad);
          g.fill({ color: 0xffffff, alpha: alpha * 0.85 });

          // Fine V-angle spray line back to stem
          g.moveTo(leftX, leftY);
          g.lineTo(node.x, node.y);
          g.lineTo(rightX, rightY);
          g.stroke({ color: 0xc4ebf7, width: 1.5, alpha: alpha * 0.5 });
        } else {
          // STERN Prop Wash
          const sternSpread = node.beam * 0.5 + node.age * 10.0 * KELVIN_SIN;
          const leftX = node.x + Math.cos(perpAngle) * sternSpread;
          const leftY = node.y + Math.sin(perpAngle) * sternSpread;
          const rightX = node.x - Math.cos(perpAngle) * sternSpread;
          const rightY = node.y - Math.sin(perpAngle) * sternSpread;

          // Check if previous node belongs to same track for continuous ribbon mesh
          const prev = i > 0 ? this.wakeNodes[i - 1] : null;
          if (
            prev &&
            prev.type === 'STERN' &&
            prev.vesselId === node.vesselId &&
            Math.hypot(node.x - prev.x, node.y - prev.y) < 70
          ) {
            const prevSpread = prev.beam * 0.5 + prev.age * 10.0 * KELVIN_SIN;
            const prevPerp = prev.heading + Math.PI / 2;
            const pLeftX = prev.x + Math.cos(prevPerp) * prevSpread;
            const pLeftY = prev.y + Math.sin(prevPerp) * prevSpread;
            const pRightX = prev.x - Math.cos(prevPerp) * prevSpread;
            const pRightY = prev.y - Math.sin(prevPerp) * prevSpread;

            // Connected quad wash ribbon
            g.poly([leftX, leftY, rightX, rightY, pRightX, pRightY, pLeftX, pLeftY]);
            g.fill({
              color: node.isCavitation ? 0xffffff : 0xcaedf7,
              alpha: alpha * 0.45,
            });
          }

          // Central turbulent wash foam disc
          const centerFoamRad = (node.beam * 0.35 + node.age * 3.0) * node.speedRatio;
          g.circle(node.x, node.y, Math.max(1.5, centerFoamRad));
          g.fill({
            color: node.isCavitation ? 0xffffff : 0xdbf4fc,
            alpha: alpha * 0.6,
          });

          // Lateral Kelvin wave crests
          const crestRad = Math.max(1.2, (2.0 + node.age * 2.2) * node.speedRatio);
          g.circle(leftX, leftY, crestRad);
          g.circle(rightX, rightY, crestRad);
          g.fill({ color: 0xe0f7fa, alpha: alpha * 0.75 });
        }
      }
    }
    this.wakeNodes = alive;

    // 2. Render prominent white wake foam bubble trail (mk48.io Screenshot 3)
    const aliveBubbles: WakeBubble[] = [];
    for (const b of this.wakeBubbles) {
      b.age += dt;
      if (b.age < b.maxAge) {
        aliveBubbles.push(b);
        const progress = b.age / b.maxAge;
        const bAlpha = (1.0 - progress) * b.alpha;

        // Bright white bubble center
        g.circle(b.x, b.y, b.radius * (1.0 + progress * 0.4));
        g.fill({ color: 0xffffff, alpha: bAlpha });

        // Soft cyan water ring
        g.circle(b.x, b.y, b.radius * 1.3);
        g.stroke({ color: 0xa5e7f7, width: 0.8, alpha: bAlpha * 0.6 });
      }
    }
    this.wakeBubbles = aliveBubbles;
  }

  public clear(): void {
    this.wakeNodes = [];
    this.wakeBubbles = [];
    this.graphics.clear();
  }

  public get count(): number {
    return this.wakeNodes.length;
  }
}
