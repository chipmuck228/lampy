import { pauseForegroundAudio, registerForegroundAudioPauser } from './foreground-audio';

describe('foreground audio pause', () => {
  it('pauses registered players and does not resume them', () => {
    const pause = jest.fn();
    const stop = registerForegroundAudioPauser(pause);
    pauseForegroundAudio();
    expect(pause).toHaveBeenCalledTimes(1);
    stop();
    pauseForegroundAudio();
    expect(pause).toHaveBeenCalledTimes(1);
  });
});
