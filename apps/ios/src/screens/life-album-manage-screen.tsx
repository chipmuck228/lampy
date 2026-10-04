import { useCallback, useRef, useState } from 'react';
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
import {
  ALBUM_PREVIEW_ACTION,
  ALBUM_PREVIEW_EMPTY,
  canOpenAlbumPreview,
} from '../application/album-layout';
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
  const hydratedId = useRef<string | null>(null);
  const busyRef = useRef(false);

  const applyView = useCallback((next: AlbumManageView, mode: 'hydrate' | 'refresh' | 'name' | 'opening') => {
    setView(next);
    setMissing(false);
    setError(null);
    if (mode === 'hydrate') {
      setName(next.album.name);
      setOpening(next.album.opening ?? '');
      hydratedId.current = next.album.id;
      return;
    }
    if (mode === 'name') setName(next.album.name);
    if (mode === 'opening') setOpening(next.album.opening ?? '');
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadKey;
      if (hydratedId.current && hydratedId.current !== albumId) {
        hydratedId.current = null;
      }
      let cancelled = false;
      getUseCases()
        .then((app) => app.getAlbum(albumId))
        .then((next) => {
          if (cancelled) return;
          applyView(next, hydratedId.current === next.album.id ? 'refresh' : 'hydrate');
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

  async function run(
    work: (app: Awaited<ReturnType<typeof getUseCases>>) => Promise<AlbumManageView | void>,
    mode: 'refresh' | 'name' | 'opening' = 'refresh',
  ) {
    if (busyRef.current || !albumId) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const app = await getUseCases();
      const next = await work(app);
      if (next) applyView(next, mode);
    } catch (caught) {
      setError(isApplicationError(caught) ? caught.message : ALBUM_WRITE_FAILED);
    } finally {
      busyRef.current = false;
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
          onPress={() => {
            hydratedId.current = null;
            setLoadKey((value) => value + 1);
          }}
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
            disabled={busy}
            onPress={() => {
              if (busyRef.current) return;
              void run((app) => app.updateAlbum({ albumId, name }), 'name');
            }}
            style={styles.hit}
          >
            <Text style={[styles.action, busy && styles.disabled]}>保存册名</Text>
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
            disabled={busy}
            onPress={() => {
              if (busyRef.current) return;
              void run((app) => app.updateAlbum({ albumId, opening }), 'opening');
            }}
            style={styles.hit}
          >
            <Text style={[styles.action, busy && styles.disabled]}>保存开篇</Text>
          </Pressable>
          <Text style={styles.label}>封面</Text>
          <CoverChoice
            selected={view.album.cover}
            candidates={view.coverCandidates}
            disabled={busy}
            onSelect={(cover) => {
              if (busyRef.current) return;
              void run((app) => app.setAlbumCover({ albumId, cover }));
            }}
          />
          <Text style={styles.label}>收入的记录</Text>
          {canOpenAlbumPreview(view.entries.length) ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={ALBUM_PREVIEW_ACTION}
              testID="life-album-preview-open"
              onPress={() => router.push(`/albums/${albumId}/preview`)}
              style={styles.hit}
            >
              <Text style={styles.action}>{ALBUM_PREVIEW_ACTION}</Text>
            </Pressable>
          ) : (
            <Text style={styles.hint}>{ALBUM_PREVIEW_EMPTY}</Text>
          )}
          {view.entries.map((entry, index) => {
            const moveUpDisabled = busy || index === 0;
            const moveDownDisabled = busy || index === view.entries.length - 1;
            return (
              <View key={entry.momentId} style={styles.entry} testID={`life-album-entry-${entry.momentId}`}>
                {entry.source === 'ready' ? (
                  <>
                    {entry.noteExcerpt ? (
                      <Text testID={`life-album-entry-note-${entry.momentId}`} style={styles.body}>
                        {entry.noteExcerpt}
                      </Text>
                    ) : null}
                    {entry.dateLabel ? (
                      <Text testID={`life-album-entry-date-${entry.momentId}`} style={styles.hint}>
                        {entry.dateLabel}
                      </Text>
                    ) : null}
                    {entry.mediaHint ? (
                      <Text testID={`life-album-entry-media-${entry.momentId}`} style={styles.hint}>
                        {entry.mediaHint}
                      </Text>
                    ) : null}
                    {!entry.noteExcerpt && !entry.dateLabel && !entry.mediaHint ? (
                      <Text style={styles.hint}>第{index + 1}条</Text>
                    ) : null}
                  </>
                ) : (
                  <Text style={styles.body}>{ALBUM_MISSING_SOURCE}</Text>
                )}
                <View style={styles.row}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: moveUpDisabled }}
                    accessibilityLabel="上移"
                    testID={`life-album-move-up-${entry.momentId}`}
                    disabled={moveUpDisabled}
                    onPress={() => {
                      if (busyRef.current || moveUpDisabled) return;
                      void run((app) =>
                        app.moveAlbumEntry({ albumId, momentId: entry.momentId, direction: 'up' }),
                      );
                    }}
                    style={styles.hit}
                  >
                    <Text style={[styles.action, moveUpDisabled && styles.disabled]}>上移</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: moveDownDisabled }}
                    accessibilityLabel="下移"
                    testID={`life-album-move-down-${entry.momentId}`}
                    disabled={moveDownDisabled}
                    onPress={() => {
                      if (busyRef.current || moveDownDisabled) return;
                      void run((app) =>
                        app.moveAlbumEntry({ albumId, momentId: entry.momentId, direction: 'down' }),
                      );
                    }}
                    style={styles.hit}
                  >
                    <Text style={[styles.action, moveDownDisabled && styles.disabled]}>下移</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: busy }}
                    accessibilityLabel="移出"
                    testID={`life-album-remove-${entry.momentId}`}
                    disabled={busy}
                    onPress={() => {
                      if (busyRef.current) return;
                      void run((app) => app.withdrawAlbumEntry({ albumId, momentId: entry.momentId }));
                    }}
                    style={styles.hit}
                  >
                    <Text style={[styles.action, busy && styles.disabled]}>移出</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            accessibilityLabel="删除这一册"
            testID="life-album-delete"
            disabled={busy}
            onPress={() => {
              if (busyRef.current) return;
              Alert.alert('删除这一册', ALBUM_DELETE_CONFIRM, [
                { text: '取消', style: 'cancel' },
                {
                  text: '删除这一册',
                  style: 'destructive',
                  onPress: () => {
                    if (busyRef.current) return;
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
            <Text style={[styles.danger, busy && styles.disabled]}>删除这一册</Text>
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
        disabled={disabled}
        onPress={() => {
          if (disabled) return;
          onSelect({ kind: 'words' });
        }}
        style={styles.hit}
      >
        <Text style={[styles.action, disabled && styles.disabled]}>{ALBUM_WORDS_COVER}</Text>
      </Pressable>
      {candidates.map((candidate) => {
        const active =
          selected.kind === 'image' &&
          selected.momentId === candidate.momentId &&
          selected.assetId === candidate.assetId;
        const blocked = disabled || !candidate.available;
        return (
          <Pressable
            key={`${candidate.momentId}:${candidate.assetId}`}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled: blocked }}
            accessibilityLabel="选这张照片做封面"
            testID={`life-album-cover-${candidate.assetId}`}
            disabled={blocked}
            onPress={() => {
              if (blocked) return;
              onSelect({ kind: 'image', momentId: candidate.momentId, assetId: candidate.assetId });
            }}
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
  disabled: { opacity: 0.45 },
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
