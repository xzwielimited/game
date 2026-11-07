/**
 * 100% Procedural Vector Warship Rendering Pipeline
 * Clean-Room implementation using PixiJS v8.
 * High-Contrast Pseudo-3D Vessel Depth (7-Tier Architecture) across all 8 naval classes.
 * Zero external bitmap sprites / textures!
 */

import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { ShipClassId } from '../../../common/models/ships.js';
import { normalizeAngle, shortestAngleDiff } from '../../../common/math/vector2.js';

export type CamoType = 'HAZE_GREY' | 'DAZZLE' | 'ARCTIC_SPLINTER' | 'STEALTH_CARBON';

export interface TurretConfig {
  slotId: string;
  offsetX: number;
  offsetY: number;
  baseAngle: number;
  arcCoverage: number;
  caliberMm?: number;
  barrels?: number;
  category?: string;
  beamMeters?: number;
}

/**
 * ProceduralTurret (Tier 6 Depth Architecture)
 * Faceted 3D gunhouse with lit sunward facets, shadowed flanks,
 * recoil blast bags / mantlet collars, and barrel top specular highlight stripes.
 */
export class ProceduralTurret {
  public readonly container: Container;
  public readonly shadowGraphics: Graphics;
  public readonly houseGraphics: Graphics;
  public readonly barrelGraphics: Graphics;
  public currentRelativeAngle: number = 0;
  public recoilOffset: number = 0;

  public readonly offsetX: number;
  public readonly offsetY: number;
  public readonly baseAngle: number;
  public readonly arcCoverage: number;
  public readonly caliberMm: number;
  public readonly barrels: number;
  public readonly category?: string;
  public readonly beamMeters: number;

  constructor(cfg: TurretConfig) {
    this.container = new Container();
    this.shadowGraphics = new Graphics();
    this.barrelGraphics = new Graphics();
    this.houseGraphics = new Graphics();

    this.offsetX = cfg.offsetX;
    this.offsetY = cfg.offsetY;
    this.baseAngle = cfg.baseAngle;
    this.arcCoverage = cfg.arcCoverage;
    this.caliberMm = cfg.caliberMm ?? 127;
    this.barrels = cfg.barrels ?? (this.caliberMm > 300 ? 3 : this.caliberMm > 150 ? 2 : 1);
    this.category = cfg.category;
    this.beamMeters = cfg.beamMeters ?? 20;

    this.container.position.set(this.offsetX, this.offsetY);
    this.container.addChild(this.shadowGraphics);
    this.container.addChild(this.barrelGraphics);
    this.container.addChild(this.houseGraphics);

    this.renderTurretHouse();
    this.renderBarrels();
  }

