/**
 * Universal Platform SDK Interface for NavalCommand.io
 * Clean-Room implementation supporting CrazyGames, Poki, Playgama, Y8, and Standalone Fallback.
 */

export type RewardType = 'BONUS_STARTING_XP' | 'VIP_TRIAL_SHIP' | 'CREDIT_MULTIPLIER';

export interface RewardedAdOptions {
  rewardType: RewardType;
  onRewardGranted: () => void;
  onAdSkippedOrFailed: () => void;
}

export interface IPlatformSDK {
  readonly platformName: string;
  init(): Promise<boolean>;
  gameplayStart(): void;
  gameplayStop(): void;
  commercialBreak(): Promise<void>;
  rewardedBreak(options: RewardedAdOptions): Promise<boolean>;
  happyTime(intensity?: number): void;
  isAdPlaying(): boolean;
}
