import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { ShareConfirmState, SharePreview } from '../application/family-use-cases';

function precisionLabel(precision: string) {
  if (precision === 'exact') return '具体时刻';
  if (precision === 'day') return '那天';
  if (precision === 'month') return '那个月';
  if (precision === 'year') return '那年';
  return '时间还没确定';
}

function storedMessage(state: ShareConfirmState) {
  if (state.status === 'stored') return '分享已经保存在家里的服务上。';
  if (state.status === 'failed') return state.message;
  if (state.status === 'confirming') return '正在保存这次分享。';
  return null;
}

export function ShareConfirmScreen(props: {
  preview: SharePreview;
  status: ShareConfirmState;
  onConfirm: () => void;
  onBack?: () => void;
}) {
  const message = storedMessage(props.status);
  return (
    <ScrollView contentContainerStyle={styles.column} accessibilityLabel="确认分享">
      <Text style={styles.title} accessibilityRole="header">
        将发给家里的内容
      </Text>
      <Text style={styles.hint}>只有你确认后才会保存。家人还没有收到。</Text>
      {props.preview.note ? <Text style={styles.block}>文字：{props.preview.note}</Text> : null}
      {props.preview.emotion ? <Text style={styles.block}>感受：{props.preview.emotion}</Text> : null}
      <Text style={styles.block}>
        时间：{props.preview.occurredAt || '还没写下'}（{precisionLabel(props.preview.occurredAtPrecision)}）
      </Text>
      {props.preview.media.length ? (
        props.preview.media.map((item) => (
          <Text key={item.assetId} style={styles.block}>
            {item.ready ? `媒体：已选好，可以发送` : '媒体：还没传到家庭服务，不能分享'}
          </Text>
        ))
      ) : (
        <Text style={styles.block}>这次没有照片或声音。</Text>
      )}
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <View style={styles.actions}>
        {props.onBack ? (
          <Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={props.onBack}>
            <Text style={styles.back}>返回</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="确认分享"
          testID="share-confirm"
          disabled={!props.preview.canConfirm || props.status.status === 'confirming' || props.status.status === 'stored'}
          onPress={props.onConfirm}
        >
          <Text style={styles.confirm}>确认分享</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  column: { padding: 24, gap: 12 },
  title: { fontSize: 28, lineHeight: 36 },
  hint: { fontSize: 16, lineHeight: 24, opacity: 0.7 },
  block: { fontSize: 18, lineHeight: 28 },
  message: { fontSize: 16, lineHeight: 24 },
  actions: { flexDirection: 'row', gap: 24, marginTop: 12 },
  back: { fontSize: 18 },
  confirm: { fontSize: 18 },
});
