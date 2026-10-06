import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { getUseCases } from '../application/container';
import {
  ALBUM_EMPTY_HINT,
  ALBUM_EMPTY_LEAD,
  ALBUM_LOADING,
  ALBUM_MY_ALBUMS,
  ALBUM_NEW_ACTION,
  ALBUM_READ_FAILED,
  ALBUM_RETRY,
  albumEntryCountLabel,
  type AlbumListItem,
} from '../application/life-album';
import { ink, inkSoft, paperDeep, sage } from './life-page';
import { Text, type } from './life-text';
import { SettingsPage } from './settings-chrome';
import { firstSearchParam } from './lookback-origin';
import { dismissToSettingsRoot } from './settings-nav';

export default function LifeAlbumListScreen() {
  const router = useRouter();
  const fromLookback = firstSearchParam(useLocalSearchParams<{ from?: string | string[] }>().from) === 'lookback';
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [albums, setAlbums] = useState<AlbumListItem[]>([]);
  const [loadKey, setLoadKey] = useState(0);

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
    }, [loadKey]), // retry token
  );

  return (
    <SettingsPage
      title={ALBUM_MY_ALBUMS}
      backLabel={fromLookback ? '回看' : '本机设置'}
      accessibilityLabel={ALBUM_MY_ALBUMS}
      pageTestID="life-album-list"
      onBack={() => {
        if (fromLookback) {
          router.dismissTo('/lookback');
          return;
        }
        dismissToSettingsRoot(router);
      }}
    >
      {status === 'loading' ? <Text style={styles.body}>{ALBUM_LOADING}</Text> : null}
      {status === 'error' ? (
        <View>
          <Text style={styles.body}>{ALBUM_READ_FAILED}</Text>
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
      {status === 'ready' && albums.length === 0 ? (
        <View testID="life-album-list-empty" style={styles.block}>
          <Text style={styles.title}>{ALBUM_EMPTY_LEAD}</Text>
          <Text style={styles.body}>{ALBUM_EMPTY_HINT}</Text>
        </View>
      ) : null}
      {status === 'ready'
        ? albums.map((album) => (
            <Pressable
              key={album.id}
              accessibilityRole="button"
              accessibilityLabel={album.name}
              testID={`life-album-row-${album.id}`}
              onPress={() => router.push({ pathname: '/albums/[id]', params: { id: album.id } })}
              style={styles.row}
            >
              <Text style={styles.albumName}>{album.name}</Text>
              <Text style={styles.meta}>
                {albumEntryCountLabel(album.entryCount)}
                {album.lastCollectedLabel ? ` · ${album.lastCollectedLabel}` : ''}
              </Text>
            </Pressable>
          ))
        : null}
      {status !== 'loading' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={ALBUM_NEW_ACTION}
          testID="life-album-new"
          onPress={() => router.push('/albums/new')}
          style={styles.createHit}
        >
          <Text style={styles.createLabel}>＋ {ALBUM_NEW_ACTION}</Text>
        </Pressable>
      ) : null}
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  block: { gap: 10 },
  title: { ...type.title, color: ink, fontSize: 22, lineHeight: 30 },
  body: { ...type.body, color: inkSoft },
  action: { ...type.action, color: sage },
  albumName: { ...type.action, color: ink },
  meta: { ...type.meta, color: inkSoft },
  row: {
    minHeight: 48,
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 4,
  },
  hit: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' },
  createHit: {
    minHeight: 48,
    marginTop: 8,
    paddingHorizontal: 16,
    borderRadius: 24,
    backgroundColor: paperDeep,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: sage,
    justifyContent: 'center',
    alignSelf: 'flex-start',
    shadowColor: ink,
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  createLabel: { ...type.action, color: ink },
});
