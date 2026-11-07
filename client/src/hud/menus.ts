/**
 * Tactical Menus: Tech Tree, Loadout Customizer & Camouflage Selector
 * Clean-Room implementation for NavalCommand.io
 */

import { ALL_SHIPS, ShipDef } from '../../../common/models/ships.js';
import { CamoType } from '../rendering/vector_hulls.js';

export interface CasualtyReport {
  killerName: string;
  killerShipName?: string;
  weaponType?: string;
  playerScore: number;
  playerKills: number;
  playerDeaths: number;
  playerXp: number;
}

export class MenusManager {
  public readonly overlayContainer: HTMLElement;
  private techTreeModal: HTMLElement | null = null;
  private loadoutModal: HTMLElement | null = null;
  private camoModal: HTMLElement | null = null;
  private respawnModal: HTMLElement | null = null;
  private respawnIntervalTimer: any = null;
  private onRespawnCb: (() => void) | null = null;

  public credits: number = 1500;
  public matchXP: number = 350;
  public unlockedHulls: Set<string> = new Set(['pt_boat_109', 'fairmile_d_dog']);
  public selectedCamo: CamoType = 'HAZE_GREY';
  public selectedHullId: string = 'pt_boat_109';

  private onSelectHullCb: ((hullId: string) => void) | null = null;
  private onSelectCamoCb: ((camo: CamoType) => void) | null = null;

