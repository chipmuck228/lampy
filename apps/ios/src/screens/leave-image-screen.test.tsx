import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import LeaveScreen from '../app/leave';
import { ApplicationError } from '../application/errors';

const mockAddLibraryImages = jest.fn();
const mockRestore = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('../application/container', () => ({
  getUseCases: async () => ({
    restoreOrCreateDraft: mockRestore,
    updateDraftNote: async () => undefined,
    addLibraryImages: mockAddLibraryImages,
    addCameraImage: async () => undefined,
    saveTextMoment: async () => ({ id: 'moment_draft' }),
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
      <LeaveScreen />
    </SafeAreaProvider>
  );
}

const emptyDraft = {
  draftId: 'moment_draft',
  note: '还可以写字',
  isRestored: true,
  images: [],
};

describe('leave image actions', () => {
  beforeEach(() => {
    mockRestore.mockReset();
    mockAddLibraryImages.mockReset();
    mockRestore.mockResolvedValue(emptyDraft);
  });

  it('shows the three-photo limit and does not lose the draft', async () => {
    mockAddLibraryImages.mockRejectedValueOnce(new ApplicationError('IMAGE_LIMIT', '每条最多三张照片'));
    mockRestore
      .mockResolvedValueOnce(emptyDraft)
      .mockResolvedValueOnce({
        ...emptyDraft,
        images: [
          {
            id: 'asset_1',
            status: 'available',
            uri: 'memory://assets/asset_1.jpg',
            width: 800,
            height: 600,
            label: '照片 1/3',
          },
          {
            id: 'asset_2',
            status: 'available',
            uri: 'memory://assets/asset_2.jpg',
            width: 400,
            height: 800,
            label: '照片 2/3',
          },
          {
            id: 'asset_3',
            status: 'available',
            uri: 'memory://assets/asset_3.jpg',
            width: 1200,
            height: 800,
            label: '照片 3/3',
          },
        ],
      });

    const view = await render(wrap());
    await waitFor(() => {
      expect(view.getByDisplayValue('还可以写字')).toBeTruthy();
    });
    fireEvent.press(view.getByTestId('composer-library'));
    await waitFor(() => {
      expect(view.getByText('每条最多三张照片')).toBeTruthy();
    });
    expect(view.getByDisplayValue('还可以写字')).toBeTruthy();
    expect(view.getByLabelText('照片 1/3')).toBeTruthy();
  });

  it('keeps the written words after the album permission is refused', async () => {
    mockAddLibraryImages.mockRejectedValueOnce(
      new ApplicationError('LIBRARY_DENIED', '没有打开相册。还可以写字，草稿还在。'),
    );

    const view = await render(wrap());
    await waitFor(() => {
      expect(view.getByDisplayValue('还可以写字')).toBeTruthy();
    });
    fireEvent.press(view.getByTestId('composer-library'));
    await waitFor(() => {
      expect(view.getByText('没有打开相册。还可以写字，草稿还在。')).toBeTruthy();
    });
    expect(view.getByDisplayValue('还可以写字')).toBeTruthy();
  });
});
