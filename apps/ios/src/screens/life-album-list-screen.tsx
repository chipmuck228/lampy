import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { getUseCases } from '../application/container';
import {
  ALBUM_EMPTY_HINT,
  ALBUM_EMPTY_LEAD,
  ALBUM_GUIDE_BODY,
  ALBUM_GUIDE_DISMISS,
  ALBUM_GUIDE_PERSIST_FAILED,
  ALBUM_GUIDE_REOPEN,
  ALBUM_GUIDE_TITLE,
  ALBUM_LOADING,
  ALBUM_MY_ALBUMS,
  ALBUM_NEW_ACTION,
  ALBUM_READ_FAILED,
  ALBUM_RETRY,
  ALBUM_ROOT_LABEL,
  albumEntryCountLabel,
  type AlbumListItem,
} from '../application/life-album';
import { createSecureAlbumListGuideStore } from '../infrastructure/album-list-guide-store';
import { isFamilyProductEntryOpen } from '../infrastructure/family-config';
import { AlbumCoverFace, AlbumCoverMeta } from './album-cover-tile';
import { albumCoverWallLayout, ALBUM_COVER_WALL_GAP } from './album-cover-wall';
import {
  albumListRestoreScrollY,
  albumListShouldRecordScrollOffset,
} from './album-list-scroll-restore';
import { peekAlbumListScroll, rememberAlbumListScroll } from './album-list-session';
import { hairline, ink, inkSoft, pageGutter, paper, paperDeep, sage } from './life-page';
import { Text, type } from './life-text';
import { LifeIcon } from './life-icons';
import { RootNavBand, RootReadingLayout } from './root-nav-band';
import { dismissToRootNav } from './root-nav-switch';
import { usePageMetrics } from './use-page-metrics';

const guideStore = createSecureAlbumListGuideStore();

