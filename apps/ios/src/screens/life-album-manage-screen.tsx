import { useCallback, useEffect, useRef, useState } from 'react';
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
  albumDateRangeLabel,
  albumEntryCountLabel,
  formatAlbumAudioDuration,
  type AlbumCover,
  type AlbumEntryView,
  type AlbumManageView,
} from '../application/life-album';
import {
  ALBUM_PREVIEW_ACTION,
  ALBUM_PREVIEW_EMPTY,
  canOpenAlbumPreview,
} from '../application/album-layout';
import { firstSearchParam } from './lookback-origin';
import { momentHref } from './lookback-chrome';
import { hairline, ink, inkSoft, paperDeep, sage } from './life-page';
import { Text, TextInput, type } from './life-text';
import { LifeIcon, LifeIconButton } from './life-icons';
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
  const [editing, setEditing] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loadKey, setLoadKey] = useState(0);
  const hydratedId = useRef<string | null>(null);
  const busyRef = useRef(false);
  const aliveRef = useRef(true);

  const applyView = useCallback((next: AlbumManageView, mode: 'hydrate' | 'refresh' | 'name' | 'opening') => {
    if (!aliveRef.current) return;
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

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
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
          if (cancelled || !aliveRef.current) return;
          applyView(next, hydratedId.current === next.album.id ? 'refresh' : 'hydrate');
        })
        .catch((caught) => {
          if (cancelled || !aliveRef.current) return;
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
      if (!aliveRef.current) return;
      if (next) applyView(next, mode);
    } catch (caught) {
      if (!aliveRef.current) return;
      setError(isApplicationError(caught) ? caught.message : ALBUM_WRITE_FAILED);
    } finally {
      busyRef.current = false;
      if (aliveRef.current) setBusy(false);
    }
  }

  function closeEditor() {
    if (view) {
      setName(view.album.name);
      setOpening(view.album.opening ?? '');
    }
    setEditing(false);
    setError(null);
  }

  const cover = view?.album.cover;
  const selectedCoverUri =
    cover?.kind === 'image'
      ? view?.coverCandidates.find(
          (candidate) => candidate.assetId === cover.assetId && candidate.momentId === cover.momentId,
        )?.uri
      : undefined;
  const dateRange = view ? albumDateRangeLabel(view.entries) : null;

  return (
    <SettingsPage
      title={view?.album.name || '这一册'}
      backLabel="我的生活册"
      accessibilityLabel="这一册"
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
          <View style={styles.hero}>
            <View style={styles.heroCover} testID="life-album-manage-cover">
              {selectedCoverUri ? (
                <Image source={{ uri: selectedCoverUri }} style={styles.heroImage} accessibilityIgnoresInvertColors />
              ) : (
                <Text style={styles.heroWords} numberOfLines={3}>
                  {view.album.name}
                </Text>
              )}
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.heroTitle} numberOfLines={2}>
                {view.album.name}
              </Text>
              <Text style={styles.meta}>
                {albumEntryCountLabel(view.entries.length)}
                {dateRange ? ` · ${dateRange}` : ''}
              </Text>
              {canOpenAlbumPreview(view.entries.length) ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={ALBUM_PREVIEW_ACTION}
                  testID="life-album-preview-open"
                  onPress={() => router.push(`/albums/${albumId}/preview`)}
                  style={styles.previewHit}
                >
                  <Text style={styles.previewLabel}>{ALBUM_PREVIEW_ACTION}</Text>
                </Pressable>
              ) : (
                <Text style={styles.hint}>{ALBUM_PREVIEW_EMPTY}</Text>
              )}
            </View>
            <LifeIconButton
              name="more"
              label="册子菜单"
              testID="life-album-manage-menu"
              onPress={() => setMenuOpen((open) => !open)}
            />
          </View>
          {menuOpen ? (
            <View style={styles.menu}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="删除这一册"
                testID="life-album-delete"
                disabled={busy}
                onPress={() => {
                  if (busyRef.current) return;
                  setMenuOpen(false);
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
          <View style={styles.toolbar}>
            {editing ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="取消"
                testID="life-album-cancel-edit"
                onPress={closeEditor}
                style={styles.hit}
              >
                <Text style={styles.action}>取消</Text>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="编辑册子"
                testID="life-album-edit"
                onPress={() => {
                  setMenuOpen(false);
                  setEditing(true);
                }}
                style={styles.hit}
              >
                <Text style={styles.action}>编辑册子</Text>
              </Pressable>
            )}
            {organizing ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="完成"
                testID="life-album-organize-done"
                onPress={() => setOrganizing(false)}
                style={styles.doneHit}
              >
                <Text style={styles.doneLabel}>完成</Text>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="整理"
                testID="life-album-organize"
                onPress={() => {
                  setMenuOpen(false);
                  setOrganizing(true);
                }}
                style={styles.hit}
              >
                <Text style={styles.action}>整理</Text>
              </Pressable>
            )}
          </View>
          {editing ? (
            <View testID="life-album-editor" style={styles.edit}>
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
            </View>
          ) : null}
          {view.entries.map((entry, index) => (
            <AlbumEntryRow
              key={entry.momentId}
              entry={entry}
              index={index}
              last={index === view.entries.length - 1}
              organizing={organizing}
              busy={busy}
              onOpen={() => {
                if (organizing) return;
                router.push(momentHref(entry.momentId));
              }}
              onMoveUp={() => {
                if (busyRef.current || index === 0) return;
                void run((app) => app.moveAlbumEntry({ albumId, momentId: entry.momentId, direction: 'up' }));
              }}
              onMoveDown={() => {
                if (busyRef.current || index === view.entries.length - 1) return;
                void run((app) => app.moveAlbumEntry({ albumId, momentId: entry.momentId, direction: 'down' }));
              }}
              onRemove={() => {
                if (busyRef.current) return;
                void run((app) => app.withdrawAlbumEntry({ albumId, momentId: entry.momentId }));
              }}
            />
          ))}
        </View>
      ) : null}
    </SettingsPage>
  );
}

