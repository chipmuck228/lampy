import { appLanguage, tr } from '../i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput, type } from '../screens/life-text';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';

import { composerPermissionNotice } from '../application/composer-notice';
import { getUseCases } from '../application/container';
import { isApplicationError } from '../application/errors';
import {
  occurredInputFromChoice,
  optimisticOccurredChoice,
  type CalendarDayParts,
  type OccurredChoiceView,
  type OccurredDraftInput,
} from '../application/occurred-date';
import {
  DRAFT_AUDIO_REMOVE_FAILED_MESSAGE,
  DRAFT_IMAGE_REMOVE_FAILED_MESSAGE,
  DRAFT_MEDIA_CLEANUP_FAILED_MESSAGE,
  type AudioView,
  type ImageView,
  type UnknownMediaView,
} from '../application/use-cases';
import {
  DraftSoundBar,
  MomentUnknownMedia,
  draftPreviewStatus,
  type RecordPhase,
} from '../screens/moment-audio';
import { LifeLabeledHit } from '../screens/life-icons';
import { FeelingPicker } from '../screens/moment-feeling';
import { OccurredDatePicker } from '../screens/moment-occurred';
import { MomentImages } from '../screens/moment-images';
import {
  clay,
  hairline,
  ink,
  inkSoft,
  isCompactHeight,
  pageGutter,
  paper,
  placeholder,
  readingPageWidth,
  readingWidth,
  sage,
  shouldStackLeaveActions,
} from '../screens/life-page';
import { useSoundPlayer } from '../screens/use-sound-player';
import {
  FAMILY_TEST_JPEG_BASE64,
  armFamilyTestLibraryPick,
  isFamilyTestDriverEnabled,
} from '../infrastructure/family-test-driver';
import { finishLeaveToRecent, leaveOpenedFromLookback } from '../screens/lookback-origin';
import { writeJustSavedMomentId } from '../screens/recent-save-echo';
import { usePageMetrics } from '../screens/use-page-metrics';

import { useDeviceLock } from '../screens/device-lock-context';
import { forgetLeaveVoiceIntent, takeLeaveVoiceIntent } from '../screens/leave-voice-intent';
import { forgetHomeScreenEntry, takeHomeScreenEntry } from '../application/home-screen-actions';
import type { TextInput as NativeTextInput } from 'react-native';
import { waitForRecordingForeground } from '../screens/recording-foreground';
import { recordingStartedFeedback } from '../infrastructure/recording-feedback';

export const DRAFT_RESTORED_COPY = tr("上次没保存的内容已放回来。");