  private renderTurretHouse(): void {
    const g = this.houseGraphics;
    const sg = this.shadowGraphics;
    g.clear();
    sg.clear();

    const cat = this.category;

    if (cat === 'TORPEDO' || cat === 'ROCKET_TORPEDO') {
      // Compact realistic Torpedo Tube Launcher rack turntable base
      sg.rect(-3.5 + 2, -1.8 + 2, 7.5, 3.6);
      sg.fill({ color: 0x050d18, alpha: 0.35 });

      // Rotating turntable pivot
      g.circle(0, 0, 2.4);
      g.fill({ color: 0x27303c });
      g.stroke({ color: 0x14181f, width: 1.0 });

      // Bedplate pedestal
      g.rect(-2.8, -1.6, 5.6, 3.2);
      g.fill({ color: 0x485563 });
      g.stroke({ color: 0x1e2730, width: 1.0 });
      return;
    }

    if (cat === 'CRUISE_MISSILE') {
      // Flush VLS Missile Hatch (5m x 5m dark grid with small white cell lids)
      sg.rect(-2.5 + 1.5, -2.5 + 1.5, 5, 5);
      sg.fill({ color: 0x050d18, alpha: 0.3 });

      // Dark armored perimeter coaming
      g.rect(-2.5, -2.5, 5, 5);
      g.fill({ color: 0x242d38 });
      g.stroke({ color: 0x0f141a, width: 1.2 });

      // Grid of cell lids (4 cells: 2x2)
      const cells = [
        { x: -2.0, y: -2.0 },
        { x: 0.3, y: -2.0 },
        { x: -2.0, y: 0.3 },
        { x: 0.3, y: 0.3 },
      ];
      for (const cp of cells) {
        g.rect(cp.x, cp.y, 1.7, 1.7);
        g.fill({ color: 0xe2e8f0 });
        g.stroke({ color: 0x334155, width: 0.8 });
      }
      return;
    }

    if (cat === 'DEPTH_CHARGE' || cat === 'NAVAL_MINE') {
      // Tiny stern rack (3m x 2m)
      sg.rect(-1.5 + 1, -1.0 + 1, 3, 2);
      sg.fill({ color: 0x050d18, alpha: 0.3 });

      g.rect(-1.5, -1.0, 3, 2);
      g.fill({ color: 0x374151 });
      g.stroke({ color: 0x111827, width: 1.0 });

      // Charges in rack
      for (let rx = -0.9; rx <= 0.9; rx += 0.9) {
        g.ellipse(rx, 0, 0.35, 0.75);
        g.fill({ color: 0x1f2937 });
        g.stroke({ color: 0x9ca3af, width: 0.5 });
      }
      return;
    }

    // Default / BALLISTIC_GUN / SAM_CIWS / ARTILLERY
    // Clamp turret house width to at most beamMeters * 0.36
    const maxHalfW = Math.max(3.2, this.beamMeters * 0.36);
    const rawScale = Math.min(2.0, Math.max(0.6, this.caliberMm / 150));
    const halfWidth = Math.min(maxHalfW, 7 * rawScale);
    const halfHeight = Math.min(maxHalfW * 0.85, 6 * rawScale);

    // 1. Turret Drop Shadow onto deck
    sg.ellipse(2, 3, halfWidth + 2, halfHeight + 1.5);
    sg.fill({ color: 0x050d18, alpha: 0.35 });

    // 2. Barbette ring underneath
    g.circle(0, 0, halfWidth + 1.2);
    g.fill({ color: 0x27303c });
    g.stroke({ color: 0x14181f, width: 1.2 });

    // 3. Faceted 3D Gunhouse
    // Lit sunward facet (top/port side)
    g.moveTo(halfWidth * 0.9, -halfHeight * 0.6);
    g.lineTo(halfWidth * 0.4, -halfHeight);
    g.lineTo(-halfWidth * 0.8, -halfHeight * 0.8);
    g.lineTo(-halfWidth, 0);
    g.lineTo(0, 0);
    g.closePath();
    g.fill({ color: 0x8a99a8 }); // Lit metallic grey

    // Shadowed flank facet (bottom/starboard side)
    g.moveTo(0, 0);
    g.lineTo(-halfWidth, 0);
    g.lineTo(-halfWidth * 0.8, halfHeight * 0.8);
    g.lineTo(halfWidth * 0.4, halfHeight);
    g.lineTo(halfWidth * 0.9, halfHeight * 0.6);
    g.closePath();
    g.fill({ color: 0x485565 }); // Shadowed steel grey

    // Outer armored housing contour
    g.moveTo(halfWidth * 0.9, -halfHeight * 0.6);
    g.lineTo(halfWidth * 0.4, -halfHeight);
    g.lineTo(-halfWidth * 0.8, -halfHeight * 0.8);
    g.lineTo(-halfWidth, 0);
    g.lineTo(-halfWidth * 0.8, halfHeight * 0.8);
    g.lineTo(halfWidth * 0.4, halfHeight);
    g.lineTo(halfWidth * 0.9, halfHeight * 0.6);
    g.closePath();
    g.stroke({ color: 0x15191f, width: 1.5 });

    // Central roof plate highlight
    g.ellipse(0, 0, halfWidth * 0.5, halfHeight * 0.4);
    g.fill({ color: 0xa0b0c0, alpha: 0.5 });

    // Optical rangefinder ears on sides of heavy turrets
    if (this.caliberMm >= 200) {
      const earScale = halfWidth / 7;
      g.rect(-halfWidth * 0.2, -halfHeight - 2.5, 4.5 * earScale, 2.5);
      g.fill({ color: 0x3d4855 });
      g.stroke({ color: 0x1a2028, width: 1 });
      // Cyan optical glass lens glint
      g.rect(halfWidth * 0.1, -halfHeight - 2, 1.2, 1.5);
      g.fill({ color: 0x00e5ff });

      g.rect(-halfWidth * 0.2, halfHeight, 4.5 * earScale, 2.5);
      g.fill({ color: 0x3d4855 });
      g.stroke({ color: 0x1a2028, width: 1 });
      g.rect(halfWidth * 0.1, halfHeight + 0.5, 1.2, 1.5);
      g.fill({ color: 0x00e5ff });
    }
  }

  private renderBarrels(): void {
    const g = this.barrelGraphics;
    g.clear();

    const cat = this.category;
    if (cat === 'CRUISE_MISSILE' || cat === 'DEPTH_CHARGE' || cat === 'NAVAL_MINE') {
      // Flush hatches / stern racks have no protruding barrels
      return;
    }

    if (cat === 'TORPEDO' || cat === 'ROCKET_TORPEDO') {
      // Compact, realistic Torpedo Tube Launcher (8m long x 3.5m wide grey rectangular 3-tube rack)
      const startX = -3.5 + this.recoilOffset;
      const rackLen = 8.0;
      const rackWidth = 3.5;
      const halfW = rackWidth * 0.5;

      // Outer housing cradle
      g.rect(startX, -halfW, rackLen, rackWidth);
      g.fill({ color: 0x485563 });
      g.stroke({ color: 0x181f26, width: 1.2 });

      // 3 cylindrical torpedo tubes with muzzle openings
      const tubeY = [-1.0, 0, 1.0];
      for (const ty of tubeY) {
        // Tube body
        g.rect(startX + 0.3, ty - 0.35, rackLen - 0.6, 0.7);
        g.fill({ color: 0x2b343d });
        g.stroke({ color: 0x12171c, width: 0.8 });

        // Muzzle ring / cap
        g.rect(startX + rackLen - 0.6, ty - 0.4, 0.6, 0.8);
        g.fill({ color: 0x15191d });

        // Specular highlight stripe
        g.moveTo(startX + 0.5, ty - 0.15);
        g.lineTo(startX + rackLen - 0.7, ty - 0.15);
        g.stroke({ color: 0x7e8e9e, width: 0.6, alpha: 0.7 });
      }

      // Reinforcing steel bands across the tubes
      g.rect(startX + 1.8, -halfW - 0.1, 0.9, rackWidth + 0.2);
      g.fill({ color: 0x181f26 });
      g.rect(startX + 5.2, -halfW - 0.1, 0.9, rackWidth + 0.2);
      g.fill({ color: 0x181f26 });
      return;
    }

    // Default guns: clamp barrel length between 8m and 18m
    const rawScale = Math.min(2.0, Math.max(0.6, this.caliberMm / 150));
    const rawLength = (16 + this.caliberMm * 0.05) * rawScale;
    const barrelLength = Math.max(8.0, Math.min(18.0, rawLength));
    const barrelThickness = Math.max(1.5, Math.min(3.0, (this.caliberMm / 100) * 1.3));
    const spacing = Math.max(2.5, Math.min(4.5, 4 * rawScale));

    const startX = this.recoilOffset;
    const mantletWidth = Math.min(4.5, 4 * rawScale);

    const drawSingleBarrel = (yOffset: number) => {
      // 1. Recoil blast bag / mantlet collar at gunhouse opening
      g.rect(startX, yOffset - barrelThickness * 0.8, mantletWidth, barrelThickness * 1.6);
      g.fill({ color: 0x22272e });
      g.stroke({ color: 0x111418, width: 1 });

      // 2. Dark gunmetal barrel body
      g.rect(startX + mantletWidth, yOffset - barrelThickness * 0.5, barrelLength - mantletWidth, barrelThickness);
      g.fill({ color: 0x1e242b });
      g.stroke({ color: 0x0f1216, width: 1 });

      // 3. Specular highlight line along barrel top (3D cylindrical metallic shine)
      g.moveTo(startX + mantletWidth, yOffset - barrelThickness * 0.25);
      g.lineTo(startX + barrelLength, yOffset - barrelThickness * 0.25);
      g.stroke({ color: 0x8a9baa, width: 1, alpha: 0.75 });

      // 4. Muzzle crown ring
      g.rect(startX + barrelLength - 1.5, yOffset - barrelThickness * 0.6, 1.5, barrelThickness * 1.2);
      g.fill({ color: 0x14181d });
    };

    if (this.barrels === 1) {
      drawSingleBarrel(0);
    } else if (this.barrels === 2) {
      drawSingleBarrel(-spacing * 0.5);
      drawSingleBarrel(spacing * 0.5);
    } else {
      // Triple turret
      drawSingleBarrel(-spacing);
      drawSingleBarrel(0);
      drawSingleBarrel(spacing);
    }
  }

