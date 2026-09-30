import { createSnapshotBlockGate } from './screen-privacy';

describe('screen privacy when native module is present', () => {
  const mockPrevent = jest.fn(async (): Promise<void> => undefined);
  const mockAllow = jest.fn(async (): Promise<void> => undefined);

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

  it('lets a later allow finish after a slow prevent so Face ID dismiss does not stay black', async () => {
    let finishPrevent: (() => void) | undefined;
    mockPrevent.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishPrevent = resolve;
        }),
    );
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { setPrivateSnapshotBlocked } = require('./screen-privacy') as typeof import('./screen-privacy');
    const first = setPrivateSnapshotBlocked(true);
    const second = setPrivateSnapshotBlocked(false);
    expect(finishPrevent).toBeTruthy();
    finishPrevent?.();
    await Promise.all([first, second]);
    expect(mockPrevent).toHaveBeenCalledTimes(1);
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

describe('snapshot block gate', () => {
  it('lets a later allow win over a slow prevent so Face ID dismiss does not leave a black screen', async () => {
    const applied: boolean[] = [];
    let finishPrevent: (() => void) | undefined;
    const apply = jest.fn((blocked: boolean) => {
      if (blocked && !finishPrevent) {
        return new Promise<void>((resolve) => {
          finishPrevent = resolve;
        }).then(() => {
          applied.push(true);
        });
      }
      applied.push(blocked);
      return Promise.resolve();
    });
    const gate = createSnapshotBlockGate(apply);
    const first = gate.set(true);
    const second = gate.set(false);
    expect(finishPrevent).toBeTruthy();
    finishPrevent?.();
    await Promise.all([first, second]);
    expect(applied).toEqual([true, false]);
    expect(applied[applied.length - 1]).toBe(false);
  });
});