function AlbumEntryRow({
  entry,
  index,
  last,
  organizing,
  busy,
  onOpen,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  entry: AlbumEntryView;
  index: number;
  last: boolean;
  organizing: boolean;
  busy: boolean;
  onOpen: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  const moveUpDisabled = busy || index === 0;
  const moveDownDisabled = busy || last;
  const duration = formatAlbumAudioDuration(entry.audioDurationMs);
  const ready = entry.source === 'ready';
  return (
    <View style={styles.entry} testID={`life-album-entry-${entry.momentId}`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={ready ? entry.noteExcerpt || `第${index + 1}条` : ALBUM_MISSING_SOURCE}
        testID={`life-album-entry-open-${entry.momentId}`}
        disabled={organizing}
        onPress={onOpen}
        style={styles.entryHit}
      >
        {ready && entry.thumbnailUri ? (
          <Image source={{ uri: entry.thumbnailUri }} style={styles.thumb} testID={`life-album-entry-thumb-${entry.momentId}`} accessibilityIgnoresInvertColors />
        ) : null}
        <View style={styles.entryCopy}>
          {ready ? (
            <>
              {entry.noteExcerpt ? (
                <Text testID={`life-album-entry-note-${entry.momentId}`} style={styles.excerpt} numberOfLines={3}>
                  {entry.noteExcerpt}
                </Text>
              ) : null}
              {entry.dateLabel ? (
                <Text testID={`life-album-entry-date-${entry.momentId}`} style={styles.hint}>
                  {entry.dateLabel}
                </Text>
              ) : null}
              {entry.hasAudio || entry.photoCount > 1 || entry.unknownCount > 0 || (entry.photoCount === 1 && !entry.thumbnailUri) ? (
                <View style={styles.mediaRow}>
                  {entry.photoCount > 1 ? (
                    <Text testID={`life-album-entry-media-${entry.momentId}`} style={styles.hint}>
                      {entry.photoCount}张照片
                    </Text>
                  ) : entry.photoCount === 1 && !entry.thumbnailUri ? (
                    <Text testID={`life-album-entry-media-${entry.momentId}`} style={styles.hint}>
                      有照片
                    </Text>
                  ) : null}
                  {entry.hasAudio ? (
                    <View style={styles.audioMark} testID={`life-album-entry-audio-${entry.momentId}`}>
                      <LifeIcon name="record" size={16} decorative />
                      <Text style={styles.hint}>{duration ? duration : '有声音'}</Text>
                    </View>
                  ) : null}
                  {entry.unknownCount > 0 ? (
                    <Text testID={`life-album-entry-unknown-${entry.momentId}`} style={styles.hint}>
                      还有一种现在打不开的媒介。
                    </Text>
                  ) : null}
                </View>
              ) : null}
              {!entry.noteExcerpt && !entry.dateLabel && !entry.mediaHint ? (
                <Text style={styles.hint}>第{index + 1}条</Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.body}>{ALBUM_MISSING_SOURCE}</Text>
          )}
        </View>
      </Pressable>
      {organizing ? (
        <View style={styles.row}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: moveUpDisabled }}
            accessibilityLabel="上移"
            testID={`life-album-move-up-${entry.momentId}`}
            disabled={moveUpDisabled}
            onPress={onMoveUp}
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
            onPress={onMoveDown}
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
            onPress={onRemove}
            style={styles.hit}
          >
            <Text style={[styles.action, busy && styles.disabled]}>移出</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
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
        style={[styles.coverChip, selected.kind === 'words' && styles.coverChipOn]}
      >
        <Text style={[styles.coverChipLabel, disabled && styles.disabled]}>{ALBUM_WORDS_COVER}</Text>
        {selected.kind === 'words' ? <Text style={styles.selectedMark}>已选</Text> : null}
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
            accessibilityLabel={active ? '已选这张照片做封面' : '选这张照片做封面'}
            testID={`life-album-cover-${candidate.assetId}`}
            disabled={blocked}
            onPress={() => {
              if (blocked) return;
              onSelect({ kind: 'image', momentId: candidate.momentId, assetId: candidate.assetId });
            }}
            style={[styles.coverHit, active && styles.coverHitOn]}
          >
            {candidate.uri ? (
              <Image source={{ uri: candidate.uri }} style={styles.coverImage} />
            ) : (
              <Text style={styles.hint}>这张照片现在看不到</Text>
            )}
            {active ? <Text style={styles.selectedMark}>已选</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 10 },
  hero: { flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 },
  heroCover: {
    width: 72,
    height: 96,
    borderRadius: 4,
    backgroundColor: paperDeep,
    overflow: 'hidden',
    justifyContent: 'center',
    padding: 8,
    flexShrink: 0,
  },
  heroImage: { width: 72, height: 96 },
  heroWords: { ...type.meta, color: ink, fontSize: 13, lineHeight: 18 },
  heroCopy: { flex: 1, minWidth: 0, gap: 6 },
  heroTitle: { ...type.action, color: ink, flexShrink: 1 },
  previewHit: {
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 24,
    backgroundColor: paperDeep,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: sage,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  previewLabel: { ...type.action, color: ink },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' },
  doneHit: {
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 24,
    backgroundColor: paperDeep,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: sage,
    justifyContent: 'center',
  },
  doneLabel: { ...type.action, color: ink },
  menu: { gap: 4 },
  edit: { gap: 8 },
  label: { ...type.meta, color: sage, marginTop: 4 },
  hint: { ...type.meta, color: inkSoft },
  meta: { ...type.meta, color: inkSoft },
  body: { ...type.body, color: ink },
  excerpt: { ...type.body, color: ink },
  input: { ...type.body, color: ink, minHeight: 48, paddingVertical: 8 },
  action: { ...type.action, color: sage },
  danger: { ...type.action, color: inkSoft },
  disabled: { opacity: 0.45 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  entry: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: hairline,
    paddingTop: 10,
    gap: 6,
  },
  entryHit: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, minHeight: 48 },
  entryCopy: { flex: 1, minWidth: 0, gap: 2 },
  thumb: { width: 56, height: 56, borderRadius: 4, backgroundColor: paperDeep, flexShrink: 0 },
  mediaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  audioMark: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  covers: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  coverChip: {
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: hairline,
    justifyContent: 'center',
  },
  coverChipOn: { borderColor: sage, backgroundColor: paperDeep },
  coverChipLabel: { ...type.action, color: sage },
  coverHit: { minHeight: 48, minWidth: 48, justifyContent: 'center' },
  coverHitOn: { borderWidth: StyleSheet.hairlineWidth, borderColor: sage, borderRadius: 6, padding: 2 },
  coverImage: { width: 56, height: 56, borderRadius: 4 },
  selectedMark: { ...type.meta, color: sage },
  hit: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' },
});
