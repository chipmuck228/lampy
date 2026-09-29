export async function setPrivateSnapshotBlocked(blocked: boolean) {
  try {
    const capture = await import('expo-screen-capture');
    if (blocked) await capture.preventScreenCaptureAsync();
    else await capture.allowScreenCaptureAsync();
  } catch {
    // Native module is missing until prebuild; keep the in-app cover.
  }
}
