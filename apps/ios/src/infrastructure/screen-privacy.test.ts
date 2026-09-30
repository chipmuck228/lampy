import { setPrivateSnapshotBlocked } from './screen-privacy';

const mockPrevent = jest.fn(async () => undefined);
const mockAllow = jest.fn(async () => undefined);

jest.mock('expo-screen-capture', () => ({
  preventScreenCaptureAsync: () => mockPrevent(),
  allowScreenCaptureAsync: () => mockAllow(),
}));

describe('screen privacy', () => {
  beforeEach(() => {
    mockPrevent.mockReset().mockResolvedValue(undefined);
    mockAllow.mockReset().mockResolvedValue(undefined);
  });

  it('blocks and unblocks snapshots when the native module is present', async () => {
    await setPrivateSnapshotBlocked(true);
    expect(mockPrevent).toHaveBeenCalledTimes(1);
    await setPrivateSnapshotBlocked(false);
    expect(mockAllow).toHaveBeenCalledTimes(1);
  });

  it('does not throw when ExpoScreenCapture is missing', async () => {
    let block: typeof setPrivateSnapshotBlocked | undefined;
    jest.isolateModules(() => {
      jest.doMock('expo-screen-capture', () => {
        throw new Error("Cannot find native module 'ExpoScreenCapture'");
      });
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const loaded = require('./screen-privacy') as typeof import('./screen-privacy');
      block = loaded.setPrivateSnapshotBlocked;
    });
    await expect(block!(true)).resolves.toBeUndefined();
    await expect(block!(false)).resolves.toBeUndefined();
  });
});