  constructor() {
    this.overlayContainer = document.createElement('div');
    this.overlayContainer.className = 'tactical-menus-overlay';
    this.overlayContainer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 200;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    `;
  }

  public setCallbacks(cbs: {
    onSelectHull?: (hullId: string) => void;
    onSelectCamo?: (camo: CamoType) => void;
  }): void {
    if (cbs.onSelectHull) this.onSelectHullCb = cbs.onSelectHull;
    if (cbs.onSelectCamo) this.onSelectCamoCb = cbs.onSelectCamo;
  }

  private getShipSilhouetteSvg(ship: { shipClass: string; tier: number }): string {
    const isSub = ship.shipClass === 'SUBMARINE';
    const isCarrier = ship.shipClass === 'AIRCRAFT_CARRIER';
    const isBb = ship.shipClass === 'BATTLESHIP';
    const isPatrol = ship.shipClass === 'COASTAL_PATROL';

    const hullColor = isSub ? '#2d3748' : isCarrier ? '#334155' : isPatrol ? '#64748b' : '#718096';
    const deckColor = isCarrier ? '#1e293b' : isBb ? '#b45309' : '#475569';

    if (isCarrier) {
      return `
        <svg viewBox="-40 -15 80 30" width="100%" height="34" style="display: block; margin: 3px 0;">
          <polygon points="-36,-11 32,-11 36,-4 36,4 32,11 -36,11 -38,5 -38,-5" fill="${hullColor}" stroke="#1e293b" stroke-width="1"/>
          <rect x="-34" y="-9" width="66" height="18" fill="${deckColor}"/>
          <line x1="-30" y1="0" x2="30" y2="0" stroke="#facc15" stroke-dasharray="3,2" stroke-width="0.8"/>
          <rect x="-5" y="-10" width="16" height="3" fill="#64748b"/>
        </svg>
      `;
    }

    if (isSub) {
      return `
        <svg viewBox="-40 -15 80 30" width="100%" height="34" style="display: block; margin: 3px 0;">
          <ellipse cx="0" cy="0" rx="34" ry="7" fill="${hullColor}" stroke="#1a202c" stroke-width="1"/>
          <rect x="-4" y="-3.5" width="12" height="7" rx="2" fill="#1a202c"/>
          <line x1="-12" y1="-8" x2="-12" y2="8" stroke="#4a5568" stroke-width="1.2"/>
        </svg>
      `;
    }

    // Surface Warships (DD, Cruiser, BB, Patrol)
    return `
      <svg viewBox="-40 -15 80 30" width="100%" height="34" style="display: block; margin: 3px 0;">
        <path d="M 34 0 Q 20 -8, -30 -8 L -34 -4 L -34 4 L -30 8 Q 20 8, 34 0 Z" fill="${hullColor}" stroke="#1a202c" stroke-width="1"/>
        <rect x="-24" y="-5" width="46" height="10" rx="2" fill="${deckColor}" opacity="0.8"/>
        <rect x="-8" y="-4" width="16" height="8" rx="1.5" fill="#334155"/>
        <circle cx="16" cy="0" r="3" fill="#1e293b"/>
        <circle cx="-16" cy="0" r="3" fill="#1e293b"/>
        ${isBb ? '<circle cx="6" cy="0" r="3" fill="#1e293b"/><circle cx="-24" cy="0" r="3" fill="#1e293b"/>' : ''}
      </svg>
    `;
  }

  public showTechTree(): void {
    this.closeAll();

    const modal = document.createElement('div');
    modal.style.cssText = this.getModalStyle();
    modal.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(0, 230, 118, 0.4); padding-bottom: 10px; margin-bottom: 15px;">
        <h2 style="margin: 0; color: #00e676; font-size: 20px;">TÀU — CẤP ĐỘ 1 ĐẾN 10</h2>
        <div style="display: flex; gap: 15px; font-size: 14px; font-weight: 600;">
          <span style="color: #64ffda;">XP Trận đấu: ${this.matchXP}</span>
          <span style="color: #ffd54f;">Tiền Hải quân: ${this.credits}</span>
          <button class="close-btn" style="background: none; border: none; color: #fff; font-size: 18px; cursor: pointer;">✕</button>
        </div>
      </div>
      <div class="tech-tree-grid" style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; max-height: 480px; overflow-y: auto; padding-right: 8px;">
      </div>
    `;

    const grid = modal.querySelector('.tech-tree-grid') as HTMLElement;
    const ships = ALL_SHIPS.slice(0, 28);

    for (const ship of ships) {
      const card = document.createElement('div');
      const isUnlocked = this.unlockedHulls.has(ship.id);
      const isSelected = this.selectedHullId === ship.id;

      card.style.cssText = `
        background: ${isSelected ? 'rgba(0, 230, 118, 0.15)' : 'rgba(15, 28, 48, 0.85)'};
        border: 1px solid ${isSelected ? '#00e676' : isUnlocked ? 'rgba(0, 229, 255, 0.4)' : 'rgba(255, 255, 255, 0.15)'};
        border-radius: 4px;
        padding: 10px;
        color: #fff;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 6px;
      `;

      card.innerHTML = `
        <div>
          <div style="display: flex; justify-content: space-between; font-size: 11px; opacity: 0.8;">
            <span>Cấp ${ship.tier}</span>
            <span style="color: #64ffda;">${ship.shipClass}</span>
          </div>
          <div style="font-weight: 700; font-size: 13px; margin: 4px 0;">${ship.name}</div>
          <div style="font-size: 10px; opacity: 0.7;">${ship.inspiration}</div>
          ${this.getShipSilhouetteSvg(ship)}
        </div>
        <div style="font-size: 11px; opacity: 0.9;">
          <div>Máu: ${ship.maxHp} | Giáp: ${ship.armor}</div>
          <div>Tốc độ: ${Math.round(ship.maxForwardSpeed * 1.94)} hải lý/h</div>
        </div>
        <button class="action-btn" style="
          background: ${isSelected ? '#00e676' : isUnlocked ? '#0288d1' : '#ff8f00'};
          border: none;
          border-radius: 3px;
          color: #fff;
          padding: 6px;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
        ">
          ${isSelected ? 'ĐANG DÙNG' : isUnlocked ? 'CHỌN TÀU' : `MỞ KHÓA (${ship.tier * 300} C)`}
        </button>
      `;

      const btn = card.querySelector('.action-btn') as HTMLButtonElement;
      btn.addEventListener('click', () => {
        if (isUnlocked) {
          this.selectedHullId = ship.id;
          if (this.onSelectHullCb) this.onSelectHullCb(ship.id);
          this.showTechTree(); // Refresh
        } else {
          const cost = ship.tier * 300;
          if (this.credits >= cost) {
            this.credits -= cost;
            this.unlockedHulls.add(ship.id);
            this.selectedHullId = ship.id;
            if (this.onSelectHullCb) this.onSelectHullCb(ship.id);
            this.showTechTree();
          } else {
            alert('Không đủ Tiền Hải quân!');
          }
        }
      });

      grid.appendChild(card);
    }

    modal.querySelector('.close-btn')?.addEventListener('click', () => this.closeAll());

    this.overlayContainer.style.pointerEvents = 'auto';
    this.overlayContainer.appendChild(modal);
    this.techTreeModal = modal;
  }

