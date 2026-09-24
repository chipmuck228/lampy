import { useEffect, useRef, useState } from 'react';
import {
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { getUseCases } from '../application/container';
import { isApplicationError } from '../application/errors';
import type { AudioView, ImageView } from '../application/use-cases';
import { DraftSoundBar, type RecordPhase } from '../screens/moment-audio';
import { MomentImages } from '../screens/moment-images';
import { useSoundPlayer } from '../screens/use-sound-player';

export default function LeaveScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const readingWidth = Math.min(width, 720);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [images, setImages] = useState<ImageView[]>([]);
  const [audio, setAudio] = useState<AudioView | null>(null);
  const [phase, setPhase] = useState<RecordPhase>('ready');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [restored, setRestored] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<'idle' | 'photo' | 'record' | 'audio' | 'save'>('idle');
  const draftIdRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const phaseRef = useRef<RecordPhase>('ready');
  const persistChain = useRef(Promise.resolve());
  const interruptRef = useRef<() => void>(() => {});
  const sound = useSoundPlayer();

  function setRecordPhase(next: RecordPhase) {
    phaseRef.current = next;
    setPhase(next);
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
    let cancelled = false;
    getUseCases()
      .then((app) => app.restoreOrCreateDraft())
      .then((draft) => {
        if (cancelled) return;
        draftIdRef.current = draft.draftId;
        setDraftId(draft.draftId);
        setNote(draft.note);
        setImages(draft.images);
        setAudio(draft.audio);
        setRestored(draft.isRestored);
        setRecordPhase(draft.audio ? 'stopped' : 'ready');
      })
      .catch(() => {
        if (!cancelled) setMessage('草稿暂时读不出来，原来的内容没有被改写。');
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
      if (state !== 'active') {
        void sound.stop();
        if (phaseRef.current === 'recording') {
          interruptRef.current();
        }
      }
    });
    return () => sub.remove();
  }, [sound]);

  function persistNote(next: string) {
    setNote(next);
    const id = draftIdRef.current;
    if (!id) return;
    void enqueue(async () => {
      const app = await getUseCases();
      await app.updateDraftNote(id, next);
    }).catch(() => {
      setMessage('草稿暂时写不进去。已经写的字还在屏幕上。');
    });
  }

  function applyImageAction(action: 'library' | 'camera') {
    const id = draftIdRef.current;
    if (!id || busyRef.current) return;
    busyRef.current = true;
    setBusy('photo');
    void enqueue(async () => {
      const app = await getUseCases();
      return action === 'library' ? app.addLibraryImages(id) : app.addCameraImage(id);
    })
      .then((next) => {
        setImages(next.images);
        setAudio(next.audio);
        setMessage(null);
      })
      .catch(async (error) => {
        if (isApplicationError(error) && error.code === 'IMAGE_LIMIT') {
          const app = await getUseCases();
          const draft = await app.restoreOrCreateDraft();
          setImages(draft.images);
          setAudio(draft.audio);
          setMessage('每条最多三张照片');
          return;
        }
        if (isApplicationError(error) && (error.code === 'LIBRARY_DENIED' || error.code === 'CAMERA_DENIED')) {
          setMessage(error.message);
          return;
        }
        setMessage('这张照片没有留下。已经写的字和已有的照片还在。');
      })
      .finally(() => {
        busyRef.current = false;
        setBusy('idle');
      });
  }

  function startRecording() {
    const id = draftIdRef.current;
    if (!id || busyRef.current) return;
    busyRef.current = true;
    setBusy('record');
    setElapsedMs(0);
    setRecordPhase('processing');
    void sound.stop();
    void enqueue(async () => {
      const app = await getUseCases();
      await app.beginDraftRecording(id);
    })
      .then(() => {
        setRecordPhase('recording');
        setMessage(null);
      })
      .catch((error) => {
        busyRef.current = false;
        setBusy('idle');
        if (isApplicationError(error) && error.code === 'MIC_DENIED') {
          setRecordPhase('ready');
          setMessage(error.message);
          return;
        }
        if (isApplicationError(error) && error.code === 'AUDIO_LIMIT') {
          setRecordPhase(audio ? 'stopped' : 'ready');
          setMessage('每条最多一段声音');
          return;
        }
        setRecordPhase('failed');
        setMessage('这次没有录下声音。已经写的字和照片还在。');
      });
  }

  function stopRecording() {
    const id = draftIdRef.current;
    if (!id || phaseRef.current !== 'recording') return;
    setRecordPhase('processing');
    void enqueue(async () => {
      const app = await getUseCases();
      return app.finishDraftRecording(id);
    })
      .then((next) => {
        setImages(next.images);
        setAudio(next.audio);
        setRecordPhase(next.audio ? 'stopped' : 'failed');
        setMessage(null);
      })
      .catch(() => {
        setRecordPhase('failed');
        setMessage('这次没有录下声音。已经写的字和照片还在，可以再试。');
      })
      .finally(() => {
        busyRef.current = false;
        setBusy('idle');
      });
  }

  function interruptRecording() {
    const id = draftIdRef.current;
    if (!id || phaseRef.current !== 'recording') return;
    setRecordPhase('processing');
    void enqueue(async () => {
      const app = await getUseCases();
      return app.interruptDraftRecording(id);
    })
      .then((result) => {
        setImages(result.composer.images);
        setAudio(result.composer.audio);
        setRecordPhase(result.composer.audio ? 'stopped' : 'ready');
        if (!result.hadSession) return;
        setMessage(
          result.kept
            ? '录音被打断。已经录下的声音还在草稿里。'
            : '录音被打断。这一次没有留下声音，文字和照片还在。',
        );
      })
      .catch(() => {
        setRecordPhase('failed');
        setMessage('录音被打断。已经写的字和照片还在。');
      })
      .finally(() => {
        busyRef.current = false;
        setBusy('idle');
      });
  }

  useEffect(() => {
    interruptRef.current = interruptRecording;
  });

  function removeAudio() {
    const id = draftIdRef.current;
    if (!id || busyRef.current) return;
    busyRef.current = true;
    setBusy('audio');
    void sound.stop();
    void enqueue(async () => {
      const app = await getUseCases();
      return app.removeDraftAudio(id);
    })
      .then((next) => {
        setImages(next.images);
        setAudio(next.audio);
        setRecordPhase('ready');
        setMessage(null);
      })
      .catch(() => {
        setMessage('这段声音还在草稿里，可以再试着移除。');
      })
      .finally(() => {
        busyRef.current = false;
        setBusy('idle');
      });
  }

  function rerecord() {
    const id = draftIdRef.current;
    if (!id || busyRef.current) return;
    busyRef.current = true;
    setBusy('audio');
    void sound.stop();
    void enqueue(async () => {
      const app = await getUseCases();
      await app.removeDraftAudio(id);
      await app.beginDraftRecording(id);
    })
      .then(() => {
        setAudio(null);
        setElapsedMs(0);
        setBusy('record');
        setRecordPhase('recording');
        setMessage(null);
      })
      .catch((error) => {
        busyRef.current = false;
        setBusy('idle');
        if (isApplicationError(error) && error.code === 'MIC_DENIED') {
          setRecordPhase('ready');
          setMessage(error.message);
          return;
        }
        setRecordPhase('failed');
        setMessage('这次没有重新录上。已经写的字和照片还在。');
      });
  }

  async function onSave() {
    const id = draftIdRef.current;
    if (!id || busyRef.current) return;
    busyRef.current = true;
    setBusy('save');
    try {
      await enqueue(async () => {
        const app = await getUseCases();
        await app.updateDraftNote(id, note);
        await app.saveTextMoment(id);
      });
      router.replace('/');
    } catch (error) {
      setMessage(
        isApplicationError(error) && error.code === 'MOMENT_EMPTY'
          ? '写一句、留下一张照片或一段声音。已经写的草稿还在。'
          : '这次没有留下。草稿还在，可以再试。',
      );
    } finally {
      busyRef.current = false;
      setBusy('idle');
    }
  }

  const actionsLocked = !draftId || busy !== 'idle';
  const saveLabel =
    busy === 'save' ? '正在留下…' : busy === 'photo' ? '正在加入照片…' : busy === 'audio' || busy === 'record' ? '正在留下声音…' : '留下';

  return (
    <SafeAreaView style={styles.safe} accessibilityLabel="留下">
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.column, { maxWidth: readingWidth }]}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="返回最近"
            onPress={() => router.back()}
            style={styles.backHit}
          >
            <Text style={styles.back}>最近</Text>
          </Pressable>
          {restored ? (
            <Text style={styles.restore}>上次还有一些内容没保存，已经为你放回来了。</Text>
          ) : null}
          <TextInput
            accessibilityLabel="要留下的一句话"
            testID="composer-note"
            value={note}
            editable={!!draftId}
            onChangeText={(value) => {
              void persistNote(value);
            }}
            placeholder="写一句就可以，也可以只留下照片或声音。"
            placeholderTextColor="#777168"
            multiline
            textAlignVertical="top"
            style={styles.input}
          />
          <MomentImages images={images} testIDPrefix="composer-image" />
          <DraftSoundBar
            phase={phase}
            elapsedMs={elapsedMs}
            audio={audio}
            playbackStatus={sound.failed ? 'unavailable' : sound.status}
            currentTimeMs={sound.currentTimeMs}
            disabled={actionsLocked}
            onStart={startRecording}
            onStop={stopRecording}
            onPlay={() => {
              if (audio?.uri) void sound.play(audio.uri);
            }}
            onPause={() => {
              void sound.pause();
            }}
            onRerecord={rerecord}
            onRemove={removeAudio}
          />
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="拍摄"
              testID="composer-camera"
              onPress={() => {
                applyImageAction('camera');
              }}
              disabled={actionsLocked}
              style={styles.mediaHit}
            >
              <Text style={styles.media}>拍摄</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="照片"
              testID="composer-library"
              onPress={() => {
                applyImageAction('library');
              }}
              disabled={actionsLocked}
              style={styles.mediaHit}
            >
              <Text style={styles.media}>照片</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="留下"
              testID="composer-save"
              onPress={() => {
                void onSave();
              }}
              disabled={actionsLocked}
              style={styles.saveHit}
            >
              <Text style={styles.save}>{saveLabel}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F3F0E9' },
  flex: { flex: 1 },
  column: {
    flexGrow: 1,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingBottom: 24,
    gap: 16,
  },
  backHit: { minHeight: 44, justifyContent: 'center' },
  back: { fontSize: 16, lineHeight: 22, color: '#53604F' },
  restore: { fontSize: 16, lineHeight: 24, color: '#5C5851' },
  input: {
    minHeight: 160,
    fontSize: 22,
    lineHeight: 32,
    color: '#25231F',
    padding: 0,
  },
  message: { fontSize: 16, lineHeight: 24, color: '#87513D' },
  actions: { gap: 8, paddingBottom: 8 },
  mediaHit: { minHeight: 44, justifyContent: 'center' },
  media: { fontSize: 18, lineHeight: 24, color: '#53604F' },
  saveHit: { minHeight: 44, justifyContent: 'center' },
  save: { fontSize: 18, lineHeight: 24, color: '#53604F' },
});
