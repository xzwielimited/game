/**
 * Standalone Mock Platform SDK
 * Clean-Room fallback implementation for offline / local / test execution.
 */

import { IPlatformSDK, RewardedAdOptions } from './platform_sdk.js';

export class StandaloneMockSDK implements IPlatformSDK {
  public readonly platformName = 'StandaloneMock';
  private _isAdPlaying = false;
  private _isGameplayActive = false;
  private _commercialBreakCount = 0;
  private _rewardedBreakCount = 0;
  private _happyTimeCount = 0;
  private _lastRewardType: string | null = null;
  private _adDelayMs: number;

  constructor(adDelayMs: number = 20) {
    this._adDelayMs = adDelayMs;
  }

  public async init(): Promise<boolean> {
    return true;
  }

  public gameplayStart(): void {
    this._isGameplayActive = true;
  }

  public gameplayStop(): void {
    this._isGameplayActive = false;
  }

  public async commercialBreak(): Promise<void> {
    this._isAdPlaying = true;
    this._commercialBreakCount++;

    if (this._adDelayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, this._adDelayMs));
    }

    this._isAdPlaying = false;
  }

  public async rewardedBreak(options: RewardedAdOptions): Promise<boolean> {
    this._isAdPlaying = true;
    this._rewardedBreakCount++;
    this._lastRewardType = options.rewardType;

    if (this._adDelayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, this._adDelayMs));
    }

    this._isAdPlaying = false;
    options.onRewardGranted();
    return true;
  }

  public happyTime(intensity: number = 1.0): void {
    this._happyTimeCount += intensity;
  }

  public isAdPlaying(): boolean {
    return this._isAdPlaying;
  }

  public isGameplayActive(): boolean {
    return this._isGameplayActive;
  }

  public get commercialBreakCount(): number {
    return this._commercialBreakCount;
  }

  public get rewardedBreakCount(): number {
    return this._rewardedBreakCount;
  }

  public get happyTimeCount(): number {
    return this._happyTimeCount;
  }

  public get lastRewardType(): string | null {
    return this._lastRewardType;
  }

  public setAdDelayMs(delayMs: number): void {
    this._adDelayMs = delayMs;
  }
}
