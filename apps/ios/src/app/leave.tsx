import { useEffect, useRef, useState } from 'react';
import {
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
import type { ImageView } from '../application/use-cases';
import { MomentImages } from '../screens/moment-images';

export default function LeaveScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const readingWidth = Math.min(width, 720);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [images, setImages] = useState<ImageView[]>([]);
  const [restored, setRestored] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const draftIdRef = useRef<string | null>(null);
  const persistChain = useRef(Promise.resolve());

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
        setRestored(draft.isRestored);
      })
      .catch(() => {
        if (!cancelled) setMessage('草稿暂时读不出来，原来的内容没有被改写。');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function persistNote(next: string) {
    setNote(next);
    const id = draftIdRef.current;
    if (!id) return;
    persistChain.current = persistChain.current
      .then(async () => {
        const app = await getUseCases();
        await app.updateDraftNote(id, next);
      })
      .catch(() => {
        setMessage('草稿暂时写不进去。已经写的字还在屏幕上。');
      });
  }

  async function applyImageAction(action: 'library' | 'camera') {
    const id = draftIdRef.current;
    if (!id) return;
    try {
      await persistChain.current;
      const app = await getUseCases();
      const next =
        action === 'library' ? await app.addLibraryImages(id) : await app.addCameraImage(id);
      setImages(next.images);
      setMessage(null);
    } catch (error) {
      if (isApplicationError(error) && error.code === 'IMAGE_LIMIT') {
        const app = await getUseCases();
        const draft = await app.restoreOrCreateDraft();
        setImages(draft.images);
        setMessage('每条最多三张照片');
        return;
      }
      if (isApplicationError(error) && (error.code === 'LIBRARY_DENIED' || error.code === 'CAMERA_DENIED')) {
        setMessage(error.message);
        return;
      }
      setMessage('这张照片没有留下。已经写的字和已有的照片还在。');
    }
  }

  async function onSave() {
    const id = draftIdRef.current;
    if (!id || saving) return;
    setSaving(true);
    try {
      await persistChain.current;
      const app = await getUseCases();
      await app.updateDraftNote(id, note);
      await app.saveTextMoment(id);
      router.replace('/');
    } catch (error) {
      setMessage(
        isApplicationError(error) && error.code === 'MOMENT_EMPTY'
          ? '写一句或留下一张照片。已经写的草稿还在。'
          : '这次没有留下。草稿还在，可以再试。',
      );
    } finally {
      setSaving(false);
    }
  }

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
            placeholder="写一句就可以，也可以只留下照片。"
            placeholderTextColor="#777168"
            multiline
            textAlignVertical="top"
            style={styles.input}
          />
          <MomentImages images={images} testIDPrefix="composer-image" />
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="拍摄"
              testID="composer-camera"
              onPress={() => {
                void applyImageAction('camera');
              }}
              disabled={!draftId}
              style={styles.mediaHit}
            >
              <Text style={styles.media}>拍摄</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="照片"
              testID="composer-library"
              onPress={() => {
                void applyImageAction('library');
              }}
              disabled={!draftId}
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
              disabled={saving}
              style={styles.saveHit}
            >
              <Text style={styles.save}>{saving ? '正在留下…' : '留下'}</Text>
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
