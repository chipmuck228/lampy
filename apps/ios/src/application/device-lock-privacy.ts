import type { AppStateStatus } from 'react-native';

import type { DeviceLockSetting } from './device-lock';

export type DeviceLockTrace = {
  event: string;
  appState: string;
  generation: number;
  settingsGeneration: number;
  locked: boolean;
  cover: boolean;
  snapshotBlocked: boolean;
  result?: string;
};

export function shouldShowDeviceLockCover(input: {
  locked: boolean;
  setting: DeviceLockSetting;
  appState: AppStateStatus;
  unlockInFlight: boolean;
}): boolean {
  if (input.locked) return true;
  if (input.setting === 'unknown') return true;
  if (input.setting !== 'on') return false;
  if (input.unlockInFlight) return true;
  return input.appState !== 'active';
}

export function shouldBlockPrivateSnapshot(input: {
  cover: boolean;
  setting: DeviceLockSetting;
  appState: AppStateStatus;
}): boolean {
  if (input.cover) return true;
  return input.setting === 'on' && input.appState !== 'active';
}

export function shouldConcealOnInactive(input: {
  setting: DeviceLockSetting;
  settingsInFlight: boolean;
}): boolean {
  return input.setting === 'on' && !input.settingsInFlight;
}

export function decideUnlockResult(input: {
  appState: AppStateStatus;
  generation: number;
  currentGeneration: number;
}): 'apply' | 'hold' | 'ignore-background' | 'stale' {
  if (input.generation !== input.currentGeneration) return 'stale';
  if (input.appState === 'background') return 'ignore-background';
  if (input.appState !== 'active') return 'hold';
  return 'apply';
}

export function shouldStartUnlockOnActive(input: {
  setting: DeviceLockSetting;
  locked: boolean;
  unlockInFlight: boolean;
  needsManualRetry: boolean;
  settingsInFlight: boolean;
  hasHeldSuccess: boolean;
}): boolean {
  if (input.hasHeldSuccess) return false;
  if (input.settingsInFlight || input.unlockInFlight || input.needsManualRetry) return false;
  return input.setting === 'on' && input.locked;
}

export function recordLockTrace(
  events: DeviceLockTrace[],
  next: DeviceLockTrace,
): DeviceLockTrace[] {
  events.push(next);
  return events;
}
