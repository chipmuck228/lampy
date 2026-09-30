type ScreenCaptureModule = {
  preventScreenCaptureAsync(): Promise<void>;
  allowScreenCaptureAsync(): Promise<void>;
};

let loaded: ScreenCaptureModule | null | undefined;

function hasNativeScreenCapture(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const core = require('expo-modules-core') as {
      requireOptionalNativeModule?: (name: string) => unknown;
    };
    return !!core.requireOptionalNativeModule?.('ExpoScreenCapture');
  } catch {
    return false;
  }
}

function loadScreenCapture(): ScreenCaptureModule | null {
  if (loaded !== undefined) return loaded;
  if (!hasNativeScreenCapture()) {
    loaded = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require('expo-screen-capture') as ScreenCaptureModule;
    return loaded;
  } catch {
    loaded = null;
    return null;
  }
}

export function createSnapshotBlockGate(apply: (blocked: boolean) => Promise<void>) {
  let next: boolean | null = null;
  let busy = false;
  return {
    async set(blocked: boolean) {
      next = blocked;
      if (busy) return;
      busy = true;
      try {
        while (next !== null) {
          const wanted = next;
          next = null;
          await apply(wanted);
        }
      } finally {
        busy = false;
      }
    },
  };
}

const gate = createSnapshotBlockGate(async (blocked) => {
  const capture = loadScreenCapture();
  if (!capture) return;
  try {
    if (blocked) await capture.preventScreenCaptureAsync();
    else await capture.allowScreenCaptureAsync();
  } catch {
    // Native calls can fail on a mismatched binary; keep the in-app cover.
  }
});

export async function setPrivateSnapshotBlocked(blocked: boolean) {
  await gate.set(blocked);
}
