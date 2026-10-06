import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import MomentDetailScreen from '../app/moment/[id]';

const mockCollect = jest.fn();
const mockCreate = jest.fn();
const mockList = jest.fn();
const mockContaining = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'moment_ready' }),
}));

jest.mock('../application/container', () => ({
  getUseCases: async () => ({
    getMomentDetail: async () => ({
      kind: 'ready',
      id: 'moment_ready',
      note: '门口的风',
      dateLabel: '10月3日',
      precision: 'day',
      usedRecordedAtFallback: false,
      feeling: null,
      sourceLabel: '留下',
      images: [],
      audio: null,
      unknownMedia: [],
    }),
    listAlbums: mockList,
    albumIdsContainingMoment: mockContaining,
    createAlbum: mockCreate,
    collectAlbumEntry: mockCollect,
  }),
}));

function wrap() {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <MomentDetailScreen />
    </SafeAreaProvider>
  );
}

describe('moment detail collect menu', () => {
  beforeEach(() => {
    mockList.mockResolvedValue({
      status: 'ready',
      albums: [{ id: 'album_1', name: '一些日子', entryCount: 0, lastCollectedAt: null, lastCollectedLabel: null, cover: { kind: 'words' } }],
    });
    mockContaining.mockResolvedValue(['album_1']);
    mockCreate.mockReset();
    mockCollect.mockReset();
  });

  it('opens the collect sheet and cancels without changing the detail', async () => {
    const view = await render(wrap());
    await waitFor(() => {
      expect(view.getByTestId('detail-note')).toBeTruthy();
    });
    fireEvent.press(view.getByTestId('moment-overflow'));
    await waitFor(() => {
      expect(view.getByTestId('life-album-collect-sheet')).toBeTruthy();
      expect(view.getByLabelText('一些日子，已在此册')).toBeTruthy();
    });
    fireEvent.press(view.getByTestId('life-album-sheet-cancel'));
    await waitFor(() => {
      expect(view.queryByTestId('life-album-collect-sheet')).toBeNull();
    });
    expect(view.getByText('门口的风')).toBeTruthy();
    expect(mockCollect).not.toHaveBeenCalled();
  });
});
