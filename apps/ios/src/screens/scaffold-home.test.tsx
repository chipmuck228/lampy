import type { ReactElement } from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import RecentScreen from '../app/index';

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require('react');
  return {
    useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
    useFocusEffect: (effect: () => void | (() => void)) => {
      useEffect(effect, [effect]);
    },
  };
});

jest.mock('../application/container', () => ({
  getUseCases: async () => ({
    getRecentLife: async () => ({ isFirstUse: true, items: [] }),
  }),
}));

function wrap(ui: ReactElement) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      {ui}
    </SafeAreaProvider>
  );
}

describe('recent home', () => {
  it('renders the empty recent state without inventing moments', async () => {
    const view = await render(wrap(<RecentScreen />));
    expect(view.getByLabelText('最近')).toBeTruthy();
    await waitFor(() => {
      expect(view.getByText('最近还没有留下什么。')).toBeTruthy();
    });
    expect(view.queryByText(/假数据|mock moment/i)).toBeNull();
  });
});
