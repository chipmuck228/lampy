import { act, render, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import LeaveScreen from '../app/leave';
import { leaveVoiceHref, resetLeaveVoiceIntentsForTests } from './leave-voice-intent';
import { homeScreenLeaveHref } from '../application/home-screen-actions';
import { ApplicationError } from '../application/errors';
import { recordingStartedFeedback } from '../infrastructure/recording-feedback';

const mockRestore = jest.fn();
const mockBegin = jest.fn();
const mockCamera = jest.fn();
const mockInterrupt = jest.fn();
let mockParams: { voice?: string; from?: string; quick?: string } = {};
let mockLocked = false;
let mockBlur: (() => void) | undefined;
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), dismissTo: jest.fn() }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (effect: () => void | (() => void)) => {
    const React = jest.requireActual('react');
    React.useEffect(() => { const cleanup = effect(); mockBlur = cleanup || undefined; return cleanup; }, [effect]);
  },
}));
jest.mock('./device-lock-context', () => ({ useDeviceLock: () => ({ snapshot: { locked: mockLocked } }) }));
jest.mock('../infrastructure/recording-feedback', () => ({ recordingStartedFeedback: jest.fn(async () => {}) }));
jest.mock('../application/container', () => ({ getUseCases: async () => ({
  restoreOrCreateDraft: mockRestore, beginDraftRecording: mockBegin, addCameraImage: mockCamera,
  interruptDraftRecording: mockInterrupt, updateDraftOccurred: async () => undefined,
  updateDraftNote: async () => undefined, updateDraftEmotion: async () => undefined,
  getRecordingElapsedMs: () => 0,
}) }));
const draft = { draftId: 'draft', note: '已有文字', emotion: '平静', images: [], audio: null, isRestored: true };
function page() {
  return <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, bottom: 34, left: 0, right: 0 } }}><LeaveScreen /></SafeAreaProvider>;
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { resolve, promise }; }
beforeEach(() => {
  jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: () => {} }));
  mockCamera.mockReset().mockResolvedValue(draft);
  resetLeaveVoiceIntentsForTests(); mockParams = {}; mockLocked = false; mockBlur = undefined;
  mockRestore.mockReset().mockResolvedValue(draft); mockBegin.mockReset().mockResolvedValue(undefined);
  mockInterrupt.mockReset().mockResolvedValue({ composer: draft, hadSession: true, kept: false });
  jest.mocked(recordingStartedFeedback).mockClear();
  Object.defineProperty(AppState, 'currentState', { value: 'active', writable: true, configurable: true });
});
it('waits for restoration, starts once, keeps note, and does not restart on rerender', async () => {
  mockParams = leaveVoiceHref('recent')!.params;
  const restore = deferred<typeof draft>(); mockRestore.mockReturnValue(restore.promise);
  const view = await render(page()); expect(mockBegin).not.toHaveBeenCalled();
  await act(async () => { restore.resolve(draft); });
  await waitFor(() => expect(mockBegin).toHaveBeenCalledTimes(1));
  expect(view.getByDisplayValue('已有文字')).toBeTruthy();
  await act(async () => { view.rerender(page()); });
  expect(mockBegin).toHaveBeenCalledTimes(1);
  expect(recordingStartedFeedback).toHaveBeenCalledTimes(1);
  expect(view.getByTestId('composer-stop-sound')).toBeTruthy();
});
it('ordinary and forged deep-link entries never auto-record', async () => {
  mockParams = { voice: 'external', from: 'recent' };
  const view = await render(page()); await waitFor(() => expect(view.getByDisplayValue('已有文字')).toBeTruthy());
  expect(mockBegin).not.toHaveBeenCalled();
});
it('preserves an existing recording instead of replacing it', async () => {
  mockParams = leaveVoiceHref('lookback')!.params;
  mockRestore.mockResolvedValue({ ...draft, audio: { id: 'voice', status: 'available', uri: 'memory://voice', durationMs: 1000, durationLabel: '1秒', label: '声音' } });
  const view = await render(page()); await waitFor(() => expect(view.getByText('草稿里已经有一段声音。')).toBeTruthy());
  expect(mockBegin).not.toHaveBeenCalled(); expect(recordingStartedFeedback).not.toHaveBeenCalled();
});
it('restore failure is not an empty draft', async () => {
  mockParams = leaveVoiceHref('recent')!.params; mockRestore.mockRejectedValue(new Error('disk'));
  const view = await render(page()); await waitFor(() => expect(view.getByText('草稿暂时读不出来，原来的内容没有被改写。')).toBeTruthy());
  expect(mockBegin).not.toHaveBeenCalled();
});
it('does not start behind the lock, then starts only once after unlock', async () => {
  mockParams = leaveVoiceHref('recent')!.params; mockLocked = true;
  const view = await render(page());
  expect(mockRestore).not.toHaveBeenCalled(); expect(mockBegin).not.toHaveBeenCalled();
  await act(async () => { mockLocked = false; view.rerender(page()); });
  await waitFor(() => expect(mockBegin).toHaveBeenCalledTimes(1));
});
it('leaving during startup invalidates native eligibility and produces no haptic', async () => {
  mockParams = leaveVoiceHref('recent')!.params;
  const begin = deferred<void>(); mockBegin.mockReturnValue(begin.promise);
  const view = await render(page()); await waitFor(() => expect(mockBegin).toHaveBeenCalledTimes(1));
  const options = mockBegin.mock.calls[0][1]; expect(options.canStart()).toBe(true);
  await act(async () => { mockBlur?.(); }); expect(options.canStart()).toBe(false);
  await act(async () => { begin.resolve(); });
  expect(recordingStartedFeedback).not.toHaveBeenCalled(); expect(mockInterrupt).toHaveBeenCalledTimes(1);
  view.unmount();
});
it('permission refusal leaves writing available and no success feedback', async () => {
  mockParams = leaveVoiceHref('recent')!.params;
  mockBegin.mockRejectedValue(new ApplicationError('MIC_DENIED', '没有打开麦克风。还可以写字。'));
  const view = await render(page()); await waitFor(() => expect(view.getByText('麦克风未打开，草稿还在。')).toBeTruthy());
  expect(view.getByDisplayValue('已有文字')).toBeTruthy(); expect(recordingStartedFeedback).not.toHaveBeenCalled();
  expect(view.getByTestId('composer-note')).toBeTruthy();
});
it('auto startup owns the same recording mutex as the manual button', async () => {
  mockParams = leaveVoiceHref('recent')!.params;
  const begin = deferred<void>(); mockBegin.mockReturnValue(begin.promise);
  const view = await render(page()); await waitFor(() => expect(mockBegin).toHaveBeenCalledTimes(1));
  expect(view.queryByTestId('composer-sound')).toBeNull();
  await act(async () => { view.rerender(page()); });
  expect(mockBegin).toHaveBeenCalledTimes(1);
  await act(async () => { begin.resolve(); });
});

