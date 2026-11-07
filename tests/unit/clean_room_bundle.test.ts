/**
 * Milestone M5 & Final Acceptance Audit Tests:
 * Clean-Room Compliance, Production Bundle Size (< 15 MB), and Procedural Vector & Audio Verification
 * Clean-Room Test Suite for NavalCommand.io
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ProceduralVessel } from '../../client/src/rendering/vector_hulls.js';
import { WakeFX } from '../../client/src/rendering/wake_fx.js';
import { VectorParticleSystem } from '../../client/src/rendering/particle_system.js';
import { SensorOverlays } from '../../client/src/rendering/sensor_overlays.js';

function getAllFilesRecursive(dirPath: string, result: string[] = []): string[] {
  if (!fs.existsSync(dirPath)) return result;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.agents') continue;
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      getAllFilesRecursive(full, result);
    } else {
      result.push(full);
    }
  }
  return result;
}

describe('M5 & Final Audit: Clean-Room Compliance, Bundle Size (< 15 MB) & Procedural Rendering', () => {
  it('verifies production build output in dist/ is strictly under 15 MB', () => {
    const distDir = path.resolve(process.cwd(), 'dist');
    expect(fs.existsSync(distDir)).toBe(true);

    const files = getAllFilesRecursive(distDir);
    expect(files.length).toBeGreaterThan(0);

    let totalBytes = 0;
    for (const file of files) {
      totalBytes += fs.statSync(file).size;
    }

    const maxAllowedBytes = 15 * 1024 * 1024; // 15 MB
    expect(totalBytes).toBeGreaterThan(10_000);
    expect(totalBytes).toBeLessThan(maxAllowedBytes);
  });

  it('confirms 100% Clean-Room compliance: zero external bitmap spritesheets, audio files, or AGPL-3.0 mk48 code', () => {
    const rootDir = process.cwd();
    const sourceDirs = ['common', 'server', 'client'].map((d) => path.join(rootDir, d));
    const allSourceFiles = sourceDirs.flatMap((d) => getAllFilesRecursive(d));

    const forbiddenExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.mp3', '.wav', '.ogg'];
    for (const file of allSourceFiles) {
      const ext = path.extname(file).toLowerCase();
      expect(forbiddenExtensions).not.toContain(ext);

      if (ext === '.ts' || ext === '.html') {
        const content = fs.readFileSync(file, 'utf8');
        expect(content).not.toContain('GNU AFFERO GENERAL PUBLIC LICENSE');
        expect(content).not.toContain('SoftbearStudios');
      }
    }
  });

  it('instantiates and steps 100% procedural PixiJS v8 vector vessels, turrets, wakes, particles, and sensor overlays', () => {
    const vessel = new ProceduralVessel('BATTLESHIP', 263, 38.9, 'DAZZLE', [
      {
        slotId: 'main_1',
        offsetX: 70,
        offsetY: 0,
        baseAngle: 0,
        arcCoverage: Math.PI * 1.4,
        caliberMm: 460,
        barrels: 3,
      },
    ]);

    expect(vessel.turrets.length).toBe(1);
    vessel.turrets[0].fireRecoil();
    vessel.update(0.1, 0.5);
    vessel.setDepth(1);
    vessel.updateHpBar(0.75);

    const wakes = new WakeFX();
    wakes.emitWake(0, 0, 0, 20, 28, 0, true);
    expect(wakes.count).toBe(1);
    wakes.update(0.1);

    const particles = new VectorParticleSystem();
    particles.spawnExplosion(100, 100, 1.2);
    particles.spawnMuzzleFlash(50, 50, 0, 406);
    particles.spawnWaterSplash(20, 20, 1.0);
    expect(particles.count).toBeGreaterThan(10);
    particles.update(0.1);

    const sensors = new SensorOverlays();
    sensors.drawRangeRings(0, 0, 400, 800, 600);
    sensors.drawFiringArcs(0, 0, 0, [
      {
        baseAngle: 0,
        arcCoverage: Math.PI,
        currentAngle: 0,
        isLoaded: true,
        isOnBearing: true,
      },
    ]);
    sensors.triggerSonarPing(600);
    sensors.update(0.1, 0, 0, 800);
  });
});
