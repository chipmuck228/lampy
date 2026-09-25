import { useCallback, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';

import { lookbackHref } from '../screens/lookback-chrome';

import { getUseCases } from '../application/container';
import type { RecentLifeViewModel } from '../application/use-cases';
import { MomentAudio, MomentUnknownMedia } from '../screens/moment-audio';
import { MomentFeeling } from '../screens/moment-feeling';
import { MomentImages } from '../screens/moment-images';
import { useSoundPlayer } from '../screens/use-sound-player';

export default function RecentScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const readingWidth = Math.min(width, 720);
  const [view, setView] = useState<RecentLifeViewModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const sound = useSoundPlayer();

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getUseCases()
        .then((app) => app.getRecentLife())
        .then((next) => {
          if (!cancelled) {
            setView(next);
            setError(null);
          }
        })
        .catch(() => {
          if (!cancelled) setError('最近的记录暂时读不出来，原来的内容还在这台设备上。');
        });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  return (
    <SafeAreaView style={styles.safe} accessibilityLabel="最近">
      <ScrollView contentContainerStyle={[styles.column, { maxWidth: readingWidth }]}>
        <View style={styles.top}>
          <Text style={styles.wordmark} accessibilityRole="header">
            最近
          </Text>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="回看"
              testID="home-lookback"
              hitSlop={8}
              onPress={() => router.push(lookbackHref('/lookback'))}
              style={styles.leaveHit}
            >
              <Text style={styles.leave}>回看</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="留下"
              testID="home-leave"
              hitSlop={8}
              onPress={() => router.push('/leave')}
              style={styles.leaveHit}
            >
              <Text style={styles.leave}>留下</Text>
            </Pressable>
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {view?.isFirstUse ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>最近还没有留下什么。</Text>
            <Text style={styles.body}>写一句、留下照片或一段声音就可以。</Text>
          </View>
        ) : null}

        {view?.items.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={
              [
                item.dateLabel,
                item.note,
                ...item.images.map((image) => image.label),
                item.audio?.label || '',
                ...(item.unknownMedia ?? []).map((media) => media.label),
                item.feeling ? `当时的感受，${item.feeling.label}` : '',
              ]
                .filter(Boolean)
                .join('，') || `${item.dateLabel}，一条记录`
            }
            testID={`recent-item-${item.id}`}
            onPress={() => router.push(`/moment/${encodeURIComponent(item.id)}`)}
            style={styles.row}
          >
            <Text style={styles.date}>{item.dateLabel}</Text>
            {item.note ? <Text style={styles.note}>{item.note}</Text> : null}
            <MomentImages images={item.images} testIDPrefix={`recent-image-${item.id}`} />
            <MomentUnknownMedia items={item.unknownMedia ?? []} testIDPrefix={`recent-unknown-${item.id}`} />
            <MomentAudio
              audio={item.audio}
              playbackStatus={playingId === item.audio?.id ? (sound.failed ? 'unavailable' : sound.status) : 'idle'}
              currentTimeMs={playingId === item.audio?.id ? sound.currentTimeMs : 0}
              onPlay={() => {
                if (!item.audio?.uri) return;
                setPlayingId(item.audio.id);
                void sound.play(item.audio.uri);
              }}
              onPause={() => {
                void sound.pause();
              }}
              testIDPrefix={`recent-sound-${item.id}`}
              compact
            />
            <MomentFeeling feeling={item.feeling} testID={`recent-feeling-${item.id}`} />
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F3F0E9' },
  column: {
    flexGrow: 1,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingBottom: 32,
    gap: 20,
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 44,
    paddingTop: 12,
  },
  wordmark: { fontSize: 28, lineHeight: 34, color: '#25231F' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  leaveHit: { minWidth: 44, minHeight: 44, justifyContent: 'center' },
  leave: { fontSize: 18, lineHeight: 24, color: '#53604F' },
  empty: { gap: 8, paddingTop: 24 },
  emptyTitle: { fontSize: 22, lineHeight: 30, color: '#25231F' },
  body: { fontSize: 16, lineHeight: 24, color: '#5C5851' },
  error: { fontSize: 16, lineHeight: 24, color: '#87513D' },
  row: { gap: 8, paddingVertical: 8, minHeight: 44 },
  date: { fontSize: 14, lineHeight: 20, color: '#53604F' },
  note: { fontSize: 20, lineHeight: 28, color: '#25231F' },
});
