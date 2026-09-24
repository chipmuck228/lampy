import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { createExpoAudioPlayback } from '../infrastructure/expo-audio';
import type { AudioPlayback, PlaybackStatus } from '../infrastructure/media';

export function useSoundPlayer(createPlayback: () => AudioPlayback = createExpoAudioPlayback) {
  const playerRef = useRef<AudioPlayback | null>(null);
  const [status, setStatus] = useState<PlaybackStatus>('idle');
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [failed, setFailed] = useState(false);

  function player() {
    if (!playerRef.current) playerRef.current = createPlayback();
    return playerRef.current;
  }

  function sync() {
    const next = playerRef.current?.getStatus();
    if (!next) return;
    setStatus(next.status);
    setCurrentTimeMs(next.currentTimeMs);
    if (next.status === 'unavailable') setFailed(true);
  }

  useEffect(() => {
    const timer = setInterval(sync, 250);
    const app = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        void playerRef.current?.stop();
        sync();
      }
    });
    return () => {
      clearInterval(timer);
      app.remove();
      void playerRef.current?.release();
    };
  }, []);

  return {
    status,
    currentTimeMs,
    failed,
    async play(uri: string) {
      setFailed(false);
      try {
        const current = player();
        await current.load(uri);
        await current.play();
        sync();
      } catch {
        setFailed(true);
        setStatus('unavailable');
      }
    },
    async pause() {
      await player().pause();
      sync();
    },
    async stop() {
      await playerRef.current?.stop();
      sync();
    },
  };
}
