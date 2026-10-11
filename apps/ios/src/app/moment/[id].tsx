import { tr } from '../../i18n';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, type } from '../../screens/life-text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { getUseCases } from '../../application/container';
import type { MomentDetailViewModel } from '../../application/use-cases';
import { isFamilyProductEntryOpen } from '../../infrastructure/family-config';
import { MomentAudio, MomentUnknownMedia } from '../../screens/moment-audio';
import { detailPrecisionLine } from '../../screens/moment-detail-entry';
import { MomentFeeling } from '../../screens/moment-feeling';
import { MomentImages } from '../../screens/moment-images';
import {
  ink,
  hairline,
  inkSoft,
  isCompactHeight,
  pageGutter,
  paper,
  readingPageWidth,
  sage,
} from '../../screens/life-page';
import { ALBUM_COLLECT_MENU } from '../../application/life-album';
import { LifeAlbumCollectSheet } from '../../screens/life-album-collect-sheet';
import { LifeIconButton } from '../../screens/life-icons';
import { useSoundPlayer } from '../../screens/use-sound-player';
import { usePageMetrics } from '../../screens/use-page-metrics';

export default function MomentDetailScreen() {
  const router = useRouter();
  const { width, height } = usePageMetrics();
  const gutter = pageGutter(width, height);
  const pageWidth = readingPageWidth(width, height);
  const compact = isCompactHeight(height);
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const momentId = rawId ? decodeURIComponent(rawId) : '';
  const [view, setView] = useState<MomentDetailViewModel | null>(null);
  const [loadKey, setLoadKey] = useState(0);
  const [collectOpen, setCollectOpen] = useState(false);
  const sound = useSoundPlayer();

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
    <SafeAreaView style={styles.safe} accessibilityLabel={tr("记录")}>
      <View
        style={[
          styles.chrome,
          {
            maxWidth: pageWidth,
            paddingHorizontal: gutter,
            paddingTop: compact ? 4 : 8,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr("返回原来的位置")}
          onPress={() => router.back()}
          style={styles.backHit}
        >
          <Text style={styles.back}>{tr("返回原来的位置")}</Text>
        </Pressable>
        {view?.kind === 'ready' ? (
          <LifeIconButton
            name="more"
            label={ALBUM_COLLECT_MENU}
            testID="moment-overflow"
            size={20}
            onPress={() => setCollectOpen(true)}
          />
        ) : null}
      </View>
      <ScrollView
        testID="detail-scroll"
        style={styles.scroll}
        contentContainerStyle={[
          styles.column,
          {
            maxWidth: pageWidth,
            paddingHorizontal: gutter,
            paddingTop: compact ? 8 : 16,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {view?.kind === 'missing' ? (
          <View style={styles.block}>
            <Text style={styles.title}>{tr("这条记录现在无法找到。")}</Text>
            <Text style={styles.body}>{tr("没有改成显示其他记录。")}</Text>
          </View>
        ) : null}

        {view?.kind === 'error' ? (
          <View style={styles.block}>
            <Text style={styles.title}>{tr("这条记录暂时读不出来。")}</Text>
            <Text style={styles.body}>{tr("原来的内容还在，可以再试。没有把它当成已经丢失。")}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tr("再试一次")}
              onPress={() => setLoadKey((value) => value + 1)}
              style={styles.retryHit}
            >
              <Text style={styles.retry}>{tr("再试一次")}</Text>
            </Pressable>
          </View>
        ) : null}

        {view?.kind === 'ready' ? (
          <View style={styles.page}>
            <View style={styles.entry}>
              <View style={styles.dateRow} testID="detail-date-row">
              <Text accessibilityRole="header" style={styles.date}>
                {view.dateLabel}
              </Text>
              {isFamilyProductEntryOpen() ? <Pressable accessibilityRole="button" accessibilityLabel={tr('分享')}
                testID="moment-share-top" onPress={() => router.push(`/share/${encodeURIComponent(view.id)}`)} style={styles.shareHit}>
                <View style={styles.shareLabel}><Text style={styles.share}>{tr('分享')}</Text><View style={styles.shareUnderline} accessible={false} /></View>
              </Pressable> : null}
              </View>
              {detailPrecisionLine(view.precision) ? (
                <Text testID="detail-precision" style={styles.precision}>
                  {detailPrecisionLine(view.precision)}
                </Text>
              ) : null}
            </View>
            {view.note ? (
              <Text testID="detail-note" style={styles.note}>
                {view.note}
              </Text>
            ) : null}
            <MomentImages images={view.images} testIDPrefix="detail-image" rhythm />
            <MomentUnknownMedia items={view.unknownMedia ?? []} testIDPrefix="detail-unknown" />
            <MomentAudio
              audio={view.audio}
              playbackStatus={sound.failed ? 'unavailable' : sound.status}
              currentTimeMs={sound.currentTimeMs}
              onPlay={() => {
                if (view.audio?.uri) void sound.play(view.audio.uri);
              }}
              onPause={() => {
                void sound.pause();
              }}
              testIDPrefix="detail-sound"
              scene
            />
            <View style={styles.secondary} testID="detail-feeling-share-row">
              <View style={styles.feelingColumn}><MomentFeeling feeling={view.feeling} testID="detail-feeling" /></View>
            {isFamilyProductEntryOpen() ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={tr('分享')}
                testID="moment-share-to-family"
                onPress={() => router.push(`/share/${encodeURIComponent(view.id)}`)}
                style={styles.shareHit}
              >
                <View style={styles.shareLabel}><Text style={styles.share}>{tr('分享')}</Text><View style={styles.shareUnderline} accessible={false} /></View>
              </Pressable>
            ) : null}
            </View>
            <View testID="detail-end-line" style={styles.endLine} accessible={false} accessibilityElementsHidden importantForAccessibility="no" />
          </View>
        ) : null}
      </ScrollView>
      {view?.kind === 'ready' && collectOpen ? (
        <LifeAlbumCollectSheet
          visible
          momentId={view.id}
          onClose={() => setCollectOpen(false)}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: paper },
  chrome: {
    width: '100%',
    alignSelf: 'center',
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scroll: { flex: 1, width: '100%' },
  column: {
    flexGrow: 1,
    width: '100%',
    maxWidth: '100%',
    alignSelf: 'center',
    paddingBottom: 48,
    gap: 24,
  },
  backHit: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  back: { ...type.action, color: sage },
  block: { gap: 12, width: '100%', maxWidth: '100%', minWidth: 0 },
  page: { gap: 24, width: '100%', maxWidth: '100%', minWidth: 0 },
  entry: { gap: 4, width: '100%' },
  dateRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:16},
  endLine:{width:48,alignSelf:'center',height:StyleSheet.hairlineWidth,backgroundColor:hairline,marginTop:8,marginBottom:16},
  title: { ...type.title, color: ink, flexShrink: 0 },
  body: { ...type.action, color: inkSoft },
  date: { ...type.title, color: sage, flexShrink: 1 },
  precision: { ...type.meta, color: inkSoft },
  note: { ...type.body, color: ink },
  secondary: { gap: 16, width: '100%',flexDirection:'row',justifyContent:'space-between',alignItems:'center' },
  feelingColumn:{flex:1,minWidth:0},
  meta: { ...type.meta, color: inkSoft },
  retryHit: { minHeight: 44, justifyContent: 'center' },
  retry: { ...type.action, color: sage },
  shareHit: { minHeight: 48, minWidth:48, justifyContent: 'center',alignItems:'center' },
  share: { ...type.meta, color: sage },
  shareLabel:{alignItems:'stretch',gap:5},
  shareUnderline:{height:StyleSheet.hairlineWidth,backgroundColor:sage,opacity:0.55},
});