  public showLoadoutCustomizer(): void {
    this.closeAll();

    const modal = document.createElement('div');
    modal.style.cssText = this.getModalStyle();
    modal.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(0, 230, 118, 0.4); padding-bottom: 10px; margin-bottom: 15px;">
        <h2 style="margin: 0; color: #00e676; font-size: 20px;">TÙY CHỈNH TRANG BỊ VŨ KHÍ</h2>
        <button class="close-btn" style="background: none; border: none; color: #fff; font-size: 18px; cursor: pointer;">✕</button>
      </div>
      <div style="display: flex; gap: 20px;">
        <div style="flex: 1; background: rgba(12, 24, 40, 0.8); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; padding: 15px;">
          <h3 style="margin-top: 0; color: #64ffda; font-size: 15px;">ĐIỂM GẮN VŨ KHÍ HIỆN TẠI</h3>
          <div style="display: flex; flex-direction: column; gap: 10px; font-size: 12px;">
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 5px;">
              <span>Ô 1 (Hải Pháo Chính Mũi):</span>
              <span style="color: #00e676; font-weight: 600;">Hải Pháo 127mm Mark 45</span>
            </div>
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 5px;">
              <span>Ô 2 (Bệ Phóng Ngư Lôi Thân):</span>
              <span style="color: #00e5ff; font-weight: 600;">Ngư Lôi Hạng Nặng Mark 48</span>
            </div>
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 5px;">
              <span>Ô 3 (Giàn Tên Lửa Phòng Không VLS):</span>
              <span style="color: #ffd54f; font-weight: 600;">Tên Lửa RIM-162 ESSM Đất-đối-Không</span>
            </div>
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 5px;">
              <span>Ô 4 (Mô-đun Tác Chiến Điện Tử):</span>
              <span style="color: #e040fb; font-weight: 600;">Máy Gây Nhiễu Radar AN/SLQ-32 ECM</span>
            </div>
          </div>
        </div>
        <div style="flex: 1; background: rgba(12, 24, 40, 0.8); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; padding: 15px;">
          <h3 style="margin-top: 0; color: #64ffda; font-size: 15px;">NÂNG CẤP KHẢ DỤNG</h3>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <button style="text-align: left; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.2); color: #fff; padding: 8px; border-radius: 3px; cursor: pointer;">
              <div style="font-weight: 600; color: #00e5ff;">Mảng Sonar Kéo Chủ Động</div>
              <div style="font-size: 10px; opacity: 0.7;">+60% Cự ly phát hiện thủy âm vùng lặn sâu</div>
            </button>
            <button style="text-align: left; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.2); color: #fff; padding: 8px; border-radius: 3px; cursor: pointer;">
              <div style="font-weight: 600; color: #ff5252;">Dàn Cối Phóng Bom Chìm RBU-6000 ASW</div>
              <div style="font-size: 10px; opacity: 0.7;">Loạt phóng bom chống ngầm đa hướng</div>
            </button>
          </div>
        </div>
      </div>
    `;

    modal.querySelector('.close-btn')?.addEventListener('click', () => this.closeAll());

    this.overlayContainer.style.pointerEvents = 'auto';
    this.overlayContainer.appendChild(modal);
    this.loadoutModal = modal;
  }

  public showCamoSelector(): void {
    this.closeAll();

    const modal = document.createElement('div');
    modal.style.cssText = this.getModalStyle();
    modal.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(0, 230, 118, 0.4); padding-bottom: 10px; margin-bottom: 15px;">
        <h2 style="margin: 0; color: #00e676; font-size: 20px;">SƠN TÀU & LỚP PHỦ NGỤY TRANG</h2>
        <button class="close-btn" style="background: none; border: none; color: #fff; font-size: 18px; cursor: pointer;">✕</button>
      </div>
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px;">
        ${this.getCamoCardHtml('HAZE_GREY', 'Xám Khói Hiện Đại', 'Sơn tiêu chuẩn hải quân chống phản quang mặt nước.', '#546274')}
        ${this.getCamoCardHtml('DAZZLE', 'Ngụy Trang Dazzle', 'Họa tiết hình học làm nhiễu ước lượng cự ly.', '#1a2436')}
        ${this.getCamoCardHtml('ARCTIC_SPLINTER', 'Mảnh Vỡ Băng Cực', 'Họa tiết đa giác lam trắng vùng băng tuyết.', '#00bcd4')}
        ${this.getCamoCardHtml('STEALTH_CARBON', 'Carbon Tàng Hình', 'Lớp phủ hấp thụ sóng radar đen mờ đặc chủng.', '#212121')}
      </div>
    `;

    const btns = modal.querySelectorAll('.camo-select-btn');
    btns.forEach((b) => {
      b.addEventListener('click', (e) => {
        const camo = (e.currentTarget as HTMLElement).getAttribute('data-camo') as CamoType;
        if (camo) {
          this.selectedCamo = camo;
          if (this.onSelectCamoCb) this.onSelectCamoCb(camo);
          this.showCamoSelector();
        }
      });
    });

    modal.querySelector('.close-btn')?.addEventListener('click', () => this.closeAll());

    this.overlayContainer.style.pointerEvents = 'auto';
    this.overlayContainer.appendChild(modal);
    this.camoModal = modal;
  }

