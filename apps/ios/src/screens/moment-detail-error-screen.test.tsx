import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import MomentDetailScreen from '../app/moment/[id]';

const mockGetMomentDetail = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'moment_unreadable' }),
}));

jest.mock('../application/container', () => ({
  getUseCases: async () => ({
    getMomentDetail: mockGetMomentDetail,
  }),
}));

describe('moment detail read error', () => {
  it('offers a retry instead of saying the record is missing', async () => {
    mockGetMomentDetail.mockRejectedValueOnce(new Error('disk read failed'));
    mockGetMomentDetail.mockResolvedValueOnce({
      kind: 'ready',
      id: 'moment_unreadable',
      note: '还在',
      dateLabel: '记录于 9月24日',
      precision: 'unknown',
      usedRecordedAtFallback: true,
      sourceLabel: '你留下的记录',
      images: [],
      audio: null,
    });

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
      expect(view.getByText('这条记录暂时读不出来。')).toBeTruthy();
    });
    expect(view.getByText('原来的内容还在，可以再试。没有把它当成已经丢失。')).toBeTruthy();
    expect(view.queryByText('这条记录现在无法找到。')).toBeNull();

    fireEvent.press(view.getByLabelText('再试一次'));
    await waitFor(() => {
      expect(view.getByText('还在')).toBeTruthy();
    });
    expect(mockGetMomentDetail).toHaveBeenCalledTimes(2);
  });
});
