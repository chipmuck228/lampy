import type { ReactElement } from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { resetStartupBrandForTests } from '../application/startup-brand';
import RecentScreen from '../app/index';

const mockPush = jest.fn();

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require('react');
  return {
    useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
    useFocusEffect: (effect: () => void | (() => void)) => {
      useEffect(effect, [effect]);
    },
  };
});

const mockGetRecentLife = jest.fn();

jest.mock('../application/container', () => ({
  getUseCases: async () => ({
    getRecentLife: mockGetRecentLife,
  }),
}));

function minHeightOf(node: { props: { style?: unknown } }): number {
  const flat = (StyleSheet.flatten(node.props.style as object) ?? {}) as { minHeight?: number };
  return typeof flat.minHeight === 'number' ? flat.minHeight : 0;
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

function mixed() {
  return {
    id: 'moment_mix',
    note: '门口的风',
    recordedAt: new Date(2026, 8, 27, 10).toISOString(),
    dayKey: '2026-09-27',
    dayLabel: '9月27日',
    dateLabel: '记录于 9月27日',
    occurredLabel: null,
    feeling: null,
    images: [
      {
        id: 'asset_pic',
        status: 'available' as const,
        uri: 'memory://p.jpg',
        label: '照片 1/1',
        width: 800,
        height: 600,
      },
    ],
    audio: {
      id: 'asset_voice',
      status: 'available' as const,
      uri: 'file://a.m4a',
      durationMs: 3500,
      durationLabel: '4秒',
      label: '当时的声音',
    },
    unknownMedia: [],
  };
}

function voiceOnly() {
  return {
    ...mixed(),
    id: 'moment_voice',
    note: '',
    images: [],
  };
}

function life(item: ReturnType<typeof mixed>) {
  return {
    isFirstUse: false,
    items: [item],
    days: [{ key: item.dayKey, label: item.dateLabel, items: [item] }],
  };
}

describe('recent reading hierarchy', () => {
  beforeEach(() => {
    mockGetRecentLife.mockReset();
    mockPush.mockReset();
    resetStartupBrandForTests();
  });

  it('treats mixed sound as its own scene, not a caption under the photos', async () => {
    mockGetRecentLife.mockResolvedValue(life(mixed()));
    const view = await render(wrap(<RecentScreen />));
    await waitFor(() => {
      expect(view.getByText('门口的风')).toBeTruthy();
    });
    expect(view.getByTestId('recent-sound-moment_mix-scene-asset_voice').props.children).toBe('当时的声音');
    expect(view.getByTestId('recent-sound-moment_mix-progress-asset_voice')).toBeTruthy();
    expect(view.getByText('一段声音 · 4秒')).toBeTruthy();
    expect(view.getByLabelText('播放，4秒')).toBeTruthy();
    expect(view.getByTestId('recent-open-label-moment_mix').props.children).toBe('看这条');
    expect(minHeightOf(view.getByTestId('home-leave'))).toBeGreaterThanOrEqual(48);
    expect(minHeightOf(view.getByTestId('home-lookback'))).toBeGreaterThanOrEqual(48);
    expect(minHeightOf(view.getByTestId('recent-sound-moment_mix-play-asset_voice'))).toBeGreaterThanOrEqual(48);
    expect(minHeightOf(view.getByTestId('recent-open-moment_mix'))).toBeGreaterThanOrEqual(48);
    expect(minHeightOf(view.getByTestId('recent-open-label-moment_mix'))).toBeGreaterThanOrEqual(48);
    expect(view.queryByTestId('home-family')).toBeNull();
  });

  it('lets play and open stay separate so VoiceOver can reach 播放 without opening the record', async () => {
    mockGetRecentLife.mockResolvedValue(life(mixed()));
    const view = await render(wrap(<RecentScreen />));
    await waitFor(() => {
      expect(view.getByLabelText('播放，4秒')).toBeTruthy();
    });
    fireEvent.press(view.getByLabelText('播放，4秒'));
    expect(mockPush).not.toHaveBeenCalled();
    fireEvent.press(view.getByTestId('recent-open-moment_mix'));
    expect(mockPush).toHaveBeenCalledWith('/moment/moment_mix');
  });

  it('keeps a lone sound compact and still offers 看这条', async () => {
    mockGetRecentLife.mockResolvedValue(life(voiceOnly()));
    const view = await render(wrap(<RecentScreen />));
    await waitFor(() => {
      expect(view.getByLabelText('播放，4秒')).toBeTruthy();
    });
    expect(view.queryByTestId('recent-sound-moment_voice-scene-asset_voice')).toBeNull();
    expect(view.getByTestId('recent-open-label-moment_voice').props.children).toBe('看这条');
    expect(view.getByLabelText(/看这条/)).toBeTruthy();
  });
});