  public fireRecoil(): void {
    this.recoilOffset = -4;
    this.renderBarrels();
  }

  public update(dt: number, targetWorldAngle: number, shipHeading: number): void {
    if (this.recoilOffset < 0) {
      this.recoilOffset = Math.min(0, this.recoilOffset + dt * 25);
      this.renderBarrels();
    }

    const desiredLocalAngle = normalizeAngle(targetWorldAngle - shipHeading);
    const halfArc = this.arcCoverage * 0.5;

    const angleDiffFromBase = shortestAngleDiff(this.baseAngle, desiredLocalAngle);
    let clampedTarget = desiredLocalAngle;

    if (Math.abs(angleDiffFromBase) > halfArc) {
      clampedTarget = normalizeAngle(this.baseAngle + (angleDiffFromBase > 0 ? halfArc : -halfArc));
    }

    const currentAngleDiff = shortestAngleDiff(this.currentRelativeAngle, clampedTarget);
    const maxStep = 2.8 * dt;

    if (Math.abs(currentAngleDiff) <= maxStep) {
      this.currentRelativeAngle = clampedTarget;
    } else {
      this.currentRelativeAngle = normalizeAngle(
        this.currentRelativeAngle + Math.sign(currentAngleDiff) * maxStep
      );
    }

    this.container.rotation = this.currentRelativeAngle;
  }
}

/**
 * ProceduralVessel (7-Tier Pseudo-3D Warship Depth Architecture)
 * Tier 0: Soft ocean drop shadow (lifts vessel above ocean plane)
 * Tier 1: Directional armor rim highlight (port sunlight highlight / starboard shadow) & waterline trim
 * Tier 2: Layered deck plates with warm non-skid coloring, anchor chains & helipad markings
 * Tier 3-4: Multi-tier deckhouses, superstructure blocks & pagoda/radar masts
 * Tier 5: Navigation bridge luminous window bands & funnels with soot grills
 * Tier 6: Articulated 3D faceted turrets with mantlets and specular highlights
 */
export class ProceduralVessel {
  public readonly container: Container;
  public readonly shadowGraphics: Graphics;         // Tier 0
  public readonly hullGraphics: Graphics;           // Tier 1
  public readonly deckGraphics: Graphics;           // Tier 2
  public readonly camoGraphics: Graphics;           // Tier 3
  public readonly superstructureGraphics: Graphics; // Tier 4 & 5
  public readonly overheadUI: Container;
  public readonly hpBarGraphics: Graphics;
  public readonly nameLabel: Text;
  public readonly shieldGraphics: Graphics;
  public readonly sinkingBubblesGraphics: Graphics;

  public readonly shipClass: ShipClassId;
  public readonly lengthMeters: number;
  public readonly beamMeters: number;
  public readonly visualBeam: number;
  public readonly camoType: CamoType;
  public readonly turrets: ProceduralTurret[] = [];
  public hasSpawnShield: boolean = false;
  public isSinking: boolean = false;
  public sinkingProgress: number = 0;
  public isLocalPlayer: boolean = false;
  private currentHpRatio: number = 1.0;

