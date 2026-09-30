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
import { AppState, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import {
  createDeviceLockSession,
  deviceLockAuthErrorCopy,
  deviceLockCopy,
  deviceLockPersistCopy,
  deviceLockReadCopy,
  type DeviceLockSnapshot,
} from '../application/device-lock';
import {
  decideUnlockResult,
  shouldBlockPrivateSnapshot,
  shouldConcealOnInactive,
  shouldShowDeviceLockCover,
  shouldStartUnlockOnActive,
  type DeviceLockTrace,
} from '../application/device-lock-privacy';
import { pauseForegroundAudio } from '../application/foreground-audio';
import { createSecureDeviceLockStore, type DeviceLockStore } from '../infrastructure/device-lock-store';
import { createExpoDeviceAuthenticator, type DeviceAuthenticator } from '../infrastructure/expo-device-auth';
import { setPrivateSnapshotBlocked } from '../infrastructure/screen-privacy';
import { ink, inkSoft, paper, sage } from './life-page';

function appIsBackgrounded() {
  return AppState.currentState === 'background';
}

export type DeviceLockContextValue = {
  snapshot: DeviceLockSnapshot;
  enabled: boolean;
  switchOn: boolean;
  settingsBusy: boolean;
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
  onLockTrace,
}: {
  children: ReactNode;
  store?: DeviceLockStore;
  authenticator?: DeviceAuthenticator;
  onLockTrace?: (event: DeviceLockTrace) => void;
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
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [switchOn, setSwitchOn] = useState(false);
  const inFlight = useRef(false);
  const hydrated = useRef(false);
  const needsManualRetry = useRef(false);
  const leftToBackground = useRef(false);
  const settingsBusyRef = useRef(false);
  const heldUnlock = useRef<number | null>(null);
  const mounted = useRef(true);
  const [lifeState, setLifeState] = useState(AppState.currentState);
  const [unlockBusy, setUnlockBusy] = useState(false);

  const refresh = useCallback(() => setSnapshot(session.snapshot()), [session]);

  const logLock = useCallback(
    (event: string, extra?: { generation?: number; settingsGeneration?: number; locked?: boolean; cover?: boolean; result?: string }) => {
      const current = session.snapshot();
      const cover =
        extra?.cover ??
        shouldShowDeviceLockCover({
          locked: extra?.locked ?? current.locked,
          setting: current.setting,
          appState: AppState.currentState,
          unlockInFlight: inFlight.current && !settingsBusyRef.current,
        });
      const trace: DeviceLockTrace = {
        event,
        appState: AppState.currentState,
        generation: extra?.generation ?? current.authGeneration,
        settingsGeneration: extra?.settingsGeneration ?? current.settingsGeneration,
        locked: extra?.locked ?? current.locked,
        cover,
        snapshotBlocked: shouldBlockPrivateSnapshot({
          cover,
          setting: current.setting,
          appState: AppState.currentState,
          sessionUnlocked: current.sessionUnlocked,
          unlockInFlight: inFlight.current && !settingsBusyRef.current,
        }),
        ...(extra?.result ? { result: extra.result } : {}),
      };
      onLockTrace?.(trace);
      if (process.env.JEST_WORKER_ID) return;
      if (typeof __DEV__ !== 'undefined' && !__DEV__) return;
      console.log('[device-lock]', {
        event: trace.event,
        appState: trace.appState,
        generation: trace.generation,
        settingsGeneration: trace.settingsGeneration,
        locked: trace.locked,
        cover: trace.cover,
        snapshotBlocked: trace.snapshotBlocked,
        setting: current.setting,
        inFlight: inFlight.current,
        ...(trace.result ? { result: trace.result } : {}),
      });
    },
    [onLockTrace, session],
  );

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
      if (mounted.current) {
        const stored = session.snapshot();
        if (stored.setting === 'on' || stored.setting === 'off') setSwitchOn(stored.setting === 'on');
        refresh();
      }
    }
  }, [refresh, resolvedStore, session]);

  useEffect(() => {
    mounted.current = true;
    if (!hydrated.current) void loadStoredSetting();
    return () => {
      mounted.current = false;
    };
  }, [loadStoredSetting]);

  const coverVisible = shouldShowDeviceLockCover({
    locked: snapshot.locked,
    setting: snapshot.setting,
    appState: lifeState,
    unlockInFlight: unlockBusy,
  });

  useEffect(() => {
    void setPrivateSnapshotBlocked(
      shouldBlockPrivateSnapshot({
        cover: coverVisible,
        setting: snapshot.setting,
        appState: lifeState,
        sessionUnlocked: snapshot.sessionUnlocked,
        unlockInFlight: unlockBusy,
      }),
    );
  }, [coverVisible, lifeState, snapshot.sessionUnlocked, snapshot.setting, unlockBusy]);

  const retryUnlock = useCallback(async () => {
    if (appIsBackgrounded()) return;
    if (AppState.currentState !== 'active') return;
    if (session.snapshot().setting !== 'on' || inFlight.current) return;
    const generation = session.beginAuth();
    inFlight.current = true;
    setUnlockBusy(true);
    needsManualRetry.current = false;
    heldUnlock.current = null;
    setMessage(null);
    logLock('auth-start', { generation, cover: true });
    try {
      const result = await resolvedAuthenticator.authenticate('验证是这台设备的持有人，才能打开 Lampy。');
      const decision = decideUnlockResult({
        appState: AppState.currentState,
        generation,
        currentGeneration: session.snapshot().authGeneration,
      });
      if (decision === 'ignore-background' || decision === 'stale') {
        logLock('auth-end', { generation, result: decision, cover: true });
        return;
      }
      if (decision === 'hold') {
        if (result.ok) {
          heldUnlock.current = generation;
          logLock('auth-end', { generation, result: 'held-until-active', cover: true });
        } else {
          const next = session.finishUnlock(generation, result);
          needsManualRetry.current = true;
          setMessage(deviceLockCopy(result));
          logLock('auth-end', { generation, result: next.kind, locked: next.locked, cover: true });
        }
        return;
      }
      const next = session.finishUnlock(generation, result);
      logLock('auth-end', { generation, result: next.kind, locked: next.locked });
      if (next.kind === 'denied') {
        needsManualRetry.current = true;
        setMessage(deviceLockCopy(result));
      }
    } catch {
      const decision = decideUnlockResult({
        appState: AppState.currentState,
        generation,
        currentGeneration: session.snapshot().authGeneration,
      });
      if (decision === 'ignore-background' || decision === 'stale') {
        logLock('auth-end', { generation, result: decision, cover: true });
        return;
      }
      needsManualRetry.current = true;
      setMessage(deviceLockAuthErrorCopy());
      logLock('auth-end', { generation, result: 'error', cover: true });
    } finally {
      inFlight.current = false;
      setUnlockBusy(false);
      refresh();
    }
  }, [logLock, refresh, resolvedAuthenticator, session]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      setLifeState(state);
      if (state === 'inactive') {
        pauseForegroundAudio();
        const current = session.snapshot();
        if (
          shouldConcealOnInactive({
            setting: current.setting,
            settingsInFlight: settingsBusyRef.current,
            unlockInFlight: inFlight.current && !settingsBusyRef.current,
            sessionUnlocked: current.sessionUnlocked,
          })
        ) {
          session.conceal();
          refresh();
        }
        if (
          shouldBlockPrivateSnapshot({
            cover: true,
            setting: current.setting,
            appState: 'inactive',
            sessionUnlocked: current.sessionUnlocked,
            unlockInFlight: inFlight.current && !settingsBusyRef.current,
          })
        ) {
          void setPrivateSnapshotBlocked(true);
        }
        logLock('app-state', { cover: true });
        return;
      }
      if (state === 'background') {
        pauseForegroundAudio();
        leftToBackground.current = true;
        heldUnlock.current = null;
        session.lockForBackground();
        void setPrivateSnapshotBlocked(true);
        refresh();
        logLock('app-state', { cover: true });
        return;
      }
      if (state !== 'active') {
        logLock('app-state');
        return;
      }
      const returnedFromBackground = leftToBackground.current;
      leftToBackground.current = false;
      const held = heldUnlock.current;
      if (held != null) {
        heldUnlock.current = null;
        if (held === session.snapshot().authGeneration && !appIsBackgrounded()) {
          const next = session.finishUnlock(held, { ok: true });
          refresh();
          logLock('auth-end', { generation: held, result: next.kind, locked: next.locked });
          return;
        }
      }
      logLock('app-state');
      const current = session.snapshot();
      if (
        shouldStartUnlockOnActive({
          setting: current.setting,
          locked: current.locked,
          unlockInFlight: inFlight.current,
          needsManualRetry: needsManualRetry.current,
          settingsInFlight: settingsBusyRef.current,
          hasHeldSuccess: false,
        }) &&
        (returnedFromBackground || current.locked)
      ) {
        void retryUnlock();
      }
    });
    return () => sub?.remove();
  }, [logLock, refresh, retryUnlock, session]);

  useEffect(() => {
    if (
      AppState.currentState === 'active' &&
      shouldStartUnlockOnActive({
        setting: snapshot.setting,
        locked: snapshot.locked,
        unlockInFlight: inFlight.current,
        needsManualRetry: needsManualRetry.current,
        settingsInFlight: settingsBusyRef.current,
        hasHeldSuccess: heldUnlock.current != null,
      }) &&
      !message &&
      !leftToBackground.current
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
    const generation = session.beginSettingsAuth();
    inFlight.current = true;
    settingsBusyRef.current = true;
    setSettingsBusy(true);
    setMessage(null);
    const enabling = current.setting === 'off';
    logLock('settings-start', { settingsGeneration: generation });
    try {
      const result = await resolvedAuthenticator.authenticate(
        enabling ? '验证是这台设备的持有人，才能打开本机保护。' : '验证是这台设备的持有人，才能关闭本机保护。',
      );
      const next = enabling ? session.confirmEnable(generation, result) : session.confirmDisable(generation, result);
      logLock('settings-end', { settingsGeneration: generation, result: next.kind, locked: next.locked });
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
      } else if (next.kind === 'stale') {
        setMessage(deviceLockPersistCopy());
      }
    } catch {
      logLock('settings-end', { settingsGeneration: generation, result: 'error' });
      setMessage(deviceLockAuthErrorCopy());
    } finally {
      inFlight.current = false;
      settingsBusyRef.current = false;
      if (mounted.current) {
        setSettingsBusy(false);
        setSwitchOn(session.snapshot().setting === 'on');
        refresh();
      }
    }
  }, [logLock, refresh, resolvedAuthenticator, resolvedStore, session]);

  const value = {
    snapshot,
    enabled: snapshot.setting === 'on',
    switchOn,
    settingsBusy,
    toggle,
    retryUnlock,
    message,
  };

  return (
    <DeviceLockContext.Provider value={value}>
      <View
        style={styles.stack}
        accessibilityElementsHidden={coverVisible}
        importantForAccessibility={coverVisible ? 'no-hide-descendants' : 'auto'}
      >
        {children}
      </View>
      {coverVisible ? (
        <View style={styles.cover} testID="device-lock-cover" accessibilityLabel="Lampy 已锁定">
          <ScrollView
            contentContainerStyle={styles.coverInner}
            keyboardShouldPersistTaps="handled"
            testID="device-lock-cover-scroll"
          >
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
          </ScrollView>
        </View>
      ) : null}
    </DeviceLockContext.Provider>
  );
}

export function DeviceLockSettings() {
  const lock = useDeviceLock();
  if (!lock || lock.snapshot.setting === 'unknown') return null;
  const displayOn = lock.switchOn;
  const busy = lock.settingsBusy;
  return (
    <View testID="account-device-lock">
      <Text style={styles.title} accessibilityRole="header">
        本机保护
      </Text>
      <View style={styles.settingsRow}>
        <Text style={styles.action} testID="account-device-lock-state">
          {displayOn ? '已开启' : '未开启'}
        </Text>
        <Switch
          value={displayOn}
          disabled={busy}
          onValueChange={() => {
            if (busy) return;
            void lock.toggle();
          }}
          accessibilityLabel="本机保护"
          accessibilityState={{ checked: displayOn, disabled: busy }}
          testID="account-device-lock-toggle"
        />
      </View>
      <Text style={styles.body} testID="account-device-lock-copy">
        开启后，进入 Lampy 需要 Face ID 或设备密码。
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
    zIndex: 20,
  },
  coverInner: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  title: { fontSize: 28, color: ink },
  body: { fontSize: 17, color: inkSoft },
  action: { fontSize: 17, color: sage },
  hit: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  settingsRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
});
