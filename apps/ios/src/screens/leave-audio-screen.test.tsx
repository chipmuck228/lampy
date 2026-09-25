import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import LeaveScreen from '../app/leave';
import { ApplicationError } from '../application/errors';

const mockRestore = jest.fn();
const mockBegin = jest.fn();
const mockFinish = jest.fn();
const mockInterrupt = jest.fn();
const mockRemove = jest.fn();
const mockSave = jest.fn();
const mockElapsed = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('../application/container', () => ({
  getUseCases: async () => ({
    restoreOrCreateDraft: mockRestore,
    updateDraftNote: async () => undefined,
    updateDraftEmotion: async () => undefined,
    addLibraryImages: async () => undefined,
    addCameraImage: async () => undefined,
    beginDraftRecording: mockBegin,
    finishDraftRecording: mockFinish,
    interruptDraftRecording: mockInterrupt,
    removeDraftAudio: mockRemove,
    saveTextMoment: mockSave,
    getRecordingElapsedMs: mockElapsed,
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

const recordedDraft = {
  ...emptyDraft,
  audio: {
    id: 'asset_voice',
    status: 'available' as const,
    uri: 'memory://assets/asset_voice.m4a',
    durationMs: 3500,
    durationLabel: '4秒',
    label: '当时的声音',
  },
};

describe('leave audio actions', () => {
  beforeEach(() => {
    mockRestore.mockReset();
    mockBegin.mockReset();
    mockFinish.mockReset();
    mockInterrupt.mockReset();
    mockRemove.mockReset();
    mockSave.mockReset();
    mockElapsed.mockReset();
    mockRestore.mockResolvedValue(emptyDraft);
    mockElapsed.mockReturnValue(1500);
    mockSave.mockResolvedValue({ id: 'moment_draft' });
  });

  it('keeps writing after the microphone is refused', async () => {
    mockBegin.mockRejectedValueOnce(
      new ApplicationError(
        'MIC_DENIED',
        '没有打开麦克风。还可以写字和留下照片，草稿还在。打开系统设置允许麦克风后，可以再试。',
      ),
    );

    const view = await render(wrap());
    await waitFor(() => {
      expect(view.getByDisplayValue('还可以写字')).toBeTruthy();
    });
    fireEvent.press(view.getByTestId('composer-sound'));
    await waitFor(() => {
      expect(
        view.getByText(
          '没有打开麦克风。还可以写字和留下照片，草稿还在。打开系统设置允许麦克风后，可以再试。',
        ),
      ).toBeTruthy();
    });
    expect(view.getByDisplayValue('还可以写字')).toBeTruthy();
    expect(view.getByTestId('composer-note')).toBeTruthy();
    expect(view.getByLabelText('照片')).toBeEnabled();
  });

  it('does not save or pick photos while recording', async () => {
    let finishStart: () => void = () => {};
    mockBegin.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishStart = () => resolve();
        }),
    );

    const view = await render(wrap());
    await waitFor(() => {
      expect(view.getByDisplayValue('还可以写字')).toBeTruthy();
    });
    fireEvent.press(view.getByTestId('composer-sound'));
    await waitFor(() => {
      expect(view.getByText('正在留下这段声音…')).toBeTruthy();
    });
    fireEvent.press(view.getByTestId('composer-save'));
    fireEvent.press(view.getByTestId('composer-library'));
    expect(view.queryByTestId('composer-sound')).toBeNull();
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockBegin).toHaveBeenCalledTimes(1);

    finishStart();
    await waitFor(() => {
      expect(view.getByText(/正在录/)).toBeTruthy();
    });
    expect(view.getByTestId('composer-save')).toBeDisabled();
    expect(view.getByTestId('composer-camera')).toBeDisabled();
  });

  it('keeps the previous sound when rerecord cannot start', async () => {
    mockRestore.mockResolvedValue(recordedDraft);
    mockBegin.mockRejectedValueOnce(
      new ApplicationError(
        'MIC_DENIED',
        '没有打开麦克风。还可以写字和留下照片，草稿还在。打开系统设置允许麦克风后，可以再试。',
      ),
    );

    const view = await render(wrap());
    await waitFor(() => {
      expect(view.getByText('一段声音 · 4秒')).toBeTruthy();
    });
    fireEvent.press(view.getByTestId('composer-rerecord'));
    await waitFor(() => {
      expect(
        view.getByText(
          '没有打开麦克风。还可以写字和留下照片，草稿还在。打开系统设置允许麦克风后，可以再试。',
        ),
      ).toBeTruthy();
    });
    expect(view.getByText('一段声音 · 4秒')).toBeTruthy();
    expect(view.getByLabelText('播放，4秒')).toBeTruthy();
    expect(mockRemove).not.toHaveBeenCalled();
    expect(mockBegin).toHaveBeenCalledWith('moment_draft', { replace: true });
  });

  it('shows a stopped recording that can be previewed without autoplay', async () => {
    mockBegin.mockResolvedValueOnce(undefined);
    mockFinish.mockResolvedValueOnce(recordedDraft);

    const view = await render(wrap());
    await waitFor(() => {
      expect(view.getByTestId('composer-sound')).toBeTruthy();
    });
    fireEvent.press(view.getByTestId('composer-sound'));
    await waitFor(() => {
      expect(view.getByTestId('composer-stop-sound')).toBeTruthy();
    });
    fireEvent.press(view.getByTestId('composer-stop-sound'));
    await waitFor(() => {
      expect(view.getByText('一段声音 · 4秒')).toBeTruthy();
    });
    expect(view.getByLabelText('播放，4秒')).toBeTruthy();
    expect(view.queryByText('正在播放')).toBeNull();
  });
});
