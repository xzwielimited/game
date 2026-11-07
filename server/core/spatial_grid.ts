/**
 * 2D Spatial Hash Grid for Broadphase Collision and Sensor Queries
 * Clean-Room implementation for NavalCommand.io
 */

export interface SpatialEntity {
  id: string | number;
  type: 'VESSEL' | 'PROJECTILE' | 'CRATE' | 'OIL_RIG' | 'BUOY';
  x: number;
  y: number;
  radius: number;
  data?: any;
}

export class SpatialGrid {
  private cellSize: number;
  private cells: Map<string, Set<SpatialEntity>> = new Map();
  private entityToCells: Map<string | number, Set<string>> = new Map();
  private entityMap: Map<string | number, SpatialEntity> = new Map();

  constructor(cellSize = 250) {
    this.cellSize = cellSize;
  }

  private getCellCoords(x: number, y: number): { cx: number; cy: number } {
    return {
      cx: Math.floor(x / this.cellSize),
      cy: Math.floor(y / this.cellSize),
    };
  }

  private cellKey(cx: number, cy: number): string {
    return `${cx}:${cy}`;
  }

  public insert(entity: SpatialEntity): void {
    if (this.entityMap.has(entity.id)) {
      this.remove(entity.id);
    }

    this.entityMap.set(entity.id, entity);
    const occupiedKeys = new Set<string>();

    const minX = entity.x - entity.radius;
    const maxX = entity.x + entity.radius;
    const minY = entity.y - entity.radius;
    const maxY = entity.y + entity.radius;

    const minCell = this.getCellCoords(minX, minY);
    const maxCell = this.getCellCoords(maxX, maxY);

    for (let cx = minCell.cx; cx <= maxCell.cx; cx++) {
      for (let cy = minCell.cy; cy <= maxCell.cy; cy++) {
        const key = this.cellKey(cx, cy);
        occupiedKeys.add(key);

        let cellSet = this.cells.get(key);
        if (!cellSet) {
          cellSet = new Set();
          this.cells.set(key, cellSet);
        }
        cellSet.add(entity);
      }
    }

    this.entityToCells.set(entity.id, occupiedKeys);
  }

  public remove(entityId: string | number): void {
    const entity = this.entityMap.get(entityId);
    if (!entity) return;

    const keys = this.entityToCells.get(entityId);
    if (keys) {
      for (const key of keys) {
        const cellSet = this.cells.get(key);
        if (cellSet) {
          cellSet.delete(entity);
          if (cellSet.size === 0) {
            this.cells.delete(key);
          }
        }
      }
      this.entityToCells.delete(entityId);
    }
    this.entityMap.delete(entityId);
  }

  public update(entity: SpatialEntity): void {
    this.insert(entity);
  }

  public get(entityId: string | number): SpatialEntity | undefined {
    return this.entityMap.get(entityId);
  }

  public queryRadius(x: number, y: number, radius: number): SpatialEntity[] {
    const minX = x - radius;
    const maxX = x + radius;
    const minY = y - radius;
    const maxY = y + radius;

    const minCell = this.getCellCoords(minX, minY);
    const maxCell = this.getCellCoords(maxX, maxY);

    const candidates = new Set<SpatialEntity>();
    for (let cx = minCell.cx; cx <= maxCell.cx; cx++) {
      for (let cy = minCell.cy; cy <= maxCell.cy; cy++) {
        const cellSet = this.cells.get(this.cellKey(cx, cy));
        if (cellSet) {
          for (const ent of cellSet) {
            candidates.add(ent);
          }
        }
      }
    }

    const radiusSq = radius * radius;
    const results: SpatialEntity[] = [];
    for (const ent of candidates) {
      const dx = ent.x - x;
      const dy = ent.y - y;
      const combinedRadius = radius + ent.radius;
      if (dx * dx + dy * dy <= combinedRadius * combinedRadius) {
        results.push(ent);
      }
    }

    return results;
  }

  public queryAABB(minX: number, minY: number, maxX: number, maxY: number): SpatialEntity[] {
    const minCell = this.getCellCoords(minX, minY);
    const maxCell = this.getCellCoords(maxX, maxY);

    const candidates = new Set<SpatialEntity>();
    for (let cx = minCell.cx; cx <= maxCell.cx; cx++) {
      for (let cy = minCell.cy; cy <= maxCell.cy; cy++) {
        const cellSet = this.cells.get(this.cellKey(cx, cy));
        if (cellSet) {
          for (const ent of cellSet) {
            candidates.add(ent);
          }
        }
      }
    }

    const results: SpatialEntity[] = [];
    for (const ent of candidates) {
      if (
        ent.x + ent.radius >= minX &&
        ent.x - ent.radius <= maxX &&
        ent.y + ent.radius >= minY &&
        ent.y - ent.radius <= maxY
      ) {
        results.push(ent);
      }
    }

    return results;
  }

  public clear(): void {
    this.cells.clear();
    this.entityToCells.clear();
    this.entityMap.clear();
  }

  public size(): number {
    return this.entityMap.size;
  }
}