export default function LeaveScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ td?: string | string[]; n?: string | string[]; from?: string | string[]; voice?: string | string[]; quick?: string | string[] }>();
  const noteInputRef = useRef<NativeTextInput>(null);
  const lock = useDeviceLock();
  const lockRef = useRef(lock);
  lockRef.current = lock;
  const recordingGeneration = useRef(0);
  const focusedRef = useRef(false);
  useFocusEffect(useCallback(() => {
    focusedRef.current = true;
    return () => {
      focusedRef.current = false;
      recordingGeneration.current += 1;
      forgetLeaveVoiceIntent(params.voice);
      forgetHomeScreenEntry(params.quick);
      interruptRef.current();
    };
  }, [params.voice, params.quick]));
  const fromLookback = leaveOpenedFromLookback(params.from);
  const { width, height } = usePageMetrics();
  const insets = useSafeAreaInsets();
  const reading = readingWidth(width, height);
  const gutter = pageGutter(width, height);
  const pageWidth = readingPageWidth(width, height);
  const compact = isCompactHeight(height);
  const stackActions = (appLanguage !== 'en' && (compact || reading < 320)) || shouldStackLeaveActions(reading);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [emotion, setEmotion] = useState('');
  const [images, setImages] = useState<ImageView[]>([]);
  const [audio, setAudio] = useState<AudioView | null>(null);
  const [unknownMedia, setUnknownMedia] = useState<UnknownMediaView[]>([]);
  const [phase, setPhase] = useState<RecordPhase>('ready');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [restored, setRestored] = useState(false);
  const [confirmingAbandon, setConfirmingAbandon] = useState(false);
  const [occurred, setOccurred] = useState<OccurredChoiceView>({ kind: 'today', label: tr("今天") });
  const [todayParts, setTodayParts] = useState<CalendarDayParts>(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
  });
  const [message, setMessageState] = useState<string | null>(null);
  const [messageDetail, setMessageDetail] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [noteBoxHeight, setNoteBoxHeight] = useState<number | undefined>(undefined);

  function setMessage(status: string | null, detail?: string | null) {
    setMessageState(status);
    setMessageDetail(status && detail ? detail : null);
    if (!detail) setDetailOpen(false);
  }

  function setDeniedMessage(code: string, detail: string) {
    const notice = composerPermissionNotice(code, detail);
    if (notice) setMessage(notice.status, notice.detail);
    else setMessage(detail);
  }
  const [busy, setBusy] = useState<
    'idle' | 'photo' | 'record' | 'audio' | 'save' | 'abandon' | 'remove'
  >('idle');
  const draftIdRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const abandoningRef = useRef(false);
  const removingRef = useRef(false);
  const writeEpochRef = useRef(0);
  const phaseRef = useRef<RecordPhase>('ready');
  const persistChain = useRef(Promise.resolve());
  const interruptRef = useRef<() => void>(() => {});
  const mountedRef = useRef(true);
  const seededTodayRef = useRef(false);
  const restoreStartedRef = useRef(false);
  const occurredEpochRef = useRef(0);
  const pendingTodaySeedRef = useRef<string | null>(null);
  const sound = useSoundPlayer();
  const [previewBoundId, setPreviewBoundId] = useState<string | null>(null);
  const contentScrollRef = useRef<ScrollView>(null);
  const audioId = audio?.id;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- preview is bound to the current audio id
    setPreviewBoundId(null);
    void sound.stop();
  }, [audioId]);

  function setRecordPhase(next: RecordPhase) {
    phaseRef.current = next;
    setPhase(next);
  }

  function applyComposer(next: {
    images: ImageView[];
    audio: AudioView | null;
    unknownMedia?: UnknownMediaView[];
  }) {
    setImages(next.images);
    setAudio(next.audio);
    setUnknownMedia(next.unknownMedia ?? []);
  }

  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const run = persistChain.current.then(work);
    persistChain.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  useEffect(() => {
    if (!detailOpen || !messageDetail) return;
    const id = requestAnimationFrame(() => {
      contentScrollRef.current?.scrollToEnd({ animated: true });
    });
    return () => cancelAnimationFrame(id);
  }, [detailOpen, messageDetail]);

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardOpen(true),
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardOpen(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    if (lock?.snapshot.locked || restoreStartedRef.current) return;
    restoreStartedRef.current = true;
    let cancelled = false;
    getUseCases()
      .then((app) => {
        if (cancelled || !mountedRef.current) throw new Error('draft read cancelled');
        return app.restoreOrCreateDraft();
      })
      .then((draft) => {
        if (cancelled || !mountedRef.current) return;
        draftIdRef.current = draft.draftId;
        setDraftId(draft.draftId);
        setNote(draft.note);
        setEmotion(draft.emotion ?? '');
        applyComposer(draft);
        setRestored(draft.isRestored);
        if (draft.today) setTodayParts(draft.today);
        const nextOccurred =
          draft.occurred ??
          (draft.isRestored
            ? { kind: 'unknown' as const, label: tr("时间不确定") }
            : { kind: 'today' as const, label: tr("今天") });
        setOccurred(nextOccurred);
        setRecordPhase(draft.audio ? 'stopped' : 'ready');
        if (
          !draft.isRestored &&
          (!draft.occurred || draft.occurred.kind === 'unknown') &&
          !seededTodayRef.current
        ) {
          seededTodayRef.current = true;
          persistOccurred({ kind: 'today' }, draft.draftId);
        }
      })
      .catch(() => {
        if (!cancelled && mountedRef.current) setMessage(tr("草稿暂时读不出来，原来的内容没有被改写。"));
      });
    return () => {
      cancelled = true;
      if (!draftIdRef.current) restoreStartedRef.current = false;
    };
  }, [lock?.snapshot.locked]);

  useEffect(() => {
    if (phase !== 'recording') return;
    let cancelled = false;
    const timer = setInterval(() => {
      void getUseCases()
        .then((app) => app.getRecordingElapsedMs())
        .then((next) => {
          if (!cancelled) setElapsedMs(next);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [phase]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') recordingGeneration.current += 1;
      if (state !== 'active' && phaseRef.current === 'recording') {
        interruptRef.current();
      }
    });
    return () => sub.remove();
  }, []);

  function shownError(error: unknown, fallback: string) {
    return isApplicationError(error) ? error.message : fallback;
  }

  function persistNote(next: string) {
    setNote(next);
    const id = draftIdRef.current;
    const epoch = writeEpochRef.current;
    if (!id || abandoningRef.current) return;
    void enqueue(async () => {
      if (writeEpochRef.current !== epoch || draftIdRef.current !== id) {
        return;
      }
      const app = await getUseCases();
      await app.updateDraftNote(id, next);
    }).catch((error) => {
      if (
        !mountedRef.current ||
        writeEpochRef.current !== epoch ||
        draftIdRef.current !== id ||
        abandoningRef.current
      ) {
        return;
      }
      setMessage(shownError(error, tr("草稿暂时写不进去。已经写的字还在屏幕上。")));
    });
  }

  function persistOccurred(input: OccurredDraftInput, draftId?: string) {
    if (abandoningRef.current) return;
    setOccurred(optimisticOccurredChoice(input, todayParts));
    const id = draftId || draftIdRef.current;
    if (!id) return;
    occurredEpochRef.current += 1;
    const occurredEpoch = occurredEpochRef.current;
    const writeEpoch = writeEpochRef.current;
    void enqueue(async () => {
      if (
        occurredEpochRef.current !== occurredEpoch ||
        writeEpochRef.current !== writeEpoch ||
        draftIdRef.current !== id ||
        abandoningRef.current
      ) {
        return;
      }
      const app = await getUseCases();
      const next = await app.updateDraftOccurred(id, input);
      if (
        occurredEpochRef.current !== occurredEpoch ||
        writeEpochRef.current !== writeEpoch ||
        draftIdRef.current !== id ||
        abandoningRef.current
      ) {
        return;
      }
      if (next?.occurred) setOccurred(next.occurred);
      if (next?.today) setTodayParts(next.today);
    }).catch((error) => {
      if (
        !mountedRef.current ||
        occurredEpochRef.current !== occurredEpoch ||
        writeEpochRef.current !== writeEpoch ||
        draftIdRef.current !== id ||
        abandoningRef.current
      ) {
        return;
      }
      setMessage(shownError(error, tr("发生日期暂时写不进去。已经选的日期还在屏幕上。")));
    });
  }

  function persistEmotion(next: string) {
    setEmotion(next);
    const id = draftIdRef.current;
    const epoch = writeEpochRef.current;
    if (!id || abandoningRef.current) return;
    void enqueue(async () => {
      if (writeEpochRef.current !== epoch || draftIdRef.current !== id) {
        return;
      }
      const app = await getUseCases();
      await app.updateDraftEmotion(id, next);
    }).catch((error) => {
      if (
        !mountedRef.current ||
        writeEpochRef.current !== epoch ||
        draftIdRef.current !== id ||
        abandoningRef.current
      ) {
        return;
      }
      setMessage(shownError(error, tr("草稿暂时写不进去。已经选的感受还在屏幕上。")));
    });
  }

  function applyImageAction(action: 'library' | 'camera', fromQuickAction = false) {
    const id = draftIdRef.current;
    if (!id || busyRef.current || abandoningRef.current) return;
    const generation = recordingGeneration.current;
    const stillHere = () => mountedRef.current && focusedRef.current &&
      generation === recordingGeneration.current && draftIdRef.current === id && !abandoningRef.current;
    const canStart = () => stillHere() && AppState.currentState === 'active' && !lockRef.current?.snapshot.locked;
    busyRef.current = true;
    setBusy('photo');
    void enqueue(async () => {
      const app = await getUseCases();
      return action === 'library' ? app.addLibraryImages(id) : app.addCameraImage(id, fromQuickAction ? {
        canStart,
        waitUntilReady: () => waitForRecordingForeground(stillHere, canStart),
      } : undefined);
    })
      .then((next) => {
        if (abandoningRef.current || draftIdRef.current !== id) return;
        applyComposer(next);
        setMessage(null);
      })
      .catch(async (error) => {
        if (abandoningRef.current || draftIdRef.current !== id) return;
        if (isApplicationError(error) && error.code === 'IMAGE_LIMIT') {
          if (abandoningRef.current || draftIdRef.current !== id) return;
          const app = await getUseCases();
          const draft = await app.restoreOrCreateDraft();
          if (abandoningRef.current || draftIdRef.current !== id) return;
          applyComposer(draft);
          setMessage(tr("每条最多三张照片"));
          return;
        }
        if (
          isApplicationError(error) &&
          (error.code === 'LIBRARY_DENIED' || error.code === 'CAMERA_DENIED')
        ) {
          setDeniedMessage(error.code, error.message);
          return;
        }
        if (
          isApplicationError(error) &&
          (error.code === 'DISK_FULL' ||
            error.code === 'COPY_FAILED' ||
            error.code === 'REPOSITORY_WRITE_FAILED' ||
            error.code === 'REPOSITORY_INVALID_RECORD' ||
            error.code === 'MEDIA_UNAVAILABLE')
        ) {
          setMessage(error.message);
          return;
        }
        setMessage(shownError(error, tr("这张照片没有留下。可以再试，也可以继续写字。")));
      })
      .finally(() => {
        if (abandoningRef.current || removingRef.current || !mountedRef.current) return;
        busyRef.current = false;
        setBusy('idle');
      });
  }

  function startRecording(fromGesture = false) {
    const id = draftIdRef.current;
    if (!id || busyRef.current || abandoningRef.current || phaseRef.current === 'recording') return;
    const generation = ++recordingGeneration.current;
    const stillHere = () => mountedRef.current && focusedRef.current &&
      generation === recordingGeneration.current && draftIdRef.current === id &&
      !abandoningRef.current;
    const canStart = () => stillHere() && AppState.currentState === 'active' &&
      (!lockRef.current || !lockRef.current.snapshot.locked);
    if (!canStart()) return;
    busyRef.current = true;
    setBusy('record');
    setElapsedMs(0);
    setRecordPhase('processing');
    setPreviewBoundId(null);
    void sound.stop();
    void enqueue(async () => {
      const app = await getUseCases();
      if (!stillHere()) throw new Error('recording cancelled');
      await app.beginDraftRecording(id, {
        canStart,
        waitUntilReady: () => waitForRecordingForeground(stillHere, canStart),
      });
      if (!canStart()) {
        await app.interruptDraftRecording(id);
        throw new Error('recording cancelled');
      }
    })
      .then(() => {
        if (!canStart()) return;
        setRecordPhase('recording');
        if (fromGesture) void recordingStartedFeedback();
        setMessage(null);
      })
      .catch((error) => {
        busyRef.current = false;
        if (mountedRef.current) setBusy('idle');
        if (!mountedRef.current || !focusedRef.current || abandoningRef.current || draftIdRef.current !== id) return;
        if (isApplicationError(error) && error.code === 'MIC_DENIED') {
          setRecordPhase('ready');
          setDeniedMessage(error.code, error.message);
          return;
        }
        if (isApplicationError(error) && error.code === 'AUDIO_LIMIT') {
          setRecordPhase(audio ? 'stopped' : 'ready');
          setMessage(tr("每条最多一段声音"));
          return;
        }
        setRecordPhase('failed');
        setMessage(shownError(error, tr("这次没有录下声音。可以再试，也可以继续写字。")));
      });
  }

  useEffect(() => {
    let alive = true;
    const tryStart = () => {
      if (!alive || !focusedRef.current || !draftIdRef.current || busyRef.current ||
          AppState.currentState !== 'active' || lockRef.current?.snapshot.locked) return;
      if (!takeLeaveVoiceIntent(params.voice)) return;
      if (audio) { setMessage(tr("草稿里已经有一段声音。")); return; }
      startRecording(true);
    };
    tryStart();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') forgetLeaveVoiceIntent(params.voice);
      if (state === 'active') tryStart();
    });
    return () => { alive = false; sub.remove(); };
    // The gesture is consumed once; rerenders cannot restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId, audio, params.voice, lock?.snapshot.locked]);

  useEffect(() => {
    const tryEntry = () => {
      if (!focusedRef.current || !draftIdRef.current || AppState.currentState !== 'active' || lockRef.current?.snapshot.locked) return;
      const kind = takeHomeScreenEntry(params.quick);
      if (!kind || busyRef.current || abandoningRef.current || phaseRef.current === 'recording') return;
      if (kind === 'write') noteInputRef.current?.focus();
      if (kind === 'record') {
        if (audio) setMessage(tr("草稿里已经有一段声音。"));
        else startRecording(true);
      }
      if (kind === 'camera') {
        if (images.length >= 3) setMessage(tr("每条最多三张照片"));
        else applyImageAction('camera', true);
      }
    };
    tryEntry();
    const sub = AppState.addEventListener('change', state => {
      if (state === 'background') forgetHomeScreenEntry(params.quick);
      if (state === 'active') tryEntry();
    });
    return () => sub.remove();
    // A native capability is consumed once after draft hydration, never from a URL alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId, audio, images.length, params.quick, lock?.snapshot.locked]);

  function stopRecording() {
    const id = draftIdRef.current;
    if (!id || abandoningRef.current || phaseRef.current !== 'recording') return;
    setRecordPhase('processing');
    void enqueue(async () => {
      const app = await getUseCases();
      return app.finishDraftRecording(id);
    })
      .then((next) => {
        if (abandoningRef.current || draftIdRef.current !== id) return;
        applyComposer(next);
        setRecordPhase(next.audio ? 'stopped' : 'failed');
        setMessage(null);
      })
      .catch((error) => {
        if (abandoningRef.current || draftIdRef.current !== id) return;
        setRecordPhase('failed');
        setMessage(shownError(error, tr("这次没有录下声音。可以再试，也可以继续写字。")));
      })
      .finally(() => {
        if (abandoningRef.current || removingRef.current) return;
        busyRef.current = false;
        setBusy('idle');
      });
  }

  function interruptRecording() {
    const id = draftIdRef.current;
    if (!id || abandoningRef.current || phaseRef.current !== 'recording') return;
    setRecordPhase('processing');
    void enqueue(async () => {
      const app = await getUseCases();
      return app.interruptDraftRecording(id);
    })
      .then((result) => {
        if (!mountedRef.current || abandoningRef.current || draftIdRef.current !== id) return;
        applyComposer(result.composer);
        setRecordPhase(result.composer.audio ? 'stopped' : 'ready');
        void sound.stop();
        if (!result.hadSession) return;
        setMessage(
          result.kept
            ? tr("录音被打断。已经录下的声音还在草稿里。")
            : tr("录音被打断。这一次没有留下声音，文字和照片还在。"),
        );
      })
      .catch((error) => {
        if (!mountedRef.current || abandoningRef.current || draftIdRef.current !== id) return;
        setRecordPhase('failed');
        setMessage(shownError(error, tr("录音被打断。可以再试，也可以继续写字。")));
      })
      .finally(() => {
        if (!mountedRef.current || abandoningRef.current || removingRef.current) return;
        busyRef.current = false;
        setBusy('idle');
      });
  }

  useEffect(() => {
    interruptRef.current = interruptRecording;
  });

  function removeImage(assetId: string) {
    const id = draftIdRef.current;
    if (!id || abandoningRef.current || busyRef.current || busy !== 'idle') return;
    void enqueue(async () => {
      if (abandoningRef.current || draftIdRef.current !== id) return null;
      removingRef.current = true;
      busyRef.current = true;
      setBusy('remove');
      const app = await getUseCases();
      return app.removeDraftImage(id, assetId);
    })
      .then((next) => {
        if (!next || !mountedRef.current) return;
        applyComposer(next);
        setMessage(null);
      })
      .catch((error) => {
        if (!mountedRef.current || abandoningRef.current) return;
        setMessage(shownError(error, DRAFT_IMAGE_REMOVE_FAILED_MESSAGE));
      })
      .finally(() => {
        removingRef.current = false;
        if (abandoningRef.current || !mountedRef.current) return;
        busyRef.current = false;
        setBusy('idle');
      });
  }

  function removeAudio() {
    const id = draftIdRef.current;
    if (!id || abandoningRef.current || busyRef.current || busy !== 'idle') return;
    void sound.stop();
    void enqueue(async () => {
      if (abandoningRef.current || draftIdRef.current !== id) return null;
      removingRef.current = true;
      busyRef.current = true;
      setBusy('remove');
      const app = await getUseCases();
      return app.removeDraftAudio(id);
    })
      .then((next) => {
        if (!next || !mountedRef.current) return;
        applyComposer(next);
        setRecordPhase('ready');
        setMessage(null);
      })
      .catch((error) => {
        if (!mountedRef.current || abandoningRef.current) return;
        setMessage(shownError(error, DRAFT_AUDIO_REMOVE_FAILED_MESSAGE));
      })
      .finally(() => {
        removingRef.current = false;
        if (abandoningRef.current || !mountedRef.current) return;
        busyRef.current = false;
        setBusy('idle');
      });
  }

  function rerecord() {
    const id = draftIdRef.current;
    if (!id || busyRef.current || abandoningRef.current) return;
    busyRef.current = true;
    setBusy('audio');
    setPreviewBoundId(null);
    void sound.stop();
    void enqueue(async () => {
      const app = await getUseCases();
      await app.beginDraftRecording(id, { replace: true });
    })
      .then(() => {
        setElapsedMs(0);
        setBusy('record');
        setRecordPhase('recording');
        setMessage(null);
      })
      .catch(async (error) => {
        busyRef.current = false;
        setBusy('idle');
        if (abandoningRef.current || draftIdRef.current !== id) return;
        try {
          const app = await getUseCases();
          const draft = await app.restoreOrCreateDraft();
          if (abandoningRef.current || draftIdRef.current !== id) return;
          applyComposer(draft);
          setRecordPhase(draft.audio ? 'stopped' : 'ready');
        } catch {
          if (abandoningRef.current || draftIdRef.current !== id) return;
          setRecordPhase(audio ? 'stopped' : 'failed');
        }
        if (isApplicationError(error) && error.code === 'MIC_DENIED') {
          setDeniedMessage(error.code, error.message);
          return;
        }
        setMessage(shownError(error, tr("这次没有重新录上。可以再试。")));
      });
  }

  async function onSave() {
    const id = draftIdRef.current;
    if (!id || busyRef.current || abandoningRef.current) return;
    busyRef.current = true;
    setBusy('save');
    try {
      await enqueue(async () => {
        if (abandoningRef.current || draftIdRef.current !== id) {
          throw new Error('abandoned');
        }
        const app = await getUseCases();
        await app.updateDraftNote(id, note);
        await app.updateDraftEmotion(id, emotion);
        await app.updateDraftOccurred(id, occurredInputFromChoice(occurred));
        const saved = await app.saveTextMoment(id);
        writeJustSavedMomentId(saved.id);
      });
      if (abandoningRef.current || draftIdRef.current !== id) return;
      finishLeaveToRecent(router);
    } catch (error) {
      if (abandoningRef.current || draftIdRef.current !== id) return;
      setMessage(
        isApplicationError(error) && error.code === 'MOMENT_EMPTY'
          ? tr("写一句、留下一张照片或一段声音。已经写的草稿还在。")
          : shownError(error, tr("这次没有留下正式记录。可以再试。")),
      );
    } finally {
      if (abandoningRef.current) return;
      busyRef.current = false;
      setBusy('idle');
    }
  }

  function requestAbandon() {
    if (!draftIdRef.current || abandoningRef.current || busy === 'save') return;
    setConfirmingAbandon(true);
  }

  function cancelAbandon() {
    if (abandoningRef.current) return;
    setConfirmingAbandon(false);
  }

  function confirmAbandon() {
    const id = draftIdRef.current;
    if (!id || abandoningRef.current) return;
    abandoningRef.current = true;
    setConfirmingAbandon(false);
    setBusy('abandon');
    void sound.stop();
    void enqueue(async () => {
      writeEpochRef.current += 1;
      const epoch = writeEpochRef.current;
      const app = await getUseCases();
      const result = await app.abandonActiveDraft(id);
      return { result, epoch };
    })
      .then(({ result, epoch }) => {
        if (!mountedRef.current || writeEpochRef.current !== epoch) return;
        writeEpochRef.current += 1;
        draftIdRef.current = result.composer.draftId;
        setDraftId(result.composer.draftId);
        setNote(result.composer.note);
        setEmotion(result.composer.emotion ?? '');
        applyComposer(result.composer);
        occurredEpochRef.current += 1;
        setOccurred(
          result.composer.occurred ?? { kind: 'today', label: tr("今天") },
        );
        if (result.composer.today) setTodayParts(result.composer.today);
        if (!result.composer.occurred || result.composer.occurred.kind === 'unknown') {
          pendingTodaySeedRef.current = result.composer.draftId;
        }
        setRestored(false);
        setRecordPhase('ready');
        setElapsedMs(0);
        setMessage(result.cleanup.failed > 0 ? DRAFT_MEDIA_CLEANUP_FAILED_MESSAGE : null);
      })
      .catch((error) => {
        if (!mountedRef.current) return;
        setMessage(shownError(error, tr("这份草稿还没拿掉。原来的内容还在，可以再试。")));
      })
      .finally(() => {
        abandoningRef.current = false;
        busyRef.current = false;
        if (!mountedRef.current) return;
        setBusy('idle');
        const seedId = pendingTodaySeedRef.current;
        pendingTodaySeedRef.current = null;
        if (seedId && draftIdRef.current === seedId) {
          persistOccurred({ kind: 'today' }, seedId);
        }
      });
  }

  const testAction = Array.isArray(params.td) ? params.td[0] : params.td;
  const testNonce = Array.isArray(params.n) ? params.n[0] : params.n;
  const ranTestAction = useRef('');
  useEffect(() => {
    if (!isFamilyTestDriverEnabled() || !testAction || !draftId) return;
    const key = `${testAction}:${testNonce || ''}`;
    if (ranTestAction.current === key) return;
    ranTestAction.current = key;
    if (testAction === 'photo') {
      void Promise.resolve().then(() => {
        persistNote('本轮媒体闭环');
        persistEmotion('平静');
      });
      const root = FileSystem.cacheDirectory;
      if (!root) {
        void Promise.resolve().then(() => {
          setMessage(tr("这次没有留下照片。可以再试，也可以继续写字。"));
        });
        return;
      }
      const path = `${root}family-test-photo.jpg`;
      void FileSystem.writeAsStringAsync(path, FAMILY_TEST_JPEG_BASE64, {
        encoding: 'base64',
      })
        .then(() => {
          armFamilyTestLibraryPick({
            sourceUri: path,
            mimeType: 'image/jpeg',
            width: 16,
            height: 16,
          });
          applyImageAction('library');
        })
        .catch(() => {
          setMessage(tr("这次没有留下照片。可以再试，也可以继续写字。"));
        });
      return;
    }
    if (testAction === 'save') {
      void onSave();
    }
  }, [testAction, testNonce, draftId]);

  const draftHasContent =
    !!note.trim() || !!emotion.trim() || images.length > 0 || !!audio || unknownMedia.length > 0;
  const showAbandon = !!draftId && draftHasContent && busy !== 'save';
  const actionsLocked = !draftId || busy !== 'idle';
  const composerLocked = actionsLocked || confirmingAbandon;
  const saveLabel =
    busy === 'save'
      ? tr("正在留下…")
      : busy === 'photo'
        ? tr("正在加入照片…")
        : busy === 'audio' || busy === 'record'
          ? tr("正在留下声音…")
          : busy === 'abandon'
            ? tr("正在拿掉这份草稿…")
            : tr("留下");

  return (
    <SafeAreaView
      style={styles.safe}
      edges={['top', 'left', 'right']}
      accessibilityLabel={tr("留下")}
      testID="composer-layout"
      accessibilityHint={`leave-layout width:${Math.round(reading)} actions:${stackActions ? 'stack' : 'row'}`}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Text testID="composer-type-policy" accessible={false} style={styles.layoutProbe}>
          fixed
        </Text>
        <Text testID="composer-actions-mode" accessible={false} style={styles.layoutProbe}>
          {stackActions ? 'stack' : 'row'}
        </Text>
        <ScrollView
          ref={contentScrollRef}
          testID="composer-scroll"
          style={styles.flex}
          contentContainerStyle={[
            styles.column,
            {
              maxWidth: pageWidth,
              paddingHorizontal: gutter,
              paddingTop: compact ? 4 : 8,
              paddingBottom: 24,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets={false}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={fromLookback ? tr("返回原来的位置") : tr("返回最近")}
            testID="leave-back"
            onPress={() => router.back()}
            style={styles.backHit}
          >
            <Text style={styles.back}>{fromLookback ? tr("返回原来的位置") : tr("最近")}</Text>
          </Pressable>
          {restored ? (
            <Text style={styles.restore}>{DRAFT_RESTORED_COPY}</Text>
          ) : null}
          {showAbandon && !confirmingAbandon ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tr("放弃这份草稿")}
              testID="composer-abandon"
              onPress={requestAbandon}
              disabled={busy === 'abandon'}
              style={styles.abandonHit}
            >
              <Text style={styles.abandon}>{tr("放弃这份草稿")}</Text>
            </Pressable>
          ) : null}
          {confirmingAbandon ? (
            <View testID="composer-abandon-confirm">
              <Text style={styles.restore}>
                {tr("这份草稿里的文字、感受、照片和录音会从这里拿掉。相册原片和已经留下的记录不会动。")}</Text>
              <View style={styles.confirmRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={tr("取消放弃草稿")}
                  testID="composer-abandon-cancel"
                  onPress={cancelAbandon}
                  style={styles.abandonHit}
                >
                  <Text style={styles.back}>{tr("取消")}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={tr("确认放弃这份草稿")}
                  testID="composer-abandon-confirm-button"
                  onPress={confirmAbandon}
                  style={styles.abandonHit}
                >
                  <Text style={styles.abandon}>{tr("确认放弃")}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
          <TextInput
            ref={noteInputRef}
            accessibilityLabel={tr("要留下的一句话")}
            testID="composer-note"
            value={note}
            editable={!!draftId && busy !== 'abandon' && !confirmingAbandon}
            onChangeText={(value) => {
              void persistNote(value);
            }}
            onContentSizeChange={(event) => {
              const next = Math.max(88, Math.ceil(event.nativeEvent.contentSize.height));
              setNoteBoxHeight((current) => (current === next ? current : next));
            }}
            placeholder={tr("写一句就可以，也可以只留下照片或声音。")}
            placeholderTextColor={placeholder}
            multiline
            textAlignVertical="top"
            style={[styles.input, noteBoxHeight != null ? { height: noteBoxHeight } : null]}
          />
          <MomentImages
            images={images}
            testIDPrefix="composer-image"
            onRemoveImage={
              draftId && !confirmingAbandon && busy === 'idle' ? removeImage : undefined
            }
          />
          <MomentUnknownMedia items={unknownMedia} testIDPrefix="composer-unknown" />
          <DraftSoundBar
            phase={phase}
            elapsedMs={elapsedMs}
            audio={audio}
            playbackStatus={draftPreviewStatus(
              sound.status,
              sound.failed,
              audio?.id,
              previewBoundId,
            )}
            currentTimeMs={previewBoundId === audio?.id ? sound.currentTimeMs : 0}
            disabled={composerLocked}
            removeDisabled={busy !== 'idle' || confirmingAbandon}
            onStart={() => startRecording()}
            onStop={stopRecording}
            onPlay={() => {
              if (!audio?.uri) return;
              setPreviewBoundId(audio.id);
              void sound.play(audio.uri);
            }}
            onPause={() => {
              void sound.pause();
            }}
            onRerecord={rerecord}
            onRemove={removeAudio}
          />
          <FeelingPicker
            value={emotion}
            disabled={!draftId || composerLocked}
            onChange={(next) => {
              persistEmotion(next);
            }}
          />
          <OccurredDatePicker
            value={occurred}
            today={todayParts}
            disabled={!draftId || composerLocked}
            onChange={(next) => {
              persistOccurred(next);
            }}
          />
          {detailOpen && messageDetail ? (
            <View testID="composer-feedback-sheet" style={styles.sheet}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={tr("关闭说明")}
                testID="composer-feedback-detail-close"
                onPress={() => setDetailOpen(false)}
                style={styles.sheetClose}
              >
                <Text style={styles.back}>{tr("关闭")}</Text>
              </Pressable>
              <ScrollView
                testID="composer-feedback-detail-scroll"
                style={styles.sheetScroll}
                contentContainerStyle={styles.sheetBody}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
              >
                <Text testID="composer-feedback-detail-body" style={styles.sheetText}>
                  {messageDetail}
                </Text>
              </ScrollView>
            </View>
          ) : null}
        </ScrollView>
        <View
          testID="composer-action-band"
          style={[
            styles.band,
            {
              paddingHorizontal: gutter,
              paddingTop: compact || stackActions ? 8 : 12,
              paddingBottom: keyboardOpen ? 8 : Math.max(insets.bottom, 8),
            },
          ]}
        >
          {message ? (
            <View testID="composer-feedback-row" style={[styles.feedbackRow, { maxWidth: reading }]}>
              <Text
                testID="composer-feedback"
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                style={styles.message}
              >
                {message}
              </Text>
              {messageDetail ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={tr("查看说明")}
                  testID="composer-feedback-detail"
                  onPress={() => setDetailOpen(true)}
                  style={styles.detailHit}
                >
                  <Text style={styles.detailLink}>{tr("查看说明")}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          <View
            testID="composer-actions"
            accessibilityLabel={stackActions ? 'leave-actions-stack' : 'leave-actions-row'}
            style={[
              styles.actions,
              appLanguage === 'en' && styles.actionsEnglish,
              { maxWidth: reading },
              stackActions && styles.actionsStacked,
            ]}
          >
            <View style={[styles.mediaRow, appLanguage === 'en' && styles.actionsEnglish]}>
              <LifeLabeledHit
                icon="camera"
                label={tr("拍摄")}
                testID="composer-camera"
                disabled={composerLocked}
                onPress={() => {
                  applyImageAction('camera');
                }}
              />
              <LifeLabeledHit
                icon="photo"
                label={tr("照片")}
                testID="composer-library"
                disabled={composerLocked}
                onPress={() => {
                  applyImageAction('library');
                }}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tr("留下")}
              testID="composer-save"
              onPress={() => {
                void onSave();
              }}
              disabled={composerLocked}
              style={[styles.saveHit, stackActions && styles.saveHitStacked]}
            >
              <Text style={styles.save}>{saveLabel}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: paper },
  flex: { flex: 1 },
  layoutProbe: { position: 'absolute', height: 0, width: 0, opacity: 0 },
  column: {
    flexGrow: 1,
    width: '100%',
    alignSelf: 'center',
    gap: 20,
  },
  backHit: { minHeight: 44, justifyContent: 'center' },
  back: { ...type.action, color: sage },
  restore: { ...type.action, color: inkSoft },
  abandonHit: { minHeight: 44, justifyContent: 'center' },
  abandon: { ...type.action, color: clay },
  confirmRow: { flexDirection: 'row', gap: 24, marginTop: 8 },
  input: {
    minHeight: 88,
    ...type.body,
    color: ink,
    padding: 0,
  },
  feedbackRow: {
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    alignSelf: 'center',
    gap: 4,
    paddingBottom: 8,
  },
  message: {
    ...type.body,
    color: clay,
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
  },
  detailHit: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' },
  detailLink: { ...type.action, color: sage },
  sheet: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: hairline,
    paddingTop: 8,
    gap: 8,
    maxHeight: 220,
  },
  sheetClose: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' },
  sheetScroll: { maxHeight: 160 },
  sheetBody: { paddingBottom: 16 },
  sheetText: { ...type.body, color: inkSoft },
  band: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: hairline,
    backgroundColor: paper,
    minWidth: 0,
  },
  actions: {
    width: '100%',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  actionsEnglish: { gap: 12 },
  actionsStacked: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 4,
  },
  mediaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 20,
  },
  saveHit: { minHeight: 48, minWidth: 48, justifyContent: 'center', marginLeft: 'auto' },
  saveHitStacked: { marginLeft: 0, alignSelf: 'flex-start' },
  save: { ...type.action, color: ink },
});
