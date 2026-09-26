import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { getFamilyUseCases } from '../../application/container';
import { isApplicationError } from '../../application/errors';
import type { ShareConfirmState, SharePreview } from '../../application/family-use-cases';
import { isFamilyApiConfigured } from '../../infrastructure/family-config';
import { isFamilyTestDriverEnabled } from '../../infrastructure/family-test-driver';
import { ShareConfirmScreen } from '../../screens/share-confirm-screen';

function shareLoadMessage(error: unknown) {
  if (isApplicationError(error)) {
    if (error.code === 'UNAUTHENTICATED') return '要先登录，才能把这条记录分享给家里。';
    if (error.code === 'NOT_IN_FAMILY') return '现在还不在这个家里，不能分享。';
    if (error.code === 'MOMENT_NOT_FOUND') return '这条记录现在无法分享。没有改成显示其他记录。';
    if (error.code === 'SERVER_UNREACHABLE' || error.code === 'NETWORK') {
      return '现在连不上家庭服务，不能确认这次分享。';
    }
  }
  return '这次分享没有做成。个人记录还在这台设备上。';
}

export default function ShareConfirmRoute() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const readingWidth = Math.min(width, 720);
  const params = useLocalSearchParams<{ id?: string | string[]; td?: string | string[] }>();
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const testAction = Array.isArray(params.td) ? params.td[0] : params.td;
  const momentId = rawId ? decodeURIComponent(rawId) : '';
  const configured = isFamilyApiConfigured();
  const [preview, setPreview] = useState<SharePreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<ShareConfirmState>({ status: 'idle' });
  const [loadKey, setLoadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!configured) {
      setPreview(null);
      setLoadError(null);
      return () => {
        cancelled = true;
      };
    }
    getFamilyUseCases()
      .then((family) => family.prepareSharePreview(momentId))
      .then((next) => {
        if (!cancelled) {
          setPreview(next);
          setLoadError(null);
          setStatus({ status: 'idle' });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setPreview(null);
          setLoadError(shareLoadMessage(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [configured, momentId, loadKey]);

  async function confirm() {
    if (!preview) return;
    const family = await getFamilyUseCases();
    const next = await family.confirmShareMoment({
      momentId: preview.sourceMomentId,
      sourceRevision: preview.sourceRevision,
    });
    setStatus(next);
  }

  const ranConfirm = useRef(false);
  useEffect(() => {
    if (!isFamilyTestDriverEnabled() || testAction !== 'confirm' || !preview || ranConfirm.current) return;
    if (!preview.canConfirm) return;
    ranConfirm.current = true;
    void confirm();
  }, [testAction, preview]);

  return (
    <SafeAreaView style={styles.safe} accessibilityLabel="分享确认页">
      <View style={[styles.column, { maxWidth: readingWidth }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回原来的位置"
          onPress={() => router.back()}
          style={styles.backHit}
        >
          <Text style={styles.back}>返回原来的位置</Text>
        </Pressable>
        {!configured ? (
          <Text style={styles.body}>还没有接到能用的家庭服务。个人记录还在这台设备上。</Text>
        ) : null}
        {configured && loadError ? (
          <View style={styles.block}>
            <Text style={styles.body}>{loadError}</Text>
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
        {configured && preview ? (
          <ShareConfirmScreen
            preview={preview}
            status={status}
            onConfirm={() => confirm()}
            onBack={() => router.back()}
          />
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
  body: { fontSize: 16, lineHeight: 24, color: '#5C5851' },
  retryHit: { minHeight: 44, justifyContent: 'center' },
  retry: { fontSize: 18, lineHeight: 24, color: '#53604F' },
});
