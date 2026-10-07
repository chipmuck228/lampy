import * as Haptics from 'expo-haptics';
import { recordingStartedFeedback } from './recording-feedback';
it('uses light impact and absorbs native feedback failure', async () => {
  jest.mocked(Haptics.impactAsync).mockRejectedValueOnce(new Error('unavailable'));
  await expect(recordingStartedFeedback()).resolves.toBeUndefined();
  expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
});