  constructor(
    shipClass: ShipClassId,
    lengthMeters: number,
    beamMeters: number,
    camoType: CamoType = 'HAZE_GREY',
    turretConfigs: TurretConfig[] = []
  ) {
    this.shipClass = shipClass;
    this.lengthMeters = lengthMeters;
    this.beamMeters = beamMeters;
    this.visualBeam = Math.max(this.beamMeters, this.lengthMeters * 0.20);
    this.camoType = camoType;

    this.container = new Container();
    this.shadowGraphics = new Graphics();
    this.hullGraphics = new Graphics();
    this.deckGraphics = new Graphics();
    this.camoGraphics = new Graphics();
    this.superstructureGraphics = new Graphics();
    this.overheadUI = new Container();
    this.hpBarGraphics = new Graphics();
    this.shieldGraphics = new Graphics();
    this.sinkingBubblesGraphics = new Graphics();

    const style = new TextStyle({
      fontFamily: "'Segoe UI', Tahoma, Arial, sans-serif",
      fontSize: 12,
      fontWeight: 'bold',
      fill: 0xffffff,
      align: 'center',
      dropShadow: {
        alpha: 0.85,
        angle: Math.PI / 4,
        blur: 3,
        color: 0x000000,
        distance: 2,
      },
    });
    this.nameLabel = new Text({ text: '', style });
    this.nameLabel.anchor.set(0.5, 1.0);

    const overheadOffsetY = Math.max(this.lengthMeters * 0.45, 28);
    this.hpBarGraphics.position.set(0, -overheadOffsetY);
    this.nameLabel.position.set(0, -overheadOffsetY - 8);

    this.overheadUI.addChild(this.hpBarGraphics);
    this.overheadUI.addChild(this.nameLabel);

    // 7-Tier Scene Layer Stack
    this.container.addChild(this.shadowGraphics);         // Tier 0
    this.container.addChild(this.hullGraphics);           // Tier 1
    this.container.addChild(this.deckGraphics);           // Tier 2
    this.container.addChild(this.camoGraphics);           // Tier 3
    this.container.addChild(this.superstructureGraphics); // Tier 4 & 5

    // Mount turrets (Tier 6)
    for (const cfg of turretConfigs) {
      if (cfg.beamMeters === undefined) {
        cfg.beamMeters = this.visualBeam;
      }
      const turret = new ProceduralTurret(cfg);
      this.turrets.push(turret);
      this.container.addChild(turret.container);
    }

    this.container.addChild(this.sinkingBubblesGraphics);
    this.container.addChild(this.shieldGraphics);
    this.container.addChild(this.overheadUI);

    this.drawShadow();
    this.drawHull();
    this.drawDeck();
    this.drawCamo();
    this.drawSuperstructure();
    this.updateHpBar(1.0);
  }

  /**
   * Tier 0: Soft ocean drop shadow projected onto the water.
   * Offsets hull silhouette to create true pseudo-3D elevation above the sea surface.
   */
  private drawShadow(): void {
    const g = this.shadowGraphics;
    g.clear();

    const halfL = this.lengthMeters * 0.5;
    const halfB = this.visualBeam * 0.5;
    // Directional sunlight angle (~135° south-east offset)
    const offsetX = 5;
    const offsetY = 7;

    g.moveTo(halfL + offsetX, offsetY);
    g.bezierCurveTo(
      halfL * 0.6 + offsetX, -halfB * 1.1 + offsetY,
      -halfL * 0.4 + offsetX, -halfB * 1.1 + offsetY,
      -halfL + offsetX, -halfB * 0.8 + offsetY
    );
    g.lineTo(-halfL + offsetX, halfB * 0.8 + offsetY);
    g.bezierCurveTo(
      -halfL * 0.4 + offsetX, halfB * 1.1 + offsetY,
      halfL * 0.6 + offsetX, halfB * 1.1 + offsetY,
      halfL + offsetX, offsetY
    );
    g.closePath();
    g.fill({ color: 0x050d18, alpha: 0.45 });
  }