export default function LifeAlbumListScreen() {
  const router = useRouter();
  const { width, height } = usePageMetrics();
  const gutter = pageGutter(width, height);
  const [wallWidth, setWallWidth] = useState<number | null>(null);
  const wallLayout = albumCoverWallLayout(wallWidth);

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [albums, setAlbums] = useState<AlbumListItem[]>([]);
  const [loadKey, setLoadKey] = useState(0);
  const [focusEpoch, setFocusEpoch] = useState(0);
  const [guideOpen, setGuideOpen] = useState(true);
  const [guideReady, setGuideReady] = useState(false);
  const [guidePersistHint, setGuidePersistHint] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const restorePendingRef = useRef(false);
  const contentSizedRef = useRef(false);
  const contentHeightRef = useRef(0);
  const viewportHeightRef = useRef(0);

  const tryRestoreScroll = useCallback(() => {
    const decision = albumListRestoreScrollY({
      restorePending: restorePendingRef.current,
      savedY: peekAlbumListScroll(),
      listReady: status === 'ready' || status === 'error',
      guideReady,
      contentSized: contentSizedRef.current,
      contentHeight: contentHeightRef.current,
      viewportHeight: viewportHeightRef.current,
    });
    if (decision.action === 'wait') return;
    restorePendingRef.current = false;
    if (decision.action === 'restore') {
      scrollRef.current?.scrollTo({ y: decision.y, animated: false });
    }
  }, [status, guideReady]);

  useEffect(() => {
    let cancelled = false;
    void guideStore
      .isDismissed()
      .then((dismissed) => {
        if (cancelled) return;
        setGuideOpen(!dismissed);
        setGuideReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        // Read failed: show guide and finish pending; cover wall still loads.
        setGuideOpen(true);
        setGuideReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      // Returning from detail / another root: arm restore from saved offset.
      // Retry (loadKey) must not re-arm while the user stays on this page.
      if (peekAlbumListScroll() > 0) {
        restorePendingRef.current = true;
        contentSizedRef.current = false;
      }
      setFocusEpoch((value) => value + 1);
    }, []),
  );

  useEffect(() => {
    if (focusEpoch === 0) return;
    let cancelled = false;
    contentSizedRef.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- album list load is bound to focus/retry
    setStatus('loading');
    getUseCases()
      .then((app) => app.listAlbums())
      .then((view) => {
        if (cancelled) return;
        if (view.status === 'ready') {
          setAlbums(view.albums);
          setStatus('ready');
          return;
        }
        setStatus('error');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [focusEpoch, loadKey]);

  useEffect(() => {
    tryRestoreScroll();
  }, [status, guideReady, albums.length, guideOpen, tryRestoreScroll]);

  const dismissGuide = useCallback(() => {
    setGuideOpen(false);
    void guideStore.markDismissed().then(
      () => {
        setGuidePersistHint(null);
      },
      () => {
        // In-session dismiss kept; do not claim persistence.
        setGuidePersistHint(ALBUM_GUIDE_PERSIST_FAILED);
      },
    );
  }, []);

  const empty = status === 'ready' && albums.length === 0;
  const showGuideBody = guideReady && guideOpen;

  return (
    <RootReadingLayout
      accessibilityLabel={ALBUM_MY_ALBUMS}
      scrollTestID="life-album-list-scroll"
      scrollRef={scrollRef}
      contentContainerStyle={[
        styles.column,
        {
          paddingHorizontal: gutter,
          paddingTop: 4,
          paddingBottom: 24,
        },
      ]}
      onScroll={(event) => {
        const offsetY = event.nativeEvent.contentOffset.y;
        if (
          !albumListShouldRecordScrollOffset({
            restorePending: restorePendingRef.current,
            listLoading: status === 'loading',
            offsetY,
          })
        ) {
          return;
        }
        rememberAlbumListScroll(offsetY);
      }}
      onScrollBeginDrag={() => {
        if (restorePendingRef.current) {
          restorePendingRef.current = false;
        }
      }}
      onScrollLayout={(event) => {
        viewportHeightRef.current = event.nativeEvent.layout.height;
        tryRestoreScroll();
      }}
      onContentSizeChange={(_w, contentHeight) => {
        contentHeightRef.current = contentHeight;
        // Loading collapse must not count as the restore target layout.
        if (status !== 'loading') {
          contentSizedRef.current = true;
        }
        tryRestoreScroll();
      }}
      header={
        <View style={[styles.header, { paddingHorizontal: gutter }]} testID="life-album-list-header">
          <Text style={styles.kicker}>LAMPY · 生活册</Text>
          <View style={styles.headerRow}>
            <Text style={styles.title} accessibilityRole="header">
              {ALBUM_MY_ALBUMS}
            </Text>
            {guideReady && !guideOpen ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={ALBUM_GUIDE_REOPEN}
                testID="life-album-guide-reopen"
                onPress={() => {
                  setGuidePersistHint(null);
                  setGuideOpen(true);
                }}
                style={styles.reopenHit}
              >
                <Text style={styles.reopenLabel}>{ALBUM_GUIDE_REOPEN}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      }
      band={
        <RootNavBand
          here="albums"
          onGo={(dest) => {
            if (!restorePendingRef.current) {
              rememberAlbumListScroll(peekAlbumListScroll());
            }
            if (dest === 'recent') {
              dismissToRootNav(router, 'recent');
              return;
            }
            if (dest === 'lookback') {
              // Prefer an existing lookback root; do not mint the recent→lookback origin token.
              dismissToRootNav(router, 'lookback');
            }
          }}
          onFamily={isFamilyProductEntryOpen() ? () => router.push('/family') : undefined}
        />
      }
    >
      <View testID="life-album-list" style={styles.body}>
        {showGuideBody ? (
          <View
            testID="life-album-guide"
            style={[styles.guide, empty && styles.guideEmpty]}
            accessibilityRole="summary"
          >
            <Text style={styles.guideTitle}>{ALBUM_GUIDE_TITLE}</Text>
            <Text style={styles.guideBody}>{ALBUM_GUIDE_BODY}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={ALBUM_GUIDE_DISMISS}
              testID="life-album-guide-dismiss"
              onPress={dismissGuide}
              style={styles.hit}
            >
              <Text style={styles.action}>{ALBUM_GUIDE_DISMISS}</Text>
            </Pressable>
          </View>
        ) : null}

        {guidePersistHint ? (
          <Text testID="life-album-guide-persist-hint" style={styles.meta}>
            {guidePersistHint}
          </Text>
        ) : null}

        {status === 'loading' ? <Text style={styles.meta}>{ALBUM_LOADING}</Text> : null}
        {status === 'error' ? (
          <View>
            <Text style={styles.meta}>{ALBUM_READ_FAILED}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={ALBUM_RETRY}
              testID="life-album-list-retry"
              onPress={() => setLoadKey((value) => value + 1)}
              style={styles.hit}
            >
              <Text style={styles.action}>{ALBUM_RETRY}</Text>
            </Pressable>
          </View>
        ) : null}

        {empty ? (
          <View testID="life-album-list-empty" style={styles.empty}>
            {!showGuideBody ? (
              <>
                <Text style={styles.emptyLead}>{ALBUM_EMPTY_LEAD}</Text>
                <Text style={styles.meta}>{ALBUM_EMPTY_HINT}</Text>
              </>
            ) : null}
          </View>
        ) : null}

        {status === 'ready' && albums.length > 0 ? (
          <View
            testID="life-album-cover-wall"
            style={[styles.wall, { gap: ALBUM_COVER_WALL_GAP }]}
            accessibilityLabel={ALBUM_ROOT_LABEL}
            onLayout={(event) => {
              const next = Math.round(event.nativeEvent.layout.width);
              setWallWidth((prev) => (prev === next ? prev : next));
            }}
          >
            {albums.map((album) => (
              <Pressable
                key={album.id}
                accessibilityRole="button"
                accessibilityLabel={`${album.name}，${albumEntryCountLabel(album.entryCount)}`}
                testID={`life-album-tile-${album.id}`}
                onPress={() => router.push({ pathname: '/albums/[id]', params: { id: album.id } })}
                style={[styles.tile, { width: wallLayout.tileWidth }]}
              >
                <AlbumCoverFace
                  name={album.name}
                  coverUri={album.coverUri}
                  width={wallLayout.tileWidth}
                  height={wallLayout.tileHeight}
                  wordsTestID={`life-album-words-cover-${album.id}`}
                />
                <AlbumCoverMeta name={album.name} entryCount={album.entryCount} />
              </Pressable>
            ))}
          </View>
        ) : null}

        {status !== 'loading' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={ALBUM_NEW_ACTION}
            testID="life-album-new"
            onPress={() => router.push('/albums/new')}
            style={styles.createHit}
          >
            <LifeIcon name="plus" size={18} color={ink} decorative />
            <Text style={styles.createLabel}>{ALBUM_NEW_ACTION}</Text>
          </Pressable>
        ) : null}
      </View>
    </RootReadingLayout>
  );
}

const styles = StyleSheet.create({
  column: { alignSelf: 'stretch', width: '100%' },
  body: { gap: 16 },
  header: { paddingTop: 8, paddingBottom: 8, gap: 4, backgroundColor: paper },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 48,
  },
  kicker: { ...type.meta, color: inkSoft, letterSpacing: 0.6 },
  title: { ...type.title, color: ink, fontSize: 28, lineHeight: 34, flexShrink: 1 },
  reopenHit: { minHeight: 48, minWidth: 48, justifyContent: 'center', paddingHorizontal: 4 },
  reopenLabel: { ...type.meta, color: sage },
  guide: {
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: paperDeep,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: hairline,
  },
  guideEmpty: { marginBottom: 4 },
  guideTitle: { ...type.action, color: ink, fontSize: 18, lineHeight: 26 },
  guideBody: { ...type.body, color: inkSoft },
  empty: { gap: 8 },
  emptyLead: { ...type.title, color: ink, fontSize: 22, lineHeight: 30 },
  meta: { ...type.body, color: inkSoft },
  action: { ...type.action, color: sage },
  hit: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' },
  wall: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    alignSelf: 'stretch',
  },
  tile: {
    minHeight: 48,
    gap: 6,
  },
  createHit: {
    minHeight: 48,
    marginTop: 4,
    paddingHorizontal: 16,
    borderRadius: 24,
    backgroundColor: paperDeep,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: sage,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
  },
  createLabel: { ...type.action, color: ink },
});
