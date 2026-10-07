/** Optional feedback: older Dev Clients may not yet link ExpoHaptics. */
export async function recordingStartedFeedback(): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const haptics = require('expo-haptics') as typeof import('expo-haptics');
    await haptics.impactAsync(haptics.ImpactFeedbackStyle.Light);
  } catch {
    // Missing native module or unavailable feedback must never prevent recording.
  }
}