it('background before restore completion discards the pending automatic intent', async () => {
  mockParams = leaveVoiceHref('recent')!.params;
  const listeners: ((state: 'active' | 'background') => void)[] = [];
  const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, cb) => {
    listeners.push(cb); return { remove: () => { const i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1); } };
  });
  const emit = (state: 'active' | 'background') => { AppState.currentState = state; [...listeners].forEach(cb => cb(state)); };
  const restore = deferred<typeof draft>(); mockRestore.mockReturnValue(restore.promise);
  const view = await render(page());
  await act(async () => { emit('background'); restore.resolve(draft); });
  await act(async () => { emit('active'); });
  expect(mockBegin).not.toHaveBeenCalled();
  view.unmount(); spy.mockRestore();
});


it('a native record action waits for the draft and keeps its existing writing', async () => {
  mockParams = homeScreenLeaveHref('record').params;
  const restore = deferred<typeof draft>(); mockRestore.mockReturnValue(restore.promise);
  const view = await render(page()); expect(mockBegin).not.toHaveBeenCalled();
  await act(async () => { restore.resolve(draft); });
  await waitFor(() => expect(mockBegin).toHaveBeenCalledTimes(1));
  expect(view.getByDisplayValue('已有文字')).toBeTruthy();
  await view.rerender(page()); expect(mockBegin).toHaveBeenCalledTimes(1);
});
it('a native record action does not replace an existing sound', async () => {
  mockParams = homeScreenLeaveHref('record').params;
  mockRestore.mockResolvedValue({ ...draft, audio: { id: 'voice', status: 'available', uri: 'memory://voice', durationMs: 1000, durationLabel: '1秒', label: '声音' } });
  const view = await render(page());
  await waitFor(() => expect(view.getByText('草稿里已经有一段声音。')).toBeTruthy());
  expect(mockBegin).not.toHaveBeenCalled();
});
it('a native camera action restores before opening and shares foreground qualification', async () => {
  mockParams = homeScreenLeaveHref('camera').params;
  const restore = deferred<typeof draft>(); mockRestore.mockReturnValue(restore.promise);
  const view = await render(page()); expect(mockCamera).not.toHaveBeenCalled();
  await act(async () => { restore.resolve(draft); });
  await waitFor(() => expect(mockCamera).toHaveBeenCalledTimes(1));
  expect(view.getByDisplayValue('已有文字')).toBeTruthy();
  expect(mockCamera.mock.calls[0][1].canStart()).toBe(true);
  await act(async () => { mockBlur?.(); });
  expect(mockCamera.mock.calls[0][1].canStart()).toBe(false);
});
it('a full photo draft stays intact instead of launching a fourth photo', async () => {
  mockParams = homeScreenLeaveHref('camera').params;
  mockRestore.mockResolvedValue({ ...draft, images: [1, 2, 3].map(n => ({ id: `image-${n}`, status: 'available', uri: `memory://image-${n}`, label: `照片 ${n}/3`, width: 800, height: 600 })) });
  const view = await render(page());
  await waitFor(() => expect(view.getByText('每条最多三张照片')).toBeTruthy());
  expect(mockCamera).not.toHaveBeenCalled(); expect(view.getByDisplayValue('已有文字')).toBeTruthy();
});
it('a forged quick parameter never opens the camera or recorder', async () => {
  mockParams = { quick: 'quick_external', from: 'recent' };
  const view = await render(page()); await waitFor(() => expect(view.getByDisplayValue('已有文字')).toBeTruthy());
  expect(mockCamera).not.toHaveBeenCalled(); expect(mockBegin).not.toHaveBeenCalled();
});
it('a native action abandoned during draft restoration does not run on returning', async () => {
  mockParams = homeScreenLeaveHref('camera').params;
  const listeners: ((state: 'active' | 'background') => void)[] = [];
  const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, cb) => {
    listeners.push(cb); return { remove: () => { const i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1); } };
  });
  const restore = deferred<typeof draft>(); mockRestore.mockReturnValue(restore.promise);
  const view = await render(page());
  await act(async () => {
    AppState.currentState = 'background'; [...listeners].forEach(cb => cb('background')); restore.resolve(draft);
  });
  await act(async () => { AppState.currentState = 'active'; [...listeners].forEach(cb => cb('active')); });
  expect(mockCamera).not.toHaveBeenCalled(); view.unmount(); spy.mockRestore();
});
