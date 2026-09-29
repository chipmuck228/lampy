import { useRef, useState } from 'react';
import {
  AccessibilityInfo,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  FIRST_RUN_SCREENS,
  isFirstRunFinishAction,
  nextFirstRunIndex,
} from '../application/first-run';
import { ink, inkSoft, isCompactHeight, paper, sage } from './life-page';

export function FirstRunGuide({ onFinished }: { onFinished: () => void }) {
  const { width, height } = useWindowDimensions();
  const compact = isCompactHeight(height);
  const pager = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const [pageHeight, setPageHeight] = useState(Math.max(height - 160, 280));
  const screen = FIRST_RUN_SCREENS[index];

  function moveTo(next: number) {
    indexRef.current = next;
    setIndex(next);
    const reduce = AccessibilityInfo.isReduceMotionEnabled?.();
    void Promise.resolve(reduce).then((value) => {
      pager.current?.scrollTo({ y: next * pageHeight, animated: value !== true });
    });
  }

  function onContinue() {
    const current = indexRef.current;
    if (isFirstRunFinishAction(current)) {
      onFinished();
      return;
    }
    moveTo(nextFirstRunIndex(current));
  }

  function onScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.max(0, Math.min(Math.round(event.nativeEvent.contentOffset.y / Math.max(pageHeight, 1)), FIRST_RUN_SCREENS.length - 1));
    indexRef.current = next;
    setIndex(next);
  }

  return (
    <SafeAreaView style={styles.safe} accessibilityLabel="Lampy 引导">
      <ScrollView
        ref={pager}
        pagingEnabled
        testID="first-run-pager"
        onLayout={(event) => setPageHeight(event.nativeEvent.layout.height)}
        onMomentumScrollEnd={onScrollEnd}
        showsVerticalScrollIndicator={false}
        accessibilityRole="adjustable"
        accessibilityLabel="引导页，上滑翻页"
        style={styles.pager}
      >
        {FIRST_RUN_SCREENS.map((item) => (
          <View
            key={item.id}
            style={[styles.page, { width, height: pageHeight, paddingTop: compact ? 24 : 48 }]}
            testID={`first-run-${item.id}`}
          >
            <Text style={styles.title} accessibilityRole="header">
              {item.title}
            </Text>
            <Text style={styles.body}>{item.body}</Text>
          </View>
        ))}
      </ScrollView>
      <View style={styles.footer}>
        <Text style={styles.progress} testID="first-run-progress">
          {index + 1} / {FIRST_RUN_SCREENS.length}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={screen.action}
          testID="first-run-continue"
          onPress={onContinue}
          style={styles.hit}
        >
          <Text style={styles.action}>{screen.action}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: paper },
  pager: { flex: 1 },
  page: { paddingHorizontal: 24, gap: 16, justifyContent: 'center' },
  title: { fontSize: 28, lineHeight: 36, color: ink },
  body: { fontSize: 17, lineHeight: 26, color: inkSoft },
  footer: { paddingHorizontal: 24, paddingBottom: 16, gap: 8 },
  progress: { fontSize: 15, lineHeight: 22, color: inkSoft },
  action: { fontSize: 20, lineHeight: 28, color: sage },
  hit: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' },
});
