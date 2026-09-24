import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import LeaveScreen from '../app/leave';
import { ApplicationError } from '../application/errors';

const mockAddLibraryImages = jest.fn();
const mockRestore = jest.fn();
const mockSaveTextMoment = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('../application/container', () => ({
  getUseCases: async () => ({
    restoreOrCreateDraft: mockRestore,
    updateDraftNote: async () => undefined,
    addLibraryImages: mockAddLibraryImages,
    addCameraImage: async () => undefined,
    saveTextMoment: mockSaveTextMoment,
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
  audio: null,
};

describe('leave image actions', () => {
  beforeEach(() => {
    mockRestore.mockReset();
    mockAddLibraryImages.mockReset();
    mockSaveTextMoment.mockReset();
    mockRestore.mockResolvedValue(emptyDraft);
    mockSaveTextMoment.mockResolvedValue({ id: 'moment_draft' });
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

  it('does not save while a photo pick is still in progress', async () => {
    let finishPick: (value: {
      draftId: string;
      note: string;
      isRestored: boolean;
      images: [];
      audio: null;
    }) => void =
      () => undefined;
    mockAddLibraryImages.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishPick = resolve;
        }),
    );

    const view = await render(wrap());
    await waitFor(() => {
      expect(view.getByDisplayValue('还可以写字')).toBeTruthy();
    });
    fireEvent.press(view.getByTestId('composer-library'));
    await waitFor(() => {
      expect(view.getByText('正在加入照片…')).toBeTruthy();
    });
    fireEvent.press(view.getByTestId('composer-save'));
    fireEvent.press(view.getByTestId('composer-camera'));
    expect(mockSaveTextMoment).not.toHaveBeenCalled();
    expect(view.getByTestId('composer-save')).toBeDisabled();
    expect(view.getByTestId('composer-camera')).toBeDisabled();

    finishPick({
      draftId: 'moment_draft',
      note: '还可以写字',
      isRestored: true,
      images: [],
      audio: null,
    });
    await waitFor(() => {
      expect(view.getByText('留下')).toBeTruthy();
    });
    expect(mockSaveTextMoment).not.toHaveBeenCalled();
  });
});
