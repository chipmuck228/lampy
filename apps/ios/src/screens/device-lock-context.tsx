import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  createDeviceLockSession,
  deviceLockAuthErrorCopy,
  deviceLockCopy,
  deviceLockPersistCopy,
  deviceLockReadCopy,
  type DeviceLockSnapshot,
} from '../application/device-lock';
import { pauseForegroundAudio } from '../application/foreground-audio';
import { createSecureDeviceLockStore, type DeviceLockStore } from '../infrastructure/device-lock-store';
import { createExpoDeviceAuthenticator, type DeviceAuthenticator } from '../infrastructure/expo-device-auth';
import { setPrivateSnapshotBlocked } from '../infrastructure/screen-privacy';
import { ink, inkSoft, paper, sage } from './life-page';

export type DeviceLockContextValue = {
  snapshot: DeviceLockSnapshot;
  enabled: boolean;
  toggle(): Promise<void>;
  retryUnlock(): Promise<void>;
  message: string | null;
};

export const DeviceLockContext = createContext<DeviceLockContextValue | null>(null);

export function useDeviceLock() {
  return useContext(DeviceLockContext);
}

export function DeviceLockProvider({
  children,
  store,
  authenticator,
}: {
  children: ReactNode;
  store?: DeviceLockStore;
  authenticator?: DeviceAuthenticator;
}) {
  const defaults = useRef({
    store: store ?? createSecureDeviceLockStore(),
    authenticator: authenticator ?? createExpoDeviceAuthenticator(),
  });
  const resolvedStore = store ?? defaults.current.store;
  const resolvedAuthenticator = authenticator ?? defaults.current.authenticator;
  const session = useMemo(() => createDeviceLockSession(), []);
  const [snapshot, setSnapshot] = useState(session.snapshot());
  const [message, setMessage] = useState<string | null>(null);
  const inFlight = useRef(false);
  const hydrated = useRef(false);
  const needsManualRetry = useRef(false);
  const mounted = useRef(true);

  const refresh = useCallback(() => setSnapshot(session.snapshot()), [session]);

  const loadStoredSetting = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setMessage(null);
    try {
      const enabled = await resolvedStore.isEnabled();
      if (!mounted.current) return;
      hydrated.current = true;
      session.applyStored(enabled);
      needsManualRetry.current = false;
    } catch {
      if (!mounted.current) return;
      needsManualRetry.current = true;
      setMessage(deviceLockReadCopy());
    } finally {
      inFlight.current = false;
      if (mounted.current) refresh();
    }
  }, [refresh, resolvedStore, session]);

  useEffect(() => {
    mounted.current = true;
    if (!hydrated.current) void loadStoredSetting();
    return () => {
      mounted.current = false;
    };
  }, [loadStoredSetting]);

  useEffect(() => {
    void setPrivateSnapshotBlocked(snapshot.locked);
  }, [snapshot.locked]);

  const retryUnlock = useCallback(async () => {
    if (AppState.currentState !== 'active') return;
    if (session.snapshot().setting !== 'on' || inFlight.current) return;
    const generation = session.beginAuth();
    inFlight.current = true;
    needsManualRetry.current = false;
    setMessage(null);
    try {
      const result = await resolvedAuthenticator.authenticate('验证是这台设备的持有人，才能打开 Lampy。');
      if (AppState.currentState !== 'active') return;
      const next = session.finishUnlock(generation, result);
      if (next.kind === 'denied') {
        needsManualRetry.current = true;
        setMessage(deviceLockCopy(result));
      }
    } catch {
      if (AppState.currentState !== 'active') return;
      needsManualRetry.current = true;
      setMessage(deviceLockAuthErrorCopy());
    } finally {
      inFlight.current = false;
      refresh();
    }
  }, [refresh, resolvedAuthenticator, session]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        pauseForegroundAudio();
        session.lockForBackground();
        refresh();
        return;
      }
      const current = session.snapshot();
      if (current.setting === 'on' && current.locked && !needsManualRetry.current) void retryUnlock();
    });
    return () => sub?.remove();
  }, [refresh, retryUnlock, session]);

  useEffect(() => {
    if (
      AppState.currentState === 'active' &&
      snapshot.setting === 'on' &&
      snapshot.locked &&
      !inFlight.current &&
      !message &&
      !needsManualRetry.current
    ) {
      void retryUnlock();
    }
  }, [message, retryUnlock, snapshot.locked, snapshot.setting]);

  function retryCoverAction() {
    if (session.snapshot().setting === 'unknown') {
      void loadStoredSetting();
      return;
    }
    void retryUnlock();
  }

  const toggle = useCallback(async () => {
    const current = session.snapshot();
    if (current.setting === 'unknown' || inFlight.current) return;
    const generation = session.beginAuth();
    inFlight.current = true;
    setMessage(null);
    const enabling = current.setting === 'off';
    try {
      const result = await resolvedAuthenticator.authenticate(
        enabling ? '验证是这台设备的持有人，才能打开本机保护。' : '验证是这台设备的持有人，才能关闭本机保护。',
      );
      const next = enabling ? session.confirmEnable(generation, result) : session.confirmDisable(generation, result);
      if (next.persist) {
        try {
          await resolvedStore.setEnabled(enabling);
        } catch {
          if (enabling) session.revertEnable();
          else session.revertDisable();
          setMessage(deviceLockPersistCopy());
        }
      } else if (next.kind === 'denied') {
        setMessage(deviceLockCopy(result));
      }
    } catch {
      setMessage(deviceLockAuthErrorCopy());
    } finally {
      inFlight.current = false;
      refresh();
    }
  }, [refresh, resolvedAuthenticator, resolvedStore, session]);

  const value = {
    snapshot,
    enabled: snapshot.setting === 'on',
    toggle,
    retryUnlock,
    message,
  };

  return (
    <DeviceLockContext.Provider value={value}>
      <View
        style={styles.stack}
        accessibilityElementsHidden={snapshot.locked}
        importantForAccessibility={snapshot.locked ? 'no-hide-descendants' : 'auto'}
      >
        {children}
      </View>
      {snapshot.locked ? (
        <View style={styles.cover} testID="device-lock-cover" accessibilityLabel="Lampy 已锁定">
          <Text style={styles.title} accessibilityRole="header">
            {snapshot.setting === 'unknown' ? 'Lampy' : '这台设备已保护'}
          </Text>
          <Text style={styles.body}>
            {snapshot.setting === 'unknown' && !message
              ? '正在确认本机设置。'
              : snapshot.setting === 'unknown'
                ? '记录还在。'
                : '进入 Lampy 前，先确认是这台设备的持有人。记录还在。'}
          </Text>
          {snapshot.setting === 'on' || message ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="再试一次"
              testID="device-lock-retry"
              onPress={retryCoverAction}
              style={styles.hit}
            >
              <Text style={styles.action}>再试一次</Text>
            </Pressable>
          ) : null}
          {message ? (
            <Text style={styles.body} testID="device-lock-message">
              {message}
            </Text>
          ) : null}
        </View>
      ) : null}
    </DeviceLockContext.Provider>
  );
}

