/**
 * Main Client Application Orchestrator for NavalCommand.io
 * Clean-Room implementation combining PixiJS v8 Vector WebGL Renderer,
 * Tactical HUD, Procedural Web Audio Synthesizer, Web Portal SDK,
 * Binary Netcode Client, and Local Authoritative Simulation Fallback.
 */

import { Graphics } from 'pixi.js';
import { PixiRenderer } from './rendering/pixi_renderer.js';
import { ProceduralVessel, CamoType, TurretConfig } from './rendering/vector_hulls.js';
import { FiringArcState } from './rendering/sensor_overlays.js';
import { HUDController } from './hud/hud_controller.js';
import { CasualtyReport } from './hud/menus.js';
import { MinimapContact, MinimapTerrain, MinimapObjective } from './hud/minimap.js';
import { WeaponSlotUIState } from './hud/weapon_controls.js';
import { soundSynth } from './audio/sound_synthesizer.js';
import { StandaloneMockSDK } from './sdk/mock_sdk.js';
import { BinaryClient } from './netcode/binary_client.js';
import { ClientPredictor } from './netcode/predictor.js';
import { SnapshotInterpolator } from './netcode/interpolator.js';
import { AuthoritativeGameServer, ServerVessel } from '../../server/core/game_server.js';
import { BotController } from '../../server/ai/bot_controller.js';
import { SHIP_ROSTER, getAllShipDefs, ShipDef } from '../../common/models/ships.js';
import { WEAPON_DEFINITIONS, isAngleWithinMountArc, stepMountTraverse, WeaponMountDef } from '../../common/models/weapons.js';
import { commandDepthState, toggleStealthMode } from '../../common/simulation/hydrodynamics.js';
import { normalizeAngle, shortestAngleDiff } from '../../common/math/vector2.js';
import { GameModeController, GameModeId } from '../../common/models/game_modes.js';
import { FleetKarmaManager } from '../../common/models/fleet.js';
import { GameEventType } from '../../common/protocol/packet_types.js';

export class NavalCommandApp {
  public readonly renderer: PixiRenderer;
  public readonly hud: HUDController;
  public readonly sdk: StandaloneMockSDK;
  public readonly binaryClient: BinaryClient;
  public readonly predictor: ClientPredictor;
  public readonly interpolator: SnapshotInterpolator;

  // Embedded local authoritative server & AI bots for instant standalone play
  public readonly localServer: AuthoritativeGameServer;
  public readonly botController: BotController;
  public readonly modeController: GameModeController;
  public readonly fleetManager: FleetKarmaManager;

  public playerVesselId: number = 1;
  public steeringMode: 'MOUSE' | 'WASD' = 'MOUSE';
  private vesselViews: Map<number, ProceduralVessel> = new Map();
  private terrainGraphics: Graphics;

  // Input state
  private keysPressed: Set<string> = new Set();
  private mouseScreenX: number = typeof window !== 'undefined' ? window.innerWidth * 0.5 : 400;
  private mouseScreenY: number = typeof window !== 'undefined' ? window.innerHeight * 0.35 : 250;
  private isMouseDown: boolean = false;
  private selectedWeaponSlot: number = 0;
  private wasdThrottle: number = 0.0;
  private currentCamo: CamoType = 'HAZE_GREY';
  public stickyTelegraphThrottle: boolean = false;

  private lastFrameTimeMs: number = 0;
  private simAccumulatorSec: number = 0;
  private isRunning: boolean = false;
  private isPlayerRespawning: boolean = false;

  // mk48.io Vietnamese Start Screen & HUD overlays
  private startLobbyElement: HTMLElement | null = null;
  private mk48HudElement: HTMLElement | null = null;
  private bottomStatusText: HTMLElement | null = null;
  private bottomReloadBarText: HTMLElement | null = null;

  constructor(container: HTMLElement) {
    this.renderer = new PixiRenderer();
    this.hud = new HUDController(container);
    this.sdk = new StandaloneMockSDK(10);
    this.binaryClient = new BinaryClient();
    this.predictor = new ClientPredictor(0, 0, 0);
    this.interpolator = new SnapshotInterpolator(100);

    this.localServer = new AuthoritativeGameServer(20);
    this.botController = new BotController(this.localServer);
    this.modeController = new GameModeController();
    this.fleetManager = new FleetKarmaManager();
    this.terrainGraphics = new Graphics();
  }

  public async init(container: HTMLElement): Promise<void> {
    this.stickyTelegraphThrottle = true;
    await this.sdk.init();
    await this.renderer.init(container);
    this.renderer.setZoom(1.85); // Crisp, prominent warship view (mk48.io style)
    this.renderer.terrainLayer.addChild(this.terrainGraphics);

    if (typeof window !== 'undefined') {
      const rect = container.getBoundingClientRect();
      this.mouseScreenX = (rect.width || window.innerWidth || 800) * 0.5;
      this.mouseScreenY = (rect.height || window.innerHeight || 600) * 0.35;
    }

    this.setupInitialWorld();
    this.buildVietnameseOverlay(container);
    this.bindInputEvents(container);
    this.bindHUDCallbacks();

    this.sdk.gameplayStart();
    this.isRunning = true;
    this.lastFrameTimeMs = performance.now();
    requestAnimationFrame((t) => this.frameLoop(t));
  }

  private setupInitialWorld(): void {
    // Spawn local player vessel (Tier 3 Fletcher Destroyer by default for immediate action)
    const playerVessel = this.localServer.spawnVessel({
      id: 1,
      name: 'Commander_You',
      shipId: 'fletcher_dd',
      position: { x: 0, y: 200 },
      heading: -Math.PI / 2,
      isBot: false,
      teamId: 1,
      fleetId: 1,
    });
    this.playerVesselId = playerVessel.id;
    this.hud.menus.unlockedHulls.add('fletcher_dd');
    this.hud.menus.selectedHullId = 'fletcher_dd';

    // Spawn 12 diverse AI Bots across all 8 naval classes
    const botRosterIds = [
      'pt_boat_109',
      'fairmile_d_dog',
      'fletcher_dd',
      'arleigh_burke_ddg',
      'moskva_cg',
      'bismarck_bb',
      'yamato_bb',
      'type_vii_uboat',
      'akula_ssn',
      'essex_cv',
      'mercy_hospital',
      'polar_icebreaker',
    ];

    for (let i = 0; i < botRosterIds.length; i++) {
      const angle = (i / botRosterIds.length) * Math.PI * 2;
      const radius = 1350 + (i % 4) * 280;
      const isAlly = i === 10; // Mercy Hospital Ship on player's fleet
      const bot = this.localServer.spawnVessel({
        id: 10 + i,
        name: isAlly ? 'Mercy_Support' : `FleetBot_${i + 1}`,
        shipId: botRosterIds[i],
        position: { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius },
        heading: angle + Math.PI,
        isBot: true,
        teamId: isAlly ? 1 : 2,
        fleetId: isAlly ? 1 : 0,
      });
      this.botController.registerBot(bot.id);
    }

    this.drawWorldTerrain();
  }

