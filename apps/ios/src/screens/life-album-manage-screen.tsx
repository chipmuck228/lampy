import { useCallback, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { getUseCases } from '../application/container';
import { isApplicationError } from '../application/errors';
import {
  ALBUM_DELETE_CONFIRM,
  ALBUM_GONE,
  ALBUM_MISSING_SOURCE,
  ALBUM_OPENING_HINT,
  ALBUM_READ_FAILED,
  ALBUM_RETRY,
  ALBUM_WORDS_COVER,
  ALBUM_WRITE_FAILED,
  type AlbumCover,
  type AlbumManageView,
} from '../application/life-album';
import { firstSearchParam } from './lookback-origin';
import { hairline, ink, inkSoft, sage } from './life-page';
import { Text, TextInput, type } from './life-text';
import { SettingsPage } from './settings-chrome';

export default function LifeAlbumManageScreen() {
  const router = useRouter();
  const albumId = firstSearchParam(useLocalSearchParams<{ id?: string | string[] }>().id) ?? '';
  const [view, setView] = useState<AlbumManageView | null>(null);
  const [name, setName] = useState('');
  const [opening, setOpening] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadKey, setLoadKey] = useState(0);

  const applyView = useCallback((next: AlbumManageView) => {
    setView(next);
    setName(next.album.name);
    setOpening(next.album.opening ?? '');
    setMissing(false);
    setError(null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      const request = loadKey;
      let cancelled = false;
      getUseCases()
        .then((app) => app.getAlbum(albumId))
        .then((next) => {
          if (!cancelled && request >= 0) applyView(next);
        })
        .catch((caught) => {
          if (cancelled) return;
          if (isApplicationError(caught) && caught.code === 'ALBUM_NOT_FOUND') {
            setMissing(true);
            setError(ALBUM_GONE);
            return;
          }
          setError(ALBUM_READ_FAILED);
        });
      return () => {
        cancelled = true;
      };
    }, [albumId, applyView, loadKey]),
  );

  async function run(work: (app: Awaited<ReturnType<typeof getUseCases>>) => Promise<AlbumManageView | void>) {
    if (busy || !albumId) return;
    setBusy(true);
    setError(null);
    try {
      const app = await getUseCases();
      const next = await work(app);
      if (next) applyView(next);
    } catch (caught) {
      setError(isApplicationError(caught) ? caught.message : ALBUM_WRITE_FAILED);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsPage
      title={view?.album.name || '这一册'}
      backLabel="我的生活册"
      accessibilityLabel="管理生活册"
      pageTestID="life-album-manage"
      onBack={() => router.dismissTo('/albums')}
    >
      {missing ? <Text style={styles.body}>{ALBUM_GONE}</Text> : null}
      {error && !missing ? <Text style={styles.body}>{error}</Text> : null}
      {error && !view ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={ALBUM_RETRY}
          onPress={() => setLoadKey((value) => value + 1)}
          style={styles.hit}
        >
          <Text style={styles.action}>{ALBUM_RETRY}</Text>
        </Pressable>
      ) : null}
      {view ? (
        <View style={styles.block}>
          <Text style={styles.label}>册名</Text>
          <TextInput
            testID="life-album-manage-name"
            value={name}
            onChangeText={setName}
            editable={!busy}
            style={styles.input}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            accessibilityLabel="保存册名"
            testID="life-album-manage-save-name"
            onPress={() => {
              void run((app) => app.updateAlbum({ albumId, name }));
            }}
            style={styles.hit}
          >
            <Text style={styles.action}>保存册名</Text>
          </Pressable>
          <Text style={styles.label}>开篇</Text>
          <Text style={styles.hint}>{ALBUM_OPENING_HINT}</Text>
          <TextInput
            testID="life-album-manage-opening"
            value={opening}
            onChangeText={setOpening}
            editable={!busy}
            multiline
            style={styles.input}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            accessibilityLabel="保存开篇"
            testID="life-album-manage-save-opening"
            onPress={() => {
              void run((app) => app.updateAlbum({ albumId, opening }));
            }}
            style={styles.hit}
          >
            <Text style={styles.action}>保存开篇</Text>
          </Pressable>
          <Text style={styles.label}>封面</Text>
          <CoverChoice
            selected={view.album.cover}
            candidates={view.coverCandidates}
            disabled={busy}
            onSelect={(cover) => {
              void run((app) => app.setAlbumCover({ albumId, cover }));
            }}
          />
          <Text style={styles.label}>收入的记录</Text>
          {view.entries.length === 0 ? <Text style={styles.hint}>还没有收下记录。</Text> : null}
          {view.entries.map((entry, index) => (
            <View key={entry.momentId} style={styles.entry} testID={`life-album-entry-${entry.momentId}`}>
              <Text style={styles.body}>
                {entry.source === 'ready' ? `第${index + 1}条` : ALBUM_MISSING_SOURCE}
              </Text>
              <View style={styles.row}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: busy || index === 0 }}
                  accessibilityLabel="上移"
                  testID={`life-album-move-up-${entry.momentId}`}
                  onPress={() => {
                    void run((app) =>
                      app.moveAlbumEntry({ albumId, momentId: entry.momentId, direction: 'up' }),
                    );
                  }}
                  style={styles.hit}
                >
                  <Text style={styles.action}>上移</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: busy || index === view.entries.length - 1 }}
                  accessibilityLabel="下移"
                  testID={`life-album-move-down-${entry.momentId}`}
                  onPress={() => {
                    void run((app) =>
                      app.moveAlbumEntry({ albumId, momentId: entry.momentId, direction: 'down' }),
                    );
                  }}
                  style={styles.hit}
                >
                  <Text style={styles.action}>下移</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: busy }}
                  accessibilityLabel="移出"
                  testID={`life-album-remove-${entry.momentId}`}
                  onPress={() => {
                    void run((app) => app.withdrawAlbumEntry({ albumId, momentId: entry.momentId }));
                  }}
                  style={styles.hit}
                >
                  <Text style={styles.action}>移出</Text>
                </Pressable>
              </View>
            </View>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            accessibilityLabel="删除这一册"
            testID="life-album-delete"
            onPress={() => {
              Alert.alert('删除这一册', ALBUM_DELETE_CONFIRM, [
                { text: '取消', style: 'cancel' },
                {
                  text: '删除这一册',
                  style: 'destructive',
                  onPress: () => {
                    void run(async (app) => {
                      await app.deleteAlbum(albumId);
                      router.dismissTo('/albums');
                    });
                  },
                },
              ]);
            }}
            style={styles.hit}
          >
            <Text style={styles.danger}>删除这一册</Text>
          </Pressable>
        </View>
      ) : null}
    </SettingsPage>
  );
}

