import { tr } from '../i18n';
import type { ReactNode, Ref } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { hairline, ink, pageGutter, paper, readingWidth, sage } from './life-page';
import { LifeIcon } from './life-icons';
import { Text, type } from './life-text';
import { pageFrame } from './page-frame';
import { usePageMetrics } from './use-page-metrics';

export function settingsEdgePad(inset: number, gutter: number): number {
  return Math.max(inset, gutter);
}

export function SettingsPage({
  title,
  backLabel,
  accessibilityLabel,
  testID,
  pageTestID,
  onBack,
  headerRight,
  headerAccessory,
  hideBackLabel = false,
  scrollEnabled = true,
  wide = false,
  scrollRef,
  children,
}: {
  title: string;
  backLabel: string;
  accessibilityLabel: string;
  testID?: string;
  pageTestID?: string;
  onBack: () => void;
  headerRight?: ReactNode;
  headerAccessory?: ReactNode;
  hideBackLabel?: boolean;
  scrollEnabled?: boolean;
  /** Gallery/album tools use the full shared page; prose/forms keep a reading measure. */
  wide?: boolean;
  scrollRef?: Ref<ScrollView>;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = usePageMetrics();
  const gutter = pageGutter(width, height);
  const frame = pageFrame(width, height);
  const column = frame.regular ? (wide ? frame.content : frame.reading) : readingWidth(width, height);
  const padLeft = settingsEdgePad(insets.left, gutter);
  const padRight = settingsEdgePad(insets.right, gutter);
  return (
    <View style={styles.safe} accessibilityLabel={accessibilityLabel} testID={pageTestID}>
      <View
        testID="account-header"
        style={[
          styles.header,
          {
            ...(frame.regular ? { width: '100%' as const, maxWidth: frame.column, alignSelf: 'center' as const, paddingTop: insets.top + frame.top, paddingBottom: 12 } : {paddingTop: insets.top}),
            paddingLeft: padLeft,
            paddingRight: padRight,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr("返回")}
          accessibilityHint={hideBackLabel ? backLabel : undefined}
          testID="account-back"
          onPress={onBack}
          style={styles.backHit}
        >
          <LifeIcon name="back" size={19} color={sage} decorative />
          {!hideBackLabel ? <Text style={styles.back} numberOfLines={1}>{backLabel}</Text> : null}
        </Pressable>
        {title ? <Text style={styles.title} accessibilityRole="header">{title}</Text> : null}
        <View style={styles.headerSpacer}>{headerRight}</View>
      </View>
      {headerAccessory ? <View style={{paddingLeft:padLeft,paddingRight:padRight,alignItems:frame.regular?'flex-start':'center',width:'100%',...(frame.regular?{maxWidth:frame.column,alignSelf:'center'}:null)}}><View style={[styles.reading,{maxWidth:column}]}>{headerAccessory}</View></View> : null}
      <KeyboardAvoidingView
        style={styles.scroll}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          testID={testID ?? 'account-scroll'}
          style={styles.scroll}
          scrollEnabled={scrollEnabled}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets={false}
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={[
            styles.column,
            {
              ...(frame.regular ? {maxWidth:frame.column,alignSelf:'center' as const,alignItems:'flex-start' as const,paddingTop:24}:null),
              paddingLeft: padLeft,
              paddingRight: padRight,
              paddingBottom: Math.max(insets.bottom, 44),
              ...(scrollEnabled ? null : { flexGrow: 1 }),
            },
          ]}
        >
          <View testID="account-reading-column" style={[styles.reading, { maxWidth: column }]}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: paper },
  header: {
    minHeight: 66,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: hairline,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backHit: {
    flex: 1,
    minWidth: 54,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  back: { ...type.meta, color: sage, flexShrink: 1 },
  title: { ...type.meta, color: ink, textAlign: 'center', flexShrink: 1, maxWidth: '58%', paddingVertical: 14 },
  headerSpacer: { flex: 1, minWidth: 54, minHeight: 48, alignItems: 'flex-end', justifyContent: 'center' },
  scroll: { flex: 1 },
  column: {
    width: '100%',
    alignItems: 'center',
  },
  reading: {
    width: '100%',
  },
});