export function DeviceLockSettings() {
  const lock = useDeviceLock();
  if (!lock || lock.snapshot.setting === 'unknown') return null;
  const on = lock.snapshot.setting === 'on';
  return (
    <View testID="account-device-lock">
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: on }}
        accessibilityLabel="使用 Face ID 保护 Lampy"
        testID="account-device-lock-toggle"
        onPress={() => void lock.toggle()}
        style={styles.hit}
      >
        <Text style={styles.action}>{on ? '已使用 Face ID 保护 Lampy' : '使用 Face ID 保护 Lampy'}</Text>
      </Pressable>
      <Text style={styles.body} testID="account-device-lock-copy">
        开启后，进入 Lampy 时需先验证设备持有人。设置只作用于这台设备，不是 Lampy 账户登录，也不会上传面部数据。
      </Text>
      {lock.message ? (
        <Text style={styles.body} testID="account-device-lock-message">
          {lock.message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { flex: 1 },
  cover: {
    ...StyleSheet.absoluteFill,
    backgroundColor: paper,
    padding: 24,
    justifyContent: 'center',
    gap: 16,
    zIndex: 20,
  },
  title: { fontSize: 28, lineHeight: 36, color: ink },
  body: { fontSize: 17, lineHeight: 26, color: inkSoft },
  action: { fontSize: 17, lineHeight: 24, color: sage },
  hit: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
});
