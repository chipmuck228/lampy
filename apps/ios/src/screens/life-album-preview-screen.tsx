import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { getUseCases } from '../application/container';
import { isApplicationError } from '../application/errors';
import { ALBUM_LAYOUT_CANCELLED } from '../application/album-layout-use-cases';
import {
  ALBUM_CONTENT_WIDTH_PT,
  ALBUM_IMAGE_MISSING,
  ALBUM_PREVIEW_ACTION,
  ALBUM_PREVIEW_CANCEL,
  ALBUM_PREVIEW_FAILED,
  ALBUM_PREVIEW_LOADING,
  ALBUM_PREVIEW_NEXT,
  ALBUM_PREVIEW_PREV,
  ALBUM_PREVIEW_ZOOM,
  ALBUM_PREVIEW_ZOOM_OUT,
  ALBUM_SOURCE_CHANGED,
  ALBUM_SOURCE_GONE,
  ALBUM_SOURCE_UNREADABLE,
  albumFontFace,
  type AlbumLayout,
  type AlbumPlacedBlock,
} from '../application/album-layout';
import type { AlbumLayoutMediaMap } from '../application/album-layout-input';
import {
  abandonAlbumPreviewAttempt,
  shouldApplyAlbumLayoutResult,
  shouldContinueAlbumPreviewLoad,
  startAlbumPreviewPageAttempt,
  type AlbumPreviewPageAttempt,
} from '../application/album-layout-request';
import { albumSliceCodePoints } from '../application/album-unicode';
import { ALBUM_RETRY } from '../application/life-album';
import { feelingAccentColor } from '../application/feeling-accent';
import { useDeviceLock } from './device-lock-context';
import { firstSearchParam } from './lookback-origin';
import { ink, inkSoft, paper, sage } from './life-page';
import { Text, type } from './life-text';
import { LifeIcon } from './life-icons';
import { SettingsPage } from './settings-chrome';
import { useRecentClipPlayback } from './use-recent-clip-playback';
import { requireAlbumNativePageView } from '../../modules/lampy-album-layout';

const MIN_HIT = 48;
const NativeAlbumPageView = requireAlbumNativePageView() as
  | import('react').ComponentType<{ pageJson: string; mediaJson: string; style?: object }>
  | null;

