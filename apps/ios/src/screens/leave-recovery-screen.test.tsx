import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import LeaveScreen from '../app/leave';
import { ApplicationError } from '../application/errors';

const mockAddLibraryImages = jest.fn();
const mockAddCameraImage = jest.fn();
const mockRestore = jest.fn();
const mockSaveTextMoment = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('../application/container', () => ({
  getUseCases: async () => ({
    restoreOrCreateDraft: mockRestore,
    updateDraftNote: async () => undefined,
    updateDraftEmotion: async () => undefined,
    addLibraryImages: mockAddLibraryImages,
    addCameraImage: mockAddCameraImage,
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

describe('leave recovery copy', () => {
  beforeEach(() => {
    mockRestore.mockReset();
    mockAddLibraryImages.mockReset();
    mockAddCameraImage.mockReset();
    mockSaveTextMoment.mockReset();
    mockRestore.mockResolvedValue(emptyDraft);
    mockSaveTextMoment.mockResolvedValue({ id: 'moment_draft' });
  });

  it('explains disk full on a photo without calling the draft saved', async () => {
    mockAddLibraryImages.mockRejectedValueOnce(
      new ApplicationError(
        'DISK_FULL',
        '这台设备空间不够，这张照片没有留下。已经写的字和已留下的内容还在草稿里，可以清出空间后再试。',
      ),
    );

    const view = await render(wrap());
    await waitFor(() => {
      expect(view.getByDisplayValue('还可以写字')).toBeTruthy();
    });
    fireEvent.press(view.getByTestId('composer-library'));
    await waitFor(() => {
      expect(
        view.getByText(
          '这台设备空间不够，这张照片没有留下。已经写的字和已留下的内容还在草稿里，可以清出空间后再试。',
        ),
      ).toBeTruthy();
    });
    expect(view.getByDisplayValue('还可以写字')).toBeTruthy();
    expect(view.queryByText('留下了')).toBeNull();
  });

  it('explains a copy failure and keeps the written words', async () => {
    mockAddLibraryImages.mockRejectedValueOnce(
      new ApplicationError(
        'COPY_FAILED',
        '这张照片没有复制进来。已经写的字和已留下的内容还在草稿里，可以再试。',
      ),
    );

    const view = await render(wrap());
    await waitFor(() => {
      expect(view.getByDisplayValue('还可以写字')).toBeTruthy();
    });
    fireEvent.press(view.getByTestId('composer-library'));
    await waitFor(() => {
      expect(
        view.getByText('这张照片没有复制进来。已经写的字和已留下的内容还在草稿里，可以再试。'),
      ).toBeTruthy();
    });
    expect(view.getByDisplayValue('还可以写字')).toBeTruthy();
  });

  it('explains a formal save write failure without claiming the moment exists', async () => {
    mockSaveTextMoment.mockRejectedValueOnce(
      new ApplicationError('REPOSITORY_WRITE_FAILED', '这次没有留下正式记录。草稿还在，可以再试。'),
    );

    const view = await render(wrap());
    await waitFor(() => {
      expect(view.getByDisplayValue('还可以写字')).toBeTruthy();
    });
    fireEvent.press(view.getByTestId('composer-save'));
    await waitFor(() => {
      expect(view.getByText('这次没有留下正式记录。草稿还在，可以再试。')).toBeTruthy();
    });
    expect(view.getByDisplayValue('还可以写字')).toBeTruthy();
  });

  it('keeps writing after camera permission is refused', async () => {
    mockAddCameraImage.mockRejectedValueOnce(
      new ApplicationError(
        'CAMERA_DENIED',
        '没有打开相机。还可以写字，也可以用其他已允许的方式留下。草稿还在。打开系统设置允许相机后，可以再试。',
      ),
    );

    const view = await render(wrap());
    await waitFor(() => {
      expect(view.getByDisplayValue('还可以写字')).toBeTruthy();
    });
    fireEvent.press(view.getByTestId('composer-camera'));
    await waitFor(() => {
      expect(
        view.getByText(
          '没有打开相机。还可以写字，也可以用其他已允许的方式留下。草稿还在。打开系统设置允许相机后，可以再试。',
        ),
      ).toBeTruthy();
    });
    expect(view.getByDisplayValue('还可以写字')).toBeTruthy();
    expect(view.getByLabelText('照片')).toBeEnabled();
  });
});
