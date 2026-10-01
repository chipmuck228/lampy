import type { ReactElement } from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { resetStartupBrandForTests } from '../application/startup-brand';
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
    getRecentLife: async () => ({ isFirstUse: true, items: [], days: [] }),
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
  const previousUrl = process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL;
  const previousEntry = process.env.EXPO_PUBLIC_FAMILY_ENTRY_OPEN;

  beforeEach(() => {
    resetStartupBrandForTests();
    delete process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL;
    delete process.env.EXPO_PUBLIC_FAMILY_ENTRY_OPEN;
  });

  afterEach(() => {
    if (previousUrl === undefined) delete process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL;
    else process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL = previousUrl;
    if (previousEntry === undefined) delete process.env.EXPO_PUBLIC_FAMILY_ENTRY_OPEN;
    else process.env.EXPO_PUBLIC_FAMILY_ENTRY_OPEN = previousEntry;
  });

  it('renders the empty recent state without inventing moments', async () => {
    const view = await render(wrap(<RecentScreen />));
    expect(view.getByLabelText('刚刚留下的生活')).toBeTruthy();
    expect(view.getByTestId('recent-wordmark').props.children).toBe('刚刚留下的生活');
    expect(view.getByLabelText('回看')).toBeTruthy();
    expect(view.getByTestId('recent-leave-fab')).toBeTruthy();
    expect(view.getByTestId('recent-leave-fab').props.accessibilityElementsHidden).toBe(false);
    expect(view.getByLabelText('留下')).toBeTruthy();
    expect(view.queryByTestId('home-leave')).toBeNull();
    expect(view.getByTestId('recent-scroll')).toBeTruthy();
    await waitFor(() => {
      expect(view.getByText('这里，留下自己的生活。')).toBeTruthy();
    });
    expect(view.getByTestId('recent-eyebrow').props.children).toBe('LAMPY · 生活记录');
    expect(view.getByText('写一句，\n拍一张，\n或留一段声音。')).toBeTruthy();
    expect(view.getByLabelText('留下第一条')).toBeTruthy();
    expect(view.queryByTestId('home-family')).toBeNull();
    expect(view.getByTestId('home-account')).toBeTruthy();
    expect(view.getByLabelText('本机设置')).toBeTruthy();
    expect(view.queryByText(/假数据|mock moment/i)).toBeNull();
  });

  it('hides 家庭 when an auth URL is set but the product entry is closed', async () => {
    process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL = 'https://family.example.com';
    delete process.env.EXPO_PUBLIC_FAMILY_ENTRY_OPEN;
    const view = await render(wrap(<RecentScreen />));
    await waitFor(() => {
      expect(view.getByText('这里，留下自己的生活。')).toBeTruthy();
    });
    expect(view.queryByTestId('home-family')).toBeNull();
    expect(view.getByTestId('home-account')).toBeTruthy();
  });

  it('shows 家庭 only when the product entry is open', async () => {
    process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL = 'https://family.example.com';
    process.env.EXPO_PUBLIC_FAMILY_ENTRY_OPEN = '1';
    const view = await render(wrap(<RecentScreen />));
    await waitFor(() => {
      expect(view.getByText('这里，留下自己的生活。')).toBeTruthy();
    });
    expect(view.getByTestId('home-family')).toBeTruthy();
    expect(view.getByTestId('home-account')).toBeTruthy();
  });
});
