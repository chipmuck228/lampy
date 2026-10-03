import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { getUseCases } from '../application/container';
import { isApplicationError } from '../application/errors';
import {
  ALBUM_ALREADY_IN,
  ALBUM_COLLECT_MENU,
  ALBUM_NEW_ACTION,
  ALBUM_READ_FAILED,
  ALBUM_WRITE_FAILED,
  DEFAULT_ALBUM_NAME,
  type AlbumListItem,
} from '../application/life-album';
import { ink, inkSoft, paper, sage } from './life-page';
import { Text, TextInput, type } from './life-text';

export function LifeAlbumCollectSheet({
  visible,
  momentId,
  onClose,
}: {
  visible: boolean;
  momentId: string;
  onClose: () => void;
}) {
  const [albums, setAlbums] = useState<AlbumListItem[]>([]);
  const [contained, setContained] = useState<string[]>([]);
  const [name, setName] = useState(DEFAULT_ALBUM_NAME);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadKey, setLoadKey] = useState(0);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    getUseCases()
      .then(async (app) => {
        const [list, ids] = await Promise.all([
          app.listAlbums(),
          app.albumIdsContainingMoment(momentId),
        ]);
        if (cancelled) return;
        if (list.status === 'ready') setAlbums(list.albums);
        else setError(ALBUM_READ_FAILED);
        setContained(ids);
      })
      .catch(() => {
        if (!cancelled) setError(ALBUM_READ_FAILED);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, momentId, loadKey]);

  async function collectInto(albumId: string) {
    if (busy || contained.includes(albumId)) return;
    setBusy(true);
    setError(null);
    try {
      const app = await getUseCases();
      await app.collectAlbumEntry({ albumId, momentId });
      onClose();
    } catch (caught) {
      setError(isApplicationError(caught) ? caught.message : ALBUM_WRITE_FAILED);
    } finally {
      setBusy(false);
    }
  }

  async function createAndCollect() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const app = await getUseCases();
      const album = await app.createAlbum({ name });
      await app.collectAlbumEntry({ albumId: album.id, momentId });
      onClose();
    } catch (caught) {
      setError(isApplicationError(caught) ? caught.message : ALBUM_WRITE_FAILED);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop} testID="life-album-collect-sheet">
        <View style={styles.sheet} accessibilityLabel={ALBUM_COLLECT_MENU}>
          <Text style={styles.title}>{ALBUM_COLLECT_MENU}</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {albums.map((album) => {
            const already = contained.includes(album.id);
            return (
              <Pressable
                key={album.id}
                accessibilityRole="button"
                accessibilityState={{ disabled: already || busy }}
                accessibilityLabel={already ? `${album.name}，${ALBUM_ALREADY_IN}` : album.name}
                testID={`life-album-sheet-${album.id}`}
                onPress={() => {
                  void collectInto(album.id);
                }}
                style={styles.hit}
              >
                <Text style={styles.row}>
                  {album.name}
                  {already ? ` · ${ALBUM_ALREADY_IN}` : ''}
                </Text>
              </Pressable>
            );
          })}
          <Text style={styles.meta}>{ALBUM_NEW_ACTION}</Text>
          <TextInput
            testID="life-album-sheet-name"
            value={name}
            onChangeText={setName}
            editable={!busy}
            placeholder={DEFAULT_ALBUM_NAME}
            style={styles.input}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            accessibilityLabel={ALBUM_NEW_ACTION}
            testID="life-album-sheet-create"
            onPress={() => {
              void createAndCollect();
            }}
            style={styles.hit}
          >
            <Text style={styles.action}>{ALBUM_NEW_ACTION}</Text>
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="取消"
            testID="life-album-sheet-cancel"
            onPress={onClose}
            style={styles.hit}
          >
            <Text style={styles.action}>取消</Text>
          </Pressable>
        </View>
      </View>
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
  },
  title: { ...type.action, color: ink },
  row: { ...type.body, color: ink },
  meta: { ...type.meta, color: inkSoft, marginTop: 8 },
  error: { ...type.meta, color: inkSoft },
  action: { ...type.action, color: sage },
  input: { ...type.body, color: ink, minHeight: 48 },
  hit: { minHeight: 48, justifyContent: 'center' },
});
