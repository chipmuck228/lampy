import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
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

export default function LeaveScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const readingWidth = Math.min(width, 720);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [note, setNote] = useState('');
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
        setRestored(draft.isRestored && !!draft.note.trim());
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
          ? '写一句再留下。已经写的草稿还在。'
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
        <View style={[styles.column, { maxWidth: readingWidth }]}>
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
            placeholder="写一句就可以。"
            placeholderTextColor="#777168"
            multiline
            textAlignVertical="top"
            style={styles.input}
          />
          {message ? <Text style={styles.message}>{message}</Text> : null}
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F3F0E9' },
  flex: { flex: 1 },
  column: {
    flex: 1,
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
    flex: 1,
    fontSize: 22,
    lineHeight: 32,
    color: '#25231F',
    padding: 0,
  },
  message: { fontSize: 16, lineHeight: 24, color: '#87513D' },
  saveHit: { minHeight: 44, justifyContent: 'center' },
  save: { fontSize: 18, lineHeight: 24, color: '#53604F' },
});
