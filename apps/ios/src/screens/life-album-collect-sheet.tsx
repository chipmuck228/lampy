import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { getUseCases } from '../application/container';
import { isApplicationError } from '../application/errors';
import {
  ALBUM_ALREADY_IN,
  ALBUM_COLLECT_MENU,
  ALBUM_JOIN_ACTION,
  ALBUM_NEW_ACTION,
  ALBUM_READ_FAILED,
  ALBUM_WRITE_FAILED,
  type AlbumListItem,
} from '../application/life-album';
import { hairline, ink, inkSoft, paper, paperDeep, sage } from './life-page';
import { Text, type } from './life-text';

export function shouldApplyCollectSheetResult(input: {
  session: number;
  currentSession: number;
  cancelled: boolean;
}): boolean {
  return !input.cancelled && input.session === input.currentSession;
}

export function LifeAlbumCollectSheet({
  visible,
  momentId,
  onClose,
}: {
  visible: boolean;
  momentId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const sheetMax = Math.min(560, Math.max(280, Math.round(height * 0.72)));
  const [albums, setAlbums] = useState<AlbumListItem[]>([]);
  const [contained, setContained] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loadKey, setLoadKey] = useState(0);
  const sheetKey = `${visible ? 'open' : 'closed'}:${momentId}:${loadKey}`;
  const [resetKey, setResetKey] = useState(sheetKey);
  const sessionRef = useRef(0);
  const cancelledRef = useRef(false);
  if (resetKey !== sheetKey) {
    setResetKey(sheetKey);
    if (visible) {
      setError(null);
      setBusyId(null);
    }
  }

  function dismiss() {
    sessionRef.current += 1;
    cancelledRef.current = true;
    onClose();
  }

  useEffect(() => {
    sessionRef.current += 1;
    const session = sessionRef.current;
    if (!visible) {
      cancelledRef.current = true;
      return;
    }
    cancelledRef.current = false;
    getUseCases()
      .then(async (app) => {
        const [list, ids] = await Promise.all([
          app.listAlbums(),
          app.albumIdsContainingMoment(momentId),
        ]);
        if (!shouldApplyCollectSheetResult({
          session,
          currentSession: sessionRef.current,
          cancelled: cancelledRef.current,
        })) {
          return;
        }
        if (list.status === 'ready') setAlbums(list.albums);
        else setError(ALBUM_READ_FAILED);
        setContained(ids);
      })
      .catch(() => {
        if (
          shouldApplyCollectSheetResult({
            session,
            currentSession: sessionRef.current,
            cancelled: cancelledRef.current,
          })
        ) {
          setError(ALBUM_READ_FAILED);
        }
      });
    return () => {
      cancelledRef.current = true;
    };
  }, [visible, momentId, loadKey]);

  async function collectInto(albumId: string) {
    if (busyId || contained.includes(albumId)) return;
    const session = sessionRef.current;
    setBusyId(albumId);
    setError(null);
    try {
      const app = await getUseCases();
      await app.collectAlbumEntry({ albumId, momentId });
      if (
        !shouldApplyCollectSheetResult({
          session,
          currentSession: sessionRef.current,
          cancelled: cancelledRef.current,
        })
      ) {
        return;
      }
      setContained((ids) => (ids.includes(albumId) ? ids : [...ids, albumId]));
    } catch (caught) {
      if (
        !shouldApplyCollectSheetResult({
          session,
          currentSession: sessionRef.current,
          cancelled: cancelledRef.current,
        })
      ) {
        return;
      }
      setError(isApplicationError(caught) ? caught.message : ALBUM_WRITE_FAILED);
    } finally {
      if (
        shouldApplyCollectSheetResult({
          session,
          currentSession: sessionRef.current,
          cancelled: cancelledRef.current,
        })
      ) {
        setBusyId(null);
      }
    }
  }

  function openCreate() {
    dismiss();
    router.push('/albums/new');
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismiss}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
        testID="life-album-collect-sheet"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="关闭"
          testID="life-album-sheet-mask"
          onPress={dismiss}
          style={StyleSheet.absoluteFill}
        />
        <View
          style={[styles.sheet, { maxHeight: sheetMax }]}
          accessibilityLabel={ALBUM_COLLECT_MENU}
          onStartShouldSetResponder={() => true}
        >
          <Text style={styles.title}>{ALBUM_COLLECT_MENU}</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <ScrollView
            testID="life-album-collect-sheet-scroll"
            style={styles.sheetScroll}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
            {albums.map((album) => {
              const already = contained.includes(album.id);
              const joining = busyId === album.id;
              return (
                <View key={album.id} style={styles.albumRow}>
                  <Text style={styles.rowName}>{album.name}</Text>
                  {already ? (
                    <Text
                      accessibilityRole="text"
                      accessibilityLabel={`${album.name}，${ALBUM_ALREADY_IN}`}
                      testID={`life-album-sheet-status-${album.id}`}
                      style={styles.status}
                    >
                      {ALBUM_ALREADY_IN}
                    </Text>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ disabled: !!busyId }}
                      accessibilityLabel={`${ALBUM_JOIN_ACTION}，${album.name}`}
                      testID={`life-album-sheet-${album.id}`}
                      disabled={!!busyId}
                      onPress={() => {
                        void collectInto(album.id);
                      }}
                      style={[styles.capsule, !!busyId && styles.capsuleDisabled]}
                    >
                      <Text style={styles.capsuleLabel}>{joining ? '正在加入' : ALBUM_JOIN_ACTION}</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={ALBUM_NEW_ACTION}
              testID="life-album-sheet-create"
              disabled={!!busyId}
              onPress={openCreate}
              style={styles.createHit}
            >
              <Text style={styles.createLabel}>＋ {ALBUM_NEW_ACTION}</Text>
            </Pressable>
            {error ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="再试一次"
                onPress={() => setLoadKey((value) => value + 1)}
                style={styles.hit}
              >
                <Text style={styles.action}>再试一次</Text>
              </Pressable>
            ) : null}
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="取消"
            testID="life-album-sheet-cancel"
            onPress={dismiss}
            style={styles.cancelHit}
          >
            <Text style={styles.cancelLabel}>取消</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(37,35,31,0.28)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  sheet: {
    backgroundColor: paper,
    paddingHorizontal: 20,
    paddingVertical: 18,
    gap: 8,
    zIndex: 1,
  },
  sheetScroll: {
    flexGrow: 0,
  },
  title: { ...type.action, color: ink },
  albumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingVertical: 6,
  },
  rowName: { ...type.body, color: ink, flex: 1, flexShrink: 1, minWidth: 0 },
  status: { ...type.meta, color: inkSoft, flexShrink: 0 },
  error: { ...type.meta, color: inkSoft },
  action: { ...type.action, color: sage },
  hit: { minHeight: 48, justifyContent: 'center' },
  capsule: {
    minHeight: 40,
    minWidth: 88,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: paperDeep,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: sage,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  capsuleDisabled: { opacity: 0.45 },
  capsuleLabel: { ...type.action, color: ink, fontSize: 14 },
  createHit: {
    minHeight: 48,
    marginTop: 8,
    borderRadius: 24,
    backgroundColor: paperDeep,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: sage,
    justifyContent: 'center',
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
  },
  createLabel: { ...type.action, color: ink },
  cancelHit: {
    minHeight: 48,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: hairline,
    backgroundColor: paper,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  cancelLabel: { ...type.action, color: sage },
});
