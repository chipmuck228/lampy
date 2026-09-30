export type DeviceLockSetting = 'unknown' | 'off' | 'on';

export type DeviceAuthResult =
  | { ok: true }
  | { ok: false; reason: 'cancel' | 'fail' | 'unavailable' | 'no-passcode' };

export type DeviceLockSnapshot = {
  setting: DeviceLockSetting;
  sessionUnlocked: boolean;
  locked: boolean;
  authGeneration: number;
  settingsGeneration: number;
};

export function createDeviceLockSession() {
  let setting: DeviceLockSetting = 'unknown';
  let sessionUnlocked = false;
  let authGeneration = 0;
  let settingsGeneration = 0;

  function snapshot(): DeviceLockSnapshot {
    return {
      setting,
      sessionUnlocked,
      locked: setting === 'unknown' || (setting === 'on' && !sessionUnlocked),
      authGeneration,
      settingsGeneration,
    };
  }

  return {
    snapshot,
    applyStored(enabled: boolean) {
      if (enabled) {
        const keepUnlocked = setting === 'on' && sessionUnlocked;
        setting = 'on';
        sessionUnlocked = keepUnlocked;
      } else {
        setting = 'off';
        sessionUnlocked = true;
      }
      return snapshot();
    },
    beginAuth() {
      authGeneration += 1;
      return authGeneration;
    },
    beginSettingsAuth() {
      settingsGeneration += 1;
      return settingsGeneration;
    },
    finishUnlock(generation: number, result: DeviceAuthResult) {
      if (generation !== authGeneration) return { kind: 'stale' as const, ...snapshot() };
      if (setting !== 'on') return { kind: 'ignored' as const, ...snapshot() };
      if (result.ok) sessionUnlocked = true;
      return { kind: result.ok ? ('unlocked' as const) : ('denied' as const), ...snapshot(), result };
    },
    confirmEnable(generation: number, result: DeviceAuthResult) {
      if (generation !== settingsGeneration) return { kind: 'stale' as const, persist: false, ...snapshot() };
      if (!result.ok) return { kind: 'denied' as const, persist: false, ...snapshot(), result };
      setting = 'on';
      sessionUnlocked = true;
      return { kind: 'enabled' as const, persist: true, ...snapshot() };
    },
    confirmDisable(generation: number, result: DeviceAuthResult) {
      if (generation !== settingsGeneration) return { kind: 'stale' as const, persist: false, ...snapshot() };
      if (!result.ok) return { kind: 'denied' as const, persist: false, ...snapshot(), result };
      setting = 'off';
      sessionUnlocked = true;
      return { kind: 'disabled' as const, persist: true, ...snapshot() };
    },
    revertEnable() {
      setting = 'off';
      sessionUnlocked = true;
      return snapshot();
    },
    revertDisable() {
      setting = 'on';
      sessionUnlocked = true;
      return snapshot();
    },
    lockForBackground() {
      authGeneration += 1;
      if (setting === 'on') sessionUnlocked = false;
      return snapshot();
    },
  };
}

export type DeviceLockSession = ReturnType<typeof createDeviceLockSession>;

export function deviceLockCopy(result: DeviceAuthResult) {
  if (result.ok) return null;
  if (result.reason === 'no-passcode') {
    return '这台设备还没有设置密码或 Face ID。记录还在。先在系统设置里加上设备密码，再回来重试。';
  }
  if (result.reason === 'unavailable') {
    return '现在不能用系统认证。记录还在，可以再试一次。';
  }
  return '这次没有解锁。记录还在，可以再试一次。';
}

export function deviceLockPersistCopy() {
  return '这次没有保存本机保护设置。记录还在，可以再试一次。';
}

export function deviceLockReadCopy() {
  return '暂时无法确认本机保护设置，可重试';
}

export function deviceLockAuthErrorCopy() {
  return '这次系统认证没有完成。记录还在，可以再试一次。';
}
