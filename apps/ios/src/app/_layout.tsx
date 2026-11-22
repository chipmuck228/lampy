import {observeExportEntitlements} from '../infrastructure/album-export-purchases';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { androidExcludedRoutes, personalRecordsOnly } from '../application/mobile-capabilities';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';

import { ensureStartupOverlayFailsafe } from '../application/startup-overlay';
import { DeviceLockProvider } from '../screens/device-lock-context';
import { FirstRunGate } from '../screens/first-run-gate';
import { HomeScreenActionCapture, HomeScreenActionDispatch } from '../screens/home-screen-actions';
import { paper } from '../screens/life-page';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  useEffect(() => ensureStartupOverlayFailsafe(), []);
  useEffect(()=>observeExportEntitlements(()=>{}),[]);

  return (
    <DeviceLockProvider>
      <StatusBar style="dark" />
      <HomeScreenActionCapture />
      <FirstRunGate>
        <Stack
          initialRouteName="index"
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: paper },
            animation: 'fade',
          }}
        >
          {personalRecordsOnly() ? <Stack.Protected guard={false}>
            {androidExcludedRoutes().map(name => <Stack.Screen key={name} name={name} />)}
          </Stack.Protected> : null}
        </Stack>
        <HomeScreenActionDispatch />
      </FirstRunGate>
    </DeviceLockProvider>
  );
}
