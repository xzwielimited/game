/**
 * Interactive Tactical Minimap
 * Clean-Room implementation for NavalCommand.io
 * Renders accurate island closed polygon contours, shallow sandbars, Arctic ice shelves,
 * objectives, fleet members, enemy pings, and click-to-pan coordinates.
 */

export interface MinimapContact {
  id: number;
  x: number;
  y: number;
  heading: number;
  isPlayer: boolean;
  isFriendly: boolean;
  isSubmerged?: boolean;
}

export interface MinimapTerrain {
  type: 'ISLAND' | 'SHALLOW' | 'ICEBERG';
  polygonVertices?: { x: number; y: number }[];
  x?: number;
  y?: number;
  radius?: number;
}

export interface MinimapObjective {
  x: number;
  y: number;
  radius: number;
  name: string;
  progress: number; // 0..1
}

export type MinimapClickCallback = (worldX: number, worldY: number) => void;

export class TacticalMinimap {
  public readonly container: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private worldSize: number = 6000;
  private onClickCb: MinimapClickCallback | null = null;
  private highlightedFleetMemberId: number | null = null;

  constructor(sizePx: number = 200, worldSize: number = 6000) {
    this.worldSize = worldSize;

    this.container = document.createElement('div');
    this.container.className = 'tactical-minimap-panel';
    this.container.style.cssText = `
      position: absolute;
      bottom: 20px;
      left: 20px;
      width: ${sizePx}px;
      height: ${sizePx}px;
      background: rgba(13, 39, 69, 0.88);
      border: 1.5px solid rgba(0, 230, 118, 0.5);
      border-radius: 4px;
      box-shadow: 0 4px 18px rgba(0, 0, 0, 0.6);
      overflow: hidden;
      cursor: crosshair;
      user-select: none;
      z-index: 100;
    `;

    this.canvas = document.createElement('canvas');
    this.canvas.width = sizePx;
    this.canvas.height = sizePx;
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.container.appendChild(this.canvas);

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D context for minimap');
    this.ctx = ctx;

    this.canvas.addEventListener('click', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      const normX = clickX / this.canvas.width - 0.5;
      const normY = clickY / this.canvas.height - 0.5;

      const worldX = normX * this.worldSize;
      const worldY = normY * this.worldSize;

      if (this.onClickCb) {
        this.onClickCb(worldX, worldY);
      }
    });
  }

  public onClick(cb: MinimapClickCallback): void {
    this.onClickCb = cb;
  }

  public highlightFleetMember(id: number | null): void {
    this.highlightedFleetMemberId = id;
  }

  /**
   * Render complete minimap situational layer with exact closed polygon contours.
   */
  public render(
    playerX: number,
    playerY: number,
    contacts: MinimapContact[],
    terrainList: MinimapTerrain[] = [],
    objectives: MinimapObjective[] = []
  ): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const half = this.worldSize * 0.5;

    ctx.clearRect(0, 0, w, h);

    // 1. Ocean Background (Vibrant Marine Blue) & Grid
    ctx.fillStyle = '#0d2745';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(36, 85, 136, 0.45)';
    ctx.lineWidth = 1;
    const gridDivisions = 4;
    for (let i = 1; i < gridDivisions; i++) {
      const pos = (i / gridDivisions) * w;
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, h);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, pos);
      ctx.lineTo(w, pos);
      ctx.stroke();
    }

    const toMapCoord = (wx: number, wy: number) => {
      return {
        mx: ((wx + half) / this.worldSize) * w,
        my: ((wy + half) / this.worldSize) * h,
      };
    };

    // 2. Terrain Features (Accurate Island Closed Polygons & Shallow Sandbars)
    for (const t of terrainList) {
      if (t.polygonVertices && t.polygonVertices.length >= 3) {
        // Draw exact closed polygon contour
        ctx.beginPath();
        const first = toMapCoord(t.polygonVertices[0].x, t.polygonVertices[0].y);
        ctx.moveTo(first.mx, first.my);
        for (let i = 1; i < t.polygonVertices.length; i++) {
          const pt = toMapCoord(t.polygonVertices[i].x, t.polygonVertices[i].y);
          ctx.lineTo(pt.mx, pt.my);
        }
        ctx.closePath();

        if (t.type === 'ISLAND') {
          // Shallow coastal water reef halo
          ctx.strokeStyle = '#1a4552';
          ctx.lineWidth = 4;
          ctx.stroke();

          // Island foliage interior
          ctx.fillStyle = '#2e5836';
          ctx.fill();

          // Sandy coastal beach outline
          ctx.strokeStyle = '#c2b280';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else if (t.type === 'ICEBERG') {
          ctx.fillStyle = '#b2ebf2';
          ctx.fill();
          ctx.strokeStyle = '#80deea';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else {
          // SHALLOW
          ctx.fillStyle = 'rgba(38, 166, 154, 0.45)';
          ctx.fill();
          ctx.strokeStyle = '#26a69a';
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      } else {
        // Fallback for single-point circle representation
        const cx = t.x ?? 0;
        const cy = t.y ?? 0;
        const rad = t.radius ?? 50;
        const { mx, my } = toMapCoord(cx, cy);
        const mr = (rad / this.worldSize) * w;

        ctx.beginPath();
        ctx.arc(mx, my, mr, 0, Math.PI * 2);

        if (t.type === 'ISLAND') {
          ctx.fillStyle = '#2e5836';
          ctx.fill();
          ctx.strokeStyle = '#c2b280';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else if (t.type === 'SHALLOW') {
          ctx.fillStyle = 'rgba(38, 166, 154, 0.35)';
          ctx.fill();
        } else if (t.type === 'ICEBERG') {
          ctx.fillStyle = '#b2ebf2';
          ctx.fill();
          ctx.strokeStyle = '#80deea';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }

    // 3. Objectives & Capture Zones
    for (const obj of objectives) {
      const { mx, my } = toMapCoord(obj.x, obj.y);
      const mr = (obj.radius / this.worldSize) * w;

      ctx.strokeStyle = 'rgba(255, 235, 59, 0.75)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 235, 59, 0.15)';
      ctx.fill();
    }

    // 4. Contacts (Vessels, Teammates, Enemies)
    for (const c of contacts) {
      const { mx, my } = toMapCoord(c.x, c.y);

      if (c.isPlayer) {
        // Player Ship: bright white arrow
        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(c.heading);

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(5.5, 0);
        ctx.lineTo(-4.5, -3.5);
        ctx.lineTo(-2.5, 0);
        ctx.lineTo(-4.5, 3.5);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
      } else if (c.isFriendly) {
        // Friendly Fleet member: cyan dot
        ctx.fillStyle = '#00e5ff';
        ctx.beginPath();
        ctx.arc(mx, my, 2.8, 0, Math.PI * 2);
        ctx.fill();

        // Pulsating highlight if selected on fleet list
        if (c.id === this.highlightedFleetMemberId) {
          ctx.strokeStyle = '#00e5ff';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(mx, my, 6, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else {
        // Hostile contact: red diamond
        ctx.fillStyle = c.isSubmerged ? 'rgba(255, 23, 68, 0.45)' : '#ff1744';
        ctx.beginPath();
        ctx.moveTo(mx, my - 3.5);
        ctx.lineTo(mx + 3.5, my);
        ctx.lineTo(mx, my + 3.5);
        ctx.lineTo(mx - 3.5, my);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Outer border
    ctx.strokeStyle = '#00e676';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(0, 0, w, h);
  }
}
