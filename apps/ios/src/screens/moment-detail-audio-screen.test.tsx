import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import MomentDetailScreen from '../app/moment/[id]';

const mockPlay = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'moment_with_sound' }),
}));

jest.mock('../application/container', () => ({
  getUseCases: async () => ({
    getMomentDetail: async () => ({
      kind: 'ready',
      id: 'moment_with_sound',
      note: '字还在',
      dateLabel: '记录于 9月24日',
      precision: 'unknown',
      usedRecordedAtFallback: true,
      sourceLabel: '你留下的记录',
      images: [
        {
          id: 'asset_photo',
          status: 'available',
          uri: 'memory://assets/asset_photo.jpg',
          width: 800,
          height: 600,
          label: '照片 1/1',
        },
      ],
      audio: {
        id: 'asset_voice',
        status: 'unavailable',
        durationMs: 3500,
        durationLabel: '4秒',
        label: '当时的声音',
        unavailableLabel: '这段声音暂时无法播放，其他内容仍然保留。',
      },
    }),
  }),
}));

jest.mock('./use-sound-player', () => ({
  useSoundPlayer: () => ({
    status: 'unavailable',
    currentTimeMs: 0,
    failed: true,
    play: mockPlay,
    pause: async () => undefined,
    stop: async () => undefined,
  }),
}));

describe('moment detail missing audio', () => {
  it('keeps the moment and shows the unavailable sound in place', async () => {
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
      expect(view.getByText('字还在')).toBeTruthy();
    });
    expect(view.getByText('这段声音暂时无法播放，其他内容仍然保留。')).toBeTruthy();
    expect(view.getByLabelText('照片 1/1')).toBeTruthy();
    expect(view.queryByText('这条记录现在无法找到。')).toBeNull();
    fireEvent.press(view.getByText('这段声音暂时无法播放，其他内容仍然保留。'));
    expect(mockPlay).not.toHaveBeenCalled();
  });
});