  /**
   * Tier 1: Outer Hull, Waterline Anti-Fouling Trim, and Directional Armor Rim.
   */
  private drawHull(): void {
    const g = this.hullGraphics;
    g.clear();

    const L = this.lengthMeters;
    const halfL = L * 0.5;
    const halfB = this.visualBeam * 0.5;

    // High-contrast maritime steel & hull tones
    let hullColor = 0x8a99a8; // Bright crisp naval steel grey
    const waterlineTrim = 0x991b1b; // Anti-fouling red boot-topping

    if (this.shipClass === 'TACTICAL_SUPPORT') {
      hullColor = 0xf8fafc; // Hospital ship gleaming white
    } else if (this.camoType === 'STEALTH_CARBON') {
      hullColor = 0x22272e;
    } else if (this.shipClass === 'SUBMARINE') {
      hullColor = 0x283038;
    } else if (this.shipClass === 'DREDGER_ICEBREAKER') {
      hullColor = 0xb91c1c; // Arctic high-visibility red
    }

    // 1. Waterline red anti-fouling outer trim
    g.moveTo(halfL + 2.5, 0);
    g.bezierCurveTo(halfL * 0.6, -halfB - 2.5, -halfL * 0.5, -halfB - 2.5, -halfL - 2.5, -halfB * 0.75);
    g.lineTo(-halfL - 2.5, halfB * 0.75);
    g.bezierCurveTo(-halfL * 0.5, halfB + 2.5, halfL * 0.6, halfB + 2.5, halfL + 2.5, 0);
    g.closePath();
    g.fill({ color: waterlineTrim, alpha: 0.85 });

    // 2. Class-specific main hull contour
    switch (this.shipClass) {
      case 'COASTAL_PATROL': {
        g.moveTo(halfL, 0);
        g.lineTo(halfL * 0.35, -halfB);
        g.lineTo(-halfL, -halfB * 0.9);
        g.lineTo(-halfL, halfB * 0.9);
        g.lineTo(halfL * 0.35, halfB);
        g.closePath();
        break;
      }
      case 'SUBMARINE': {
        g.moveTo(halfL, 0);
        g.bezierCurveTo(halfL, -halfB, halfL * 0.3, -halfB, -halfL * 0.5, -halfB * 0.75);
        g.lineTo(-halfL, -halfB * 0.3);
        g.lineTo(-halfL, halfB * 0.3);
        g.lineTo(-halfL * 0.5, halfB * 0.75);
        g.bezierCurveTo(halfL * 0.3, halfB, halfL, halfB, halfL, 0);
        g.closePath();
        break;
      }
      case 'AIRCRAFT_CARRIER': {
        g.moveTo(halfL, -halfB * 0.35);
        g.lineTo(halfL * 0.8, -halfB);
        g.lineTo(-halfL * 0.9, -halfB);
        g.lineTo(-halfL, -halfB * 0.5);
        g.lineTo(-halfL, halfB * 0.95);
        g.lineTo(halfL * 0.7, halfB);
        g.lineTo(halfL, halfB * 0.35);
        g.closePath();
        break;
      }
      case 'BATTLESHIP': {
        g.moveTo(halfL, 0);
        g.bezierCurveTo(halfL * 0.7, -halfB * 0.85, halfL * 0.2, -halfB * 1.05, -halfL * 0.4, -halfB);
        g.lineTo(-halfL, -halfB * 0.75);
        g.lineTo(-halfL, halfB * 0.75);
        g.lineTo(-halfL * 0.4, halfB);
        g.bezierCurveTo(halfL * 0.2, halfB * 1.05, halfL * 0.7, halfB * 0.85, halfL, 0);
        g.closePath();
        break;
      }
      case 'DREDGER_ICEBREAKER': {
        g.moveTo(halfL, -halfB * 0.65);
        g.lineTo(halfL * 0.4, -halfB);
        g.lineTo(-halfL, -halfB);
        g.lineTo(-halfL, halfB);
        g.lineTo(halfL * 0.4, halfB);
        g.lineTo(halfL, halfB * 0.65);
        g.closePath();
        break;
      }
      default: {
        // DESTROYER & CRUISER
        g.moveTo(halfL, 0);
        g.bezierCurveTo(halfL * 0.6, -halfB, -halfL * 0.4, -halfB, -halfL, -halfB * 0.8);
        g.lineTo(-halfL, halfB * 0.8);
        g.bezierCurveTo(-halfL * 0.4, halfB, halfL * 0.6, halfB, halfL, 0);
        g.closePath();
        break;
      }
    }

    g.fill({ color: hullColor });
    g.stroke({ color: 0x15191e, width: 2.0 });

    // 3. Directional Sunlight Armor Rim:
    // Sunward port sheer line highlight (shining steel)
    g.moveTo(halfL, 0);
    g.bezierCurveTo(halfL * 0.6, -halfB, -halfL * 0.4, -halfB, -halfL, -halfB * 0.8);
    g.stroke({ color: 0xe2e8f0, width: 2.2, alpha: 0.85 });

    // Shadowed starboard sheer line (dark armor skirt)
    g.moveTo(halfL, 0);
    g.bezierCurveTo(halfL * 0.6, halfB, -halfL * 0.4, halfB, -halfL, halfB * 0.8);
    g.stroke({ color: 0x242d38, width: 2.2, alpha: 0.75 });
  }

  /**
   * Tier 2: Layered Deck Plates with Non-Skid Warm Tones, Anchor Chains, and Helipad Markings.
   */
  private drawDeck(): void {
    const g = this.deckGraphics;
    g.clear();

    const halfL = this.lengthMeters * 0.5;
    const halfB = this.visualBeam * 0.5;

    // Warm deck non-skid coloring (teak wood on BB/Cruiser, marine non-skid on DD/Patrol)
    let deckColor = 0xc49363; // Warm teak wood deck
    if (this.shipClass === 'DESTROYER' || this.shipClass === 'COASTAL_PATROL') {
      deckColor = 0x6e7d8e; // Non-skid navy deck
    } else if (this.shipClass === 'AIRCRAFT_CARRIER') {
      deckColor = 0x333b44; // Dark asphalt flight deck
    } else if (this.shipClass === 'SUBMARINE') {
      deckColor = 0x1f252c;
    } else if (this.shipClass === 'TACTICAL_SUPPORT') {
      deckColor = 0xd1d5db;
    }

    // 1. Main Deck Inset Plate
    const deckMarginX = halfL * 0.88;
    const deckMarginY = halfB * 0.78;
    g.rect(-deckMarginX * 0.7, -deckMarginY, deckMarginX * 1.45, deckMarginY * 2);
    g.fill({ color: deckColor, alpha: 0.85 });
    g.stroke({ color: 0x222933, width: 1.0, alpha: 0.6 });

    // 2. Forecastle Anchor Chains (Twin anchor chains running from windlass to hawseholes)
    if (this.shipClass !== 'SUBMARINE' && this.shipClass !== 'AIRCRAFT_CARRIER') {
      const chainStart = halfL * 0.45;
      const chainEnd = halfL * 0.78;
      // Port chain
      g.moveTo(chainStart, -halfB * 0.15);
      g.lineTo(chainEnd, -halfB * 0.35);
      g.stroke({ color: 0x1a1e24, width: 1.8 });
      // Starboard chain
      g.moveTo(chainStart, halfB * 0.15);
      g.lineTo(chainEnd, halfB * 0.35);
      g.stroke({ color: 0x1a1e24, width: 1.8 });

      // Anchor hawsehole rings
      g.circle(chainEnd, -halfB * 0.35, 2.0);
      g.circle(chainEnd, halfB * 0.35, 2.0);
      g.fill({ color: 0x0a0d11 });
    }

    // 3. Stern Tactical Helipad (Destroyers, Cruisers, Hospital Ship)
    if (this.shipClass === 'DESTROYER' || this.shipClass === 'CRUISER' || this.shipClass === 'TACTICAL_SUPPORT') {
      const padX = -halfL * 0.65;
      const padRadius = halfB * 0.55;

      // White perimeter landing ring
      g.circle(padX, 0, padRadius);
      g.stroke({ color: 0xffffff, width: 1.5, alpha: 0.8 });

      // Clean white 'H' marking
      const hSize = padRadius * 0.55;
      g.moveTo(padX - hSize * 0.5, -hSize);
      g.lineTo(padX - hSize * 0.5, hSize);
      g.moveTo(padX + hSize * 0.5, -hSize);
      g.lineTo(padX + hSize * 0.5, hSize);
      g.moveTo(padX - hSize * 0.5, 0);
      g.lineTo(padX + hSize * 0.5, 0);
      g.stroke({ color: 0xffffff, width: 1.8, alpha: 0.85 });
    }

    // 4. Aircraft Carrier Flight Deck Runway Striping
    if (this.shipClass === 'AIRCRAFT_CARRIER') {
      // Yellow boundary stripes
      g.moveTo(-halfL * 0.85, -halfB * 0.25);
      g.lineTo(halfL * 0.85, -halfB * 0.25);
      g.stroke({ color: 0xfacc15, width: 2.2, alpha: 0.9 });

      // White centerline dashes
      const dashStep = 18;
      for (let x = -halfL * 0.8; x < halfL * 0.8; x += dashStep) {
        g.moveTo(x, 0);
        g.lineTo(x + 10, 0);
        g.stroke({ color: 0xffffff, width: 1.8, alpha: 0.85 });
      }

      // 4 Transverse arrestor wire cables at stern
      for (let i = 0; i < 4; i++) {
        const wireX = -halfL * 0.55 + i * 14;
        g.moveTo(wireX, -halfB * 0.7);
        g.lineTo(wireX, halfB * 0.7);
        g.stroke({ color: 0x475569, width: 1.5, alpha: 0.75 });
      }
    }
  }

