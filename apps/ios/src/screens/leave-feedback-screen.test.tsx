import { fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import LeaveScreen from '../app/leave';
import { ApplicationError } from '../application/errors';

const mockRestore = jest.fn();
const mockAddLibraryImages = jest.fn();
const mockSaveTextMoment = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissTo: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  writeAsStringAsync: jest.fn(async () => undefined),
}));

jest.mock('../application/container', () => ({
  getUseCases: async () => ({
    restoreOrCreateDraft: mockRestore,
    updateDraftNote: async () => undefined,
    updateDraftEmotion: async () => undefined,
    updateDraftOccurred: async () => undefined,
    addLibraryImages: mockAddLibraryImages,
    addCameraImage: async () => undefined,
    saveTextMoment: mockSaveTextMoment,
  }),
}));

const LONG_NOTE =
  '门口的风还在。这一句故意写得很长，好确认三张照片和保存失败时，底栏的说明仍挨着留下按钮。'.repeat(6);

const threePhotos = [
  {
    id: 'asset_one',
    status: 'available' as const,
    uri: 'memory://assets/asset_one.jpg',
    width: 1200,
    height: 1600,
    label: '照片 1/3',
  },
  {
    id: 'asset_two',
    status: 'available' as const,
    uri: 'memory://assets/asset_two.jpg',
    width: 900,
    height: 1200,
    label: '照片 2/3',
  },
  {
    id: 'asset_three',
    status: 'unavailable' as const,
    label: '照片 3/3',
    unavailableLabel: '这张照片暂时找不到了，但这条记录还在。',
  },
];

function wrap(height = 844) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <LeaveScreen />
    </SafeAreaProvider>
  );
}

const longDraft = {
  draftId: 'moment_draft',
  note: LONG_NOTE,
  isRestored: true,
  images: threePhotos,
  audio: null,
};

describe('leave action feedback stays with the save band', () => {
  beforeEach(() => {
    mockRestore.mockReset();
    mockAddLibraryImages.mockReset();
    mockSaveTextMoment.mockReset();
    mockRestore.mockResolvedValue(longDraft);
    mockSaveTextMoment.mockResolvedValue({ id: 'moment_draft' });
  });

  it('shows a save failure next to 留下 after a long note and three photos', async () => {
    mockSaveTextMoment.mockRejectedValueOnce(
      new ApplicationError('REPOSITORY_WRITE_FAILED', '这次没有留下正式记录。草稿还在，可以再试。'),
    );
    const view = await render(wrap());
    await waitFor(() => {
      expect(view.getByLabelText('照片 1/3')).toBeTruthy();
    });
    expect(view.getByLabelText('照片 3/3。这张照片暂时找不到了，但这条记录还在。')).toBeTruthy();
    expect(view.getByDisplayValue(LONG_NOTE)).toBeTruthy();
    fireEvent.press(view.getByTestId('composer-save'));
    await waitFor(() => {
      expect(view.getByTestId('composer-feedback')).toBeTruthy();
    });
    const band = view.getByTestId('composer-action-band');
    expect(within(band).getByText('这次没有留下正式记录。草稿还在，可以再试。')).toBeTruthy();
    expect(within(band).getByTestId('composer-save')).toBeEnabled();
    expect(view.getByDisplayValue(LONG_NOTE)).toBeTruthy();
    expect(view.getByLabelText('照片 1/3')).toBeTruthy();
  });

  it('keeps a media failure in the same band so 拍摄 and 照片 stay readable', async () => {
    mockAddLibraryImages.mockRejectedValueOnce(
      new ApplicationError(
        'DISK_FULL',
        '这台设备空间不够，这张照片没有留下。已经写的字和已留下的内容还在草稿里，可以清出空间后再试。',
      ),
    );
    const view = await render(wrap());
    await waitFor(() => {
      expect(view.getByLabelText('照片 2/3')).toBeTruthy();
    });
    fireEvent.press(view.getByTestId('composer-library'));
    await waitFor(() => {
      expect(view.getByTestId('composer-feedback')).toBeTruthy();
    });
    const band = view.getByTestId('composer-action-band');
    expect(
      within(band).getByText(
        '这台设备空间不够，这张照片没有留下。已经写的字和已留下的内容还在草稿里，可以清出空间后再试。',
      ),
    ).toBeTruthy();
    expect(within(band).getByLabelText('照片')).toBeEnabled();
    expect(within(band).getByLabelText('拍摄')).toBeEnabled();
    expect(view.getByDisplayValue(LONG_NOTE)).toBeTruthy();
  });

  it('still pins the failure above 留下 when the viewport is short like a keyboard', async () => {
    mockSaveTextMoment
      .mockRejectedValueOnce(new ApplicationError('DISK_FULL', '这次没有留下正式记录。草稿还在，可以再试。'))
      .mockResolvedValueOnce({ id: 'moment_draft' });
    const view = await render(wrap(420));
    await waitFor(() => {
      expect(view.getByTestId('composer-save')).toBeTruthy();
    });
    fireEvent.press(view.getByTestId('composer-save'));
    await waitFor(() => {
      expect(within(view.getByTestId('composer-action-band')).getByTestId('composer-feedback')).toBeTruthy();
    });
    expect(view.getByDisplayValue(LONG_NOTE)).toBeTruthy();
    fireEvent.press(view.getByTestId('composer-save'));
    await waitFor(() => {
      expect(mockSaveTextMoment).toHaveBeenCalledTimes(2);
    });
  });
});
