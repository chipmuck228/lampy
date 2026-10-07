import { leaveVoiceHref, takeLeaveVoiceIntent, forgetLeaveVoiceIntent, resetLeaveVoiceIntentsForTests } from './leave-voice-intent';
beforeEach(resetLeaveVoiceIntentsForTests);
it('only consumes an issued in-process gesture once', () => {
  expect(takeLeaveVoiceIntent('voice_external')).toBe(false);
  const href = leaveVoiceHref('lookback')!;
  expect(href.params.from).toBe('lookback');
  expect(takeLeaveVoiceIntent(href.params.voice)).toBe(true);
  expect(takeLeaveVoiceIntent(href.params.voice)).toBe(false);
});
it('debounces repeat entries and forgets abandoned intent', () => {
  const href = leaveVoiceHref('recent')!;
  expect(leaveVoiceHref('recent')).toBeNull();
  forgetLeaveVoiceIntent(href.params.voice);
  expect(takeLeaveVoiceIntent(href.params.voice)).toBe(false);
});
