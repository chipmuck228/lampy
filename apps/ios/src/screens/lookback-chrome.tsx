import { useRef, type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter, type Href } from 'expo-router';

import { rememberLookbackScroll, readLookbackScroll } from '../application/lookback-session';
import type { AudioView, ImageView, UnknownMediaView } from '../application/use-cases';
import { MomentAudio, MomentUnknownMedia } from './moment-audio';
import { MomentImages } from './moment-images';

export function lookbackHref(path: string): Href {
  return path as Href;
}

export function momentHref(id: string): Href {
  return { pathname: '/moment/[id]', params: { id } } as Href;
}

export function useLookbackLayout() {
  const { width, height, fontScale } = useWindowDimensions();
  return {
    readingWidth: Math.min(width, 720),
    verticalTime: width < 600 || fontScale >= 1.3,
    shortHeight: height < 500,
    maxBar: Math.min(width, 720) - 48,
  };
}

export function LookbackScaffold({
  title,
  path,
  children,
  footer,
}: {
  title: string;
  path: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const router = useRouter();
  const { readingWidth, shortHeight } = useLookbackLayout();
  const scrollRef = useRef<ScrollView>(null);
  const restoreOnce = useRef(false);

  useFocusEffect(() => {
    restoreOnce.current = false;
    return undefined;
  });

  return (
    <SafeAreaView style={styles.safe} accessible={false}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.column,
          { maxWidth: readingWidth, paddingTop: shortHeight ? 8 : 16 },
        ]}
        onContentSizeChange={() => {
          if (restoreOnce.current) return;
          restoreOnce.current = true;
          scrollRef.current?.scrollTo({ y: readLookbackScroll(path), animated: false });
        }}
        onScroll={(event) => {
          rememberLookbackScroll(path, event.nativeEvent.contentOffset.y);
        }}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回原来的位置"
          testID="lookback-back"
          onPress={() => router.back()}
          style={styles.backHit}
        >
          <Text style={styles.back}>返回原来的位置</Text>
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        {children}
        {footer}
      </ScrollView>
    </SafeAreaView>
  );
}

export function DensityBand({ count, max, label }: { count: number; max: number; label: string }) {
  const { maxBar } = useLookbackLayout();
  const width = max <= 0 || count <= 0 ? 0 : Math.max(12, Math.round((count / max) * Math.min(160, maxBar * 0.4)));
  return (
    <View accessible={false} style={styles.bandRow}>
      <View style={[styles.band, { width }]} />
      <Text style={styles.meta}>{label}</Text>
    </View>
  );
}

export function HistoryMomentRow({
  id,
  note,
  timeLabel,
  recordedFallbackLabel,
  images,
  audio,
  unknownMedia,
  onPress,
}: {
  id: string;
  note: string;
  timeLabel: string;
  recordedFallbackLabel?: string;
  images: ImageView[];
  audio: AudioView | null;
  unknownMedia: UnknownMediaView[];
  onPress: () => void;
}) {
  const summary =
    note ||
    images.map((image) => image.label).join('，') ||
    audio?.label ||
    unknownMedia.map((item) => item.label).join('，') ||
    '一条记录';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${timeLabel}，${summary}`}
      testID={`lookback-moment-${id}`}
      hitSlop={8}
      onPress={onPress}
      style={styles.row}
    >
      <Text style={styles.meta}>{timeLabel}</Text>
      {recordedFallbackLabel ? <Text style={styles.fallback}>{recordedFallbackLabel}</Text> : null}
      {note ? <Text style={styles.note}>{note}</Text> : null}
      <MomentImages images={images} testIDPrefix={`lookback-image-${id}`} />
      <MomentAudio audio={audio} testIDPrefix={`lookback-sound-${id}`} compact />
      <MomentUnknownMedia items={unknownMedia} testIDPrefix={`lookback-unknown-${id}`} />
    </Pressable>
  );
}

export function LookbackMessage({ children }: { children: string }) {
  return <Text style={styles.body}>{children}</Text>;
}

export const lookbackStyles = StyleSheet.create({
  hit: { minHeight: 44, justifyContent: 'center' },
  action: { fontSize: 18, lineHeight: 24, color: '#53604F' },
  cell: { minHeight: 44, paddingVertical: 8, gap: 4, flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  stack: { gap: 12 },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F3F0E9' },
  column: {
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingBottom: 32,
    gap: 16,
  },
  backHit: { minHeight: 44, justifyContent: 'center' },
  back: { fontSize: 16, lineHeight: 22, color: '#53604F' },
  title: { fontSize: 28, lineHeight: 34, color: '#25231F' },
  body: { fontSize: 16, lineHeight: 24, color: '#5C5851' },
  meta: { fontSize: 14, lineHeight: 20, color: '#53604F' },
  fallback: { fontSize: 14, lineHeight: 20, color: '#5C5851' },
  note: { fontSize: 20, lineHeight: 28, color: '#25231F' },
  row: { gap: 8, paddingVertical: 8, minHeight: 44, flexGrow: 0, alignSelf: 'stretch' },
  bandRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 20 },
  band: { height: 6, borderRadius: 3, backgroundColor: '#8A9384' },
});