  private drawWorldTerrain(): void {
    const g = this.terrainGraphics;
    g.clear();

    // 1. Arctic Ice Biome Northern Shelf visual indicator
    g.rect(-3000, -3000, 6000, 650);
    g.fill({ color: 0xb2ebf2, alpha: 0.16 });
    g.stroke({ color: 0x80deea, width: 1.5, alpha: 0.4 });

    // 2. Natural shallow water sandbars & shoals (soft turquoise gradients)
    const shoals = [
      { x: -900, y: -400, r: 280 },
      { x: 1100, y: 650, r: 320 },
    ];
    for (const s of shoals) {
      g.circle(s.x, s.y, s.r);
      g.fill({ color: 0x1a455a, alpha: 0.35 });
      g.stroke({ color: 0x24627d, width: 2, alpha: 0.4 });
      g.circle(s.x, s.y, s.r * 0.65);
      g.fill({ color: 0x225c75, alpha: 0.28 });
    }

    // 3. Islands with 3D Hill-Shading (Drop-shadow, golden beach contour & elevated interior hills)
    for (const island of this.localServer.getIslands()) {
      const pts: number[] = [];
      const shadowPts: number[] = [];
      for (const v of island.polygon.vertices) {
        pts.push(v.x, v.y);
        shadowPts.push(v.x + 14, v.y + 18); // Directional 3D sunlight shadow
      }
      if (pts.length >= 6) {
        // Tier 0: Soft Underwater Island Drop Shadow
        g.poly(shadowPts);
        g.fill({ color: 0x071b2d, alpha: 0.55 });

        // Tier 1: Coastal Golden Sandy Beach Perimeter
        g.poly(pts);
        g.fill({ color: 0xc2b280 });
        g.stroke({ color: 0xa8935c, width: 3.5 });

        // Tier 2: Interior Elevated Hill Foliage (Olive Green)
        g.poly(pts);
        g.fill({ color: 0x2e5836, alpha: 0.92 });
        g.stroke({ color: 0xc2b280, width: 4.5, alpha: 0.85 });

        // Tier 3: Sunward Hilltop Shading Highlight
        const sunPts: number[] = [];
        for (let i = 0; i < island.polygon.vertices.length; i++) {
          const v = island.polygon.vertices[i];
          sunPts.push(v.x * 0.95, v.y * 0.95);
        }
        g.poly(sunPts);
        g.fill({ color: 0x3d6e47, alpha: 0.45 });
      }
    }

    // 4. Detailed 3D Offshore Oil Rig Platforms (media_1794053697947_d02bd12a.jpg)
    for (const rig of this.localServer.resourceEngine.getAllOilRigs()) {
      const rx = rig.position.x;
      const ry = rig.position.y;

      // Capture radius ring
      g.circle(rx, ry, rig.captureRadius);
      g.stroke({ color: 0xffd54f, width: 1.5, alpha: 0.35 });

      // Tier 0: Dark underwater drop-shadow on the water
      g.rect(rx - 45 + 10, ry - 45 + 14, 90, 90);
      g.fill({ color: 0x071b2d, alpha: 0.55 });

      // 4 corner pillar legs with water ripple halos
      const cornerOffsets = [
        { x: -38, y: -38 },
        { x: 38, y: -38 },
        { x: -38, y: 38 },
        { x: 38, y: 38 },
      ];
      for (const co of cornerOffsets) {
        const cx = rx + co.x;
        const cy = ry + co.y;
        // Water ripple halo rings
        g.circle(cx, cy, 12);
        g.stroke({ color: 0x80deea, width: 1.5, alpha: 0.65 });
        g.circle(cx, cy, 16);
        g.stroke({ color: 0xffffff, width: 1.0, alpha: 0.35 });
        // Pillar leg
        g.circle(cx, cy, 6.5);
        g.fill({ color: 0x334155 });
        g.stroke({ color: 0x0f172a, width: 1.2 });
      }

      // Square concrete platform deck (90m x 90m, steel/beige tone #b8b09d)
      g.rect(rx - 45, ry - 45, 90, 90);
      g.fill({ color: 0xb8b09d });
      g.stroke({ color: 0x6e685a, width: 2.0 });

      // Perimeter safety walkway / railing
      g.rect(rx - 42, ry - 42, 84, 84);
      g.stroke({ color: 0x8c8371, width: 1.2, alpha: 0.7 });

      // Inner deck floor plate / grating
      g.rect(rx - 38, ry - 38, 76, 76);
      g.fill({ color: 0x8c8372, alpha: 0.35 });

      // Industrial piping & derrick structures
      // Central drilling derrick tower (lattice pyramid with cross-braces)
      g.rect(rx - 18, ry - 15, 20, 20);
      g.fill({ color: 0x475569 });
      g.stroke({ color: 0x1e293b, width: 1.5 });
      g.moveTo(rx - 18, ry - 15);
      g.lineTo(rx + 2, ry + 5);
      g.stroke({ color: 0xfacc15, width: 1.2 });
      g.moveTo(rx - 18, ry + 5);
      g.lineTo(rx + 2, ry - 15);
      g.stroke({ color: 0xfacc15, width: 1.2 });

      // Industrial pipelines
      g.moveTo(rx - 34, ry + 12);
      g.lineTo(rx + 10, ry + 12);
      g.stroke({ color: 0xe2e8f0, width: 2.2 });
      g.moveTo(rx - 34, ry + 16);
      g.lineTo(rx + 10, ry + 16);
      g.stroke({ color: 0xd97706, width: 2.0 });
      g.moveTo(rx + 10, ry + 12);
      g.lineTo(rx + 10, ry + 32);
      g.stroke({ color: 0xe2e8f0, width: 2.2 });

      // Storage tanks / cylindrical oil reservoirs
      g.circle(rx - 24, ry + 24, 7.5);
      g.fill({ color: 0xd1d5db });
      g.stroke({ color: 0x4b5563, width: 1.2 });
      g.circle(rx - 8, ry + 24, 7.5);
      g.fill({ color: 0xd1d5db });
      g.stroke({ color: 0x4b5563, width: 1.2 });

      // Operations / crew module
      g.rect(rx - 36, ry - 36, 16, 14);
      g.fill({ color: 0x334155 });
      g.stroke({ color: 0x1e293b, width: 1.2 });
      g.rect(rx - 34, ry - 34, 12, 2.5);
      g.fill({ color: 0x38ef7d });

      // Octagonal helipad in one corner with bold white [H] marking
      const hx = rx + 22;
      const hy = ry - 20;
      const hr = 16;
      const octPts: number[] = [];
      for (let a = 0; a < 8; a++) {
        const ang = (a * Math.PI) / 4 + Math.PI / 8;
        octPts.push(hx + Math.cos(ang) * hr, hy + Math.sin(ang) * hr);
      }
      g.poly(octPts);
      g.fill({ color: 0x374151 });
      g.stroke({ color: 0xfacc15, width: 1.5 });

      // White circular landing guide ring
      g.circle(hx, hy, hr * 0.72);
      g.stroke({ color: 0xffffff, width: 1.2, alpha: 0.85 });

      // Bold white [H] marking
      const hSize = hr * 0.42;
      g.moveTo(hx - hSize * 0.6, hy - hSize);
      g.lineTo(hx - hSize * 0.6, hy + hSize);
      g.moveTo(hx + hSize * 0.6, hy - hSize);
      g.lineTo(hx + hSize * 0.6, hy + hSize);
      g.moveTo(hx - hSize * 0.6, hy);
      g.lineTo(hx + hSize * 0.6, hy);
      g.stroke({ color: 0xffffff, width: 2.2 });
    }
  }

  private bindInputEvents(container: HTMLElement): void {
    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      this.keysPressed.add(key);
      soundSynth.resumeContext();

      if (key === 'q') this.togglePlayerDive();
      else if (key === 'e') this.togglePlayerStealth();
      else if (key === 'f') this.triggerPlayerECM();
      else if (key === 'r') this.triggerPlayerSonarPing();
      else if (key === 't') {
        if (this.hud.menus.isAnyOpen()) this.hud.menus.closeAll();
        else this.hud.menus.showTechTree();
      } else if (key === 'l') {
        if (this.hud.menus.isAnyOpen()) this.hud.menus.closeAll();
        else this.hud.menus.showLoadoutCustomizer();
      } else if (key === 'c') {
        if (this.hud.menus.isAnyOpen()) this.hud.menus.closeAll();
        else this.hud.menus.showCamoSelector();
      } else if (key === 'm') {
        this.cycleGameMode();
      } else if (key === 'x') {
        this.toggleSteeringMode();
      } else if (key === 'v') {
        this.toggleTacticalOverlay();
      } else if (key === 'escape') {
        this.toggleStartLobby();
      } else if (key >= '1' && key <= '4') {
        this.selectedWeaponSlot = Number(key) - 1;
      } else if (key === ' ') {
        e.preventDefault();
        this.triggerSalvoBurst();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keysPressed.delete(e.key.toLowerCase());
    });

