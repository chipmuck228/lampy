import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getUseCases } from '../application/container';
import type { AlbumLayoutInput } from '../application/album-layout-input';
import {
  ALBUM_AUDIO_MISSING,
  ALBUM_CLOSE_TEXT,
  ALBUM_IMAGE_MISSING,
  ALBUM_SOURCE_CHANGED,
  ALBUM_SOURCE_GONE,
  ALBUM_SOURCE_UNREADABLE,
  ALBUM_TIME_UNKNOWN,
} from '../application/album-layout';
import { dateKeyAndLabel, recordedLabel } from '../application/album-paginate';
import {
  ALBUM_RETRY,
  ALBUM_READ_FAILED,
  formatAlbumAudioDuration,
} from '../application/life-album';
import {
  ALBUM_READING_STYLES,
  albumReadingFingerprint,
  albumReadingFonts,
  captureAlbumReadingPosition,
  restoreAlbumReadingPosition,
  type AlbumReadingPosition,
  type AlbumReadingStyle,
} from '../application/album-reading';
import {
  readAlbumReadingState,
  saveAlbumReadingState,
} from '../infrastructure/album-reading-store';
import {
  feelingAccentColor,
  isFeelingWord,
} from '../application/feeling-accent';
import { feelingLabel, tr } from '../i18n';
import { firstSearchParam } from './lookback-origin';
import { useDeviceLock } from './device-lock-context';
import { useRecentClipPlayback } from './use-recent-clip-playback';
import { Text } from './life-text';

