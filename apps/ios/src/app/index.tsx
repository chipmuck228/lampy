import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Phase-gate scaffold only. No Moment UI, no mock data, no splash delay.
 */
export default function ScaffoldHomeScreen() {
  const { width } = useWindowDimensions();
  const readingWidth = Math.min(width, 720);

  return (
    <SafeAreaView style={styles.safe} accessibilityLabel="Lampy iOS 脚手架">
      <View style={[styles.column, { maxWidth: readingWidth }]}>
        <Text style={styles.wordmark} accessibilityRole="header">
          Lampy
        </Text>
        <Text style={styles.claim}>iOS 脚手架已就绪</Text>
        <Text style={styles.body}>
          这是空 App。还没有创建 Moment、媒体或同步。日期和首页会在下一阶段与启动层共用同一版面。
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F3F0E9',
  },
  column: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  wordmark: {
    fontSize: 28,
    lineHeight: 34,
    color: '#25231F',
  },
  claim: {
    fontSize: 20,
    lineHeight: 28,
    color: '#667568',
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    color: '#777168',
  },
});
