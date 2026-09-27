import { render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import MomentDetailScreen from '../app/moment/[id]';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'moment_long' }),
}));

jest.mock('../application/container', () => ({
  getUseCases: async () => ({
    getMomentDetail: async () => ({
      kind: 'ready',
      id: 'moment_long',
      note: '门口的风还在。这一句故意写得很长，好确认三张照片、声音提示和来源说明都能排在标题下面，并且可以滚到最后。'.repeat(
        6,
      ),
      dateLabel: '2026年9月24日',
      precision: 'day',
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
          status: 'unavailable',
          label: '照片 2/3',
          unavailableLabel: '这张照片暂时找不到了，但这条记录还在。',
        },
        {
          id: 'asset_three',
          status: 'available',
          uri: 'memory://assets/asset_three.jpg',
          width: 900,
          height: 1600,
          label: '照片 3/3',
        },
      ],
      audio: {
        id: 'asset_voice',
        status: 'unavailable',
        durationMs: 2400,
        durationLabel: '3秒',
        label: '当时的声音',
        unavailableLabel: '这段声音暂时找不到了，其他内容仍然保留。',
        reason: 'missing',
      },
      unknownMedia: [],
    }),
  }),
}));

describe('moment detail long layout', () => {
  it('puts the page in a scroll view so the last source line stays reachable', async () => {
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
    expect(view.getByTestId('detail-scroll')).toBeTruthy();
    expect(view.getByLabelText('返回原来的位置')).toBeTruthy();
    expect(view.getByText('2026年9月24日')).toBeTruthy();
    expect(view.getByLabelText('照片 1/3')).toBeTruthy();
    expect(view.getByText('这张照片暂时找不到了，但这条记录还在。')).toBeTruthy();
    expect(view.getByLabelText('照片 3/3')).toBeTruthy();
    expect(view.getByText('这段声音暂时找不到了，其他内容仍然保留。')).toBeTruthy();
    expect(view.getByText('当时的感受 · 平静')).toBeTruthy();
    expect(view.getByText('你留下的记录')).toBeTruthy();
    expect(view.getByTestId('detail-image-frame-asset_one').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ aspectRatio: 0.75 })]),
    );
  });
});
