type ScreenCaptureModule = {
  preventScreenCaptureAsync(): Promise<void>;
  allowScreenCaptureAsync(): Promise<void>;
};

function loadScreenCapture(): ScreenCaptureModule | null {
  try {
    // Native module is missing on some simulator binaries; load only when called.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-screen-capture') as ScreenCaptureModule;
  } catch {
    return null;
  }
}

export async function setPrivateSnapshotBlocked(blocked: boolean) {
  const capture = loadScreenCapture();
  if (!capture) return;
  try {
    if (blocked) await capture.preventScreenCaptureAsync();
    else await capture.allowScreenCaptureAsync();
  } catch {
    // Native calls can fail on a mismatched binary; keep the in-app cover.
  }
}
