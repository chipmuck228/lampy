import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';

import { ensureStartupOverlayFailsafe } from '../application/startup-overlay';
import { DeviceLockProvider } from '../screens/device-lock-context';
import { FirstRunGate } from '../screens/first-run-gate';
import { paper } from '../screens/life-page';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  useEffect(() => ensureStartupOverlayFailsafe(), []);

  return (
    <DeviceLockProvider>
      <StatusBar style="dark" />
      <FirstRunGate>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: paper },
            animation: 'fade',
          }}
        />
      </FirstRunGate>
    </DeviceLockProvider>
  );
}
