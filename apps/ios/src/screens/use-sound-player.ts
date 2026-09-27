import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { createExpoAudioPlayback } from '../infrastructure/expo-audio';
import type { AudioPlayback, PlaybackStatus } from '../infrastructure/media';

const SYNC_INTERVAL_MS = 200;
const PREPARE_TIMEOUT_MS = 8000;

export function useSoundPlayer(createPlayback: () => AudioPlayback = createExpoAudioPlayback) {
  const playerRef = useRef<AudioPlayback | null>(null);
  const loadedUriRef = useRef<string | null>(null);
  const pendingUriRef = useRef<string | null>(null);
  const generationRef = useRef(0);
  const mountedRef = useRef(true);
  const playInFlightRef = useRef(false);
  const statusRef = useRef<PlaybackStatus>('idle');
  const [status, setStatus] = useState<PlaybackStatus>('idle');
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [failed, setFailed] = useState(false);

  function player() {
    if (!playerRef.current) playerRef.current = createPlayback();
    return playerRef.current;
  }

  function writeStatus(next: PlaybackStatus) {
    statusRef.current = next;
    setStatus(next);
  }

  function applyNativeStatus(next: { status: PlaybackStatus; currentTimeMs: number }) {
    if (!mountedRef.current) return;
    if (statusRef.current === 'preparing' && next.status === 'idle') {
      setCurrentTimeMs(next.currentTimeMs);
      return;
    }
    writeStatus(next.status);
    setCurrentTimeMs(next.currentTimeMs);
    if (next.status === 'unavailable') setFailed(true);
  }

  function sync() {
    if (!mountedRef.current) return;
    const next = playerRef.current?.getStatus();
    if (!next) return;
    applyNativeStatus(next);
  }
  const syncRef = useRef(sync);
  useEffect(() => {
    syncRef.current = sync;
  });

  const teardown = useCallback(async (resetUi: boolean) => {
    generationRef.current += 1;
    playInFlightRef.current = false;
    pendingUriRef.current = null;
    loadedUriRef.current = null;
    const current = playerRef.current;
    playerRef.current = null;
    if (current) {
      try {
        await current.stop();
      } catch {
        // Keep release on the way out even if stop fails.
      }
      try {
        await current.release();
      } catch {
        // Player is already gone.
      }
    }
    if (resetUi && mountedRef.current) {
      setFailed(false);
      writeStatus('idle');
      setCurrentTimeMs(0);
    }
  }, []);

  const park = useCallback(async () => {
    generationRef.current += 1;
    playInFlightRef.current = false;
    pendingUriRef.current = null;
    const current = playerRef.current;
    const before = current?.getStatus();
    const heard = before?.currentTimeMs ?? 0;
    if (current) {
      try {
        await current.pause();
      } catch {
        // Native player may already be interrupted.
      }
    }
    if (!mountedRef.current) return;
    const after = current?.getStatus();
    const kept = (after?.currentTimeMs ?? 0) > 0 ? after!.currentTimeMs : heard;
    if (after?.status === 'unavailable') {
      setFailed(true);
      writeStatus('unavailable');
      setCurrentTimeMs(0);
      return;
    }
    setFailed(false);
    if (kept > 0 && statusRef.current !== 'idle' && statusRef.current !== 'finished') {
      writeStatus('paused');
      setCurrentTimeMs(kept);
      return;
    }
    writeStatus('idle');
    setCurrentTimeMs(0);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const app = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        void park();
      }
    });
    return () => {
      mountedRef.current = false;
      app?.remove?.();
      void teardown(false);
    };
  }, [park, teardown]);

  useEffect(() => {
    if (status !== 'playing' && status !== 'preparing') return undefined;
    const timer = setInterval(() => {
      syncRef.current();
    }, SYNC_INTERVAL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [status]);

  useEffect(() => {
    if (status !== 'preparing') return undefined;
    const timeout = setTimeout(() => {
      if (!mountedRef.current || statusRef.current !== 'preparing') return;
      setFailed(true);
      writeStatus('unavailable');
      void playerRef.current?.stop();
    }, PREPARE_TIMEOUT_MS);
    return () => {
      clearTimeout(timeout);
    };
  }, [status]);

  return {
    status,
    currentTimeMs,
    failed,
    async play(uri: string) {
      if (!mountedRef.current) return;
      if (loadedUriRef.current === uri && statusRef.current === 'playing') return;
      if (playInFlightRef.current && pendingUriRef.current === uri) return;

      const generation = generationRef.current + 1;
      generationRef.current = generation;
      playInFlightRef.current = true;
      pendingUriRef.current = uri;
      setFailed(false);
      writeStatus('preparing');

      try {
        const current = player();
        const alreadyLoaded = loadedUriRef.current === uri;
        if (!alreadyLoaded) {
          await current.load(uri);
          if (!mountedRef.current || generation !== generationRef.current) return;
          loadedUriRef.current = uri;
        }
        await current.play();
        if (!mountedRef.current || generation !== generationRef.current) return;
        sync();
      } catch {
        if (!mountedRef.current || generation !== generationRef.current) return;
        loadedUriRef.current = null;
        setFailed(true);
        writeStatus('unavailable');
        setCurrentTimeMs(0);
      } finally {
        if (generation === generationRef.current) {
          playInFlightRef.current = false;
          pendingUriRef.current = null;
        }
      }
    },
    async pause() {
      if (!mountedRef.current) return;
      await player().pause();
      if (!mountedRef.current) return;
      sync();
    },
    async stop() {
      if (playerRef.current) {
        try {
          await playerRef.current.stop();
        } catch {
          // Still clear the UI so a leftover finished state cannot stick to a new clip.
        }
      }
      if (!mountedRef.current) return;
      setFailed(false);
      writeStatus('idle');
      setCurrentTimeMs(0);
    },
  };
}
