import { render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import MomentDetailScreen from '../app/moment/[id]';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'moment_with_photo' }),
}));

jest.mock('../application/container', () => ({
  getUseCases: async () => ({
    getMomentDetail: async () => ({
      kind: 'ready',
      id: 'moment_with_photo',
      note: '字还在',
      dateLabel: '记录于 9月24日',
      precision: 'unknown',
      usedRecordedAtFallback: true,
      sourceLabel: '你留下的记录',
      images: [
        {
          id: 'asset_missing',
          status: 'unavailable',
          label: '照片 1/1',
          unavailableLabel: '这张照片暂时找不到了，但这条记录还在。',
        },
      ],
      audio: null,
    }),
  }),
}));

describe('moment detail missing image', () => {
  it('keeps the moment and shows the unavailable photo in place', async () => {
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
    expect(view.getByText('这张照片暂时找不到了，但这条记录还在。')).toBeTruthy();
    expect(view.queryByText('这条记录现在无法找到。')).toBeNull();
    expect(view.getByLabelText('照片 1/1。这张照片暂时找不到了，但这条记录还在。')).toBeTruthy();
  });
});
