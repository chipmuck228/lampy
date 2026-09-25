import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import LeaveScreen from '../app/leave';

const mockRestore = jest.fn();
const mockUpdateDraftEmotion = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('../application/container', () => ({
  getUseCases: async () => ({
    restoreOrCreateDraft: mockRestore,
    updateDraftNote: async () => undefined,
    updateDraftEmotion: mockUpdateDraftEmotion,
    addLibraryImages: async () => undefined,
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
  emotion: '',
  isRestored: false,
  images: [],
  audio: null,
};

describe('leave feeling picker', () => {
  beforeEach(() => {
    mockRestore.mockReset();
    mockUpdateDraftEmotion.mockReset();
    mockRestore.mockResolvedValue(emptyDraft);
    mockUpdateDraftEmotion.mockResolvedValue(undefined);
  });

  it('shows optional feelings without selecting one', async () => {
    const view = await render(wrap());
    await waitFor(() => {
      expect(view.getByLabelText('当时的感受')).toBeTruthy();
    });
    expect(view.getByLabelText('当时的感受，高兴').props.accessibilityState.selected).toBe(false);
    expect(view.queryByLabelText('清除当时的感受')).toBeNull();
    expect(mockUpdateDraftEmotion).not.toHaveBeenCalled();
  });

  it('selects, changes, and clears a feeling', async () => {
    const view = await render(wrap());
    await waitFor(() => {
      expect(view.getByLabelText('当时的感受，高兴')).toBeTruthy();
    });

    fireEvent.press(view.getByTestId('composer-feeling-高兴'));
    await waitFor(() => {
      expect(view.getByLabelText('当时的感受，高兴，已选中').props.accessibilityState.selected).toBe(
        true,
      );
    });
    expect(mockUpdateDraftEmotion).toHaveBeenCalledWith('moment_draft', '高兴');

    fireEvent.press(view.getByTestId('composer-feeling-平静'));
    await waitFor(() => {
      expect(view.getByLabelText('当时的感受，平静，已选中')).toBeTruthy();
    });
    expect(mockUpdateDraftEmotion).toHaveBeenCalledWith('moment_draft', '平静');

    fireEvent.press(view.getByLabelText('清除当时的感受'));
    await waitFor(() => {
      expect(view.getByLabelText('当时的感受，平静').props.accessibilityState.selected).toBe(false);
    });
    expect(mockUpdateDraftEmotion).toHaveBeenCalledWith('moment_draft', '');
  });

  it('restores an unknown stored feeling without rewriting it', async () => {
    mockRestore.mockResolvedValue({
      ...emptyDraft,
      emotion: '喜悦',
      isRestored: true,
    });
    const view = await render(wrap());
    await waitFor(() => {
      expect(view.getByTestId('composer-feeling-unknown').props.children).toBe('喜悦');
    });
    expect(view.getByText('上次还有一些内容没保存，已经为你放回来了。')).toBeTruthy();
    expect(view.getByLabelText('当时的感受，高兴').props.accessibilityState.selected).toBe(false);
    expect(view.getByLabelText('清除当时的感受')).toBeTruthy();
  });
});
