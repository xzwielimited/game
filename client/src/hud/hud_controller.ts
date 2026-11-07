/**
 * HUD Controller & State Coordinator
 * Clean-Room implementation for NavalCommand.io
 * Unifies Top Status Bar, Minimap, Kill Feed, Weapon Controls, and Menus.
 */

import { TacticalMinimap } from './minimap.js';
import { KillFeed } from './kill_feed.js';
import { WeaponControlsHUD, WeaponSlotUIState, TacticalAbilitiesState } from './weapon_controls.js';
import { MenusManager, CasualtyReport } from './menus.js';

export interface PlayerVesselStatus {
  name: string;
  hullHp: number;
  maxHp: number;
  speedKnots: number;
  depthMeters: number;
  depthState: number; // 0 = Surface, 1 = Periscope, 2 = Deep
  isStealth: boolean;
  ecmActive: boolean;
  karmaScore: number;
}

export class HUDController {
  public readonly hudRoot: HTMLElement;
  public readonly minimap: TacticalMinimap;
  public readonly killFeed: KillFeed;
  public readonly weaponControls: WeaponControlsHUD;
  public readonly menus: MenusManager;

  // Top header elements
  public onToggleSteeringMode?: () => void;
  private topBar!: HTMLElement;
  private btnSteerMode!: HTMLElement;
  private hpFill!: HTMLElement;
  private hpText!: HTMLElement;
  private speedText!: HTMLElement;
  private depthText!: HTMLElement;
  private modeText!: HTMLElement;