  /**
   * Tier 3: Tactical Camouflage Patterns.
   */
  private drawCamo(): void {
    const g = this.camoGraphics;
    g.clear();

    const halfL = this.lengthMeters * 0.5;
    const halfB = this.visualBeam * 0.5;

    if (this.camoType === 'DAZZLE') {
      const colors = [0x11161d, 0xf0f3f6, 0x2e4158];
      const step = this.lengthMeters / 7;
      for (let i = 0; i < 7; i++) {
        const x = -halfL + i * step;
        g.poly([
          x, -halfB,
          x + step * 0.7, -halfB,
          x + step * 0.3, halfB,
          x - step * 0.3, halfB,
        ]);
        g.fill({ color: colors[i % colors.length], alpha: 0.55 });
      }
    } else if (this.camoType === 'ARCTIC_SPLINTER') {
      const colors = [0xffffff, 0x00bcd4, 0x1a365d];
      for (let i = 0; i < 8; i++) {
        const x = -halfL + (i / 8) * this.lengthMeters;
        const offset = (i % 2 === 0 ? 1 : -1) * halfB * 0.6;
        g.poly([
          x, offset,
          x + 14, offset - halfB * 0.4,
          x + 8, offset + halfB * 0.4,
        ]);
        g.fill({ color: colors[i % colors.length], alpha: 0.6 });
      }
    } else if (this.camoType === 'STEALTH_CARBON') {
      g.rect(-halfL * 0.7, -halfB * 0.8, this.lengthMeters * 0.7, this.visualBeam * 1.6);
      g.stroke({ color: 0x323a42, width: 1, alpha: 0.4 });
    }
  }