export default function LifeAlbumPreviewScreen() {
  const router = useRouter();
  const albumId = firstSearchParam(useLocalSearchParams<{ id?: string | string[] }>().id) ?? '';
  const lock = useDeviceLock();
  const clips = useRecentClipPlayback();
  const pauseRef = useRef(clips.pause);
  useEffect(() => {
    pauseRef.current = clips.pause;
  }, [clips.pause]);
  const { width, height } = useWindowDimensions();
  const [layout, setLayout] = useState<AlbumLayout | null>(null);
  const [media, setMedia] = useState<AlbumLayoutMediaMap>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [zoom, setZoom] = useState(1);
  const pageSeq = useRef(0);
  const attempt = useRef<AlbumPreviewPageAttempt | null>(null);

  const blocked = !!lock?.snapshot.locked;
  const showPage = !!layout && !loading && !error && !blocked && layout.albumId === albumId;

  const cancelOwnedRequest = useCallback((requestId: number | null) => {
    if (requestId == null) return;
    void getUseCases().then((app) => app.cancelAlbumLayout(requestId));
  }, []);

  const load = useCallback(() => {
    const previousId = abandonAlbumPreviewAttempt(attempt.current);
    attempt.current = null;
    cancelOwnedRequest(previousId);
    if (!albumId || blocked) {
      setLayout(null);
      setMedia({});
      setError(null);
      setLoading(false);
      return;
    }
    pageSeq.current += 1;
    const seq = pageSeq.current;
    const next = startAlbumPreviewPageAttempt(albumId, seq);
    attempt.current = next;
    setLayout(null);
    setMedia({});
    setPage(0);
    setZoom(1);
    setError(null);
    setLoading(true);
    void getUseCases().then(async (app) => {
      if (!shouldContinueAlbumPreviewLoad({ seq, albumId, current: attempt.current })) {
        return;
      }
      const began = app.beginAlbumLayout(albumId);
      if (!shouldContinueAlbumPreviewLoad({ seq, albumId, current: attempt.current })) {
        app.cancelAlbumLayout(began.requestId);
        return;
      }
      next.requestId = began.requestId;
      try {
        const result = await app.generateAlbumLayout(albumId, {
          signal: next.signal,
          requestId: began.requestId,
          privateUnlocked: true,
        });
        if (
          !shouldContinueAlbumPreviewLoad({ seq, albumId, current: attempt.current }) ||
          !shouldApplyAlbumLayoutResult({
            albumId,
            requestAlbumId: result.layout.albumId,
            requestId: result.requestId,
            current: { albumId, requestId: began.requestId },
          })
        ) {
          return;
        }
        setLayout(result.layout);
        setMedia(result.media);
        setPage(0);
        setLoading(false);
      } catch (caught) {
        if (
          !shouldContinueAlbumPreviewLoad({ seq, albumId, current: attempt.current }) ||
          !shouldApplyAlbumLayoutResult({
            albumId,
            requestAlbumId: albumId,
            requestId: began.requestId,
            current: { albumId, requestId: began.requestId },
          })
        ) {
          return;
        }
        if (isApplicationError(caught) && caught.code === ALBUM_LAYOUT_CANCELLED) return;
        setLayout(null);
        setMedia({});
        setLoading(false);
        setError(isApplicationError(caught) ? caught.message : ALBUM_PREVIEW_FAILED);
      }
    });
  }, [albumId, blocked, cancelOwnedRequest]);

  useFocusEffect(
    useCallback(() => {
      load();
      return () => {
        const owned = abandonAlbumPreviewAttempt(attempt.current);
        attempt.current = null;
        void pauseRef.current();
        cancelOwnedRequest(owned);
      };
    }, [load, cancelOwnedRequest]),
  );

  useEffect(() => {
    void pauseRef.current();
  }, [page]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') void pauseRef.current();
    });
    return () => sub.remove();
  }, []);

  const current = showPage ? layout?.pages[page] : undefined;
  const pageWidth = Math.max(120, Math.min(width - 32, ((height - 220) * 420) / 595));
  const scale = (pageWidth / 420) * zoom;

  return (
    <SettingsPage
      title={ALBUM_PREVIEW_ACTION}
      backLabel="这一册"
      accessibilityLabel="看看这一册"
      pageTestID="life-album-preview"
      onBack={() => router.back()}
    >
      {blocked ? <Text style={styles.body}>{ALBUM_PREVIEW_FAILED}</Text> : null}
      {loading && !blocked ? <Text style={styles.body}>{ALBUM_PREVIEW_LOADING}</Text> : null}
      {error ? (
        <>
          <Text style={styles.body}>{error}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={ALBUM_RETRY}
            testID="life-album-preview-retry"
            onPress={load}
            style={styles.hit}
          >
            <Text style={styles.action}>{ALBUM_RETRY}</Text>
          </Pressable>
        </>
      ) : null}
      {loading && !blocked ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={ALBUM_PREVIEW_CANCEL}
          testID="life-album-preview-cancel"
          onPress={() => {
            const owned = abandonAlbumPreviewAttempt(attempt.current);
            attempt.current = null;
            cancelOwnedRequest(owned);
            router.back();
          }}
          style={styles.hit}
        >
          <Text style={styles.action}>{ALBUM_PREVIEW_CANCEL}</Text>
        </Pressable>
      ) : null}
      {showPage && current ? (
        <>
          <Text
            style={styles.meta}
            accessibilityRole="text"
          >{`第${page + 1}页，共${layout.pages.length}页`}</Text>
          <ScrollView
            horizontal={zoom > 1}
            scrollEnabled={zoom > 1}
            style={styles.stage}
          >
            <ScrollView scrollEnabled={zoom > 1} contentContainerStyle={{ width: 420 * scale, height: 595 * scale }}>
              <View
                testID="life-album-preview-page"
                accessibilityLabel={`第${page + 1}页`}
                style={{ width: 420 * scale, height: 595 * scale, backgroundColor: paper, overflow: 'hidden' }}
              >
                <View
                  pointerEvents="none"
                  style={{
                    width: 420,
                    height: 595,
                    transform: [{ scale }],
                    transformOrigin: 'top left',
                  }}
                >
                  {NativeAlbumPageView ? (
                    <NativeAlbumPageView
                      pageJson={JSON.stringify(current)}
                      mediaJson={JSON.stringify(media)}
                      style={{ width: 420, height: 595 }}
                    />
                  ) : (
                    current.blocks.map((block, index) => (
                      <AlbumBlockView
                        key={`${block.kind}-${index}`}
                        block={block}
                        media={media}
                        playing={block.kind === 'audio' ? clips.card(block.assetId).status === 'playing' : false}
                      />
                    ))
                  )}
                </View>
                {current.blocks.map((block, index) => {
                  if (block.kind !== 'audio') return null;
                  const canPlay = block.status === 'available' && !!media[block.assetId];
                  const playing = clips.card(block.assetId).status === 'playing';
                  const hitW = Math.max(MIN_HIT, block.box.widthPt * scale);
                  const hitH = Math.max(MIN_HIT, block.box.heightPt * scale);
                  return (
                    <Pressable
                      key={`audio-hit-${block.assetId}-${index}`}
                      accessibilityRole="button"
                      accessibilityLabel={playing ? '暂停' : block.text}
                      accessibilityState={{ disabled: !canPlay }}
                      testID={`life-album-preview-audio-${block.assetId}`}
                      disabled={!canPlay}
                      onPress={() => {
                        if (playing) void pauseRef.current();
                        else if (media[block.assetId]) void clips.play(block.assetId, media[block.assetId]);
                      }}
                      style={{
                        position: 'absolute',
                        left: block.box.xPt * scale,
                        top: block.box.yPt * scale,
                        width: hitW,
                        height: hitH,
                        minWidth: MIN_HIT,
                        minHeight: MIN_HIT,
                      }}
                    />
                  );
                })}
              </View>
            </ScrollView>
          </ScrollView>
          <View style={styles.row}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={ALBUM_PREVIEW_PREV}
              accessibilityState={{ disabled: page === 0 }}
              testID="life-album-preview-prev"
              disabled={page === 0}
              onPress={() => setPage((value) => Math.max(0, value - 1))}
              style={styles.hit}
            >
              <Text style={[styles.action, page === 0 && styles.disabled]}>{ALBUM_PREVIEW_PREV}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={ALBUM_PREVIEW_NEXT}
              accessibilityState={{ disabled: page >= layout.pages.length - 1 }}
              testID="life-album-preview-next"
              disabled={page >= layout.pages.length - 1}
              onPress={() => setPage((value) => Math.min(layout.pages.length - 1, value + 1))}
              style={styles.hit}
            >
              <Text style={[styles.action, page >= layout.pages.length - 1 && styles.disabled]}>{ALBUM_PREVIEW_NEXT}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={zoom > 1 ? ALBUM_PREVIEW_ZOOM_OUT : ALBUM_PREVIEW_ZOOM}
              testID="life-album-preview-zoom"
              onPress={() => setZoom((value) => (value > 1 ? 1 : 2))}
              style={styles.hit}
            >
              <Text style={styles.action}>{zoom > 1 ? ALBUM_PREVIEW_ZOOM_OUT : ALBUM_PREVIEW_ZOOM}</Text>
            </Pressable>
          </View>
        </>
      ) : null}
    </SettingsPage>
  );
}