  constructor(parentElement: HTMLElement) {
    this.hudRoot = document.createElement('div');
    this.hudRoot.className = 'naval-command-hud-root';
    this.hudRoot.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 50;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      overflow: hidden;
    `;

    this.minimap = new TacticalMinimap(190);
    this.killFeed = new KillFeed();
    this.weaponControls = new WeaponControlsHUD();
    this.menus = new MenusManager();

    this.buildTopBar();

    // Enable pointer events on interactive UI subpanels
    this.minimap.container.style.pointerEvents = 'auto';
    this.weaponControls.container.style.pointerEvents = 'auto';

    this.hudRoot.appendChild(this.topBar);
    this.hudRoot.appendChild(this.minimap.container);
    this.hudRoot.appendChild(this.killFeed.container);
    this.hudRoot.appendChild(this.weaponControls.container);
    this.hudRoot.appendChild(this.menus.overlayContainer);

    parentElement.appendChild(this.hudRoot);
  }

  private buildTopBar(): void {
    this.topBar = document.createElement('div');
    this.topBar.className = 'tactical-top-bar';
    this.topBar.style.cssText = `
      position: absolute;
      top: 15px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 15px;
      align-items: center;
      background: rgba(10, 20, 36, 0.9);
      border: 1px solid rgba(0, 230, 118, 0.4);
      border-radius: 6px;
      padding: 8px 18px;
      color: #fff;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.6);
      pointer-events: auto;
      z-index: 100;
      user-select: none;
    `;

    this.topBar.innerHTML = `
      <div style="display: flex; flex-direction: column; min-width: 140px;">
        <span class="hud-mode-title" style="font-size: 11px; color: #00e676; font-weight: 700;">HẠM ĐỘI HỖN CHIẾN (FFA)</span>
        <span class="hud-nav-metrics" style="font-size: 12px; font-weight: 600;">
          <span class="hud-speed">0.0 hải lý/h</span> | <span class="hud-depth" style="color: #00e5ff;">MẶT NƯỚC</span>
        </span>
      </div>

      <div style="display: flex; flex-direction: column; width: 220px; gap: 3px;">
        <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 700;">
          <span>ĐỘ BỀN THÂN TÀU</span>
          <span class="hud-hp-text">100%</span>
        </div>
        <div style="width: 100%; height: 8px; background: rgba(255, 255, 255, 0.15); border-radius: 4px; overflow: hidden;">
          <div class="hud-hp-fill" style="width: 100%; height: 100%; background: #00e676; transition: width 0.15s ease-out;"></div>
        </div>
      </div>

      <div style="display: flex; gap: 8px; margin-left: 10px;">
        <button class="btn-steer-mode" style="background: rgba(0, 229, 255, 0.18); border: 1px solid #00e5ff; border-radius: 3px; color: #00e5ff; padding: 4px 8px; font-size: 11px; font-weight: 700; cursor: pointer; transition: all 0.2s ease;">
          [X] LÁI: CHUỘT
        </button>
        <button class="btn-tech-tree" style="background: rgba(0, 230, 118, 0.15); border: 1px solid #00e676; border-radius: 3px; color: #fff; padding: 4px 8px; font-size: 11px; font-weight: 700; cursor: pointer;">
          [T] ĐỔI TÀU
        </button>
        <button class="btn-loadout" style="background: rgba(0, 229, 255, 0.15); border: 1px solid #00e5ff; border-radius: 3px; color: #fff; padding: 4px 8px; font-size: 11px; font-weight: 700; cursor: pointer;">
          [L] TRANG BỊ
        </button>
        <button class="btn-camo" style="background: rgba(255, 213, 79, 0.15); border: 1px solid #ffd54f; border-radius: 3px; color: #fff; padding: 4px 8px; font-size: 11px; font-weight: 700; cursor: pointer;">
          [C] SƠN TÀU
        </button>
      </div>
    `;

    this.modeText = this.topBar.querySelector('.hud-mode-title') as HTMLElement;
    this.speedText = this.topBar.querySelector('.hud-speed') as HTMLElement;
    this.depthText = this.topBar.querySelector('.hud-depth') as HTMLElement;
    this.hpText = this.topBar.querySelector('.hud-hp-text') as HTMLElement;
    this.hpFill = this.topBar.querySelector('.hud-hp-fill') as HTMLElement;
    this.btnSteerMode = this.topBar.querySelector('.btn-steer-mode') as HTMLElement;

    this.btnSteerMode?.addEventListener('click', () => {
      this.onToggleSteeringMode?.();
    });
    this.topBar.querySelector('.btn-tech-tree')?.addEventListener('click', () => this.menus.showTechTree());
    this.topBar.querySelector('.btn-loadout')?.addEventListener('click', () => this.menus.showLoadoutCustomizer());
    this.topBar.querySelector('.btn-camo')?.addEventListener('click', () => this.menus.showCamoSelector());
  }

  /**
   * Update top status metrics from player vessel state.
   */
  public updatePlayerStatus(status: PlayerVesselStatus): void {
    if (this.speedText) {
      this.speedText.textContent = `${status.speedKnots.toFixed(1)} hải lý/h`;
    }

    if (this.depthText) {
      if (status.depthState === 0) {
        this.depthText.textContent = 'MẶT NƯỚC (0m)';
        this.depthText.style.color = '#00e5ff';
      } else if (status.depthState === 1) {
        this.depthText.textContent = 'KÍNH TIỀM VỌNG (-5m)';
        this.depthText.style.color = '#64b5f6';
      } else {
        this.depthText.textContent = 'LẶN SÂU (-30m)';
        this.depthText.style.color = '#1565c0';
      }
    }

    if (this.hpFill && this.hpText && status.maxHp > 0) {
      const ratio = Math.max(0, Math.min(1.0, status.hullHp / status.maxHp));
      this.hpFill.style.width = `${Math.round(ratio * 100)}%`;
      this.hpText.textContent = `${Math.round(status.hullHp)} / ${Math.round(status.maxHp)}`;

      if (ratio < 0.3) {
        this.hpFill.style.background = '#ff1744';
      } else if (ratio < 0.6) {
        this.hpFill.style.background = '#ffea00';
      } else {
        this.hpFill.style.background = '#00e676';
      }
    }
  }

  public setGameModeTitle(title: string): void {
    if (this.modeText) {
      this.modeText.textContent = title;
    }
  }

  public setSteeringMode(mode: 'MOUSE' | 'WASD'): void {
    if (this.btnSteerMode) {
      if (mode === 'MOUSE') {
        this.btnSteerMode.textContent = '[X] LÁI: CHUỘT';
        this.btnSteerMode.style.borderColor = '#00e5ff';
        this.btnSteerMode.style.background = 'rgba(0, 229, 255, 0.18)';
        this.btnSteerMode.style.color = '#00e5ff';
      } else {
        this.btnSteerMode.textContent = '[X] LÁI: WASD';
        this.btnSteerMode.style.borderColor = '#00e676';
        this.btnSteerMode.style.background = 'rgba(0, 230, 118, 0.18)';
        this.btnSteerMode.style.color = '#00e676';
      }
    }
  }

  public showRespawnScreen(report: CasualtyReport, onRespawn: () => void): void {
    this.menus.showRespawnModal(report, onRespawn);
  }

  public closeRespawnScreen(): void {
    this.menus.closeRespawnModal();
  }
}
