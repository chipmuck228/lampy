import type { ReactElement } from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { resetStartupBrandForTests } from '../application/startup-brand';
import RecentScreen from '../app/index';
import { resetLookbackOriginsForTests } from './lookback-origin';

const mockPush = jest.fn();
const mockGetRecentLife = jest.fn();

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require('react');
  return {
    useRouter: () => ({
      push: mockPush,
      back: jest.fn(),
      replace: jest.fn(),
      dismissTo: jest.fn(),
    }),
    useFocusEffect: (effect: () => void | (() => void)) => {
      useEffect(effect, [effect]);
    },
  };
});

jest.mock('../application/container', () => ({
  getUseCases: async () => ({
    getRecentLife: mockGetRecentLife,
  }),
}));

type HostNode = {
  props?: { testID?: string };
  children?: (HostNode | string)[];
};

function testIdsInTree(node: HostNode): string[] {
  const ids: string[] = [];
  const walk = (current: HostNode | string) => {
    if (typeof current === 'string') return;
    if (typeof current.props?.testID === 'string') ids.push(current.props.testID);
    for (const child of current.children ?? []) walk(child);
  };
  walk(node);
  return ids;
}

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

function sameDayVoiceLast() {
  const first = {
    id: 'moment_noon',
    dayKey: '2026-09-27',
    dateLabel: '记录于 9月27日',
    occurredLabel: null,
    note: '中午的光。',
    feeling: null,
    images: [],
    audio: null,
    unknownMedia: [],
  };
  const last = {
    id: 'moment_wind',
    dayKey: '2026-09-27',
    dateLabel: '记录于 9月27日',
    occurredLabel: null,
    note: '门口的风还在。',
    feeling: null,
    images: [],
    audio: {
      id: 'asset_voice',
      status: 'available' as const,
      uri: 'memory://assets/asset_voice.m4a',
      durationMs: 3000,
      label: '一段声音 · 3秒',
    },
    unknownMedia: [],
  };
  return {
    isFirstUse: false,
    items: [first, last],
    days: [{ key: '2026-09-27', label: '记录于 9月27日', items: [first, last] }],
  };
}

describe('root navigation band', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockGetRecentLife.mockReset();
    resetStartupBrandForTests();
    resetLookbackOriginsForTests();
    Dimensions.set({
      window: { width: 390, height: 844, scale: 2, fontScale: 1 },
      screen: { width: 390, height: 844, scale: 2, fontScale: 1 },
    });
  });

  it('keeps the Recent band outside the scroll so the last play and 看这条 stay in the reading area', async () => {
    mockGetRecentLife.mockResolvedValue(sameDayVoiceLast());
    const view = await render(wrap(<RecentScreen />));
    await waitFor(() => {
      expect(view.getByTestId('recent-open-moment_wind')).toBeTruthy();
    });
    expect(view.getByLabelText('最近，当前页')).toBeTruthy();
    expect(view.getByLabelText('最近，当前页').props.accessibilityRole).toBe('text');
    expect(testIdsInTree(view.getByTestId('recent-scroll') as unknown as HostNode)).not.toContain(
      'root-nav-band',
    );
    expect(view.getByTestId('root-nav-band')).toBeTruthy();
    const contentStyle = StyleSheet.flatten(view.getByTestId('recent-scroll').props.contentContainerStyle);
    expect(contentStyle?.paddingBottom).toBe(88);
    expect(view.getByLabelText('播放，3秒')).toBeTruthy();
    expect(view.getByTestId('recent-open-label-moment_wind').props.children).toBe('阅读完整记录');
    fireEvent.press(view.getByTestId('home-lookback'));
    expect(mockPush).toHaveBeenCalledWith(expect.stringMatching(/^\/lookback\?o=[^&]+$/));
    fireEvent.press(view.getByTestId('recent-leave-fab'));
    expect(mockPush).toHaveBeenCalledWith('/leave?from=recent');
    expect(view.queryByTestId('home-leave')).toBeNull();
    await view.unmount();
  });
});
