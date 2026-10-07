import { AppState } from 'react-native';
import { waitForRecordingForeground } from './recording-foreground';
it('waits through permission inactive, and accepts active only while eligible', async () => {
  Object.defineProperty(AppState, 'currentState', { value: 'inactive', writable: true, configurable: true });
  let callback!: (state: 'active' | 'background') => void;
  const remove = jest.fn();
  const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, cb) => {
    callback = cb; return { remove };
  });
  const result = waitForRecordingForeground(() => true);
  AppState.currentState = 'active'; callback('active'); expect(await result).toBe(true); expect(remove).toHaveBeenCalled();
  AppState.currentState = 'inactive';
  const late = waitForRecordingForeground(() => true);
  callback('background'); expect(await late).toBe(false);
  spy.mockRestore();
});
it('does not survive a lost page or background', async () => {
  expect(await waitForRecordingForeground(() => false)).toBe(false);
  Object.defineProperty(AppState, 'currentState', { value: 'background', writable: true, configurable: true });
  expect(await waitForRecordingForeground(() => true)).toBe(false);
});

it('waits for the lock context to settle after active instead of bypassing it', async () => {
  jest.useFakeTimers();
  Object.defineProperty(AppState, 'currentState', { value: 'active', writable: true, configurable: true });
  const spy = jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() });
  let unlocked = false;
  const promise = waitForRecordingForeground(() => true, () => unlocked);
  unlocked = true; jest.advanceTimersByTime(50);
  expect(await promise).toBe(true);
  spy.mockRestore();
  jest.useRealTimers();
});