const fonts = albumReadingFonts();
const timezone = {
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
};
export default function LifeAlbumReadingScreen() {
  const router = useRouter();
  const albumId =
    firstSearchParam(useLocalSearchParams<{ id?: string | string[] }>().id) ??
    '';
  const lock = useDeviceLock();
  const clips = useRecentClipPlayback();
  const pause = useRef(clips.pause);
  useEffect(() => {
    pause.current = clips.pause;
  }, [clips.pause]);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [foreground, setForeground] = useState(
    AppState.currentState === 'active',
  );
  const blocked = !!lock?.snapshot.locked || !foreground;
  const [input, setInput] = useState<AlbumLayoutInput | null>(null);
  const [style, setStyle] = useState<AlbumReadingStyle>('plain');
  const [error, setError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [retry, setRetry] = useState(0);
  const scroll = useRef<ScrollView>(null);
  const anchors = useRef<Record<string, number>>({});
  const saved = useRef<AlbumReadingPosition | null>(null);
  const contentReady = useRef(false);
  const restoring = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<{
    id: string;
    style: AlbumReadingStyle;
    position: AlbumReadingPosition | null;
  } | null>(null);
  const alive = useRef(false);
  const persist = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const state = latest.current;
    if (state)
      void saveAlbumReadingState(state.id, state.style, state.position).catch(
        () => {
          if (alive.current && latest.current?.id === state.id) setSaveError(true);
        },
      );
  }, []);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      setForeground(state === 'active');
      if (state !== 'active') {
        void pause.current();
        persist();
      }
    });
    return () => sub.remove();
  }, [persist]);
  useFocusEffect(
    useCallback(() => {
      void retry;
      let cancelled = false;
      let requestId: number | undefined;
      const signal = { cancelled: false };
      alive.current = true;
      setInput(null);
      setError(false);
      anchors.current = {};
      contentReady.current = false;
      restoring.current = true;
      latest.current = null;
      if (!blocked && albumId)
        void (async () => {
          try {
            const app = await getUseCases();
            if (cancelled) return;
            requestId = app.beginAlbumLayout(albumId).requestId;
            const preference = await readAlbumReadingState(albumId).catch(
              () => ({ style: 'plain' as const, position: null }),
            );
            if (cancelled) return;
            const result = await app.readAlbumForContinuousReading(albumId, {
              requestId,
              signal,
              privateUnlocked: true,
            });
            if (cancelled || result.input.album.id !== albumId) return;
            saved.current = preference.position;
            setStyle(preference.style);
            setInput(result.input);
          } catch {
            if (!cancelled) setError(true);
          }
        })();
      return () => {
        cancelled = true;
        signal.cancelled = true;
        alive.current = false;
        persist();
        void pause.current();
        if (requestId != null)
          void getUseCases().then((app) => app.cancelAlbumLayout(requestId));
      };
    }, [albumId, blocked, retry, persist]),
  );
  const shown = !blocked && input?.album.id === albumId ? input : null;
  const fingerprint = useMemo(
    () => (shown ? albumReadingFingerprint(shown) : ''),
    [shown],
  );
  const contentWidth = Math.max(
    1,
    Math.min(620, width - insets.left - insets.right - 48),
  );
  const theme = ALBUM_READING_STYLES[style];
  const metadata = { fingerprint, width: contentWidth, style };
  const geometry = `${contentWidth}:${style}:${fingerprint}`;
  useLayoutEffect(() => {
    if (latest.current?.position) saved.current = latest.current.position;
    anchors.current = {};
    contentReady.current = false;
    restoring.current = true;
  }, [geometry]);
  function remember(y: number) {
    if (!shown || !alive.current || restoring.current) return;
    latest.current = {
      id: albumId,
      style,
      position: captureAlbumReadingPosition(
        { ...metadata, y },
        anchors.current,
      ),
    };
  }
  function tryRestore() {
    if (
      !shown ||
      !alive.current ||
      !contentReady.current ||
      !restoring.current ||
      Object.keys(anchors.current).length !== shown.entries.length
    )
      return;
    const target = restoreAlbumReadingPosition(
      saved.current,
      metadata,
      anchors.current,
    );
    restoring.current = false;
    scroll.current?.scrollTo({ y: target, animated: false });
    remember(target);
  }
  const records = useMemo(() => {
    let previousDate: string | null = null;
    const output = [];
    for (const record of shown?.entries ?? []) {
      const date = dateKeyAndLabel(record, timezone);
      const showDate = !!date.key && date.key !== previousDate;
      if (date.key) previousDate = date.key;
      output.push({
        record,
        date,
        showDate,
        recorded: recordedLabel(record, timezone),
      });
    }
    return output;
  }, [shown]);
  const cover = shown?.album.cover;
  const coverMedia =
    cover?.kind === 'image'
      ? shown?.entries
          .find((record) => record.momentId === cover.momentId)
          ?.media.find((item) => item.assetId === cover.assetId)
      : null;
  return (
    <View
      style={[styles.page, { backgroundColor: theme.paper }]}
      testID="life-album-reading"
    >
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top,
            paddingLeft: Math.max(12, insets.left),
            paddingRight: Math.max(12, insets.right),
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr('返回')}
          onPress={() => router.back()}
          style={styles.hit}
        >
          <Text style={fonts.date}>{tr('返回')}</Text>
        </Pressable>
        <Text style={fonts.meta}>{tr('连续阅读')}</Text>
        {shown ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('看纸页')}
            onPress={() => {
              persist();
              void pause.current();
              router.push(`/albums/${albumId}/preview`);
            }}
            style={styles.hit}
          >
            <Text style={fonts.date}>{tr('看纸页')}</Text>
          </Pressable>
        ) : (
          <View style={styles.hit} />
        )}
      </View>
      {shown ? (
        <ScrollView
          ref={scroll}
          key={geometry}
          testID="life-album-reading-scroll"
          scrollEventThrottle={100}
          contentContainerStyle={{
            alignItems: 'center',
            paddingBottom: Math.max(48, insets.bottom),
          }}
          onContentSizeChange={() => {
            contentReady.current = true;
            tryRestore();
          }}
          onScroll={(event) => {
            remember(event.nativeEvent.contentOffset.y);
            if (!restoring.current) {
              if (timer.current) clearTimeout(timer.current);
              timer.current = setTimeout(persist, 500);
            }
          }}
        >
          <View style={{ width: contentWidth }}>
            <View style={styles.styleRow}>
              {(['plain', 'handmade'] as const).map((choice) => (
                <Pressable
                  key={choice}
                  accessibilityRole="button"
                  accessibilityState={{ selected: choice === style }}
                  style={styles.hit}
                  onPress={() => {
                    persist();
                    saved.current = latest.current?.position ?? saved.current;
                    latest.current = { id: albumId, style: choice, position: saved.current };
                  setStyle(choice);
                    void saveAlbumReadingState(
                      albumId,
                      choice,
                      saved.current,
                    ).catch(() => setSaveError(true));
                  }}
                >
                  <Text
                    style={[fonts.meta, choice === style && styles.selected]}
                  >
                    {tr(choice === 'plain' ? '素纸' : '手作')}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.cover}>
              {coverMedia?.availability === 'available' && coverMedia.uri ? (
                <Image
                  source={{ uri: coverMedia.uri }}
                  contentFit="contain"
                  style={{
                    width: '100%',
                    aspectRatio: coverMedia.intrinsicRatio || 1,
                  }}
                  accessibilityIgnoresInvertColors
                />
              ) : null}
              <Text
                style={[fonts.coverName, styles.title]}
                accessibilityRole="header"
              >
                {shown.album.name}
              </Text>
              {shown.album.opening ? (
                <Text style={fonts.body}>{shown.album.opening}</Text>
              ) : null}
            </View>
            {records.map(({ record, date, showDate, recorded }) => {
              return (
                <View
                  key={record.momentId}
                  testID={`album-reading-record-${record.momentId}`}
                  style={styles.record}
                  onLayout={(event) => {
                    anchors.current[record.momentId] =
                      event.nativeEvent.layout.y;
                    tryRestore();
                  }}
                >
                  {record.presence !== 'ready' ? (
                    <Text style={fonts.meta}>
                      {record.presence === 'missing'
                        ? ALBUM_SOURCE_GONE
                        : ALBUM_SOURCE_UNREADABLE}
                    </Text>
                  ) : (
                    <>
                      {showDate ? (
                        <Text
                          style={[fonts.date, styles.date]}
                          accessibilityRole="header"
                        >
                          {date.label}
                        </Text>
                      ) : null}
                      {record.note ? (
                        <Text style={fonts.body}>{record.note}</Text>
                      ) : null}
                      {record.media.map((item) => (
                        <View key={item.assetId} style={styles.media}>
                          {item.role === 'image' ? (
                            item.uri && item.availability === 'available' ? (
                              <Image
                                source={{ uri: item.uri }}
                                contentFit="contain"
                                accessibilityIgnoresInvertColors
                                style={{
                                  width: '100%',
                                  aspectRatio:
                                    item.intrinsicRatio &&
                                    item.intrinsicRatio > 0
                                      ? item.intrinsicRatio
                                      : 1,
                                  borderWidth: theme.photoBorderWidth,
                                  borderColor: theme.photoBorder,
                                }}
                              />
                            ) : (
                              <Text style={fonts.meta}>
                                {ALBUM_IMAGE_MISSING}
                              </Text>
                            )
                          ) : item.role === 'audio' ? (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityState={{
                                disabled: item.availability !== 'available',
                              }}
                              disabled={
                                item.availability !== 'available' || !item.uri
                              }
                              style={styles.audio}
                              testID={`album-reading-audio-${item.assetId}`}
                              onPress={() => {
                                if (blocked || !alive.current) return;
                                if (
                                  clips.card(item.assetId).status === 'playing'
                                )
                                  void pause.current();
                                else if (item.uri)
                                  void clips.play(item.assetId, item.uri);
                              }}
                            >
                              <Text style={fonts.meta}>
                                {item.availability !== 'available' ||
                                clips.card(item.assetId).status ===
                                  'unavailable'
                                  ? ALBUM_AUDIO_MISSING
                                  : tr(
                                      clips.card(item.assetId).status ===
                                        'playing'
                                        ? '暂停'
                                        : '播放声音',
                                    )}
                                {formatAlbumAudioDuration(item.durationMs)
                                  ? ` · ${formatAlbumAudioDuration(item.durationMs)}`
                                  : ''}
                              </Text>
                            </Pressable>
                          ) : (
                            <Text style={fonts.meta}>
                              {tr('还有一种现在打不开的媒介。')}
                            </Text>
                          )}
                        </View>
                      ))}
                      {record.feeling ? (
                        <Text
                          style={[
                            fonts.meta,
                            {
                              color: feelingAccentColor({
                                value: record.feeling,
                                label: record.feeling,
                                known: isFeelingWord(record.feeling),
                              }),
                            },
                          ]}
                        >
                          {feelingLabel(record.feeling)}
                        </Text>
                      ) : null}
                      {!date.key ? (
                        <Text style={fonts.meta}>
                          {ALBUM_TIME_UNKNOWN}
                          {recorded ? ` · ${recorded}` : ''}
                        </Text>
                      ) : null}
                      {record.revision !== record.sourceRevisionAtCollect ? (
                        <Text style={fonts.meta}>{ALBUM_SOURCE_CHANGED}</Text>
                      ) : null}
                    </>
                  )}
                </View>
              );
            })}
            <Text style={[fonts.body, styles.close]}>{ALBUM_CLOSE_TEXT}</Text>
            {saveError ? (
              <Text style={fonts.meta}>{tr('阅读位置暂时没有记下。')}</Text>
            ) : null}
          </View>
        </ScrollView>
      ) : !blocked ? (
        <View style={styles.message}>
          <Text style={fonts.meta}>
            {error ? ALBUM_READ_FAILED : tr('生活册正在读出来。')}
          </Text>
          {error ? (
            <Pressable
              accessibilityRole="button"
              style={styles.hit}
              onPress={() => setRetry((value) => value + 1)}
            >
              <Text style={fonts.date}>{ALBUM_RETRY}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  hit: {
    minHeight: 48,
    minWidth: 48,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  message: { padding: 24 },
  styleRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  selected: { textDecorationLine: 'underline' },
  cover: { paddingTop: 32, paddingBottom: 64 },
  title: { marginVertical: 24 },
  record: { paddingBottom: 36 },
  date: { marginBottom: 12 },
  media: { marginVertical: 12 },
  audio: { minHeight: 48, justifyContent: 'center', paddingVertical: 8 },
  close: { paddingVertical: 64 },
});
