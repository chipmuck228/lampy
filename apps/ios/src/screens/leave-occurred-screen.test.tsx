import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import LeaveScreen from '../app/leave';
import { ApplicationError } from '../application/errors';

const mockRestore = jest.fn();
const mockUpdateDraftOccurred = jest.fn();
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
    updateDraftOccurred: mockUpdateDraftOccurred,
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

const todayDraft = {
  draftId: 'moment_draft',
  note: '还可以写字',
  emotion: '',
  isRestored: false,
  images: [],
  audio: null,
  occurred: { kind: 'today' as const, year: 2026, month: 9, day: 27, label: '今天' },
  today: { year: 2026, month: 9, day: 27 },
};

describe('leave occurred date picker', () => {
  beforeEach(() => {
    mockRestore.mockReset();
    mockUpdateDraftOccurred.mockReset();
    mockSaveTextMoment.mockReset();
    mockRestore.mockResolvedValue(todayDraft);
    mockUpdateDraftOccurred.mockImplementation(async (_id: string, input: { kind: string }) => ({
      ...todayDraft,
      occurred:
        input.kind === 'unknown'
          ? { kind: 'unknown', label: '时间不确定' }
          : input.kind === 'today'
            ? todayDraft.occurred
            : { kind: 'day', year: 2026, month: 9, day: 20, label: '9月20日' },
      today: todayDraft.today,
    }));
    mockSaveTextMoment.mockResolvedValue({ id: 'moment_draft' });
  });

  it('confirms today on a new draft', async () => {
    mockRestore.mockResolvedValue({
      ...todayDraft,
      occurred: undefined,
    });
    const view = await render(wrap());
    await waitFor(() => {
      expect(view.getByLabelText('这件事发生在哪一天')).toBeTruthy();
    });
    expect(view.getByLabelText('发生日期，今天，已选中').props.accessibilityState.selected).toBe(true);
    expect(view.getByLabelText('发生日期，时间不确定').props.accessibilityState.selected).toBe(false);
    await waitFor(() => {
      expect(mockUpdateDraftOccurred).toHaveBeenCalledWith('moment_draft', { kind: 'today' });
    });
  });

  it('can mark time unknown and pick a past day', async () => {
    const view = await render(wrap());
    await waitFor(() => {
      expect(view.getByTestId('composer-occurred-toggle')).toBeTruthy();
    });
    fireEvent.press(view.getByTestId('composer-occurred-toggle'));
    await waitFor(() => {
      expect(view.getByTestId('composer-occurred-unknown')).toBeTruthy();
    });
    fireEvent.press(view.getByTestId('composer-occurred-unknown'));
    await waitFor(() => {
      expect(view.getByLabelText('发生日期，时间不确定，已选中')).toBeTruthy();
    });
    expect(mockUpdateDraftOccurred).toHaveBeenCalledWith('moment_draft', { kind: 'unknown' });

    fireEvent.press(view.getByTestId('composer-occurred-pick'));
    await waitFor(() => {
      expect(view.getByTestId('composer-occurred-calendar')).toBeTruthy();
    });
    expect(view.getByTestId('composer-occurred-day-2026-9-28').props.accessibilityState.disabled).toBe(true);
    fireEvent.press(view.getByTestId('composer-occurred-day-2026-9-20'));
    await waitFor(() => {
      expect(view.getByText('9月20日')).toBeTruthy();
    });
    expect(mockUpdateDraftOccurred).toHaveBeenCalledWith('moment_draft', {
      kind: 'day',
      year: 2026,
      month: 9,
      day: 20,
    });
  });

  it('restores an unknown date without rewriting it to today', async () => {
    mockRestore.mockResolvedValue({
      ...todayDraft,
      note: '还没留下的一句',
      isRestored: true,
      occurred: { kind: 'unknown', label: '时间不确定' },
    });
    const view = await render(wrap());
    await waitFor(() => {
      expect(view.getByLabelText('发生日期，时间不确定，已选中')).toBeTruthy();
    });
    expect(view.getByText('上次没保存的内容已放回来。')).toBeTruthy();
    expect(mockUpdateDraftOccurred).not.toHaveBeenCalled();
  });

  it('keeps the chosen date when save fails and can retry', async () => {
    mockRestore.mockResolvedValue({
      ...todayDraft,
      isRestored: true,
      occurred: { kind: 'day', year: 2026, month: 9, day: 18, label: '9月18日' },
    });
    mockSaveTextMoment
      .mockRejectedValueOnce(new ApplicationError('DISK_FULL', '这次没有留下正式记录。草稿还在，可以再试。'))
      .mockResolvedValueOnce({ id: 'moment_draft' });
    const view = await render(wrap());
    await waitFor(() => {
      expect(view.getByText('9月18日')).toBeTruthy();
    });
    fireEvent.press(view.getByTestId('composer-save'));
    await waitFor(() => {
      expect(view.getByText('这次没有留下正式记录。草稿还在，可以再试。')).toBeTruthy();
    });
    expect(view.getByText('9月18日')).toBeTruthy();
    fireEvent.press(view.getByTestId('composer-save'));
    await waitFor(() => {
      expect(mockSaveTextMoment).toHaveBeenCalledTimes(2);
    });
    expect(mockUpdateDraftOccurred).toHaveBeenLastCalledWith('moment_draft', {
      kind: 'day',
      year: 2026,
      month: 9,
      day: 18,
    });
  });

  it('does not snap a later unknown choice back to a stale today persist', async () => {
    let releaseToday: () => void = () => {};
    mockRestore.mockResolvedValue({
      ...todayDraft,
      occurred: undefined,
    });
    mockUpdateDraftOccurred.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseToday = () =>
            resolve({
              ...todayDraft,
              occurred: todayDraft.occurred,
              today: todayDraft.today,
            });
        }),
    );
    const view = await render(wrap());
    await waitFor(() => {
      expect(view.getByLabelText('发生日期，今天，已选中')).toBeTruthy();
      expect(mockUpdateDraftOccurred).toHaveBeenCalledWith('moment_draft', { kind: 'today' });
    });
    fireEvent.press(view.getByTestId('composer-occurred-toggle'));
    fireEvent.press(view.getByTestId('composer-occurred-unknown'));
    await waitFor(() => {
      expect(view.getByLabelText('发生日期，时间不确定，已选中')).toBeTruthy();
    });
    expect(mockUpdateDraftOccurred).not.toHaveBeenCalledWith('moment_draft', { kind: 'unknown' });
    releaseToday();
    await waitFor(() => {
      expect(mockUpdateDraftOccurred).toHaveBeenCalledWith('moment_draft', { kind: 'unknown' });
    });
    expect(view.getByLabelText('发生日期，时间不确定，已选中')).toBeTruthy();
    expect(view.queryByLabelText('发生日期，今天，已选中')).toBeNull();
  });
});
