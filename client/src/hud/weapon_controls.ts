/**
 * Weapon Controls & Tactical Ability Panel
 * Clean-Room implementation for NavalCommand.io
 * Renders bottom-center weapon slots with SVG icons, ammo counters,
 * straight vs homing torpedo modes, Rapid-Fire Salvo Burst, and Dive/Stealth/ECM buttons.
 * 100% Vietnamese UI localization.
 */

export interface WeaponSlotUIState {
  slotIndex: number;
  name: string;
  category: string;
  ammoCurrent: number;
  ammoMax: number;
  reloadTimeRemaining: number;
  reloadTimeTotal: number;
  isReady: boolean;
  isSelected: boolean;
  iconType?: 'CANNON' | 'TORPEDO_STRAIGHT' | 'TORPEDO_HOMING' | 'SPECIAL';
}

export interface TacticalAbilitiesState {
  depthState: number; // 0 = Surface, 1 = Periscope, 2 = Deep
  diveCooldownRemaining: number;
  isStealthActive: boolean;
  ecmActive: boolean;
  ecmActiveRemaining: number;
  ecmCooldownRemaining: number;
}

export type DiveToggleCallback = () => void;
export type StealthToggleCallback = () => void;
export type EcmToggleCallback = () => void;
export type WeaponSelectCallback = (slotIndex: number) => void;
export type SalvoBurstCallback = () => void;

export class WeaponControlsHUD {
  public readonly container: HTMLElement;
  private weaponSlotElements: HTMLElement[] = [];
  private diveBtn!: HTMLButtonElement;
  private stealthBtn!: HTMLButtonElement;
  private ecmBtn!: HTMLButtonElement;
  private salvoBtn!: HTMLButtonElement;

  private onDiveCb: DiveToggleCallback | null = null;
  private onStealthCb: StealthToggleCallback | null = null;
  private onEcmCb: EcmToggleCallback | null = null;
  private onWeaponSelectCb: WeaponSelectCallback | null = null;
  private onSalvoBurstCb: SalvoBurstCallback | null = null;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'tactical-weapons-panel';
    this.container.style.cssText = `
      position: absolute;
      bottom: 14px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      flex-direction: column;
      gap: 7px;
      align-items: center;
      z-index: 100;
      user-select: none;
      pointer-events: auto;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    `;