  private getCamoCardHtml(camo: CamoType, title: string, desc: string, previewColor: string): string {
    const isSelected = this.selectedCamo === camo;
    return `
      <div style="
        background: rgba(14, 26, 44, 0.9);
        border: 2px solid ${isSelected ? '#00e676' : 'rgba(255,255,255,0.15)'};
        border-radius: 4px;
        padding: 12px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 10px;
      ">
        <div style="height: 60px; background: ${previewColor}; border-radius: 3px; display: flex; align-items: center; justify-content: center; font-weight: 700; color: #fff;">
          ${title}
        </div>
        <div style="font-size: 11px; color: #bbb;">${desc}</div>
        <button class="camo-select-btn" data-camo="${camo}" style="
          background: ${isSelected ? '#00e676' : '#0288d1'};
          border: none;
          border-radius: 3px;
          color: #fff;
          padding: 8px;
          font-weight: 700;
          font-size: 11px;
          cursor: pointer;
        ">
          ${isSelected ? 'ĐANG DÙNG' : 'TRANG BỊ'}
        </button>
      </div>
    `;
  }

  private getModalStyle(): string {
    return `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 780px;
      max-width: 90vw;
      background: rgba(8, 16, 28, 0.96);
      border: 1px solid #00e676;
      border-radius: 6px;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.7);
      padding: 20px;
      color: #fff;
      user-select: none;
    `;
  }