  /**
   * Tier 4 & 5: Multi-Tier Superstructure, Navigation Bridge Window Glints & Funnels with Soot Grills.
   */
  private drawSuperstructure(): void {
    const g = this.superstructureGraphics;
    g.clear();

    const halfL = this.lengthMeters * 0.5;
    const halfB = this.visualBeam * 0.5;

    switch (this.shipClass) {
      case 'SUBMARINE': {
        // Drop shadow under sail
        g.rect(-halfL * 0.05 + 3, -halfB * 0.35 + 3, halfL * 0.3, halfB * 0.7);
        g.fill({ color: 0x050d18, alpha: 0.45 });

        // Conning tower sail
        g.rect(-halfL * 0.05, -halfB * 0.35, halfL * 0.3, halfB * 0.7);
        g.fill({ color: 0x222830 });
        g.stroke({ color: 0x111418, width: 1.5 });

        // Periscope shears & snorkel mast
        g.circle(halfL * 0.08, 0, 2.5);
        g.fill({ color: 0x607d8b });

        // Forward dive planes with shadow
        g.rect(halfL * 0.06, -halfB * 0.75, 6, halfB * 1.5);
        g.fill({ color: 0x374151 });
        g.stroke({ color: 0x111827, width: 1 });
        break;
      }

      case 'AIRCRAFT_CARRIER': {
        // Starboard island tower drop shadow onto flight deck
        g.rect(2, halfB * 0.45 + 3, halfL * 0.38, halfB * 0.45);
        g.fill({ color: 0x050d18, alpha: 0.4 });

        // Island tower body
        g.rect(0, halfB * 0.45, halfL * 0.35, halfB * 0.4);
        g.fill({ color: 0x64748b });
        g.stroke({ color: 0x1e293b, width: 1.5 });

        // Tier 5: Navigation bridge luminous green/cyan window band
        g.rect(halfL * 0.15, halfB * 0.5, halfL * 0.18, 3);
        g.fill({ color: 0x38ef7d });

        // Funnel with soot grill
        g.ellipse(halfL * 0.05, halfB * 0.65, 4, 3);
        g.fill({ color: 0x111418 });
        break;
      }

      case 'TACTICAL_SUPPORT': {
        // Huge Red Cross markings forward and aft with drop shadow
        const drawRedCross = (cx: number) => {
          const crossSize = halfB * 0.75;
          // Shadow
          g.rect(cx - crossSize * 0.2 + 2, -crossSize + 2, crossSize * 0.4, crossSize * 2);
          g.rect(cx - crossSize + 2, -crossSize * 0.2 + 2, crossSize * 2, crossSize * 0.4);
          g.fill({ color: 0x050d18, alpha: 0.3 });
          // Cross
          g.rect(cx - crossSize * 0.2, -crossSize, crossSize * 0.4, crossSize * 2);
          g.rect(cx - crossSize, -crossSize * 0.2, crossSize * 2, crossSize * 0.4);
          g.fill({ color: 0xdc2626 });
        };
        drawRedCross(halfL * 0.35);
        drawRedCross(-halfL * 0.35);

        // White Midship bridge house
        g.rect(-halfL * 0.15, -halfB * 0.45, halfL * 0.3, halfB * 0.9);
        g.fill({ color: 0xffffff });
        g.stroke({ color: 0x94a3b8, width: 1.5 });

        // Navigation bridge windows
        g.rect(halfL * 0.05, -halfB * 0.35, 4, halfB * 0.7);
        g.fill({ color: 0x38ef7d });
        break;
      }

      case 'BATTLESHIP': {
        // Pagoda Tower / Citadel Superstructure
        // Tier 4: Stepped 01 Deckhouse
        g.rect(-halfL * 0.22, -halfB * 0.6, halfL * 0.44, halfB * 1.2);
        g.fill({ color: 0x475569 });
        g.stroke({ color: 0x1e293b, width: 1.5 });

        // Tier 4: Heavy Command Pagoda Tower
        g.rect(-halfL * 0.05, -halfB * 0.45, halfL * 0.2, halfB * 0.9);
        g.fill({ color: 0x64748b });
        g.stroke({ color: 0x0f172a, width: 1.5 });

        // Tier 5: Luminous Navigation Bridge Window Band
        g.rect(halfL * 0.1, -halfB * 0.38, 3.5, halfB * 0.76);
        g.fill({ color: 0x38ef7d });

        // Tier 5: Main Naval Funnels (Twin funnels with soot exhaust grills)
        const funnelX1 = -halfL * 0.08;
        const funnelX2 = -halfL * 0.16;
        for (const fx of [funnelX1, funnelX2]) {
          g.ellipse(fx, 0, 5.5, 4.0);
          g.fill({ color: 0x1e293b });
          g.stroke({ color: 0x0f172a, width: 1.2 });
          // Dark soot grill
          g.ellipse(fx, 0, 3.5, 2.5);
          g.fill({ color: 0x090b0e });
        }

        // Aft observation rangefinder tower
        g.rect(-halfL * 0.24, -halfB * 0.3, 6, halfB * 0.6);
        g.fill({ color: 0x475569 });
        break;
      }

      default: {
        // DESTROYER & CRUISER
        // Tier 4: Stepped Deckhouse
        g.rect(-halfL * 0.2, -halfB * 0.5, halfL * 0.38, halfB);
        g.fill({ color: 0x475569 });
        g.stroke({ color: 0x1e293b, width: 1.5 });

        // Bridge upper tier
        g.rect(-halfL * 0.05, -halfB * 0.4, halfL * 0.18, halfB * 0.8);
        g.fill({ color: 0x64748b });
        g.stroke({ color: 0x0f172a, width: 1.2 });

        // Tier 5: Navigation bridge luminous window band
        g.rect(halfL * 0.08, -halfB * 0.32, 3, halfB * 0.64);
        g.fill({ color: 0x38ef7d });

        // Tier 5: Funnel with dark soot exhaust grill
        g.ellipse(-halfL * 0.12, 0, 4.5, 3.5);
        g.fill({ color: 0x1e293b });
        g.stroke({ color: 0x0f172a, width: 1.2 });
        g.ellipse(-halfL * 0.12, 0, 3.0, 2.2);
        g.fill({ color: 0x090b0e });

        // Radar lattice mast
        g.moveTo(-halfL * 0.02, -halfB * 0.65);
        g.lineTo(-halfL * 0.02, halfB * 0.65);
        g.stroke({ color: 0xfacc15, width: 1.8 });
        break;
      }
    }
  }

  public updateHpBar(ratio: number): void {
    this.currentHpRatio = ratio;
    if (this.isLocalPlayer && ratio >= 0.999) {
      this.hpBarGraphics.visible = false;
      return;
    }
    this.hpBarGraphics.visible = true;

    const g = this.hpBarGraphics;
    g.clear();

    const barWidth = Math.max(34, this.lengthMeters * 0.65);
    const barHeight = 4.5;
    const halfW = barWidth * 0.5;

    // Dark background plate
    g.rect(-halfW - 1, -1, barWidth + 2, barHeight + 2);
    g.fill({ color: 0x0a0d12, alpha: 0.85 });

    // Health fill (Crisp high-contrast green / yellow / red)
    const fillWidth = Math.max(0, Math.min(1.0, ratio)) * barWidth;
    let hpColor = 0x00e676; // Emerald Green
    if (ratio < 0.3) hpColor = 0xff1744; // Warning Red
    else if (ratio < 0.6) hpColor = 0xffea00; // Caution Yellow

    g.rect(-halfW, 0, fillWidth, barHeight);
    g.fill({ color: hpColor });
  }

