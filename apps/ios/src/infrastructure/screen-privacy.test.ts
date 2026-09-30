describe('screen privacy when native module is present', () => {
  const mockPrevent = jest.fn(async () => undefined);
  const mockAllow = jest.fn(async () => undefined);

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('expo-modules-core', () => ({
      requireOptionalNativeModule: (name: string) => (name === 'ExpoScreenCapture' ? {} : null),
    }));
    jest.doMock('expo-screen-capture', () => ({
      preventScreenCaptureAsync: () => mockPrevent(),
      allowScreenCaptureAsync: () => mockAllow(),
    }));
    mockPrevent.mockReset().mockResolvedValue(undefined);
    mockAllow.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.dontMock('expo-modules-core');
    jest.dontMock('expo-screen-capture');
    jest.resetModules();
  });

  it('blocks and unblocks snapshots', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { setPrivateSnapshotBlocked } = require('./screen-privacy') as typeof import('./screen-privacy');
    await setPrivateSnapshotBlocked(true);
    expect(mockPrevent).toHaveBeenCalledTimes(1);
    await setPrivateSnapshotBlocked(false);
    expect(mockAllow).toHaveBeenCalledTimes(1);
  });
});

describe('screen privacy without ExpoScreenCapture', () => {
  const loadCapture = jest.fn(() => {
    throw new Error("Cannot find native module 'ExpoScreenCapture'");
  });

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('expo-modules-core', () => ({
      requireOptionalNativeModule: () => null,
    }));
    jest.doMock('expo-screen-capture', () => loadCapture());
    loadCapture.mockClear();
  });

  afterEach(() => {
    jest.dontMock('expo-modules-core');
    jest.dontMock('expo-screen-capture');
    jest.resetModules();
  });

  it('does not load expo-screen-capture or throw', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { setPrivateSnapshotBlocked } = require('./screen-privacy') as typeof import('./screen-privacy');
    await expect(setPrivateSnapshotBlocked(true)).resolves.toBeUndefined();
    await expect(setPrivateSnapshotBlocked(false)).resolves.toBeUndefined();
    expect(loadCapture).not.toHaveBeenCalled();
  });
});