  public showRespawnModal(report: CasualtyReport, onRespawn: () => void): void {
    this.closeAll();
    this.onRespawnCb = onRespawn;

    const modal = document.createElement('div');
    modal.className = 'naval-respawn-modal';
    modal.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 580px;
      max-width: 92vw;
      background: rgba(7, 14, 25, 0.96);
      border: 2px solid #ff1744;
      border-radius: 8px;
      box-shadow: 0 0 35px rgba(255, 23, 68, 0.45), 0 8px 30px rgba(0, 0, 0, 0.85);
      padding: 24px;
      color: #fff;
      user-select: none;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      z-index: 210;
      pointer-events: auto;
    `;

    let secondsRemaining = 5;

    modal.innerHTML = `
      <div style="border-bottom: 2px solid rgba(255, 23, 68, 0.5); padding-bottom: 12px; margin-bottom: 18px; text-align: center;">
        <div style="color: #ff1744; font-size: 13px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 4px;">
          BÁO CÁO TỔN THẤT — TÀU ĐÃ BỊ CHÌM TRONG TRẬN CHIẾN
        </div>
        <div style="font-size: 20px; font-weight: 800; color: #ffffff;">
          BỊ HẠ BỞI: <span style="color: #ff5252;">${report.killerName}</span>
        </div>
        <div style="font-size: 12px; color: #ffd54f; font-weight: 600; margin-top: 3px;">
          CHỦNG LOẠI VŨ KHÍ: ${report.weaponType ?? 'Hải Pháo & Ngư Lôi Cỡ Lớn'}
        </div>
      </div>

      <div style="background: rgba(14, 25, 42, 0.7); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px; padding: 14px; margin-bottom: 18px;">
        <div style="font-size: 11px; font-weight: 700; color: #80deea; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 4px;">
          TỔNG KẾT CHIẾN THUẬT TRẬN ĐẤU
        </div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; text-align: center;">
          <div style="background: rgba(0, 0, 0, 0.35); padding: 8px; border-radius: 4px; border: 1px solid rgba(0, 230, 118, 0.3);">
            <div style="font-size: 10px; color: #aaa;">ĐIỂM CHIẾN ĐẤU</div>
            <div style="font-size: 18px; font-weight: 800; color: #00e676;">${report.playerScore}</div>
          </div>
          <div style="background: rgba(0, 0, 0, 0.35); padding: 8px; border-radius: 4px; border: 1px solid rgba(0, 229, 255, 0.3);">
            <div style="font-size: 10px; color: #aaa;">HẠ GỤC / BỊ HẠ</div>
            <div style="font-size: 18px; font-weight: 800; color: #00e5ff;">${report.playerKills} / ${report.playerDeaths}</div>
          </div>
          <div style="background: rgba(0, 0, 0, 0.35); padding: 8px; border-radius: 4px; border: 1px solid rgba(255, 213, 79, 0.3);">
            <div style="font-size: 10px; color: #aaa;">KINH NGHIỆM HẢI QUÂN</div>
            <div style="font-size: 18px; font-weight: 800; color: #ffd54f;">+${report.playerXp}</div>
          </div>
        </div>
      </div>

      <div style="text-align: center; margin-bottom: 20px;">
        <div style="font-size: 12px; font-weight: 700; color: #00e5ff; letter-spacing: 1px; margin-bottom: 6px;">
          TÁI XUẤT TRẬN CHIẾN TRONG: <span class="respawn-timer-sec" style="font-size: 24px; font-weight: 800; color: #fff; font-family: monospace;">${secondsRemaining}</span>s
        </div>
        <div style="width: 100%; height: 8px; background: rgba(255, 255, 255, 0.15); border-radius: 4px; overflow: hidden; margin-top: 6px;">
          <div class="respawn-progress-bar" style="width: 100%; height: 100%; background: linear-gradient(90deg, #00e5ff, #00e676); transition: width 0.1s linear;"></div>
        </div>
      </div>

      <div style="display: flex; gap: 14px; justify-content: center;">
        <button class="btn-respawn-tech" style="
          flex: 1;
          background: rgba(0, 230, 118, 0.15);
          border: 1px solid #00e676;
          border-radius: 4px;
          color: #fff;
          padding: 11px 16px;
          font-weight: 700;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s ease;
        ">
          [T] ĐỔI TÀU / CẤP ĐỘ
        </button>
        <button class="btn-respawn-now" style="
          flex: 1;
          background: #00e676;
          border: none;
          border-radius: 4px;
          color: #05140b;
          padding: 11px 16px;
          font-weight: 800;
          font-size: 14px;
          cursor: pointer;
          box-shadow: 0 0 15px rgba(0, 230, 118, 0.4);
          transition: all 0.2s ease;
        ">
          HỒI SINH NGAY
        </button>
      </div>
    `;

    const timerSecEl = modal.querySelector('.respawn-timer-sec') as HTMLElement;
    const progressEl = modal.querySelector('.respawn-progress-bar') as HTMLElement;
    const respawnNowBtn = modal.querySelector('.btn-respawn-now') as HTMLElement;
    const techBtn = modal.querySelector('.btn-respawn-tech') as HTMLElement;

    const executeRespawn = () => {
      this.closeRespawnModal();
      this.overlayContainer.style.pointerEvents = 'none';
      if (this.onRespawnCb) {
        const cb = this.onRespawnCb;
        this.onRespawnCb = null;
        cb();
      }
    };

    respawnNowBtn?.addEventListener('click', () => {
      executeRespawn();
    });

    techBtn?.addEventListener('click', () => {
      this.closeRespawnModal();
      this.showTechTree();
    });

    const startTime = Date.now();
    const totalDurationMs = 5000;

    this.respawnIntervalTimer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remainingMs = Math.max(0, totalDurationMs - elapsed);
      const remainingSecCeil = Math.ceil(remainingMs / 1000);

      if (timerSecEl) {
        timerSecEl.textContent = String(remainingSecCeil);
      }
      if (progressEl) {
        const pct = Math.max(0, Math.min(100, (remainingMs / totalDurationMs) * 100));
        progressEl.style.width = `${pct}%`;
      }

      if (remainingMs <= 0) {
        executeRespawn();
      }
    }, 100);

    this.overlayContainer.style.pointerEvents = 'auto';
    this.overlayContainer.appendChild(modal);
    this.respawnModal = modal;
  }

  public closeRespawnModal(): void {
    if (this.respawnIntervalTimer) {
      clearInterval(this.respawnIntervalTimer);
      this.respawnIntervalTimer = null;
    }
    if (this.respawnModal) {
      this.respawnModal.remove();
      this.respawnModal = null;
    }
  }

  public closeAll(): void {
    this.closeRespawnModal();
    if (this.techTreeModal) {
      this.techTreeModal.remove();
      this.techTreeModal = null;
    }
    if (this.loadoutModal) {
      this.loadoutModal.remove();
      this.loadoutModal = null;
    }
    if (this.camoModal) {
      this.camoModal.remove();
      this.camoModal = null;
    }
    this.overlayContainer.style.pointerEvents = 'none';
  }

  public isAnyOpen(): boolean {
    return !!(this.techTreeModal || this.loadoutModal || this.camoModal || this.respawnModal);
  }
}
