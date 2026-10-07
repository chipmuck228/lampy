import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';

import { getUseCases } from '../application/container';
import {
  ALBUM_EMPTY_HINT,
  ALBUM_EMPTY_LEAD,
  ALBUM_GUIDE_BODY,
  ALBUM_GUIDE_DISMISS,
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
import {
  albumCoverTileHeight,
  albumCoverTileWidth,
  albumCoverWallColumns,
  ALBUM_COVER_WALL_GAP,
} from './album-cover-wall';
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
  const contentWidth = Math.max(0, width - gutter * 2);
  const columns = albumCoverWallColumns(contentWidth);
  const tileWidth = albumCoverTileWidth(contentWidth, columns);
  const tileHeight = albumCoverTileHeight(tileWidth);

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [albums, setAlbums] = useState<AlbumListItem[]>([]);
  const [loadKey, setLoadKey] = useState(0);
  const [guideOpen, setGuideOpen] = useState(true);
  const [guideReady, setGuideReady] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const restorePending = useRef(true);

  useEffect(() => {
    let cancelled = false;
    void guideStore.isDismissed().then((dismissed) => {
      if (cancelled) return;
      setGuideOpen(!dismissed);
      setGuideReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      const requestId = loadKey;
      let cancelled = false;
      setStatus(requestId >= 0 ? 'loading' : 'loading');
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
    }, [loadKey]),
  );

  const dismissGuide = useCallback(() => {
    setGuideOpen(false);
    void guideStore.markDismissed();
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
          maxWidth: contentWidth + gutter * 2,
          paddingHorizontal: gutter,
          paddingTop: 4,
          paddingBottom: 24,
        },
      ]}
      onScroll={(event) => {
        rememberAlbumListScroll(event.nativeEvent.contentOffset.y);
      }}
      onContentSizeChange={() => {
        if (!restorePending.current) return;
        const y = peekAlbumListScroll();
        if (y <= 0) {
          restorePending.current = false;
          return;
        }
        scrollRef.current?.scrollTo({ y, animated: false });
        restorePending.current = false;
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
                onPress={() => setGuideOpen(true)}
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
            rememberAlbumListScroll(peekAlbumListScroll());
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
          >
            {albums.map((album) => (
              <Pressable
                key={album.id}
                accessibilityRole="button"
                accessibilityLabel={`${album.name}，${albumEntryCountLabel(album.entryCount)}`}
                testID={`life-album-tile-${album.id}`}
                onPress={() => router.push({ pathname: '/albums/[id]', params: { id: album.id } })}
                style={[styles.tile, { width: tileWidth }]}
              >
                <View style={[styles.cover, { width: tileWidth, height: tileHeight }]}>
                  {album.coverUri ? (
                    <Image
                      source={{ uri: album.coverUri }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                      accessibilityIgnoresInvertColors
                    />
                  ) : (
                    <View style={styles.wordsCover} testID={`life-album-words-cover-${album.id}`}>
                      <Text style={styles.wordsName} numberOfLines={3}>
                        {album.name}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.tileName} numberOfLines={2}>
                  {album.name}
                </Text>
                <Text style={styles.tileMeta}>{albumEntryCountLabel(album.entryCount)}</Text>
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
  column: { alignSelf: 'center', width: '100%' },
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
  },
  tile: {
    minHeight: 48,
    gap: 6,
  },
  cover: {
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: paperDeep,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: hairline,
  },
  wordsCover: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 14,
    justifyContent: 'flex-end',
    backgroundColor: paperDeep,
  },
  wordsName: { ...type.action, color: ink, fontSize: 17, lineHeight: 24 },
  tileName: { ...type.action, color: ink, fontSize: 16, lineHeight: 22 },
  tileMeta: { ...type.meta, color: inkSoft },
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