  public setDepth(depthState: number): void {
    if (depthState === 0) {
      // Surface
      this.container.alpha = 1.0;
      this.container.tint = 0xffffff;
      this.shadowGraphics.visible = true;
    } else if (depthState === 1) {
      // Periscope
      this.container.alpha = 0.68;
      this.container.tint = 0x64b5f6;
      this.shadowGraphics.visible = false;
    } else {
      // Deep
      this.container.alpha = 0.28;
      this.container.tint = 0x1565c0;
      this.shadowGraphics.visible = false;
    }
  }

  /**
   * Set vessel overhead player name label.
   * Local player receives large bright-green text; allies receive cyan; enemies receive white.
   */
  public setPlayerName(name: string, isFriendly: boolean = false, isLocalPlayer: boolean = false): void {
    this.nameLabel.text = name;
    this.isLocalPlayer = isLocalPlayer;
    if (isLocalPlayer) {
      this.nameLabel.style.fill = 0x00e676; // Bright Green for player (matching mk48.io)
      this.nameLabel.style.fontSize = 13;
    } else if (isFriendly) {
      this.nameLabel.style.fill = 0x64ffda; // Cyan for friendly fleet
      this.nameLabel.style.fontSize = 11;
    } else {
      this.nameLabel.style.fill = 0xffffff; // White for enemy / bots
      this.nameLabel.style.fontSize = 11;
    }

    if (this.isLocalPlayer && this.currentHpRatio >= 0.999) {
      this.hpBarGraphics.visible = false;
    } else {
      this.hpBarGraphics.visible = true;
    }
  }

  public setSpawnShield(active: boolean, pulseTimeSec: number = 0): void {
    this.hasSpawnShield = active;
    const g = this.shieldGraphics;
    g.clear();

    if (!active || this.isSinking) return;

    const L = this.lengthMeters;
    const B = this.visualBeam;
    const radiusX = L * 0.58 + 6;
    const radiusY = B * 0.95 + 6;

    const pulse = 0.5 + 0.5 * Math.sin(pulseTimeSec * 6);
    const strokeAlpha = 0.5 + 0.35 * pulse;
    const fillAlpha = 0.08 + 0.05 * pulse;

    // Glowing elliptical forcefield barrier
    g.ellipse(0, 0, radiusX, radiusY);
    g.fill({ color: 0x00e5ff, alpha: fillAlpha });
    g.stroke({ color: 0x00e5ff, width: 2.2, alpha: strokeAlpha });

    // Shimmering outer perimeter resonance ring
    g.ellipse(0, 0, radiusX + 3 * pulse, radiusY + 2 * pulse);
    g.stroke({ color: 0x64ffda, width: 1.0, alpha: 0.4 * (1 - pulse * 0.4) });

    // Node markers on forcefield barrier
    const nodeSize = 3;
    g.circle(radiusX, 0, nodeSize);
    g.circle(-radiusX, 0, nodeSize);
    g.circle(0, radiusY, nodeSize);
    g.circle(0, -radiusY, nodeSize);
    g.fill({ color: 0xffffff, alpha: 0.8 * strokeAlpha });
  }

  public setSinking(isSinking: boolean, progress: number = 0, dt: number = 0.05): void {
    this.isSinking = isSinking;
    this.sinkingProgress = Math.max(0, Math.min(1.0, progress));

    const bg = this.sinkingBubblesGraphics;
    bg.clear();

    if (!isSinking) {
      this.overheadUI.visible = true;
      this.shadowGraphics.visible = true;
      this.hullGraphics.skew.set(0, 0);
      this.deckGraphics.skew.set(0, 0);
      this.camoGraphics.skew.set(0, 0);
      this.superstructureGraphics.skew.set(0, 0);
      this.container.alpha = 1.0;
      this.container.tint = 0xffffff;
      return;
    }

    this.overheadUI.visible = false;
    this.shadowGraphics.visible = false;
    this.shieldGraphics.clear();

    const maxListRad = 0.32;
    const currentList = this.sinkingProgress * maxListRad;
    this.hullGraphics.skew.set(0, currentList);
    this.deckGraphics.skew.set(0, currentList);
    this.camoGraphics.skew.set(0, currentList);
    this.superstructureGraphics.skew.set(0, currentList * 1.25);

    const tintVal = Math.max(26, Math.round(255 * (1.0 - this.sinkingProgress * 0.75)));
    const blueTint = Math.min(255, Math.round(tintVal * 1.25));
    this.container.tint = (tintVal << 16) | (tintVal << 8) | blueTint;

    this.container.alpha = Math.max(0.12, 1.0 - this.sinkingProgress * 0.85);

    const bubbleCount = Math.floor(6 + this.sinkingProgress * 12);
    const L = this.lengthMeters;
    const B = this.visualBeam;

    for (let i = 0; i < bubbleCount; i++) {
      const bx = (Math.random() - 0.5) * L * 0.9;
      const by = (Math.random() - 0.5) * B * 1.2 + currentList * 12;
      const rad = 1.5 + Math.random() * 3.5;
      const bAlpha = (0.3 + Math.random() * 0.5) * (1.0 - this.sinkingProgress * 0.5);

      bg.circle(bx, by, rad);
      bg.fill({ color: 0xdff4f7, alpha: bAlpha });
      bg.stroke({ color: 0x80deea, width: 0.8, alpha: bAlpha });
    }
  }

  public update(dt: number, aimAngleWorld: number): void {
    // Counter-rotate overheadUI so player name and HP bar are ALWAYS strictly upright horizontal
    this.overheadUI.rotation = -this.container.rotation;

    for (const turret of this.turrets) {
      turret.update(dt, aimAngleWorld, this.container.rotation);
    }
  }
}
