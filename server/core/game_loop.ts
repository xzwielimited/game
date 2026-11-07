/**
 * Fixed Timestep Authoritative Server Game Loop
 * Clean-Room implementation for NavalCommand.io
 */

export type TickCallback = (tick: number, dt: number) => void;

export class GameLoop {
  private tickRate: number;
  private tickIntervalMs: number;
  private currentTick: number = 0;
  private worldTimeSeconds: number = 0;
  private isRunning: boolean = false;
  private timerId: NodeJS.Timeout | null = null;
  private tickCallbacks: Set<TickCallback> = new Set();
  private lastTimeMs: number = 0;

  constructor(tickRate = 20) {
    this.tickRate = tickRate;
    this.tickIntervalMs = 1000 / tickRate;
  }

  public getTickRate(): number {
    return this.tickRate;
  }

  public getTickIntervalMs(): number {
    return this.tickIntervalMs;
  }

  public getCurrentTick(): number {
    return this.currentTick;
  }

  public getWorldTimeSeconds(): number {
    return this.worldTimeSeconds;
  }

  public isActive(): boolean {
    return this.isRunning;
  }

  public onTick(callback: TickCallback): () => void {
    this.tickCallbacks.add(callback);
    return () => this.tickCallbacks.delete(callback);
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTimeMs = performance.now();

    this.timerId = setInterval(() => {
      if (!this.isRunning) return;
      const now = performance.now();
      const elapsedSec = (now - this.lastTimeMs) / 1000;
      this.lastTimeMs = now;
      // Fixed timestep dt or clamped real elapsed
      const dt = this.tickIntervalMs / 1000;
      this.step(dt);
    }, this.tickIntervalMs);
  }

  public stop(): void {
    this.isRunning = false;
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  /**
   * Executes a single simulation step.
   * Can be driven synchronously by automated test harnesses.
   */
  public step(dt: number = this.tickIntervalMs / 1000): void {
    this.currentTick++;
    this.worldTimeSeconds += dt;

    for (const cb of this.tickCallbacks) {
      cb(this.currentTick, dt);
    }
  }

  public reset(): void {
    this.stop();
    this.currentTick = 0;
    this.worldTimeSeconds = 0;
  }
}
