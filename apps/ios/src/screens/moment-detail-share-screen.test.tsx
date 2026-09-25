import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import MomentDetailScreen from '../app/moment/[id]';
import { isFamilyApiConfigured } from '../infrastructure/family-config';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'moment_gate' }),
}));

jest.mock('../application/container', () => ({
  getUseCases: async () => ({
    getMomentDetail: async () => ({
      kind: 'ready',
      id: 'moment_gate',
      note: '门口的风',
      dateLabel: '记录于 9月25日',
      precision: 'unknown',
      usedRecordedAtFallback: true,
      sourceLabel: '你留下的记录',
      images: [],
      audio: null,
    }),
  }),
}));

jest.mock('../infrastructure/family-config', () => ({
  isFamilyApiConfigured: jest.fn(() => false),
}));

describe('moment detail share entry', () => {
  beforeEach(() => {
    mockPush.mockReset();
    jest.mocked(isFamilyApiConfigured).mockReturnValue(false);
  });

  it('does not show a share entry when the family API is not configured', async () => {
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
      expect(view.getByText('门口的风')).toBeTruthy();
    });
    expect(view.queryByLabelText('分享给家里')).toBeNull();
  });

  it('opens the confirm route from personal detail when the family API is configured', async () => {
    jest.mocked(isFamilyApiConfigured).mockReturnValue(true);
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
      expect(view.getByLabelText('分享给家里')).toBeTruthy();
    });
    fireEvent.press(view.getByLabelText('分享给家里'));
    expect(mockPush).toHaveBeenCalledWith('/share/moment_gate');
  });
});
