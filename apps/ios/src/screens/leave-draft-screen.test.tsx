import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import LeaveScreen from '../app/leave';
import { ApplicationError } from '../application/errors';
import { DRAFT_MEDIA_CLEANUP_FAILED_MESSAGE } from '../application/use-cases';

const mockRestore = jest.fn();
const mockUpdateDraftNote = jest.fn();
const mockUpdateDraftEmotion = jest.fn();
const mockAbandon = jest.fn();
const mockSaveTextMoment = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  writeAsStringAsync: jest.fn(async () => undefined),
}));

jest.mock('../application/container', () => ({
  getUseCases: async () => ({
    restoreOrCreateDraft: mockRestore,
    updateDraftNote: mockUpdateDraftNote,
    updateDraftEmotion: mockUpdateDraftEmotion,
    abandonActiveDraft: mockAbandon,
    addLibraryImages: async () => undefined,
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

const restoredDraft = {
  draftId: 'moment_restored',
  note: '还没留下的一句',
  emotion: '平静',
  isRestored: true,
  images: [
    {
      id: 'asset_restored',
      status: 'available' as const,
      uri: 'memory://assets/asset_restored.jpg',
      width: 800,
      height: 600,
      label: '照片 1/1',
    },
  ],
  audio: {
    id: 'asset_voice',
    status: 'available' as const,
    uri: 'memory://assets/asset_voice.m4a',
    durationMs: 2400,
    durationLabel: '2秒',
    label: '当时的声音',
  },
};

const emptyDraft = {
  draftId: 'moment_new',
  note: '',
  emotion: '',
  isRestored: false,
  images: [],
  audio: null,
};

describe('leave draft restore and abandon', () => {
  beforeEach(() => {
    mockRestore.mockReset();
    mockUpdateDraftNote.mockReset();
    mockUpdateDraftEmotion.mockReset();
    mockAbandon.mockReset();
    mockSaveTextMoment.mockReset();
    mockRestore.mockResolvedValue(restoredDraft);
    mockUpdateDraftNote.mockResolvedValue(undefined);
    mockUpdateDraftEmotion.mockResolvedValue(undefined);
    mockAbandon.mockResolvedValue({
      composer: emptyDraft,
      cleanup: { removed: 2, kept: 0, failed: 0 },
    });
    mockSaveTextMoment.mockResolvedValue({ id: 'moment_restored' });
  });

  it('lets a restored draft keep being edited', async () => {
    const view = await render(wrap());
    await waitFor(() => {
      expect(view.getByDisplayValue('还没留下的一句')).toBeTruthy();
    });
    const input = view.getByTestId('composer-note');
    expect(input.props.editable).toBe(true);
    expect(view.getByLabelText('拍摄').props.accessibilityState?.disabled).toBeFalsy();
    expect(view.getByLabelText('照片').props.accessibilityState?.disabled).toBeFalsy();
    expect(view.getByLabelText('当时的感受，平静，已选中').props.accessibilityState.disabled).toBeFalsy();
    expect(view.getByLabelText('照片 1/1')).toBeTruthy();
    expect(view.getByLabelText('一段声音，2秒，未播放')).toBeTruthy();

    expect(view.getByLabelText('放弃这份草稿')).toBeTruthy();
    expect(view.queryByText('已放弃')).toBeNull();
  });

  it('cancels abandon and keeps the restored draft', async () => {
    const view = await render(wrap());
    await waitFor(() => {
      expect(view.getByLabelText('放弃这份草稿')).toBeTruthy();
    });
    fireEvent.press(view.getByLabelText('放弃这份草稿'));
    await waitFor(() => {
      expect(view.getByTestId('composer-abandon-confirm')).toBeTruthy();
    });
    fireEvent.press(view.getByTestId('composer-abandon-cancel'));
    await waitFor(() => {
      expect(view.queryByTestId('composer-abandon-confirm')).toBeNull();
    });
    expect(view.getByDisplayValue('还没留下的一句')).toBeTruthy();
    expect(view.getByLabelText('放弃这份草稿')).toBeTruthy();
    expect(mockAbandon).not.toHaveBeenCalled();
  });

  it('confirms abandon and shows a new empty draft', async () => {
    const view = await render(wrap());
    await waitFor(() => {
      expect(view.getByLabelText('放弃这份草稿')).toBeTruthy();
    });
    fireEvent.press(view.getByLabelText('放弃这份草稿'));
    await waitFor(() => {
      expect(view.getByTestId('composer-abandon-confirm-button')).toBeTruthy();
    });
    fireEvent.press(view.getByTestId('composer-abandon-confirm-button'));
    await waitFor(() => {
      expect(mockAbandon).toHaveBeenCalledWith('moment_restored');
    });
    expect(view.getByTestId('composer-note').props.value).toBe('');
    expect(view.queryByDisplayValue('还没留下的一句')).toBeNull();
    expect(view.queryByText('上次还有一些内容没保存，已经为你放回来了。')).toBeNull();
    expect(view.queryByLabelText('照片 1/1')).toBeNull();
    expect(view.queryByLabelText('放弃这份草稿')).toBeNull();
    expect(view.queryByText('已放弃')).toBeNull();
  });

  it('keeps the page when draft clear fails and allows retry', async () => {
    mockAbandon.mockRejectedValueOnce(
      new ApplicationError('DRAFT_CLEAR_FAILED', '这份草稿还没拿掉。原来的内容还在，可以再试。'),
    );
    const view = await render(wrap());
    await waitFor(() => {
      expect(view.getByLabelText('放弃这份草稿')).toBeTruthy();
    });
    fireEvent.press(view.getByLabelText('放弃这份草稿'));
    await waitFor(() => {
      expect(view.getByTestId('composer-abandon-confirm-button')).toBeTruthy();
    });
    fireEvent.press(view.getByTestId('composer-abandon-confirm-button'));
    await waitFor(() => {
      expect(view.getByText('这份草稿还没拿掉。原来的内容还在，可以再试。')).toBeTruthy();
    });
    expect(view.getByDisplayValue('还没留下的一句')).toBeTruthy();
    expect(view.queryByText('已放弃')).toBeNull();
    expect(view.getByLabelText('放弃这份草稿')).toBeTruthy();

    mockAbandon.mockResolvedValueOnce({
      composer: emptyDraft,
      cleanup: { removed: 2, kept: 0, failed: 0 },
    });
    fireEvent.press(view.getByLabelText('放弃这份草稿'));
    await waitFor(() => {
      expect(view.getByTestId('composer-abandon-confirm-button')).toBeTruthy();
    });
    fireEvent.press(view.getByTestId('composer-abandon-confirm-button'));
    await waitFor(() => {
      expect(mockAbandon).toHaveBeenCalledTimes(2);
    });
    expect(view.getByTestId('composer-note').props.value).toBe('');
  });

  it('reports leftover copies after a successful abandon', async () => {
    mockAbandon.mockResolvedValueOnce({
      composer: emptyDraft,
      cleanup: { removed: 1, kept: 0, failed: 1 },
    });
    const view = await render(wrap());
    await waitFor(() => {
      expect(view.getByLabelText('放弃这份草稿')).toBeTruthy();
    });
    fireEvent.press(view.getByLabelText('放弃这份草稿'));
    await waitFor(() => {
      expect(view.getByTestId('composer-abandon-confirm-button')).toBeTruthy();
    });
    fireEvent.press(view.getByTestId('composer-abandon-confirm-button'));
    await waitFor(() => {
      expect(view.getByText(DRAFT_MEDIA_CLEANUP_FAILED_MESSAGE)).toBeTruthy();
    });
    expect(view.queryByText('磁盘已清')).toBeNull();
    expect(view.getByTestId('composer-note').props.value).toBe('');
  });

  it('waits for an in-flight note persist before abandoning', async () => {
    let release!: () => void;
    mockUpdateDraftNote.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = () => resolve();
        }),
    );
    const view = await render(wrap());
    await waitFor(() => {
      expect(view.getByDisplayValue('还没留下的一句')).toBeTruthy();
    });
    fireEvent.changeText(view.getByTestId('composer-note'), '先写完再放弃');
    await waitFor(() => {
      expect(mockUpdateDraftNote).toHaveBeenCalled();
    });
    fireEvent.press(view.getByLabelText('放弃这份草稿'));
    await waitFor(() => {
      expect(view.getByTestId('composer-abandon-confirm-button')).toBeTruthy();
    });
    fireEvent.press(view.getByTestId('composer-abandon-confirm-button'));
    expect(mockAbandon).not.toHaveBeenCalled();
    release();
    await waitFor(() => {
      expect(mockAbandon).toHaveBeenCalledWith('moment_restored');
    });
    expect(mockUpdateDraftNote).toHaveBeenCalledWith('moment_restored', '先写完再放弃');
  });

  it('does not write the old draft after abandon succeeds', async () => {
    const view = await render(wrap());
    await waitFor(() => {
      expect(view.getByLabelText('放弃这份草稿')).toBeTruthy();
    });
    fireEvent.press(view.getByLabelText('放弃这份草稿'));
    await waitFor(() => {
      expect(view.getByTestId('composer-abandon-confirm-button')).toBeTruthy();
    });
    fireEvent.press(view.getByTestId('composer-abandon-confirm-button'));
    await waitFor(() => {
      expect(view.getByTestId('composer-note').props.value).toBe('');
    });
    mockUpdateDraftNote.mockClear();
    fireEvent.changeText(view.getByTestId('composer-note'), '新草稿');
    await waitFor(() => {
      expect(mockUpdateDraftNote).toHaveBeenCalledWith('moment_new', '新草稿');
    });
    expect(mockUpdateDraftNote).not.toHaveBeenCalledWith('moment_restored', expect.anything());
  });

  it('persists edits on a restored draft', async () => {
    const view = await render(wrap());
    await waitFor(() => {
      expect(view.getByTestId('composer-note').props.editable).toBe(true);
    });
    fireEvent.changeText(view.getByTestId('composer-note'), '改过的一句');
    fireEvent.press(view.getByTestId('composer-feeling-高兴'));
    await waitFor(() => {
      expect(mockUpdateDraftNote).toHaveBeenCalledWith('moment_restored', '改过的一句');
      expect(mockUpdateDraftEmotion).toHaveBeenCalledWith('moment_restored', '高兴');
      expect(view.getByLabelText('当时的感受，高兴，已选中')).toBeTruthy();
    });
  });
});