    this.buildAbilitiesBar();
    this.buildWeaponsBar();
  }

  private getWeaponSvgIcon(slotIndex: number): string {
    if (slotIndex === 0) {
      // Slot [1]: Gold Artillery Shell & Twin Cannon Turret
      return `
        <svg viewBox="0 0 32 32" width="24" height="24" style="filter: drop-shadow(0 0 3px #ffd54f); flex-shrink: 0;">
          <path d="M16 2 C13 7 12 13 12 19 L20 19 C20 13 19 7 16 2 Z" fill="#ffd54f" stroke="#ffb300" stroke-width="1.2"/>
          <rect x="12" y="19" width="8" height="7" rx="1" fill="#ffb300" stroke="#ff8f00" stroke-width="1"/>
          <rect x="11" y="27" width="10" height="2" rx="0.5" fill="#ffe082"/>
          <line x1="16" y1="2" x2="16" y2="0" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      `;
    }
    if (slotIndex === 1) {
      // Slot [2]: Cyan/Green Straight Torpedo with Straight Velocity Arrow
      return `
        <svg viewBox="0 0 32 32" width="24" height="24" style="filter: drop-shadow(0 0 3px #00e5ff); flex-shrink: 0;">
          <path d="M6 18 C6 16 8 15 11 15 L23 15 L23 21 L11 21 C8 21 6 20 6 18 Z" fill="#00e5ff" stroke="#00b0ff" stroke-width="1"/>
          <ellipse cx="23" cy="18" rx="2.5" ry="3" fill="#80d8ff"/>
          <line x1="7" y1="13" x2="9" y2="18" stroke="#00e5ff" stroke-width="1.4"/>
          <line x1="7" y1="23" x2="9" y2="18" stroke="#00e5ff" stroke-width="1.4"/>
          <rect x="5" y="16" width="2" height="4" fill="#00b0ff"/>
          <!-- Straight trajectory arrow -->
          <line x1="3" y1="7" x2="24" y2="7" stroke="#00e676" stroke-width="2" stroke-dasharray="3,1.5"/>
          <polygon points="24,4.5 29,7 24,9.5" fill="#00e676"/>
        </svg>
      `;
    }
    if (slotIndex === 2) {
      // Slot [3]: Orange/Red Homing Torpedo with Target-Lock Reticle
      return `
        <svg viewBox="0 0 32 32" width="24" height="24" style="filter: drop-shadow(0 0 3px #ff3d00); flex-shrink: 0;">
          <path d="M6 19 C6 17 8 16 11 16 L22 16 L22 22 L11 22 C8 22 6 21 6 19 Z" fill="#ff7043" stroke="#f4511e" stroke-width="1"/>
          <ellipse cx="22" cy="19" rx="2.5" ry="3" fill="#ffab91"/>
          <line x1="7" y1="14" x2="9" y2="19" stroke="#ff7043" stroke-width="1.4"/>
          <line x1="7" y1="24" x2="9" y2="19" stroke="#ff7043" stroke-width="1.4"/>
          <!-- Target-Lock Reticle -->
          <circle cx="22" cy="10" r="6" fill="none" stroke="#ff1744" stroke-width="1.4" stroke-dasharray="3,2"/>
          <line x1="22" y1="2" x2="22" y2="18" stroke="#ff1744" stroke-width="1"/>
          <line x1="14" y1="10" x2="30" y2="10" stroke="#ff1744" stroke-width="1"/>
          <circle cx="22" cy="10" r="1.5" fill="#ff1744"/>
        </svg>
      `;
    }
    // Slot [4]: Purple/Magenta Guided Missile & Depth Charge
    return `
      <svg viewBox="0 0 32 32" width="24" height="24" style="filter: drop-shadow(0 0 3px #e040fb); flex-shrink: 0;">
        <path d="M26 5 L22 6 L10 18 L8 24 L14 22 L26 10 Z" fill="#e040fb" stroke="#aa00ff" stroke-width="1"/>
        <polygon points="17,13 13,10 15,15" fill="#ea80fc"/>
        <polygon points="16,16 19,20 14,17" fill="#ea80fc"/>
        <polygon points="8,24 5,27 6,22" fill="#ff5252"/>
        <polygon points="7,23 3,29 6,24" fill="#ffd600"/>
      </svg>
    `;
  }

  private buildAbilitiesBar(): void {
    const bar = document.createElement('div');
    bar.style.cssText = `
      display: flex;
      gap: 8px;
      align-items: center;
      justify-content: center;
    `;

    // 1. Dive / Surface Button [Q]
    this.diveBtn = document.createElement('button');
    this.diveBtn.style.cssText = this.getButtonStyle('#0288d1');
    this.diveBtn.innerHTML = `<div>[Q] LẶN / NỔI</div><div style="font-size: 10px; opacity: 0.9; color: #00e5ff;">MẶT NƯỚC</div>`;
    this.diveBtn.addEventListener('click', () => this.onDiveCb && this.onDiveCb());

    // 2. Stealth Cruise Button [E]
    this.stealthBtn = document.createElement('button');
    this.stealthBtn.style.cssText = this.getButtonStyle('#455a64');
    this.stealthBtn.innerHTML = `<div>[E] TÀNG HÌNH</div><div style="font-size: 10px; opacity: 0.85;">TẮT</div>`;
    this.stealthBtn.addEventListener('click', () => this.onStealthCb && this.onStealthCb());

    // 3. ECM Jammer Button [F]
    this.ecmBtn = document.createElement('button');
    this.ecmBtn.style.cssText = this.getButtonStyle('#7b1fa2');
    this.ecmBtn.innerHTML = `<div>[F] NHIỄU RADAR</div><div style="font-size: 10px; opacity: 0.9; color: #00e676;">SẴN SÀNG</div>`;
    this.ecmBtn.addEventListener('click', () => this.onEcmCb && this.onEcmCb());

    // 4. Dedicated Rapid-Fire Salvo Button [Space / Right-Click]
    this.salvoBtn = document.createElement('button');
    this.salvoBtn.style.cssText = `
      background: linear-gradient(180deg, #d32f2f, #b71c1c);
      border: 1.5px solid #ff5252;
      border-radius: 4px;
      color: #fff;
      padding: 5px 14px;
      cursor: pointer;
      font-size: 11px;
      font-weight: 800;
      text-align: center;
      min-width: 140px;
      box-shadow: 0 0 10px rgba(255, 23, 68, 0.45);
      letter-spacing: 0.5px;
      transition: all 0.15s ease;
    `;
    this.salvoBtn.innerHTML = `<div>🔥 BẮN LIÊN THANH</div><div style="font-size: 9px; opacity: 0.9; color: #ffcdd2;">[SPACE / CHUỘT PHẢI]</div>`;
    this.salvoBtn.addEventListener('click', () => this.onSalvoBurstCb && this.onSalvoBurstCb());

    bar.appendChild(this.diveBtn);
    bar.appendChild(this.stealthBtn);
    bar.appendChild(this.ecmBtn);
    bar.appendChild(this.salvoBtn);
    this.container.appendChild(bar);
  }

  private buildWeaponsBar(): void {
    const bar = document.createElement('div');
    bar.className = 'weapon-slots-row';
    bar.style.cssText = `
      display: flex;
      gap: 8px;
      align-items: center;
      justify-content: center;
    `;

    const slotTitles = [
      'ĐẠN PHÁO',
      'NGƯ LÔI THẲNG',
      'NGƯ LÔI TRUY ĐUỔI',
      'TÊN LỬA / ĐẶC BIỆT',
    ];

    for (let i = 0; i < 4; i++) {
      const slotEl = document.createElement('div');
      slotEl.style.cssText = `
        width: 124px;
        background: rgba(10, 22, 38, 0.92);
        border: 1.5px solid rgba(0, 230, 118, 0.35);
        border-radius: 5px;
        padding: 5px 8px;
        color: #fff;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        gap: 3px;
        position: relative;
        transition: all 0.15s ease;
        box-shadow: 0 2px 8px rgba(0,0,0,0.5);
      `;

      slotEl.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; font-weight: 700;">
          <span class="slot-key" style="color: #00e676;">[${i + 1}]</span>
          <span class="slot-badge" style="display: none; background: #00e5ff; color: #000; font-size: 8px; font-weight: 800; padding: 1px 4px; border-radius: 2px;">ĐANG CHỌN</span>
          <span class="slot-ammo" style="color: #90caf9; font-size: 11px; font-family: monospace;">--</span>
        </div>
        <div style="display: flex; align-items: center; gap: 6px; margin: 1px 0;">
          ${this.getWeaponSvgIcon(i)}
          <div class="slot-name" style="font-size: 10px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #ffffff;">
            ${slotTitles[i]}
          </div>
        </div>
        <div style="width: 100%; height: 5px; background: rgba(255,255,255,0.12); border-radius: 2px; overflow: hidden;">
          <div class="slot-reload-bar" style="width: 100%; height: 100%; background: #00e676; transition: width 0.1s linear;"></div>
        </div>
        <div class="slot-status" style="font-size: 9px; text-align: right; color: #00e676; font-weight: 600;">SẴN SÀNG</div>
      `;

      const slotIdx = i;
      slotEl.addEventListener('click', () => {
        if (this.onWeaponSelectCb) {
          this.onWeaponSelectCb(slotIdx);
        }
      });

      this.weaponSlotElements.push(slotEl);
      bar.appendChild(slotEl);
    }

    this.container.appendChild(bar);
  }

  private getButtonStyle(themeColor: string): string {
    return `
      background: rgba(12, 25, 42, 0.92);
      border: 1.5px solid ${themeColor};
      border-radius: 4px;
      color: #fff;
      padding: 5px 11px;
      cursor: pointer;
      font-size: 11px;
      font-weight: 700;
      text-align: center;
      min-width: 95px;
      transition: all 0.2s;
    `;
  }

  public setCallbacks(cbs: {
    onDive?: DiveToggleCallback;
    onStealth?: StealthToggleCallback;
    onEcm?: EcmToggleCallback;
    onWeaponSelect?: WeaponSelectCallback;
    onSalvoBurst?: SalvoBurstCallback;
  }): void {
    if (cbs.onDive) this.onDiveCb = cbs.onDive;
    if (cbs.onStealth) this.onStealthCb = cbs.onStealth;
    if (cbs.onEcm) this.onEcmCb = cbs.onEcm;
    if (cbs.onWeaponSelect) this.onWeaponSelectCb = cbs.onWeaponSelect;
    if (cbs.onSalvoBurst) this.onSalvoBurstCb = cbs.onSalvoBurst;
  }

  /**
   * Update weapon slot cooldown bars and ammunition values.
   */
  public updateWeapons(slots: WeaponSlotUIState[]): void {
    for (let i = 0; i < this.weaponSlotElements.length; i++) {
      const el = this.weaponSlotElements[i];
      const slotData = slots[i];
      if (!slotData) {
        el.style.opacity = '0.35';
        continue;
      }

      el.style.opacity = '1.0';
      const badgeEl = el.querySelector('.slot-badge') as HTMLElement;

      if (slotData.isSelected) {
        el.style.borderColor = '#00e5ff';
        el.style.boxShadow = '0 0 12px rgba(0, 229, 255, 0.6)';
        el.style.background = 'rgba(12, 30, 52, 0.95)';
        if (badgeEl) badgeEl.style.display = 'inline-block';
      } else {
        el.style.borderColor = 'rgba(0, 230, 118, 0.35)';
        el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.5)';
        el.style.background = 'rgba(10, 22, 38, 0.92)';
        if (badgeEl) badgeEl.style.display = 'none';
      }

      const nameEl = el.querySelector('.slot-name') as HTMLElement;
      const ammoEl = el.querySelector('.slot-ammo') as HTMLElement;
      const barEl = el.querySelector('.slot-reload-bar') as HTMLElement;
      const statusEl = el.querySelector('.slot-status') as HTMLElement;

      if (nameEl && slotData.name) nameEl.textContent = slotData.name;
      if (ammoEl) {
        ammoEl.textContent = slotData.ammoMax > 0 ? `${slotData.ammoCurrent}/${slotData.ammoMax}` : '--';
      }

      if (slotData.reloadTimeRemaining > 0 && slotData.reloadTimeTotal > 0) {
        const reloadRatio = Math.max(0, Math.min(1.0, 1.0 - slotData.reloadTimeRemaining / slotData.reloadTimeTotal));
        if (barEl) {
          barEl.style.width = `${Math.round(reloadRatio * 100)}%`;
          barEl.style.background = '#ffab00';
        }
        if (statusEl) {
          statusEl.textContent = `${slotData.reloadTimeRemaining.toFixed(1)}s`;
          statusEl.style.color = '#ffab00';
        }
      } else {
        if (barEl) {
          barEl.style.width = '100%';
          barEl.style.background = slotData.ammoCurrent >= 1 ? '#00e676' : '#90a4ae';
        }
        if (statusEl) {
          statusEl.textContent = slotData.ammoCurrent >= 1 ? 'SẴN SÀNG' : 'HẾT ĐẠN';
          statusEl.style.color = slotData.ammoCurrent >= 1 ? '#00e676' : '#ff5252';
        }
      }
    }
  }

  /**
   * Update Dive, Stealth, and ECM ability state and timers in Vietnamese.
   */
  public updateAbilities(state: TacticalAbilitiesState): void {
    // 1. Dive State
    const depthNames = ['MẶT NƯỚC', 'KÍNH TIỀM VỌNG (-5m)', 'LẶN SÂU (-30m)'];
    const currentDepthName = depthNames[state.depthState] ?? 'MẶT NƯỚC';
    if (state.diveCooldownRemaining > 0) {
      this.diveBtn.innerHTML = `<div>[Q] LẶN / NỔI</div><div style="font-size: 10px; color: #ffab00;">${state.diveCooldownRemaining.toFixed(1)}s</div>`;
      this.diveBtn.style.borderColor = '#ffab00';
    } else {
      this.diveBtn.innerHTML = `<div>[Q] LẶN / NỔI</div><div style="font-size: 10px; color: #00e5ff;">${currentDepthName}</div>`;
      this.diveBtn.style.borderColor = '#0288d1';
    }

    // 2. Stealth State
    if (state.isStealthActive) {
      this.stealthBtn.innerHTML = `<div>[E] TÀNG HÌNH</div><div style="font-size: 10px; color: #00e676;">BẬT (&le;20 hải lý)</div>`;
      this.stealthBtn.style.borderColor = '#00e676';
      this.stealthBtn.style.background = 'rgba(0, 230, 118, 0.18)';
    } else {
      this.stealthBtn.innerHTML = `<div>[E] TÀNG HÌNH</div><div style="font-size: 10px; opacity: 0.85;">TẮT</div>`;
      this.stealthBtn.style.borderColor = '#546e7a';
      this.stealthBtn.style.background = 'rgba(12, 25, 42, 0.92)';
    }

    // 3. ECM Jammer State
    if (state.ecmActive) {
      this.ecmBtn.innerHTML = `<div>[F] NHIỄU RADAR</div><div style="font-size: 10px; color: #e040fb;">HOẠT ĐỘNG (${state.ecmActiveRemaining.toFixed(1)}s)</div>`;
      this.ecmBtn.style.borderColor = '#e040fb';
      this.ecmBtn.style.background = 'rgba(224, 64, 251, 0.2)';
    } else if (state.ecmCooldownRemaining > 0) {
      this.ecmBtn.innerHTML = `<div>[F] NHIỄU RADAR</div><div style="font-size: 10px; color: #ffab00;">HỒI CHIÊU ${state.ecmCooldownRemaining.toFixed(1)}s</div>`;
      this.ecmBtn.style.borderColor = '#ffab00';
      this.ecmBtn.style.background = 'rgba(12, 25, 42, 0.92)';
    } else {
      this.ecmBtn.innerHTML = `<div>[F] NHIỄU RADAR</div><div style="font-size: 10px; color: #00e676;">SẴN SÀNG</div>`;
      this.ecmBtn.style.borderColor = '#7b1fa2';
      this.ecmBtn.style.background = 'rgba(12, 25, 42, 0.92)';
    }
  }
}
