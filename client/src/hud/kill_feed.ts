/**
 * Dynamic Kill Notification Feed
 * Clean-Room implementation for NavalCommand.io
 * Shows real-time sinkings, weapon icons, and karma-tinted names with smooth sliding fades.
 */

export interface KillNotification {
  id: string;
  killerName: string;
  killerIsFriendly?: boolean;
  killerIsTraitor?: boolean;
  victimName: string;
  victimIsFriendly?: boolean;
  weaponType: string;
  timestamp: number;
}

export class KillFeed {
  public readonly container: HTMLElement;
  private entries: Array<{ data: KillNotification; element: HTMLElement }> = [];
  private readonly maxEntries: number = 5;
  private readonly lifespanMs: number = 5500;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'tactical-kill-feed';
    this.container.style.cssText = `
      position: absolute;
      top: 20px;
      right: 20px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      align-items: flex-end;
      pointer-events: none;
      z-index: 100;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-size: 13px;
    `;
  }

  public addKill(
    killerName: string,
    victimName: string,
    weaponType: string = 'Artillery',
    options: {
      killerIsFriendly?: boolean;
      killerIsTraitor?: boolean;
      victimIsFriendly?: boolean;
    } = {}
  ): void {
    const data: KillNotification = {
      id: Math.random().toString(36).substring(2, 9),
      killerName,
      killerIsFriendly: options.killerIsFriendly,
      killerIsTraitor: options.killerIsTraitor,
      victimName,
      victimIsFriendly: options.victimIsFriendly,
      weaponType,
      timestamp: Date.now(),
    };

    const entryEl = document.createElement('div');
    entryEl.style.cssText = `
      background: rgba(12, 24, 38, 0.85);
      border-left: 3px solid #00e676;
      border-radius: 3px;
      padding: 6px 12px;
      color: #e0e0e0;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
      transform: translateX(20px);
      opacity: 0;
      transition: all 0.25s ease-out;
    `;

    // Killer name color
    let killerColor = '#ffffff';
    if (data.killerIsTraitor) killerColor = '#ff5252';
    else if (data.killerIsFriendly) killerColor = '#00e5ff';

    // Victim name color
    const victimColor = data.victimIsFriendly ? '#00e5ff' : '#ff8a80';

    // Weapon icon
    let icon = '💥';
    if (weaponType.toLowerCase().includes('torpedo')) icon = '🌊';
    else if (weaponType.toLowerCase().includes('missile')) icon = '🚀';
    else if (weaponType.toLowerCase().includes('depth')) icon = '💣';
    else if (weaponType.toLowerCase().includes('mine')) icon = '⚠️';
    else if (weaponType.toLowerCase().includes('ram')) icon = '⚡';

    entryEl.innerHTML = `
      <span style="font-weight: 600; color: ${killerColor};">${this.escape(killerName)}</span>
      <span style="opacity: 0.8; font-size: 14px;">${icon}</span>
      <span style="font-weight: 600; color: ${victimColor};">${this.escape(victimName)}</span>
    `;

    this.container.appendChild(entryEl);
    this.entries.push({ data, element: entryEl });

    // Trigger slide-in
    requestAnimationFrame(() => {
      entryEl.style.transform = 'translateX(0)';
      entryEl.style.opacity = '1';
    });

    // Prune if over max
    if (this.entries.length > this.maxEntries) {
      const oldest = this.entries.shift();
      if (oldest) {
        oldest.element.remove();
      }
    }

    // Schedule fade and remove
    setTimeout(() => {
      entryEl.style.opacity = '0';
      entryEl.style.transform = 'translateY(-10px)';
      setTimeout(() => {
        entryEl.remove();
        this.entries = this.entries.filter((e) => e.element !== entryEl);
      }, 300);
    }, this.lifespanMs);
  }

  private escape(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  public clear(): void {
    for (const e of this.entries) {
      e.element.remove();
    }
    this.entries = [];
  }
}
