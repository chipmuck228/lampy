import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { getUseCases } from '../../application/container';
import type { MomentDetailViewModel } from '../../application/use-cases';
import { MomentImages } from '../../screens/moment-images';

export default function MomentDetailScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const readingWidth = Math.min(width, 720);
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const momentId = rawId ? decodeURIComponent(rawId) : '';
  const [view, setView] = useState<MomentDetailViewModel | null>(null);
  const [loadKey, setLoadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getUseCases()
      .then((app) => app.getMomentDetail(momentId))
      .then((next) => {
        if (!cancelled) setView(next);
      })
      .catch(() => {
        if (!cancelled) setView({ kind: 'error', requestedId: momentId });
      });
    return () => {
      cancelled = true;
    };
  }, [momentId, loadKey]);

  return (
    <SafeAreaView style={styles.safe} accessibilityLabel="记录">
      <View style={[styles.column, { maxWidth: readingWidth }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回原来的位置"
          onPress={() => router.back()}
          style={styles.backHit}
        >
          <Text style={styles.back}>返回原来的位置</Text>
        </Pressable>

        {view?.kind === 'missing' ? (
          <View style={styles.block}>
            <Text style={styles.title}>这条记录现在无法找到。</Text>
            <Text style={styles.body}>没有改成显示其他记录。</Text>
          </View>
        ) : null}

        {view?.kind === 'error' ? (
          <View style={styles.block}>
            <Text style={styles.title}>这条记录暂时读不出来。</Text>
            <Text style={styles.body}>原来的内容还在，可以再试。没有把它当成已经丢失。</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="再试一次"
              onPress={() => setLoadKey((value) => value + 1)}
              style={styles.retryHit}
            >
              <Text style={styles.retry}>再试一次</Text>
            </Pressable>
          </View>
        ) : null}

        {view?.kind === 'ready' ? (
          <View style={styles.block}>
            <Text style={styles.date}>{view.dateLabel}</Text>
            {view.note ? (
              <Text testID="detail-note" style={styles.note}>
                {view.note}
              </Text>
            ) : null}
            <MomentImages images={view.images} testIDPrefix="detail-image" />
            <Text style={styles.meta}>{view.sourceLabel}</Text>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F3F0E9' },
  column: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 24,
    gap: 20,
  },
  backHit: { minHeight: 44, justifyContent: 'center' },
  back: { fontSize: 16, lineHeight: 22, color: '#53604F' },
  block: { gap: 12 },
  title: { fontSize: 22, lineHeight: 30, color: '#25231F' },
  body: { fontSize: 16, lineHeight: 24, color: '#5C5851' },
  date: { fontSize: 16, lineHeight: 22, color: '#53604F' },
  note: { fontSize: 24, lineHeight: 34, color: '#25231F' },
  meta: { fontSize: 14, lineHeight: 20, color: '#5C5851' },
  retryHit: { minHeight: 44, justifyContent: 'center' },
  retry: { fontSize: 18, lineHeight: 24, color: '#53604F' },
});
