type Pause = () => void;

const pausers = new Set<Pause>();

export function registerForegroundAudioPauser(pause: Pause) {
  pausers.add(pause);
  return () => {
    pausers.delete(pause);
  };
}

export function pauseForegroundAudio() {
  for (const pause of pausers) pause();
}
