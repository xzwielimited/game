/**
 * Vector Particle System for Explosions, Muzzle Flashes & Wake Cavitation
 * Clean-Room procedural vector implementation using PixiJS v8.
 * Zero external bitmap textures!
 */

import { Container, Graphics } from 'pixi.js';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  maxRadius: number;
  color: number;
  alpha: number;
  decayRate: number;
  growRate: number;
  isRing?: boolean;
  strokeWidth?: number;
}

export class VectorParticleSystem {
  public readonly container: Container;
  private readonly graphics: Graphics;
  private particles: Particle[] = [];
  private maxParticles: number = 800;

  constructor() {
    this.container = new Container();
    this.graphics = new Graphics();
    this.container.addChild(this.graphics);
  }

  /**
   * Spawn a vector explosion with multiple layered particles:
   * 1. Shockwave ring expanding rapidly
   * 2. Hot incandescent core (yellow/orange)
   * 3. Smoke puffs (dark grey fading out)
   * 4. Radiating shrapnel sparks
   */
  public spawnExplosion(x: number, y: number, intensity: number = 1.0): void {
    const scale = Math.max(0.5, intensity);

    // 1. Expanding shockwave ring
    this.addParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      radius: 5 * scale,
      maxRadius: 65 * scale,
      color: 0xffffff,
      alpha: 0.9,
      decayRate: 1.8 / scale,
      growRate: 140 * scale,
      isRing: true,
      strokeWidth: 3 * scale,
    });

    // 2. High-energy core
    this.addParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      radius: 4 * scale,
      maxRadius: 35 * scale,
      color: 0xffaa00,
      alpha: 1.0,
      decayRate: 2.5 / scale,
      growRate: 80 * scale,
    });

    // 3. Fiery billows and smoke
    const billowCount = Math.floor(10 * scale);
    for (let i = 0; i < billowCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (20 + Math.random() * 60) * scale;
      const isFire = Math.random() < 0.6;
      this.addParticle({
        x: x + Math.cos(angle) * (5 * scale),
        y: y + Math.sin(angle) * (5 * scale),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: (4 + Math.random() * 8) * scale,
        maxRadius: (15 + Math.random() * 15) * scale,
        color: isFire ? (Math.random() < 0.5 ? 0xff4500 : 0xff8c00) : 0x4a4a4a,
        alpha: 0.85,
        decayRate: (0.9 + Math.random() * 0.8) / scale,
        growRate: (15 + Math.random() * 25) * scale,
      });
    }

    // 4. Radiating shrapnel sparks
    const sparkCount = Math.floor(14 * scale);
    for (let i = 0; i < sparkCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (80 + Math.random() * 140) * scale;
      this.addParticle({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 1.5 * scale,
        maxRadius: 2.0 * scale,
        color: Math.random() < 0.3 ? 0xffffff : 0xffea00,
        alpha: 1.0,
        decayRate: (2.0 + Math.random() * 1.5) / scale,
        growRate: 0,
      });
    }
  }

  /**
   * Spawn sharp muzzle flash at gun barrel coordinates pointing in barrel direction.
   */
  public spawnMuzzleFlash(x: number, y: number, angle: number, caliberMm: number = 127): void {
    const scale = Math.min(2.5, Math.max(0.6, caliberMm / 100));

    // Conical flash burst
    for (let i = 0; i < 4; i++) {
      const spread = (Math.random() - 0.5) * 0.4;
      const dist = (8 + Math.random() * 16) * scale;
      const px = x + Math.cos(angle + spread) * dist;
      const py = y + Math.sin(angle + spread) * dist;

      this.addParticle({
        x: px,
        y: py,
        vx: Math.cos(angle + spread) * (40 * scale),
        vy: Math.sin(angle + spread) * (40 * scale),
        radius: (3 + Math.random() * 5) * scale,
        maxRadius: 12 * scale,
        color: Math.random() < 0.5 ? 0xfffee0 : 0xffa500,
        alpha: 1.0,
        decayRate: 9.0, // Very quick flash decay (~0.1s)
        growRate: 20 * scale,
      });
    }

    // Small lingering smoke puff
    this.addParticle({
      x: x + Math.cos(angle) * (12 * scale),
      y: y + Math.sin(angle) * (12 * scale),
      vx: Math.cos(angle) * 10,
      vy: Math.sin(angle) * 10,
      radius: 4 * scale,
      maxRadius: 18 * scale,
      color: 0x888888,
      alpha: 0.6,
      decayRate: 1.4,
      growRate: 12 * scale,
    });
  }

  /**
   * Spawn hydrodynamic water splash (e.g. near misses, torpedo wakes, depth charges).
   */
  public spawnWaterSplash(x: number, y: number, size: number = 1.0): void {
    // Water plume ring
    this.addParticle({
      x,
      y,
      vx: 0,
      vy: 0,
      radius: 3 * size,
      maxRadius: 28 * size,
      color: 0xdff4f7,
      alpha: 0.8,
      decayRate: 2.2 / size,
      growRate: 45 * size,
      isRing: true,
      strokeWidth: 2 * size,
    });

    // Droplet bursts
    const droplets = Math.floor(8 * size);
    for (let i = 0; i < droplets; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (25 + Math.random() * 45) * size;
      this.addParticle({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: (2 + Math.random() * 3) * size,
        maxRadius: 5 * size,
        color: 0xbaecf5,
        alpha: 0.75,
        decayRate: 2.0 / size,
        growRate: 3 * size,
      });
    }
  }

  /**
   * Spawn single cavitation / bubble trail particle behind torpedoes and propellers.
   */
  public spawnCavitationBubble(x: number, y: number, driftVx: number = 0, driftVy: number = 0): void {
    this.addParticle({
      x: x + (Math.random() - 0.5) * 4,
      y: y + (Math.random() - 0.5) * 4,
      vx: driftVx + (Math.random() - 0.5) * 5,
      vy: driftVy + (Math.random() - 0.5) * 5,
      radius: 1.5 + Math.random() * 2,
      maxRadius: 5,
      color: 0xe6f7ff,
      alpha: 0.6,
      decayRate: 1.8,
      growRate: 4,
    });
  }

  private addParticle(particle: Particle): void {
    if (this.particles.length >= this.maxParticles) {
      this.particles.shift(); // Evict oldest
    }
    this.particles.push(particle);
  }

  /**
   * Step particle simulation and redraw vector primitives.
   */
  public update(dt: number): void {
    const g = this.graphics;
    g.clear();

    const alive: Particle[] = [];
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.radius = Math.min(p.maxRadius, p.radius + p.growRate * dt);
      p.alpha -= p.decayRate * dt;

      if (p.alpha > 0.01) {
        alive.push(p);

        if (p.isRing) {
          g.circle(p.x, p.y, p.radius);
          g.stroke({
            color: p.color,
            width: p.strokeWidth ?? 2,
            alpha: Math.max(0, p.alpha),
          });
        } else {
          g.circle(p.x, p.y, p.radius);
          g.fill({
            color: p.color,
            alpha: Math.max(0, p.alpha),
          });
        }
      }
    }
    this.particles = alive;
  }

  public clear(): void {
    this.particles = [];
    this.graphics.clear();
  }

  public get count(): number {
    return this.particles.length;
  }
}
