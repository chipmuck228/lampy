import { render, waitFor, within } from '@testing-library/react-native';
import { Dimensions } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import MomentDetailScreen from '../app/moment/[id]';
import { isFamilyProductEntryOpen } from '../infrastructure/family-config';

Dimensions.set({
  window: { width: 390, height: 844, scale: 3, fontScale: 1 },
  screen: { width: 390, height: 844, scale: 3, fontScale: 1 },
});

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'moment_mixed' }),
}));

jest.mock('../application/container', () => ({
  getUseCases: async () => ({
    getMomentDetail: async () => ({
      kind: 'ready',
      id: 'moment_mixed',
      note: '门口的风还在。',
      dateLabel: '2026年9月24日 08:15',
      precision: 'exact',
      usedRecordedAtFallback: false,
      sourceLabel: '你留下的记录',
      feeling: { value: '平静', label: '平静', known: true },
      images: [
        {
          id: 'asset_one',
          status: 'available',
          uri: 'memory://assets/asset_one.jpg',
          width: 1200,
          height: 1600,
          label: '照片 1/3',
        },
        {
          id: 'asset_two',
          status: 'available',
          uri: 'memory://assets/asset_two.jpg',
          width: 900,
          height: 1200,
          label: '照片 2/3',
        },
        {
          id: 'asset_three',
          status: 'available',
          uri: 'memory://assets/asset_three.jpg',
          width: 800,
          height: 1100,
          label: '照片 3/3',
        },
      ],
      audio: {
        id: 'asset_voice',
        status: 'available',
        uri: 'memory://assets/asset_voice.m4a',
        durationMs: 3500,
        durationLabel: '4秒',
        label: '当时的声音',
      },
      unknownMedia: [],
    }),
  }),
}));

jest.mock('../infrastructure/family-config', () => ({
  isFamilyProductEntryOpen: jest.fn(() => true),
}));

jest.mock('./use-sound-player', () => ({
  useSoundPlayer: () => ({
    status: 'idle',
    currentTimeMs: 0,
    failed: false,
    play: async () => undefined,
    pause: async () => undefined,
    stop: async () => undefined,
  }),
}));

describe('moment detail hierarchy', () => {
  afterEach(() => {
    Dimensions.set({
      window: { width: 390, height: 844, scale: 3, fontScale: 1 },
      screen: { width: 390, height: 844, scale: 3, fontScale: 1 },
    });
  });

  it('keeps date as the entry, pairs the last portraits, and treats sound as a scene', async () => {
    jest.mocked(isFamilyProductEntryOpen).mockReturnValue(true);
    const view = await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, left: 0, right: 0, bottom: 34 },
        }}
      >
        <MomentDetailScreen />
      </SafeAreaProvider>,
    );

    await waitFor(() => {
      expect(view.getByTestId('detail-note')).toBeTruthy();
    });

    expect(view.getByText('2026年9月24日 08:15')).toBeTruthy();
    expect(view.getByTestId('detail-precision').props.children).toBe('记下了当时的时刻');
    expect(within(view.getByTestId('detail-scroll')).queryByLabelText('返回原来的位置')).toBeNull();
    expect(view.getByTestId('detail-image-band-pair')).toBeTruthy();
    expect(view.getByTestId('detail-sound-scene-asset_voice').props.children).toBe('当时的声音');
    expect(view.getByText('一段声音 · 4秒')).toBeTruthy();
    expect(view.getByText('当时的感受 · 平静')).toBeTruthy();
    expect(view.getByText('你留下的记录')).toBeTruthy();
    expect(view.getByLabelText('分享给家里')).toBeTruthy();
  });

  it('keeps the reading column at 520 on a regular-width page', async () => {
    Dimensions.set({
      window: { width: 1024, height: 1366, scale: 2, fontScale: 1 },
      screen: { width: 1024, height: 1366, scale: 2, fontScale: 1 },
    });
    const view = await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 1024, height: 1366 },
          insets: { top: 24, left: 0, right: 0, bottom: 20 },
        }}
      >
        <MomentDetailScreen />
      </SafeAreaProvider>,
    );
    await waitFor(() => {
      expect(view.getByTestId('detail-note')).toBeTruthy();
    });
    expect(view.getByTestId('detail-scroll').props.contentContainerStyle).toEqual(
      expect.arrayContaining([expect.objectContaining({ maxWidth: 616, paddingHorizontal: 48 })]),
    );
  });
});
