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
import { albumPreviewSpokenText } from '../application/album-preview-speech';
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
  | import('react').ComponentType<{ pageJson: string; mediaJson: string; playingJson: string; style?: object }>
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
        if (__DEV__) {
          void (async () => {
            try {
              // Isolation probe only. Not product export or system share.
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              const FileSystem = require('expo-file-system/legacy') as {
                documentDirectory: string | null;
                writeAsStringAsync(uri: string, contents: string): Promise<void>;
              };
              const { diagnoseAlbumFonts, writeAlbumProbePdf } = await import('../../modules/lampy-album-layout');
              const root = FileSystem.documentDirectory;
              if (!root) return;
              // Write layout first so a diagnose/PDF failure cannot leave a stale probe.
              await FileSystem.writeAsStringAsync(`${root}isol-album-c-layout.json`, JSON.stringify(result.layout));
              try {
                const diagnosis = diagnoseAlbumFonts();
                if (diagnosis) {
                  await FileSystem.writeAsStringAsync(
                    `${root}isol-album-c-fonts.json`,
                    JSON.stringify(diagnosis),
                  );
                }
              } catch {
                // Font diagnosis must not block layout/PDF probes.
              }
              const probe = await writeAlbumProbePdf(
                JSON.stringify(result.layout),
                JSON.stringify(result.media),
                `${root}isol-album-c-probe.pdf`.replace(/^file:\/\//, ''),
              );
              await FileSystem.writeAsStringAsync(
                `${root}isol-album-c-probe-meta.json`,
                JSON.stringify(probe),
              );
            } catch {
              // Probe failure must not change preview.
            }
          })();
        }
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
  const zoomed = zoom > 1;
  const pageWidth = Math.max(120, Math.min(width - 32, ((height - 220) * 420) / 595));
  const scale = (pageWidth / 420) * zoom;
  const paperWidth = 420 * scale;
  const paperHeight = 595 * scale;
  const playingAssetIds =
    current?.blocks.flatMap((block) =>
      block.kind === 'audio' && clips.card(block.assetId).status === 'playing' ? [block.assetId] : [],
    ) ?? [];

  return (
    <SettingsPage
      title={ALBUM_PREVIEW_ACTION}
      backLabel="这一册"
      accessibilityLabel="看看这一册"
      pageTestID="life-album-preview"
      scrollEnabled={!zoomed}
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
          <View
            testID="life-album-preview-stage"
            style={[styles.stageFrame, zoomed && styles.stageFrameZoomed]}
          >
            {zoomed ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={ALBUM_PREVIEW_ZOOM_OUT}
                testID="life-album-preview-zoom-restore"
                onPress={() => setZoom(1)}
                style={styles.restoreHit}
              >
                <Text style={styles.restoreLabel}>{ALBUM_PREVIEW_ZOOM_OUT}</Text>
              </Pressable>
            ) : null}
            <ScrollView
              testID="life-album-preview-zoom-scroll"
              scrollEnabled={zoomed}
              nestedScrollEnabled
              bounces
              style={styles.stage}
              contentContainerStyle={
                zoomed ? { minHeight: paperHeight } : { alignItems: 'center' }
              }
            >
              <ScrollView
                horizontal={zoomed}
                scrollEnabled={zoomed}
                nestedScrollEnabled
                bounces
                contentContainerStyle={{ width: paperWidth, height: paperHeight }}
              >
              <View
                testID="life-album-preview-page"
                accessible={false}
                style={{ width: paperWidth, height: paperHeight, backgroundColor: paper }}
              >
                <View
                  pointerEvents="none"
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={{
                    width: 420,
                    height: 595,
                    transform: [{ scale }],
                    transformOrigin: 'top left',
                  }}
                >
                  {NativeAlbumPageView ? (
                    <NativeAlbumPageView
                      key={`album-page-${page}-${playingAssetIds.join('|') || 'idle'}`}
                      pageJson={JSON.stringify(current)}
                      mediaJson={JSON.stringify(media)}
                      playingJson={JSON.stringify(playingAssetIds)}
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
                  const label = albumPreviewSpokenText(block);
                  if (!label) return null;
                  return (
                    <View
                      key={`read-${block.kind}-${index}`}
                      accessible
                      accessibilityRole="text"
                      accessibilityLabel={label}
                      testID={`life-album-preview-read-${index}`}
                      pointerEvents="none"
                      style={{
                        position: 'absolute',
                        left: block.box.xPt * scale,
                        top: block.box.yPt * scale,
                        width: Math.max(1, block.box.widthPt * scale),
                        height: Math.max(1, block.box.heightPt * scale),
                      }}
                    />
                  );
                })}
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
                        if (playing) {
                          void pauseRef.current();
                          return;
                        }
                        const uri = media[block.assetId];
                        if (!uri) return;
                        void clips.play(block.assetId, uri);
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
          </View>
          {zoomed ? null : (
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
                accessibilityLabel={ALBUM_PREVIEW_ZOOM}
                testID="life-album-preview-zoom"
                onPress={() => setZoom(2)}
                style={styles.hit}
              >
                <Text style={styles.action}>{ALBUM_PREVIEW_ZOOM}</Text>
              </Pressable>
            </View>
          )}
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
  stageFrame: { backgroundColor: paper, overflow: 'hidden' },
  stageFrameZoomed: { flexGrow: 1, minHeight: 280 },
  stage: { backgroundColor: paper, flexGrow: 1 },
  restoreHit: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 2,
    minHeight: 48,
    minWidth: 48,
    paddingHorizontal: 12,
    justifyContent: 'center',
    backgroundColor: paper,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: sage,
    borderRadius: 24,
  },
  restoreLabel: { ...type.action, color: sage },
  missing: { backgroundColor: 'rgba(37,35,31,0.06)', justifyContent: 'center', padding: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
