import { render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import MomentDetailScreen from '../app/moment/[id]';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'moment_with_unknown' }),
}));

jest.mock('../application/container', () => ({
  getUseCases: async () => ({
    getMomentDetail: async () => ({
      kind: 'ready',
      id: 'moment_with_unknown',
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
      audio: null,
      unknownMedia: [
        {
          id: 'asset_1727182800000_abc12xyz',
          status: 'unavailable',
          label: '这份内容',
          unavailableLabel: '这份内容暂时无法打开。',
        },
      ],
    }),
  }),
}));

describe('moment detail unknown media', () => {
  it('keeps the moment and shows a neutral placeholder instead of a photo', async () => {
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
    expect(view.getByText('这份内容暂时无法打开。')).toBeTruthy();
    expect(view.getByLabelText('照片 1/1')).toBeTruthy();
    expect(view.queryByText('照片 2/2')).toBeNull();
    expect(view.queryByText('这条记录现在无法找到。')).toBeNull();
  });
});