function CoverChoice({
  selected,
  candidates,
  disabled,
  onSelect,
}: {
  selected: AlbumCover;
  candidates: AlbumManageView['coverCandidates'];
  disabled: boolean;
  onSelect: (cover: AlbumCover) => void;
}) {
  return (
    <View style={styles.covers}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: selected.kind === 'words', disabled }}
        accessibilityLabel={ALBUM_WORDS_COVER}
        testID="life-album-cover-words"
        onPress={() => onSelect({ kind: 'words' })}
        style={styles.hit}
      >
        <Text style={styles.action}>{ALBUM_WORDS_COVER}</Text>
      </Pressable>
      {candidates.map((candidate) => {
        const active =
          selected.kind === 'image' &&
          selected.momentId === candidate.momentId &&
          selected.assetId === candidate.assetId;
        return (
          <Pressable
            key={`${candidate.momentId}:${candidate.assetId}`}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled: disabled || !candidate.available }}
            accessibilityLabel="选这张照片做封面"
            testID={`life-album-cover-${candidate.assetId}`}
            onPress={() =>
              onSelect({ kind: 'image', momentId: candidate.momentId, assetId: candidate.assetId })
            }
            style={styles.coverHit}
          >
            {candidate.uri ? (
              <Image source={{ uri: candidate.uri }} style={styles.coverImage} />
            ) : (
              <Text style={styles.hint}>这张照片现在看不到</Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 8 },
  label: { ...type.meta, color: sage, marginTop: 12 },
  hint: { ...type.meta, color: inkSoft },
  body: { ...type.body, color: ink },
  input: { ...type.body, color: ink, minHeight: 48, paddingVertical: 8 },
  action: { ...type.action, color: sage },
  danger: { ...type.action, color: inkSoft },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  entry: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: hairline,
    paddingTop: 8,
    gap: 4,
  },
  covers: { gap: 8 },
  coverHit: { minHeight: 48, justifyContent: 'center' },
  coverImage: { width: 72, height: 72, borderRadius: 4 },
  hit: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' },
});
