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

function styleOf(node: { props: { style?: unknown } }): { minHeight?: number; flexDirection?: string; alignItems?: string } {
  return (StyleSheet.flatten(node.props.style as object) ?? {}) as {
    minHeight?: number;
    flexDirection?: string;
    alignItems?: string;
  };
}

function minHeightOf(node: { props: { style?: unknown } }): number {
  const minHeight = styleOf(node).minHeight;
  return typeof minHeight === 'number' ? minHeight : 0;
}

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

function expectBefore(ids: string[], earlier: string, later: string) {
  const left = ids.indexOf(earlier);
  const right = ids.indexOf(later);
  expect(`${earlier}@${left}`).not.toBe(`${earlier}@-1`);
  expect(`${later}@${right}`).not.toBe(`${later}@-1`);
  expect(left).toBeLessThan(right);
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

function mixedReadingOrder() {
  return {
    ...mixed(),
    id: 'moment_order',
    feeling: { value: '平静', label: '平静', known: true },
    images: [
      ...mixed().images,
      {
        id: 'asset_gone',
        status: 'unavailable' as const,
        label: '照片 2/2',
        unavailableLabel: '这张照片暂时找不到了，但这条记录还在。',
        width: 800,
        height: 600,
      },
    ],
    unknownMedia: [
      {
        id: 'asset_unknown',
        status: 'unavailable' as const,
        label: '这段内容',
        unavailableLabel: '这段内容这次打不开，其他内容仍然保留。',
      },
    ],
  };
}

function missingSound() {
  return {
    ...mixedReadingOrder(),
    id: 'moment_missing_sound',
    audio: {
      id: 'asset_voice',
      status: 'unavailable' as const,
      durationMs: 0,
      durationLabel: '',
      label: '当时的声音',
      unavailableLabel: '这段声音暂时无法播放，其他内容仍然保留。',
    },
  };
}

function life(
  ...items: (ReturnType<typeof mixed> | ReturnType<typeof mixedReadingOrder> | ReturnType<typeof missingSound>)[]
) {
  return {
    isFirstUse: false,
    items,
    days: [{ key: items[0].dayKey, label: items[0].dateLabel, items }],
  };
}

describe('recent reading hierarchy', () => {
  beforeEach(() => {
    mockGetRecentLife.mockReset();
    mockPush.mockReset();
    resetStartupBrandForTests();
    delete process.env.EXPO_PUBLIC_FAMILY_ENTRY_OPEN;
  });

  it('treats mixed sound as its own scene, not a caption under the photos', async () => {
    mockGetRecentLife.mockResolvedValue(life(mixed(), voiceOnly()));
    const view = await render(wrap(<RecentScreen />));
    await waitFor(() => {
      expect(view.getByText('门口的风')).toBeTruthy();
    });
    expect(view.getByTestId('recent-sound-moment_mix-scene-asset_voice').props.children).toBe('当时的声音');
    expect(view.getByTestId('recent-sound-moment_mix-progress-asset_voice')).toBeTruthy();
    expect(view.getAllByText('一段声音 · 4秒').length).toBeGreaterThanOrEqual(1);
    expect(view.getAllByText('0:00 / 0:04').length).toBeGreaterThanOrEqual(2);
    expect(view.getAllByLabelText('播放，4秒')).toHaveLength(2);
    expect(view.getAllByTestId(/recent-sound-.*-mark-asset_voice/).length).toBeGreaterThanOrEqual(2);
    expect(view.getByTestId('recent-image-pause-moment_mix')).toBeTruthy();
    expect(view.getByTestId('recent-open-label-moment_mix').props.children).toBe('阅读完整记录');
    expect(view.queryByTestId('recent-sound-moment_voice-scene-asset_voice')).toBeNull();
    expect(view.getByTestId('recent-sound-moment_voice-progress-asset_voice')).toBeTruthy();
    expect(view.getByTestId('recent-open-label-moment_voice').props.children).toBe('阅读完整记录');
    expect(view.queryByTestId('recent-day-rule-moment_mix')).toBeNull();
    expect(view.getByTestId('recent-day-rule-moment_voice')).toBeTruthy();
    expectBefore(testIdsInTree(view.getByTestId('recent-item-moment_voice')), 'recent-sound-moment_voice-play-asset_voice', 'recent-open-label-moment_voice');
    expect(minHeightOf(view.getByTestId('recent-leave-fab'))).toBeGreaterThanOrEqual(48);
    expect(minHeightOf(view.getByTestId('home-lookback'))).toBeGreaterThanOrEqual(48);
    expect(minHeightOf(view.getByTestId('recent-sound-moment_mix-play-asset_voice'))).toBeGreaterThanOrEqual(48);
    expect(minHeightOf(view.getByTestId('recent-open-moment_mix'))).toBeGreaterThanOrEqual(48);
    expect(styleOf(view.getByTestId('recent-open-label-moment_mix')).minHeight).toBeUndefined();
    expect(styleOf(view.getByTestId('recent-open-row-moment_mix'))).toEqual(
      expect.objectContaining({ flexDirection: 'row', alignItems: 'center', flexWrap: 'nowrap' }),
    );
    expect(styleOf(view.getByTestId('recent-open-row-moment_mix')).minHeight).toBeUndefined();
    expect(view.getByTestId('recent-open-mark-moment_mix').props.accessible).toBe(false);
    expect(view.getByTestId('recent-open-moment_mix').props.accessibilityLabel).toContain('阅读完整记录');
    expect(view.getByTestId('recent-open-moment_mix').props.accessibilityLabel).not.toContain('›');
    expect(view.queryByTestId('home-family')).toBeNull();
    expect(view.getByTestId('home-account')).toBeTruthy();
    expect(view.getByLabelText('本机设置')).toBeTruthy();
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

  it('renders mixed records as body, then sound, then feeling, then 阅读完整记录', async () => {
    mockGetRecentLife.mockResolvedValue(life(mixedReadingOrder(), missingSound()));
    const view = await render(wrap(<RecentScreen />));
    await waitFor(() => {
      expect(view.getByTestId('recent-item-moment_order')).toBeTruthy();
    });
    const ids = testIdsInTree(view.getByTestId('recent-item-moment_order'));
    expectBefore(ids, 'recent-note-moment_order', 'recent-image-moment_order-frame-asset_pic');
    expectBefore(ids, 'recent-image-moment_order-frame-asset_pic', 'recent-image-moment_order-unavailable-asset_gone');
    expectBefore(ids, 'recent-image-moment_order-unavailable-asset_gone', 'recent-unknown-moment_order-unavailable-asset_unknown');
    expectBefore(ids, 'recent-unknown-moment_order-unavailable-asset_unknown', 'recent-sound-moment_order-play-asset_voice');
    expectBefore(ids, 'recent-sound-moment_order-play-asset_voice', 'recent-sound-moment_order-scene-asset_voice');
    expectBefore(ids, 'recent-sound-moment_order-scene-asset_voice', 'recent-feeling-moment_order');
    expectBefore(ids, 'recent-feeling-moment_order', 'recent-open-label-moment_order');
    expect(view.getAllByText('平静')).toHaveLength(2);
    expect(view.getAllByText('这段内容这次打不开，其他内容仍然保留。')).toHaveLength(2);
    const missing = testIdsInTree(view.getByTestId('recent-item-moment_missing_sound'));
    expectBefore(missing, 'recent-unknown-moment_missing_sound-unavailable-asset_unknown', 'recent-sound-moment_missing_sound-unavailable-asset_voice');
    expectBefore(missing, 'recent-sound-moment_missing_sound-unavailable-asset_voice', 'recent-feeling-moment_missing_sound');
    expectBefore(missing, 'recent-feeling-moment_missing_sound', 'recent-open-label-moment_missing_sound');
    expect(view.getByText('这段声音暂时无法播放，其他内容仍然保留。')).toBeTruthy();
    expect(view.getAllByText('这张照片暂时找不到了，但这条记录还在。')).toHaveLength(2);
  });
});