function AlbumBlockView({
  block,
  media,
  playing,
}: {
  block: AlbumPlacedBlock;
  media: AlbumLayoutMediaMap;
  playing: boolean;
}) {
  const box = {
    position: 'absolute' as const,
    left: block.box.xPt,
    top: block.box.yPt,
    width: block.box.widthPt,
    height: block.box.heightPt,
  };
  if (block.kind === 'cover-image' || block.kind === 'image') {
    const uri = media[block.assetId];
    if (block.status === 'available' && uri) {
      return <Image accessibilityIgnoresInvertColors source={{ uri }} style={box} resizeMode="contain" />;
    }
    return (
      <View style={[box, styles.missing]}>
        <Text style={styles.meta}>{ALBUM_IMAGE_MISSING}</Text>
      </View>
    );
  }
  if (block.kind === 'audio') {
    return (
      <View style={[box, styles.row]}>
        {block.status === 'available' ? <LifeIcon name={playing ? 'pause' : 'play'} size={18} decorative /> : null}
        <Text style={styles.meta}>{block.text}</Text>
      </View>
    );
  }
  const copy =
    block.kind === 'source-gone'
      ? ALBUM_SOURCE_GONE
      : block.kind === 'source-unreadable'
        ? ALBUM_SOURCE_UNREADABLE
        : block.kind === 'source-changed'
          ? ALBUM_SOURCE_CHANGED
          : 'text' in block
            ? block.text
            : 'label' in block
              ? block.label
              : 'value' in block
                ? block.value
                : '';
  const spec =
    block.kind === 'cover-name'
      ? { fontFamily: albumFontFace('album-serif'), fontSize: 28, lineHeight: 36, color: ink }
      : block.kind === 'note' || block.kind === 'opening'
        ? { fontFamily: albumFontFace('album-serif'), fontSize: 17, lineHeight: 32, color: ink }
        : block.kind === 'day-rule'
          ? { fontFamily: albumFontFace('album-ui'), fontSize: 15, lineHeight: 22, color: sage }
          : { fontFamily: albumFontFace('album-ui'), fontSize: 15, lineHeight: 22, color: inkSoft };
  return (
    <View style={box}>
      {block.kind === 'feeling' ? (
        <View style={styles.row}>
          <View style={[styles.dot, { backgroundColor: feelingAccentColor({ value: block.value, label: block.value, known: block.known }) }]} />
          <Text style={spec}>{block.value}</Text>
        </View>
      ) : 'lines' in block && block.lines.length ? (
        // Jest / native-view-missing only. Device preview draws with Core Text at baselineYPt.
        // RN Text at yPt is not evidence that the face or baseline matches measurement.
        block.lines.map((line, index) => (
          <Text
            key={`${block.kind}-${index}`}
            numberOfLines={1}
            ellipsizeMode="clip"
            style={[
              spec,
              {
                position: 'absolute',
                left: line.xPt - block.box.xPt,
                top: line.yPt - block.box.yPt,
                width: ALBUM_CONTENT_WIDTH_PT,
                height: line.heightPt,
              },
            ]}
          >
            {albumSliceCodePoints(block.text, line.start, line.end)}
          </Text>
        ))
      ) : (
        <Text numberOfLines={1} ellipsizeMode="clip" style={spec}>
          {copy}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { ...type.body, color: ink },
  meta: { ...type.meta, color: inkSoft },
  action: { ...type.action, color: sage },
  disabled: { opacity: 0.45 },
  hit: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' },
  stage: { backgroundColor: paper },
  missing: { backgroundColor: 'rgba(37,35,31,0.06)', justifyContent: 'center', padding: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
