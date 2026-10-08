import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AppState, Share } from 'react-native';
import { HomeScreenActionCapture, HomeScreenActionDispatch } from './home-screen-actions';
import { FirstRunGate } from './first-run-gate';
import { homeScreenActions, homeScreenLeaveHref, takeHomeScreenEntry, LAMPY_PUBLIC_URL } from '../application/home-screen-actions';

const mockPush = jest.fn();
const mockSetParams = jest.fn();
let mockPath = '/';
let mockLocked = false;
let mockMessage: string | null = null;
let mockInitial: { id: string; requestId: string } | null = null;
let mockNativeListener: ((action: { id: string; requestId: string }) => void) | undefined;
const mockRouter = { push: mockPush, setParams: mockSetParams };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter, usePathname: () => mockPath,
  useRootNavigationState: () => ({ key: 'ready' }),
}));
jest.mock('./device-lock-context', () => ({ useDeviceLock: () => ({ snapshot: { locked: mockLocked }, message: mockMessage }) }));
jest.mock('../../modules/lampy-quick-actions', () => ({ nativeQuickActions: () => ({
  consumePending: () => { const value = mockInitial; mockInitial = null; return value; },
  addListener: (_: string, listener: typeof mockNativeListener) => { mockNativeListener = listener; return { remove: jest.fn() }; },
}) }));
jest.mock('./first-run-guide', () => {
  const { Pressable, Text } = jest.requireActual('react-native');
  return { FirstRunGuide: ({ onFinished }: { onFinished(): void }) =>
    <Pressable testID="finish-guide" onPress={onFinished}><Text>guide</Text></Pressable> };
});

beforeEach(() => {
  homeScreenActions.cancel(); mockPush.mockReset(); mockSetParams.mockReset();
  mockPath = '/'; mockLocked = false; mockMessage = null; mockInitial = null;
  AppState.currentState = 'active';
});
it('captures a cold action during onboarding and dispatches once only after completion', async () => {
  mockInitial = { id: 'app.lampy.camera', requestId: 'cold' };
  const view = await render(<><HomeScreenActionCapture /><FirstRunGate
    store={{ isCompleted: async () => false, markCompleted: async () => undefined }}
    readLibrary={async () => ({ hasPersonalRecords: false, recordsUnknown: false })}>
    <HomeScreenActionDispatch />
  </FirstRunGate></>);
  await waitFor(() => expect(view.getByTestId('finish-guide')).toBeTruthy());
  expect(mockPush).not.toHaveBeenCalled();
  fireEvent.press(view.getByTestId('finish-guide'));
  await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
  expect(takeHomeScreenEntry(mockPush.mock.calls[0][0].params.quick)).toBe('camera');
  await act(async () => { mockNativeListener?.({ id: 'app.lampy.camera', requestId: 'cold' }); });
  expect(mockPush).toHaveBeenCalledTimes(1);
});
it('waits for local unlock and discards an action after cancelled authentication', async () => {
  mockLocked = true;
  homeScreenActions.receive({ id: 'app.lampy.record', requestId: 'locked' });
  const view = await render(<HomeScreenActionDispatch />);
  expect(mockPush).not.toHaveBeenCalled();
  mockMessage = '认证未完成';
  await view.rerender(<HomeScreenActionDispatch />);
  mockMessage = null; mockLocked = false;
  await view.rerender(<HomeScreenActionDispatch />);
  expect(mockPush).not.toHaveBeenCalled();
  await act(async () => { homeScreenActions.receive({ id: 'app.lampy.record', requestId: 'new' }); });
  expect(mockPush).toHaveBeenCalledTimes(1);
});
it('shares only the public URL and reuses the composer for a warm invocation', async () => {
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.dismissedAction });
  const view = await render(<HomeScreenActionDispatch />);
  await act(async () => { homeScreenActions.receive({ id: 'app.lampy.share', requestId: 'share' }); });
  expect(share).toHaveBeenCalledWith({ url: LAMPY_PUBLIC_URL });
  expect(mockPush).not.toHaveBeenCalled();
  mockPath = '/leave'; await view.rerender(<HomeScreenActionDispatch />);
  await act(async () => { homeScreenActions.receive({ id: 'app.lampy.write', requestId: 'warm' }); });
  expect(takeHomeScreenEntry(mockSetParams.mock.calls[0][0].quick)).toBe('write');
  expect(mockPush).not.toHaveBeenCalled(); share.mockRestore();
});
it('does not dispatch in background and discards a pending action on leaving again', async () => {
  let onState: ((state: 'active' | 'background') => void) | undefined;
  const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, cb) => {
    onState = cb; return { remove: jest.fn() };
  });
  AppState.currentState = 'background';
  const view = await render(<><HomeScreenActionDispatch /><HomeScreenActionCapture /></>);
  await act(async () => { homeScreenActions.receive({ id: 'app.lampy.record', requestId: 'bg' }); });
  expect(mockPush).not.toHaveBeenCalled();
  const notMountedYet = homeScreenLeaveHref('record');
  await act(async () => { onState?.('background'); });
  expect(homeScreenActions.snapshot()).toBeNull();
  expect(takeHomeScreenEntry(notMountedYet.params.quick)).toBeNull();
  view.unmount(); spy.mockRestore();
});
