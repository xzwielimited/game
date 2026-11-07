/**
 * Remote Entity Snapshot Interpolator with 100ms Jitter Buffer
 * Clean-Room implementation for NavalCommand.io
 * Smooths remote vessel and projectile movement between 15-20 Hz server ticks.
 */

import { EntitySnapshot, WorldSnapshot } from './binary_client.js';
import { normalizeAngle, shortestAngleDiff } from '../../../common/math/vector2.js';


interface TimedSnapshot {
  timestamp: number;
  entities: Map<number, EntitySnapshot>;
}

export class SnapshotInterpolator {
  private snapshots: TimedSnapshot[] = [];
  public readonly jitterBufferMs: number;
  private readonly maxHistoryMs: number = 1000;

  constructor(jitterBufferMs: number = 100) {
    this.jitterBufferMs = jitterBufferMs;
  }

  public pushSnapshot(snapshot: WorldSnapshot): void {
    const entityMap = new Map<number, EntitySnapshot>();
    for (const ent of snapshot.entities) {
      entityMap.set(ent.entityId, ent);
    }

    this.snapshots.push({
      timestamp: snapshot.timestamp,
      entities: entityMap,
    });

    // Prune old history
    const cutoff = snapshot.timestamp - this.maxHistoryMs;
    this.snapshots = this.snapshots.filter((s) => s.timestamp >= cutoff);
  }

  /**
   * Calculate smoothly interpolated entity states for current render frame.
   */
  public getInterpolatedEntities(currentTimeMs: number): Map<number, EntitySnapshot> {
    const renderTime = currentTimeMs - this.jitterBufferMs;
    const result = new Map<number, EntitySnapshot>();

    if (this.snapshots.length === 0) return result;

    // If only one snapshot exists, return latest state directly
    if (this.snapshots.length === 1) {
      return new Map(this.snapshots[0].entities);
    }

    // Find bounding snapshots S1 and S2
    let s1: TimedSnapshot | null = null;
    let s2: TimedSnapshot | null = null;

    for (let i = 0; i < this.snapshots.length - 1; i++) {
      if (this.snapshots[i].timestamp <= renderTime && this.snapshots[i + 1].timestamp >= renderTime) {
        s1 = this.snapshots[i];
        s2 = this.snapshots[i + 1];
        break;
      }
    }

    // If target renderTime is newer than latest snapshot, extrapolate lightly from latest
    if (!s1 || !s2) {
      const latest = this.snapshots[this.snapshots.length - 1];
      const dt = Math.min(0.2, Math.max(0, (renderTime - latest.timestamp) / 1000.0));

      for (const [id, ent] of latest.entities) {
        result.set(id, {
          ...ent,
          x: ent.x + ent.vx * dt,
          y: ent.y + ent.vy * dt,
        });
      }
      return result;
    }

    // Calculate interpolation factor alpha [0, 1]
    const span = s2.timestamp - s1.timestamp;
    const alpha = span > 0 ? Math.max(0, Math.min(1.0, (renderTime - s1.timestamp) / span)) : 1.0;

    // Interpolate entities present in s1 and s2
    for (const [id, e1] of s1.entities) {
      const e2 = s2.entities.get(id);
      if (!e2) {
        // Entity deleted or despawned in s2
        result.set(id, e1);
        continue;
      }

      // Linear position lerp
      const x = e1.x + (e2.x - e1.x) * alpha;
      const y = e1.y + (e2.y - e1.y) * alpha;
      const vx = e1.vx + (e2.vx - e1.vx) * alpha;
      const vy = e1.vy + (e2.vy - e1.vy) * alpha;

      // Spherical angular slerp for heading and turret
      const headingDiff = shortestAngleDiff(e1.heading, e2.heading);
      const heading = normalizeAngle(e1.heading + headingDiff * alpha);

      const turretDiff = shortestAngleDiff(e1.turretAngle, e2.turretAngle);
      const turretAngle = normalizeAngle(e1.turretAngle + turretDiff * alpha);

      result.set(id, {
        ...e2,
        x,
        y,
        vx,
        vy,
        heading,
        turretAngle,
        currentHealth: e2.currentHealth,
        maxHealth: e2.maxHealth,
        depthState: e2.depthState,
      });
    }

    return result;
  }

  public clear(): void {
    this.snapshots = [];
  }

  public get snapshotCount(): number {
    return this.snapshots.length;
  }
}
