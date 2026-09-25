import type { ReactElement } from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import RecentScreen from '../app/index';
import MomentDetailScreen from '../app/moment/[id]';
import { MomentFeeling } from './moment-feeling';

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require('react');
  return {
    useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
    useFocusEffect: (effect: () => void | (() => void)) => {
      useEffect(effect, [effect]);
    },
    useLocalSearchParams: () => ({ id: 'moment_ready' }),
  };
});

const mockGetRecentLife = jest.fn();
const mockGetMomentDetail = jest.fn();

jest.mock('../application/container', () => ({
  getUseCases: async () => ({
    getRecentLife: mockGetRecentLife,
    getMomentDetail: mockGetMomentDetail,
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

describe('feeling display', () => {
  beforeEach(() => {
    mockGetRecentLife.mockReset();
    mockGetMomentDetail.mockReset();
  });

  it('keeps feeling secondary to the note', async () => {
    const view = await render(
      <MomentFeeling feeling={{ value: '高兴', label: '高兴', known: true }} testID="feeling" />,
    );
    expect(view.getByText('当时的感受 · 高兴')).toBeTruthy();
    expect(view.getByLabelText('当时的感受，高兴')).toBeTruthy();
  });

  it('shows an unknown stored value on recent and detail', async () => {
    mockGetRecentLife.mockResolvedValue({
      isFirstUse: false,
      items: [
        {
          id: 'moment_ready',
          note: '旧词还在',
          recordedAt: '2026-09-24T12:00:00.000Z',
          dateLabel: '9月24日',
          feeling: { value: '喜悦', label: '喜悦', known: false },
          images: [],
          audio: null,
          unknownMedia: [],
        },
      ],
    });
    mockGetMomentDetail.mockResolvedValue({
      kind: 'ready',
      id: 'moment_ready',
      note: '旧词还在',
      dateLabel: '9月24日',
      precision: 'unknown',
      usedRecordedAtFallback: true,
      feeling: { value: '喜悦', label: '喜悦', known: false },
      sourceLabel: '你留下的记录',
      images: [],
      audio: null,
      unknownMedia: [],
    });

    const recent = await render(wrap(<RecentScreen />));
    await waitFor(() => {
      expect(recent.getByText('当时的感受 · 喜悦')).toBeTruthy();
    });
    expect(recent.getByText('旧词还在')).toBeTruthy();

    const detail = await render(wrap(<MomentDetailScreen />));
    await waitFor(() => {
      expect(detail.getByText('当时的感受 · 喜悦')).toBeTruthy();
    });
    expect(detail.getByTestId('detail-note').props.children).toBe('旧词还在');
  });

  it('hides feeling when none was chosen', async () => {
    mockGetRecentLife.mockResolvedValue({
      isFirstUse: false,
      items: [
        {
          id: 'moment_plain',
          note: '只写字',
          recordedAt: '2026-09-24T12:00:00.000Z',
          dateLabel: '9月24日',
          feeling: null,
          images: [],
          audio: null,
          unknownMedia: [],
        },
      ],
    });
    const recent = await render(wrap(<RecentScreen />));
    await waitFor(() => {
      expect(recent.getByText('只写字')).toBeTruthy();
    });
    expect(recent.queryByLabelText(/当时的感受/)).toBeNull();
  });
});
