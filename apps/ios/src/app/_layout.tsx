import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';

import { paper } from '../screens/life-page';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  useEffect(() => {
    const failsafe = setTimeout(() => {
      void SplashScreen.hideAsync().catch(() => undefined);
    }, 4000);
    return () => clearTimeout(failsafe);
  }, []);

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: paper },
          animation: 'fade',
        }}
      />
    </>
  );
}
