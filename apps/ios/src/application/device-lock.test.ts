import { createDeviceLockSession, deviceLockCopy } from './device-lock';

describe('device lock session', () => {
  it('stays unlocked when the stored setting is off', () => {
    const session = createDeviceLockSession();
    expect(session.snapshot().locked).toBe(true);
    expect(session.applyStored(false).locked).toBe(false);
  });

  it('keeps the setting off when enable auth fails or is cancelled', () => {
    const session = createDeviceLockSession();
    session.applyStored(false);
    const generation = session.beginAuth();
    const denied = session.confirmEnable(generation, { ok: false, reason: 'cancel' });
    expect(denied.persist).toBe(false);
    expect(denied.setting).toBe('off');
    expect(denied.locked).toBe(false);
  });

  it('persists enabled only after a successful challenge', () => {
    const session = createDeviceLockSession();
    session.applyStored(false);
    const generation = session.beginAuth();
    const enabled = session.confirmEnable(generation, { ok: true });
    expect(enabled.persist).toBe(true);
    expect(enabled.setting).toBe('on');
    expect(enabled.locked).toBe(false);
  });

  it('locks again in background and ignores a stale unlock', () => {
    const session = createDeviceLockSession();
    session.applyStored(true);
    const first = session.beginAuth();
    session.lockForBackground();
    expect(session.finishUnlock(first, { ok: true }).kind).toBe('stale');
    expect(session.snapshot().locked).toBe(true);
    const second = session.beginAuth();
    expect(session.finishUnlock(second, { ok: true }).kind).toBe('unlocked');
    expect(session.snapshot().locked).toBe(false);
  });

  it('does not disable until the close challenge succeeds', () => {
    const session = createDeviceLockSession();
    session.applyStored(true);
    const unlock = session.beginAuth();
    session.finishUnlock(unlock, { ok: true });
    const close = session.beginAuth();
    expect(session.confirmDisable(close, { ok: false, reason: 'fail' }).persist).toBe(false);
    expect(session.snapshot().setting).toBe('on');
    const again = session.beginAuth();
    expect(session.confirmDisable(again, { ok: true }).persist).toBe(true);
    expect(session.snapshot().setting).toBe('off');
  });

  it('explains a missing device passcode without implying data loss', () => {
    expect(deviceLockCopy({ ok: false, reason: 'no-passcode' })).toMatch(/记录还在/);
    expect(deviceLockCopy({ ok: false, reason: 'cancel' })).toMatch(/再试一次/);
    expect(deviceLockCopy({ ok: false, reason: 'unavailable' })).toMatch(/记录还在/);
  });
});