    container.addEventListener('mousemove', (e) => {
      const rect = container.getBoundingClientRect();
      this.mouseScreenX = e.clientX - rect.left;
      this.mouseScreenY = e.clientY - rect.top;
    });

    container.addEventListener('mousedown', (e) => {
      const target = e.target as HTMLElement;
      if (target.tagName !== 'CANVAS') return;
      if (this.startLobbyElement && this.startLobbyElement.style.display !== 'none') return;
      if (this.hud.menus.isAnyOpen()) return;

      soundSynth.resumeContext();

      if (e.button === 0) {
        this.isMouseDown = true;
        this.fireSelectedWeaponSlot();
      } else if (e.button === 2) {
        this.triggerSalvoBurst();
      }
    });

    container.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    window.addEventListener('mouseup', () => {
      this.isMouseDown = false;
    });

    container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : 0.89;
      this.renderer.zoomBy(factor);
    }, { passive: false });
  }

  private bindHUDCallbacks(): void {
    this.hud.weaponControls.setCallbacks({
      onDive: () => this.togglePlayerDive(),
      onStealth: () => this.togglePlayerStealth(),
      onEcm: () => this.triggerPlayerECM(),
      onWeaponSelect: (idx) => {
        this.selectedWeaponSlot = idx;
      },
      onSalvoBurst: () => {
        this.triggerSalvoBurst();
      },
    });

    this.hud.menus.setCallbacks({
      onSelectHull: (hullId) => {
        this.respawnPlayerWithHull(hullId, this.currentCamo);
      },
      onSelectCamo: (camo) => {
        this.currentCamo = camo;
        const player = this.localServer.getVessel(this.playerVesselId);
        if (player) {
          this.respawnPlayerWithHull(player.shipDef.id, camo);
        }
      },
    });

    this.hud.minimap.onClick((worldX, worldY) => {
      this.renderer.setCameraPosition(worldX, worldY, 0.5);
    });

    this.hud.onToggleSteeringMode = () => {
      this.toggleSteeringMode();
    };
  }

  public toggleSteeringMode(): void {
    this.steeringMode = this.steeringMode === 'MOUSE' ? 'WASD' : 'MOUSE';
    this.hud.setSteeringMode(this.steeringMode);
  }

  public toggleTacticalOverlay(): void {
    const isVisible = this.renderer.sensorOverlays.toggleOverlay();
    const modeName = isVisible ? 'BẬT RADAR & VÙNG BẮN' : 'CHẾ ĐỘ TỐI GIẢN (NƯỚC SẠCH)';
    this.hud.setGameModeTitle(`[V] ${modeName}`);
  }

  public toggleStartLobby(): void {
    if (!this.startLobbyElement) return;
    const isHidden = this.startLobbyElement.style.display === 'none';
    this.startLobbyElement.style.display = isHidden ? 'flex' : 'none';
  }

  public respawnPlayerWithHull(hullId: string, camo: CamoType = this.currentCamo): void {
    const existing = this.localServer.getVessel(this.playerVesselId);
    const pos = existing ? { ...existing.physics.position } : { x: 0, y: 0 };
    const heading = existing ? existing.physics.heading : 0;

    if (existing) {
      this.localServer.despawnVessel(existing.id);
      const oldView = this.vesselViews.get(existing.id);
      if (oldView) {
        oldView.container.removeFromParent();
        this.vesselViews.delete(existing.id);
      }
    }

    const newVessel = this.localServer.spawnVessel({
      id: this.playerVesselId,
      name: 'Commander_You',
      shipId: hullId,
      position: pos,
      heading,
      isBot: false,
      teamId: 1,
      fleetId: 1,
    });
    this.playerVesselId = newVessel.id;
    this.currentCamo = camo;
  }

  private togglePlayerDive(): void {
    const player = this.localServer.getVessel(this.playerVesselId);
    if (!player || !player.shipDef.canSubmerge) return;

    const current = player.physics.depthState;
    const next = current === 'SURFACE' ? 'PERISCOPE' : current === 'PERISCOPE' ? 'DEEP' : 'SURFACE';
    commandDepthState(player.shipDef, player.physics, next);
    soundSynth.playWaterSplash(0.8);
  }

  private togglePlayerStealth(): void {
    const player = this.localServer.getVessel(this.playerVesselId);
    if (!player) return;
    toggleStealthMode(player.shipDef, player.physics);
  }

  private triggerPlayerECM(): void {
    const player = this.localServer.getVessel(this.playerVesselId);
    if (!player) return;
    if (this.localServer.activateECM(player)) {
      soundSynth.playSonarPing(1400);
    }
  }

  private triggerPlayerSonarPing(): void {
    this.renderer.sensorOverlays.triggerSonarPing(800);
    soundSynth.playSonarPing(980);
  }

  private cycleGameMode(): void {
    const modes: GameModeId[] = ['FFA_SANDBOX', 'KOTH_CONVOY', 'DUEL_ARENA'];
    const idx = (modes.indexOf(this.modeController.currentMode) + 1) % modes.length;
    const nextMode = modes[idx];
    this.modeController.currentMode = nextMode;

    if (nextMode === 'FFA_SANDBOX') {
      this.hud.setGameModeTitle('HẠM ĐỘI HỖN CHIẾN (FFA)');
    } else if (nextMode === 'KOTH_CONVOY') {
      this.modeController.startKothConvoyMatch();
      this.hud.setGameModeTitle('CHIẾM CỨ ĐIỂM & HỘ TỐNG');
    } else {
      this.hud.setGameModeTitle('ĐẤU TRƯỜNG 1V1 (ARENA)');
    }
  }

  private triggerMountFX(player: ServerVessel, mountIndex: number, mount: WeaponMountDef): void {
    const view = this.vesselViews.get(player.id);
    if (view && view.turrets[mountIndex]) {
      view.turrets[mountIndex].fireRecoil();
    }

    if (mount.category === 'TORPEDO' || mount.category === 'ROCKET_TORPEDO') {
      soundSynth.playTorpedoWhoosh();
    } else if (mount.category === 'CRUISE_MISSILE' || mount.category === 'SAM_CIWS') {
      soundSynth.playTorpedoWhoosh();
    } else if (mount.category === 'DEPTH_CHARGE' || mount.category === 'NAVAL_MINE') {
      soundSynth.playWaterSplash(1.2);
    } else {
      soundSynth.playCannonBoom(mount.caliberMm ?? 127, 0);
      const worldAngle = player.physics.heading + mount.currentAngle;
      this.renderer.particles.spawnMuzzleFlash(
        player.physics.position.x + Math.cos(worldAngle) * 18,
        player.physics.position.y + Math.sin(worldAngle) * 18,
        worldAngle,
        mount.caliberMm ?? 127
      );
    }
  }

  /**
   * Left-Click handler: Only fires the currently selected weapon slot!
   * Defaults to [1] Đạn Pháo Chính so clicking NEVER auto-fires torpedoes.
   */
  public fireSelectedWeaponSlot(): void {
    const player = this.localServer.getVessel(this.playerVesselId);
    if (!player || player.physics.isDestroyed || player.isSinking) return;

    const targetWorld = this.renderer.screenToWorld(this.mouseScreenX, this.mouseScreenY);
    let firedAny = false;

    if (this.selectedWeaponSlot === 0) {
      // Slot 1: ĐẠN PHÁO (Hải Pháo Chính)
      for (let i = 0; i < player.mounts.length; i++) {
        const mount = player.mounts[i];
        if (mount.category === 'ARTILLERY') {
          if (this.localServer.fireMount(player.id, i, targetWorld)) {
            firedAny = true;
            this.triggerMountFX(player, i, mount);
          }
        }
      }
    } else if (this.selectedWeaponSlot === 1) {
      // Slot 2: NGƯ LÔI THẲNG (Bắn thẳng không truy đuổi)
      for (let i = 0; i < player.mounts.length; i++) {
        const mount = player.mounts[i];
        if (mount.category === 'TORPEDO' || mount.category === 'ROCKET_TORPEDO') {
          if (this.localServer.fireMount(player.id, i, targetWorld, false)) {
            firedAny = true;
            this.triggerMountFX(player, i, mount);
            break; // Discharge one tube per click
          }
        }
      }
    } else if (this.selectedWeaponSlot === 2) {
      // Slot 3: NGƯ LÔI TRUY ĐUỔI (Tự định hướng & bám mục tiêu)
      for (let i = 0; i < player.mounts.length; i++) {
        const mount = player.mounts[i];
        if (mount.category === 'TORPEDO' || mount.category === 'ROCKET_TORPEDO') {
          if (this.localServer.fireMount(player.id, i, targetWorld, true)) {
            firedAny = true;
            this.triggerMountFX(player, i, mount);
            break; // Discharge one tube per click
          }
        }
      }
    } else if (this.selectedWeaponSlot === 3) {
      // Slot 4: TÊN LỬA / THỦY LÔI / ĐẶC BIỆT
      for (let i = 0; i < player.mounts.length; i++) {
        const mount = player.mounts[i];
        const cat = mount.category;
        if (
          cat === 'CRUISE_MISSILE' ||
          cat === 'DEPTH_CHARGE' ||
          cat === 'SAM_CIWS' ||
          cat === 'NAVAL_MINE' ||
          cat === 'ROCKET_BARRAGE'
        ) {
          if (this.localServer.fireMount(player.id, i, targetWorld)) {
            firedAny = true;
            this.triggerMountFX(player, i, mount);
            break;
          }
        }
      }
    }

    if (firedAny) {
      this.sdk.happyTime(0.1);
    }
  }

  /**
   * Rapid-Fire Salvo Burst [Space / Right-Click / HUD Button]
   * Rapidly discharges all loaded barrels/tubes of currently selected weapon slot!
   */
  public triggerSalvoBurst(): void {
    const player = this.localServer.getVessel(this.playerVesselId);
    if (!player || player.physics.isDestroyed || player.isSinking) return;

    const candidateIndices: number[] = [];
    let homingOverride: boolean | undefined = undefined;

    if (this.selectedWeaponSlot === 0) {
      for (let i = 0; i < player.mounts.length; i++) {
        const cat = player.mounts[i].category;
        if (cat === 'ARTILLERY') {
          candidateIndices.push(i);
        }
      }
    } else if (this.selectedWeaponSlot === 1) {
      homingOverride = false;
      for (let i = 0; i < player.mounts.length; i++) {
        const cat = player.mounts[i].category;
        if (cat === 'TORPEDO' || cat === 'ROCKET_TORPEDO') {
          candidateIndices.push(i);
        }
      }
    } else if (this.selectedWeaponSlot === 2) {
      homingOverride = true;
      for (let i = 0; i < player.mounts.length; i++) {
        const cat = player.mounts[i].category;
        if (cat === 'TORPEDO' || cat === 'ROCKET_TORPEDO') {
          candidateIndices.push(i);
        }
      }
    } else if (this.selectedWeaponSlot === 3) {
      for (let i = 0; i < player.mounts.length; i++) {
        const cat = player.mounts[i].category;
        if (
          cat === 'CRUISE_MISSILE' ||
          cat === 'DEPTH_CHARGE' ||
          cat === 'SAM_CIWS' ||
          cat === 'NAVAL_MINE' ||
          cat === 'ROCKET_BARRAGE'
        ) {
          candidateIndices.push(i);
        }
      }
    }

    if (candidateIndices.length === 0) return;

    let shotCount = 0;
    for (const mIdx of candidateIndices) {
      const mount = player.mounts[mIdx];
      if (mount && mount.ammoCurrent >= 1) {
        const delay = shotCount * 120;
        shotCount++;
        setTimeout(() => {
          if (!player.physics.isDestroyed && !player.isSinking) {
            const currentTarget = this.renderer.screenToWorld(this.mouseScreenX, this.mouseScreenY);
            if (this.localServer.fireMount(player.id, mIdx, currentTarget, homingOverride)) {
              this.triggerMountFX(player, mIdx, mount);
            }
          }
        }, delay);
      }
    }

    if (shotCount > 0) {
      this.sdk.happyTime(0.2);
    }
  }

  public firePlayerWeapons(): void {
    this.fireSelectedWeaponSlot();
  }

  private frameLoop(nowMs: number): void {
    if (!this.isRunning) return;

    const dt = Math.min(0.1, Math.max(0.001, (nowMs - this.lastFrameTimeMs) / 1000));
    this.lastFrameTimeMs = nowMs;

    this.updateLocalInput(dt);

    // Fixed 20 Hz (50ms) authoritative simulation step
    this.simAccumulatorSec += dt;
    const fixedStep = 0.05;
    while (this.simAccumulatorSec >= fixedStep) {
      this.botController.update(fixedStep);
      this.localServer.step(fixedStep);
      this.processServerEvents();
      this.simAccumulatorSec -= fixedStep;
    }

    this.renderWorld(dt);
    requestAnimationFrame((t) => this.frameLoop(t));
  }

  private updateLocalInput(dt: number): void {
    const player = this.localServer.getVessel(this.playerVesselId);
    if (!player || player.physics.isDestroyed || player.isSinking) return;

    const targetWorld = this.renderer.screenToWorld(this.mouseScreenX, this.mouseScreenY);

    const hasW = this.keysPressed.has('w') || this.keysPressed.has('arrowup');
    const hasS = this.keysPressed.has('s') || this.keysPressed.has('arrowdown');
    const hasA = this.keysPressed.has('a') || this.keysPressed.has('arrowleft');
    const hasD = this.keysPressed.has('d') || this.keysPressed.has('arrowright');
    const hasX = this.keysPressed.has('x');

    // Update sticky telegraph throttle on key input
    if (hasW) {
      this.wasdThrottle = 1.0;
    } else if (hasS) {
      this.wasdThrottle = -0.5;
    } else if (hasX) {
      this.wasdThrottle = 0.0;
    }

    const dx = targetWorld.x - player.physics.position.x;
    const dy = targetWorld.y - player.physics.position.y;
    const dist = Math.hypot(dx, dy);

    const targetHeading = Math.atan2(dy, dx);
    const headingError = shortestAngleDiff(player.physics.heading, targetHeading);

    let mouseRudder = 0;
    if (Math.abs(headingError) >= 0.02) {
      mouseRudder = Math.max(-1.0, Math.min(1.0, headingError * 2.5));
    }

    // Distance-based Throttle (mk48.io style):
    let mouseThrottle = 0;
    if (this.stickyTelegraphThrottle) {
      if (dist < 35) {
        mouseThrottle = 0.0;
        if (this.steeringMode === 'MOUSE') {
          this.wasdThrottle = 0.0;
        }
      } else if (dist <= 120) {
        mouseThrottle = 0.5 + ((dist - 35) / 85) * 0.5;
      } else {
        mouseThrottle = 1.0;
      }
    } else {
      if (dist < 50) {
        mouseThrottle = 0.0;
      } else if (dist <= 250) {
        mouseThrottle = 0.1 + ((dist - 50) / 200) * 0.9;
      } else {
        mouseThrottle = 1.0;
      }
    }

    if (this.steeringMode === 'MOUSE') {
      // In MOUSE mode:
      // Manual WASD immediately overrides cursor guidance for tactical maneuvers;
      // Releasing them smoothly restores cursor tracking.
      if (hasS) {
        player.physics.throttle = -0.5;
      } else if (hasW) {
        player.physics.throttle = 1.0;
      } else {
        player.physics.throttle = mouseThrottle;
      }

      if (hasA) {
        player.physics.rudderAngle = -1.0;
      } else if (hasD) {
        player.physics.rudderAngle = 1.0;
      } else {
        player.physics.rudderAngle = mouseRudder;
      }
    } else {
      // Responsive WASD Mode (instantaneous, zero laggy ramp-up)
      if (this.stickyTelegraphThrottle) {
        player.physics.throttle = this.wasdThrottle;
      } else {
        if (hasW) {
          player.physics.throttle = 1.0;
        } else if (hasS) {
          player.physics.throttle = -0.5;
        } else {
          player.physics.throttle = 0.0;
        }
      }

      if (hasA) {
        player.physics.rudderAngle = -1.0;
      } else if (hasD) {
        player.physics.rudderAngle = 1.0;
      } else {
        player.physics.rudderAngle = 0.0;
      }
    }

    // Responsive player vessel acceleration & turning boost (<0.5s response time)
    if (player.physics.throttle !== 0) {
      const targetSpeedMs = player.physics.throttle > 0
        ? player.physics.throttle * player.shipDef.maxForwardSpeed
        : player.physics.throttle * 2 * player.shipDef.maxReverseSpeed;
      const cosH = Math.cos(player.physics.heading);
      const sinH = Math.sin(player.physics.heading);
      const currentForwardSpeed = player.physics.linearVelocity.x * cosH + player.physics.linearVelocity.y * sinH;
      const speedDiff = targetSpeedMs - currentForwardSpeed;
      if (Math.abs(speedDiff) > 0.5) {
        const boost = speedDiff * Math.min(1.0, dt * 5.0);
        player.physics.linearVelocity.x += cosH * boost;
        player.physics.linearVelocity.y += sinH * boost;
      }
    }

    if (Math.abs(player.physics.rudderAngle) > 0.05) {
      const targetAngular = player.physics.rudderAngle * player.shipDef.turnRateMax * 1.5;
      player.physics.angularVelocity += (targetAngular - player.physics.angularVelocity) * Math.min(1.0, dt * 6.0);
    }

    // Aim turrets toward mouse cursor
    const aimWorldAngle = Math.atan2(
      targetWorld.y - player.physics.position.y,
      targetWorld.x - player.physics.position.x
    );
    const relTargetAngle = normalizeAngle(aimWorldAngle - player.physics.heading);

    for (const mount of player.mounts) {
      stepMountTraverse(mount, relTargetAngle, dt);
    }

    if (this.isMouseDown) {
      this.fireSelectedWeaponSlot();
    }

    soundSynth.updateEngineSound(player.physics.throttle, player.physics.speedKnots);
  }

  private processServerEvents(): void {
    const events = this.localServer.drainQueuedEvents();
    for (const ev of events) {
      if (ev.eventType === GameEventType.HIT) {
        const victim = this.localServer.getVessel(ev.targetId);
        if (victim) {
          this.renderer.particles.spawnExplosion(victim.physics.position.x, victim.physics.position.y, 0.7);
        }
      } else if (ev.eventType === GameEventType.SINK) {
        const victim = this.localServer.getVessel(ev.targetId);
        const killer = this.localServer.getVessel(ev.sourceId);
        if (victim) {
          this.renderer.particles.spawnExplosion(victim.physics.position.x, victim.physics.position.y, 1.8);
          soundSynth.playExplosion(1.4);
          this.hud.killFeed.addKill(
            killer ? killer.name : 'Hazard',
            victim.name,
            'Naval Strike',
            {
              killerIsFriendly: killer?.id === this.playerVesselId,
              killerIsTraitor: (killer?.karma ?? 100) < 50,
            }
          );

          if (victim.id === this.playerVesselId) {
            // Player death: trigger dedicated respawn modal with countdown timer
            this.triggerPlayerDeathRespawn(victim, killer);
          } else {
            // Auto-respawn AI bot at safe outer patrol ring after 5s delay
            setTimeout(() => {
              if (victim.physics.isDestroyed) {
                victim.physics.isDestroyed = false;
                victim.isSinking = false;
                victim.sinkingTimer = 0;
                victim.physics.hullHp = victim.shipDef.maxHp;
                victim.spawnShieldRemaining = 4.0;
                const angle = Math.random() * Math.PI * 2;
                const radius = 1350 + (victim.id % 4) * 280;
                victim.physics.position = {
                  x: Math.cos(angle) * radius,
                  y: Math.sin(angle) * radius,
                };
                victim.physics.linearVelocity = { x: 0, y: 0 };
                victim.physics.angularVelocity = 0;
                victim.physics.heading = angle + Math.PI;
              }
            }, 5000);
          }
        }
      }
    }
  }

  private createVesselView(vessel: ServerVessel): ProceduralVessel {
    const turretConfigs: TurretConfig[] = vessel.mounts.map((m) => ({
      slotId: m.slotId,
      offsetX: m.localOffset.x,
      offsetY: m.localOffset.y,
      baseAngle: m.baseAngle,
      arcCoverage: m.arcCoverage,
      caliberMm: m.caliberMm ?? 127,
      category: m.category,
      beamMeters: vessel.shipDef.beam,
    }));

    const camo: CamoType = vessel.id === this.playerVesselId ? this.currentCamo : 'HAZE_GREY';
    const view = new ProceduralVessel(
      vessel.shipDef.shipClass,
      vessel.shipDef.length,
      vessel.shipDef.beam,
      camo,
      turretConfigs
    );
    view.setPlayerName(
      vessel.name,
      vessel.fleetId > 0 && vessel.fleetId === 1,
      vessel.id === this.playerVesselId
    );
    this.renderer.surfaceLayer.addChild(view.container);
    this.vesselViews.set(vessel.id, view);
    return view;
  }

  private renderWorld(dt: number): void {
    const vessels = this.localServer.getAllVessels();
    const player = this.localServer.getVessel(this.playerVesselId);
    const targetWorld = this.renderer.screenToWorld(this.mouseScreenX, this.mouseScreenY);

    const minimapContacts: MinimapContact[] = [];

    for (const v of vessels) {
      let view = this.vesselViews.get(v.id);
      if (!view) {
        view = this.createVesselView(v);
      }

      if (v.isSinking) {
        view.container.visible = true;
        const progress = Math.max(0, Math.min(1.0, 1.0 - (v.sinkingTimer / 3.0)));
        view.setSinking(true, progress, dt);
        if (Math.random() < 0.35) {
          const bx = v.physics.position.x + (Math.random() - 0.5) * v.shipDef.length * 0.7;
          const by = v.physics.position.y + (Math.random() - 0.5) * v.shipDef.beam * 0.7;
          this.renderer.particles.spawnCavitationBubble(bx, by);
        }
      } else if (v.physics.isDestroyed) {
        view.container.visible = false;
        view.setSinking(false, 0);
        continue;
      } else {
        view.container.visible = true;
        view.setSinking(false, 0);
        view.setSpawnShield(v.spawnShieldRemaining > 0, performance.now() / 1000);
      }

      view.container.position.set(v.physics.position.x, v.physics.position.y);
      view.container.rotation = v.physics.heading;

      const depthNum = v.physics.depthState === 'DEEP' ? 2 : v.physics.depthState === 'PERISCOPE' ? 1 : 0;
      view.setDepth(depthNum);
      view.updateHpBar(v.physics.hullHp / v.shipDef.maxHp);

      const aimAngle =
        v.id === this.playerVesselId
          ? Math.atan2(targetWorld.y - v.physics.position.y, targetWorld.x - v.physics.position.x)
          : v.physics.heading + (v.mounts[0]?.currentAngle ?? 0);
      view.update(dt, aimAngle);

      // Emit hydrodynamic dual-emitter Kelvin wake (Bow divergent spray + Stern prop wash)
      const sternX = v.physics.position.x - Math.cos(v.physics.heading) * (v.shipDef.length * 0.45);
      const sternY = v.physics.position.y - Math.sin(v.physics.heading) * (v.shipDef.length * 0.45);
      this.renderer.wakeFX.emitWake(
        sternX,
        sternY,
        v.physics.heading,
        v.shipDef.beam,
        v.physics.speedKnots,
        depthNum,
        v.physics.isCavitationNoise,
        v.id
      );

      const bowX = v.physics.position.x + Math.cos(v.physics.heading) * (v.shipDef.length * 0.48);
      const bowY = v.physics.position.y + Math.sin(v.physics.heading) * (v.shipDef.length * 0.48);
      this.renderer.wakeFX.emitBowWave(
        bowX,
        bowY,
        v.physics.heading,
        v.shipDef.beam,
        v.physics.speedKnots,
        depthNum,
        v.id
      );

      // Large bright green player name label (mk48.io style), white for enemies
      view.setPlayerName(v.name, v.fleetId > 0 && v.fleetId === (player?.fleetId ?? 1), v.id === this.playerVesselId);

      minimapContacts.push({
        id: v.id,
        x: v.physics.position.x,
        y: v.physics.position.y,
        heading: v.physics.heading,
        isPlayer: v.id === this.playerVesselId,
        isFriendly: v.fleetId > 0 && v.fleetId === (player?.fleetId ?? 1),
        isSubmerged: depthNum > 0,
      });
    }

    // Render active projectiles
    const projRenderList = this.localServer.getAllProjectiles().map((p) => ({
      x: p.position.x,
      y: p.position.y,
      heading: Math.atan2(p.velocity.y, p.velocity.x),
      type:
        p.category === 'TORPEDO' || p.category === 'ROCKET_TORPEDO'
          ? ('TORPEDO' as const)
          : p.category === 'CRUISE_MISSILE' || p.category === 'SAM_CIWS'
          ? ('MISSILE' as const)
          : ('SHELL' as const),
    }));
    this.renderer.renderProjectiles(projRenderList);

    // Update camera, sensor overlays, firing arcs, and HUD for player vessel
    if (player) {
      this.renderer.setCameraPosition(player.physics.position.x, player.physics.position.y, 0.15);
      this.renderer.sensorOverlays.drawRangeRings(
        player.physics.position.x,
        player.physics.position.y,
        450,
        850,
        620
      );

      this.renderer.sensorOverlays.drawCourseReticle(
        player.physics.position.x,
        player.physics.position.y,
        player.physics.heading,
        targetWorld.x,
        targetWorld.y,
        this.steeringMode === 'MOUSE'
      );

      const aimAngle = Math.atan2(
        targetWorld.y - player.physics.position.y,
        targetWorld.x - player.physics.position.x
      );
      const relAim = normalizeAngle(aimAngle - player.physics.heading);

      const arcs: FiringArcState[] = player.mounts.slice(0, 4).map((m) => ({
        baseAngle: m.baseAngle,
        arcCoverage: m.arcCoverage,
        currentAngle: m.currentAngle,
        isLoaded: m.reloadTimeRemaining <= 0 && m.ammoCurrent >= 1,
        isOnBearing:
          isAngleWithinMountArc(m, relAim) &&
          Math.abs(shortestAngleDiff(m.currentAngle, relAim)) <= 0.12,
      }));

      // Annular donut firing arcs with deadzone over hull
      this.renderer.sensorOverlays.drawFiringArcs(
        player.physics.position.x,
        player.physics.position.y,
        player.physics.heading,
        arcs,
        210,
        player.shipDef.length
      );

      this.renderer.sensorOverlays.update(dt, player.physics.position.x, player.physics.position.y, 850);

      const depthNum =
        player.physics.depthState === 'DEEP' ? 2 : player.physics.depthState === 'PERISCOPE' ? 1 : 0;

      this.hud.updatePlayerStatus({
        name: player.name,
        hullHp: player.physics.hullHp,
        maxHp: player.shipDef.maxHp,
        speedKnots: player.physics.speedKnots,
        depthMeters: player.physics.currentDepth,
        depthState: depthNum,
        isStealth: player.physics.stealthModeActive,
        ecmActive: player.ecmActive,
        karmaScore: player.karma,
      });

      // 4 Structured Weapon Slots (Guns, Straight Torpedo, Homing Torpedo, Special)
      const gunMounts = player.mounts.filter((m) => m.category === 'ARTILLERY');
      const torpMounts = player.mounts.filter((m) => m.category === 'TORPEDO' || m.category === 'ROCKET_TORPEDO');
      const specMounts = player.mounts.filter(
        (m) =>
          m.category === 'CRUISE_MISSILE' ||
          m.category === 'DEPTH_CHARGE' ||
          m.category === 'SAM_CIWS' ||
          m.category === 'NAVAL_MINE' ||
          m.category === 'ROCKET_BARRAGE'
      );

      const slotsUI: WeaponSlotUIState[] = [
        {
          slotIndex: 0,
          name: 'ĐẠN PHÁO',
          category: 'ARTILLERY',
          ammoCurrent: gunMounts.reduce((sum, m) => sum + Math.floor(m.ammoCurrent), 0),
          ammoMax: gunMounts.reduce((sum, m) => sum + m.ammoMax, 0),
          reloadTimeRemaining: gunMounts.length > 0 ? Math.min(...gunMounts.map((m) => m.reloadTimeRemaining)) : 0,
          reloadTimeTotal: gunMounts.length > 0 ? gunMounts[0].reloadTimeTotal : 1,
          isReady: gunMounts.some((m) => m.reloadTimeRemaining <= 0 && m.ammoCurrent >= 1),
          isSelected: this.selectedWeaponSlot === 0,
          iconType: 'CANNON',
        },
        {
          slotIndex: 1,
          name: 'NGƯ LÔI THẲNG',
          category: 'TORPEDO',
          ammoCurrent: torpMounts.reduce((sum, m) => sum + Math.floor(m.ammoCurrent), 0),
          ammoMax: torpMounts.reduce((sum, m) => sum + m.ammoMax, 0),
          reloadTimeRemaining: torpMounts.length > 0 ? Math.min(...torpMounts.map((m) => m.reloadTimeRemaining)) : 0,
          reloadTimeTotal: torpMounts.length > 0 ? torpMounts[0].reloadTimeTotal : 4,
          isReady: torpMounts.some((m) => m.reloadTimeRemaining <= 0 && m.ammoCurrent >= 1),
          isSelected: this.selectedWeaponSlot === 1,
          iconType: 'TORPEDO_STRAIGHT',
        },
        {
          slotIndex: 2,
          name: 'NGƯ LÔI TRUY ĐUỔI',
          category: 'TORPEDO',
          ammoCurrent: torpMounts.reduce((sum, m) => sum + Math.floor(m.ammoCurrent), 0),
          ammoMax: torpMounts.reduce((sum, m) => sum + m.ammoMax, 0),
          reloadTimeRemaining: torpMounts.length > 0 ? Math.min(...torpMounts.map((m) => m.reloadTimeRemaining)) : 0,
          reloadTimeTotal: torpMounts.length > 0 ? torpMounts[0].reloadTimeTotal : 4,
          isReady: torpMounts.some((m) => m.reloadTimeRemaining <= 0 && m.ammoCurrent >= 1),
          isSelected: this.selectedWeaponSlot === 2,
          iconType: 'TORPEDO_HOMING',
        },
        {
          slotIndex: 3,
          name: 'TÊN LỬA / ĐẶC BIỆT',
          category: specMounts[0]?.category ?? 'SPECIAL',
          ammoCurrent: specMounts.reduce((sum, m) => sum + Math.floor(m.ammoCurrent), 0),
          ammoMax: specMounts.reduce((sum, m) => sum + m.ammoMax, 0),
          reloadTimeRemaining: specMounts.length > 0 ? Math.min(...specMounts.map((m) => m.reloadTimeRemaining)) : 0,
          reloadTimeTotal: specMounts.length > 0 ? specMounts[0].reloadTimeTotal : 5,
          isReady: specMounts.some((m) => m.reloadTimeRemaining <= 0 && m.ammoCurrent >= 1),
          isSelected: this.selectedWeaponSlot === 3,
          iconType: 'SPECIAL',
        },
      ];
      this.hud.weaponControls.updateWeapons(slotsUI);

      this.hud.weaponControls.updateAbilities({
        depthState: depthNum,
        diveCooldownRemaining: player.physics.depthTransitionTimer,
        isStealthActive: player.physics.stealthModeActive,
        ecmActive: player.ecmActive,
        ecmActiveRemaining: player.ecmTimer,
        ecmCooldownRemaining: player.ecmCooldown,
      });

      // Pass true island closed polygons to minimap
      const terrainMinimap: MinimapTerrain[] = this.localServer.getIslands().map((isl) => ({
        type: 'ISLAND',
        polygonVertices: isl.polygon.vertices,
        x: isl.polygon.vertices[0]?.x ?? 0,
        y: isl.polygon.vertices[0]?.y ?? 0,
        radius: 180,
      }));
      const objectivesMinimap: MinimapObjective[] = this.localServer.resourceEngine
        .getAllOilRigs()
        .map((r) => ({
          x: r.position.x,
          y: r.position.y,
          radius: r.captureRadius,
          name: r.name,
          progress: r.captureProgress / r.captureProgressRequired,
        }));

      this.hud.minimap.render(
        player.physics.position.x,
        player.physics.position.y,
        minimapContacts,
        terrainMinimap,
        objectivesMinimap
      );

      // Update streamlined Vietnamese HUD text lines (mk48.io Screenshots 2 & 3)
      if (this.bottomStatusText) {
        const headingDeg = Math.round(((normalizeAngle(player.physics.heading) * 180) / Math.PI + 360) % 360);
        const posX = Math.round(player.physics.position.x);
        const posY = Math.round(player.physics.position.y);
        const coordStr = `(${Math.abs(posX)}${posX >= 0 ? 'E' : 'W'}, ${Math.abs(posY)}${posY >= 0 ? 'S' : 'N'})`;
        this.bottomStatusText.textContent = `${player.shipDef.name}  ${player.physics.speedKnots.toFixed(1)}kn  ${headingDeg}° [S]  ${coordStr}`;
      }
      if (this.bottomReloadBarText) {
        const readyCount = player.mounts.filter((m) => m.reloadTimeRemaining <= 0 && m.ammoCurrent >= 1).length;
        this.bottomReloadBarText.textContent = `${readyCount}/${player.mounts.length}`;
      }
    }

    // Casualty check for local player
    if (player && (player.isSinking || player.physics.isDestroyed) && !this.isPlayerRespawning) {
      const killer = player.killerId ? this.localServer.getVessel(player.killerId) : undefined;
      this.triggerPlayerDeathRespawn(player, killer);
    }

    this.renderer.update(dt);
  }

  public findSafeSpawnPosition(): { x: number; y: number } {
    const vessels = this.localServer.getAllVessels().filter(
      (v) => v.id !== this.playerVesselId && !v.physics.isDestroyed && !v.isSinking
    );

    if (vessels.length === 0) {
      return { x: 0, y: 200 };
    }

    let bestPos = { x: 0, y: 200 };
    let maxMinDist = -1;

    // Check candidate spawn points on rings between 800m and 1400m
    const candidateRings = [800, 1050, 1300];
    for (const r of candidateRings) {
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
        const cx = Math.cos(angle) * r;
        const cy = Math.sin(angle) * r;

        let minDistToEnemy = Infinity;
        for (const v of vessels) {
          const d = Math.hypot(cx - v.physics.position.x, cy - v.physics.position.y);
          if (d < minDistToEnemy) {
            minDistToEnemy = d;
          }
        }

        if (minDistToEnemy > maxMinDist) {
          maxMinDist = minDistToEnemy;
          bestPos = { x: cx, y: cy };
        }
      }
    }

    return bestPos;
  }

  public triggerPlayerDeathRespawn(player: ServerVessel, killer?: ServerVessel): void {
    if (this.isPlayerRespawning) return;
    this.isPlayerRespawning = true;

    const report: CasualtyReport = {
      killerName: killer ? killer.name : 'Hostile Fleet Strike',
      killerShipName: killer?.shipDef.name,
      weaponType: killer ? 'Naval Gunfire & Heavy Torpedoes' : 'Coastal Battery Shellfire',
      playerScore: player.score,
      playerKills: player.kills,
      playerDeaths: player.deaths,
      playerXp: player.accumulatedXp,
    };

    this.hud.showRespawnScreen(report, () => {
      this.respawnPlayer();
    });
  }

  public respawnPlayer(): void {
    const player = this.localServer.getVessel(this.playerVesselId);
    if (!player) return;

    this.isPlayerRespawning = false;

    // Swap ship hull if unlocked and selected from tech tree
    if (this.hud.menus.selectedHullId && SHIP_ROSTER[this.hud.menus.selectedHullId]) {
      const newShipDef = SHIP_ROSTER[this.hud.menus.selectedHullId];
      if (player.shipDef.id !== newShipDef.id) {
        player.shipDef = newShipDef;
        player.mounts = newShipDef.mounts.map((m) => ({ ...m }));
        const oldView = this.vesselViews.get(player.id);
        if (oldView) {
          this.renderer.surfaceLayer.removeChild(oldView.container);
          this.vesselViews.delete(player.id);
        }
      }
    }

    const safePos = this.findSafeSpawnPosition();
    player.physics.position = { ...safePos };
    player.physics.linearVelocity = { x: 0, y: 0 };
    player.physics.angularVelocity = 0;
    player.physics.speedKnots = 0;
    player.physics.throttle = 0;
    player.physics.rudderAngle = 0;
    player.physics.heading = Math.atan2(-safePos.y, -safePos.x); // Inward facing
    player.physics.hullHp = player.shipDef.maxHp;
    player.physics.isDestroyed = false;
    player.isSinking = false;
    player.sinkingTimer = 0;
    player.spawnShieldRemaining = 4.0;

    let view = this.vesselViews.get(player.id);
    if (!view) {
      view = this.createVesselView(player);
    }
    view.container.visible = true;
    view.setSinking(false, 0);
    view.setSpawnShield(true, 0);
    view.updateHpBar(1.0);

    this.renderer.setCameraPosition(safePos.x, safePos.y, 1.0);
    this.hud.setGameModeTitle('SPAWN SHIELD ENGAGED (4s)');
    setTimeout(() => {
      this.hud.setGameModeTitle('FFA FLEET SANDBOX');
    }, 4000);
  }

  private buildVietnameseOverlay(container: HTMLElement): void {
    // 1. mk48.io Vietnamese Start/Lobby Overlay (Screenshot 1)
    this.startLobbyElement = document.createElement('div');
    this.startLobbyElement.className = 'mk48-start-lobby-overlay';
    this.startLobbyElement.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(10, 24, 44, 0.75);
      backdrop-filter: blur(2px);
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      z-index: 150;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      user-select: none;
    `;

    this.startLobbyElement.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; gap: 14px; max-width: 420px; width: 90%;">
        <!-- Game Logo -->
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
          <span style="font-size: 34px;">⚓</span>
          <span style="font-size: 32px; font-weight: 800; color: #ffffff; letter-spacing: 1px; text-shadow: 0 0 12px rgba(0, 230, 118, 0.6);">mk48.io</span>
        </div>

        <!-- Mode Selection Cards -->
        <div style="display: flex; flex-direction: column; gap: 10px; width: 100%;">
          <div class="mode-card-ffa" style="background: rgba(20, 42, 70, 0.85); border: 2px solid #ffcc00; border-radius: 6px; padding: 12px 18px; color: #ffffff; cursor: pointer; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 12px rgba(0,0,0,0.4);">
            <span style="font-size: 14px; font-weight: 700; color: #ffeb3b;">Hạm đội hỗn chiến</span>
            <span style="font-size: 13px; font-weight: 700; background: #f57f17; padding: 2px 8px; border-radius: 4px;">69</span>
          </div>
          <div class="mode-card-2f" style="background: rgba(20, 42, 70, 0.65); border: 1px solid rgba(255,255,255,0.25); border-radius: 6px; padding: 12px 18px; color: #cfd8dc; cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 14px; font-weight: 600;">2 Hạm đội</span>
            <span style="font-size: 13px; font-weight: 700; background: #37474f; padding: 2px 8px; border-radius: 4px;">50</span>
          </div>
        </div>

        <!-- Big Green Play Button (Chơi) -->
        <button class="btn-play-vn" style="background: linear-gradient(180deg, #4caf50, #2e7d32); color: #ffffff; font-size: 20px; font-weight: 800; padding: 12px 0; width: 100%; border: 2px solid #81c784; border-radius: 6px; cursor: pointer; box-shadow: 0 4px 18px rgba(76, 175, 80, 0.55); transition: all 0.15s ease;">
          Chơi
        </button>

        <!-- Secondary Friends Button -->
        <button class="btn-friends-vn" style="background: rgba(24, 46, 74, 0.9); color: #ffffff; font-size: 14px; font-weight: 700; padding: 9px 0; width: 100%; border: 1.5px solid #0288d1; border-radius: 6px; cursor: pointer;">
          Chơi với bạn bè
        </button>

        <!-- Name Input -->
        <input class="input-name-vn" value="Guestbound" style="width: 100%; background: rgba(13, 27, 46, 0.95); border: 2px solid #ffb300; border-radius: 6px; color: #ffffff; font-size: 16px; font-weight: 700; text-align: center; padding: 10px 0; outline: none; box-sizing: border-box;" placeholder="Tên..." />

        <!-- Bottom Footer Links -->
        <div style="font-size: 11px; color: #90caf9; display: flex; gap: 14px; margin-top: 10px;">
          <span style="cursor: pointer;">Giúp đỡ</span>
          <span style="cursor: pointer;">Phản hồi</span>
          <span style="cursor: pointer;">Quyền riêng tư</span>
          <span style="cursor: pointer;">Điều khoản</span>
        </div>
      </div>
    `;

    const playBtn = this.startLobbyElement.querySelector('.btn-play-vn') as HTMLButtonElement;
    const nameInput = this.startLobbyElement.querySelector('.input-name-vn') as HTMLInputElement;

    const startGame = () => {
      const enteredName = nameInput.value.trim() || 'Guestbound';
      const player = this.localServer.getVessel(this.playerVesselId);
      if (player) {
        player.name = enteredName;
        const view = this.vesselViews.get(player.id);
        if (view) {
          view.setPlayerName(enteredName, false, true);
        }
      }
      this.startLobbyElement!.style.display = 'none';
      soundSynth.resumeContext();
    };

    playBtn.addEventListener('click', startGame);
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') startGame();
    });

    container.appendChild(this.startLobbyElement);

    // 2. Streamlined in-game Vietnamese HUD overlays (matching mk48.io Screenshots 2 & 3)
    this.mk48HudElement = document.createElement('div');
    this.mk48HudElement.className = 'mk48-ingame-hud-root';
    this.mk48HudElement.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 60;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      overflow: hidden;
    `;

    this.mk48HudElement.innerHTML = `
      <!-- Top Center Level/XP bar (Screenshot 2 & 3) -->
      <div style="position: absolute; top: 0; left: 50%; transform: translateX(-50%); background: rgba(54, 34, 18, 0.92); border: 1px solid #795548; color: #ffffff; font-size: 11px; font-weight: 700; padding: 3px 18px; border-bottom-left-radius: 4px; border-bottom-right-radius: 4px; z-index: 90; text-shadow: 1px 1px 2px #000;">
        0% lên Cấp 2 — Bấm [T] chọn tàu mới
      </div>

      <!-- Top Left Compact Fleet Panel (Screenshot 2 & 3) -->
      <div style="position: absolute; top: 12px; left: 16px; color: #ffffff; font-size: 11px; font-weight: 600; text-shadow: 1px 1px 2px #000; z-index: 80; line-height: 1.5;">
        <div style="opacity: 0.85; margin-bottom: 2px;">Tên hạm đội</div>
        <div>USSR &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <span style="color: #64ffda; cursor: pointer; pointer-events: auto;">Xin tham gia</span></div>
        <div>Ae VN &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <span style="color: #64ffda; cursor: pointer; pointer-events: auto;">Xin tham gia</span></div>
        <div>やまをと &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <span style="color: #64ffda; cursor: pointer; pointer-events: auto;">Xin tham gia</span></div>
        <div>Đại Hán &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <span style="color: #64ffda; cursor: pointer; pointer-events: auto;">Xin tham gia</span></div>
        <div>Yamato &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <span style="color: #64ffda; cursor: pointer; pointer-events: auto;">Xin tham gia</span></div>
      </div>

      <!-- Top Right Clean Leaderboard (Screenshot 2 & 3) -->
      <div style="position: absolute; top: 12px; right: 16px; color: #ffffff; font-size: 11px; font-weight: 600; text-align: right; text-shadow: 1px 1px 2px #000; z-index: 80; line-height: 1.45;">
        <div style="opacity: 0.95;">1. [XVX] Mobpsycho &nbsp; 3193</div>
        <div style="opacity: 0.95;">2. [Đại Hán] Lưu Bị &nbsp;&nbsp;&nbsp; 1182</div>
        <div style="opacity: 0.95;">3. [XVX] siuuuuuuuu &nbsp; 1130</div>
        <div style="opacity: 0.95;">4. [やまをと] ウシャコ &nbsp;&nbsp;&nbsp; 840</div>
        <div style="opacity: 0.95;">5. 流星-jp &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 734</div>
        <div style="opacity: 0.95;">6. [USSR] INS delhi &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 724</div>
        <div style="color: #69f0ae; font-weight: 700;">17. Guestbound &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 0</div>
        <div style="color: #81d4fa; font-size: 10px; margin-top: 4px;">21 trong Pacific / 126 trực tuyến</div>
      </div>

      <!-- Bottom Center Compact Status & Weapon Reload (Screenshot 2 & 3) -->
      <div style="position: absolute; bottom: 116px; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 3px; z-index: 90; text-shadow: 1px 1px 3px #000;">
        <span class="mk48-status-line" style="color: #ffffff; font-size: 11px; font-weight: 700; letter-spacing: 0.5px;">Fletcher DD &nbsp; 53.0kn 193° [S] &nbsp; (586W, 2234S)</span>
        <div style="display: flex; gap: 6px;">
          <div class="mk48-reload-box" style="background: rgba(18, 30, 48, 0.88); border: 1.2px solid rgba(255,255,255,0.4); border-radius: 3px; padding: 2px 12px; font-size: 11px; font-weight: 800; color: #00e676;">2/2</div>
          <div style="background: rgba(18, 30, 48, 0.88); border: 1.2px solid rgba(255,255,255,0.4); border-radius: 3px; padding: 2px 12px; font-size: 11px; font-weight: 800; color: #00e5ff;">[V] RADAR</div>
        </div>
      </div>

      <!-- Bottom Left Translucent Chat Box (Screenshot 2 & 3) -->
      <div style="position: absolute; bottom: 235px; left: 20px; width: 240px; font-size: 11px; color: #ffffff; text-shadow: 1px 1px 2px #000; z-index: 80;">
        <div style="background: rgba(10, 20, 36, 0.6); border-radius: 4px; padding: 6px 10px; margin-bottom: 5px; line-height: 1.4;">
          <div style="color: #81d4fa;">[Server] Chào mừng đến với Pacific!</div>
          <div style="color: #ffd54f;">Bấm [V] bật/tắt Radar | [X] đổi lái chuột/phím</div>
        </div>
        <input placeholder="Thông điệp..." style="width: 100%; background: rgba(10, 20, 36, 0.7); border: 1px solid rgba(255,255,255,0.25); border-radius: 3px; padding: 4px 8px; color: #ffffff; font-size: 11px; outline: none; pointer-events: auto;" />
      </div>
    `;

    this.bottomStatusText = this.mk48HudElement.querySelector('.mk48-status-line') as HTMLElement;
    this.bottomReloadBarText = this.mk48HudElement.querySelector('.mk48-reload-box') as HTMLElement;

    container.appendChild(this.mk48HudElement);
  }
}
