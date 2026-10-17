import {AlbumExportUnlock} from './album-export-unlock';
import {albumExportConfig,albumExportEntryOpen,AlbumExportAccessError} from '../application/album-export-access';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  printFailureDiagnostic,
  type PrintFailureDiagnostic,
} from '../application/album-print';
import type { AlbumReadingStyle } from '../application/album-reading';
import {
  createExpoAlbumPrint,
  listSavedAlbumPrints,
  shareSavedAlbumPrint,
  summarizePrint,
  type SavedPrintSummary,
} from '../infrastructure/album-print-files';
import { readAlbumReadingState } from '../infrastructure/album-reading-store';
import { tr } from '../i18n';
import { useDeviceLock } from './device-lock-context';
import { firstSearchParam } from './lookback-origin';
import { SettingsPage } from './settings-chrome';
import { Text, type } from './life-text';
import { ink, inkSoft, sage } from './life-page';

export default function AlbumPrintScreen() {
  const router = useRouter();
  const id =
    firstSearchParam(useLocalSearchParams<{ id?: string | string[] }>().id) ??
    '';
  const lock = useDeviceLock();
  const config=albumExportConfig();
  const formal=config.enabled;
  const enabled = albumExportEntryOpen(
    typeof __DEV__ !== 'undefined' && __DEV__,
  );
  const [foreground, setForeground] = useState(
    AppState.currentState === 'active',
  );
  const blocked = !enabled || !foreground || !!lock?.snapshot.locked;
  const [style, setStyle] = useState<AlbumReadingStyle>('plain');
  const [saved, setSaved] = useState<SavedPrintSummary[]>([]);
  const [ready, setReady] = useState(false);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [diagnostic, setDiagnostic] = useState<PrintFailureDiagnostic | null>(
    null,
  );
  const [error, setError] = useState(false);
  const [accessNotice,setAccessNotice]=useState(false);
  const active = useRef(false);
  const locked = useRef(blocked);
  const generation = useRef(0);
  const owner = useRef<number | null>(null);
  useLayoutEffect(() => {
    locked.current = blocked;
  }, [blocked]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      setForeground(state === 'active');
      if (state !== 'active') generation.current += 1;
    });
    return () => sub.remove();
  }, []);
  useFocusEffect(
    useCallback(() => {
      void retry;
      active.current = true;
      const epoch = ++generation.current;
      setSaved([]);
      setError(false);
      setDiagnostic(null);
      setReady(false);
      if (!blocked && id)
        void Promise.all([listSavedAlbumPrints(id), readAlbumReadingState(id)])
          .then(([editions, preference]) => {
            if (active.current && generation.current === epoch) {
              setSaved(editions);
              setStyle(preference.style);
              setReady(true);
            }
          })
          .catch((caught) => {
            if (active.current && generation.current === epoch) {
              setError(true);
              setDiagnostic(printFailureDiagnostic(caught, 'LOAD_SAVED'));
            }
          });
      return () => {
        active.current = false;
        generation.current += 1;
      };
    }, [blocked, id, retry]),
  );
  function current(epoch: number) {
    return (
      enabled &&
      active.current &&
      !locked.current &&
      AppState.currentState === 'active' &&
      generation.current === epoch
    );
  }
  async function run(work: (valid: () => boolean) => Promise<void>) {
    if (owner.current !== null || blocked || !ready) return;
    const epoch = ++generation.current;
    owner.current = epoch;
    setBusy(true);
    setError(false);
    setDiagnostic(null);
    setAccessNotice(false);
    try {
      await work(() => current(epoch));
    } catch (caught) {
      if (current(epoch)) {
        if(caught instanceof AlbumExportAccessError||printFailureDiagnostic(caught).code.startsWith('EXPORT_')){setAccessNotice(true);return;}
        setError(true);
        setDiagnostic(printFailureDiagnostic(caught));
      }
    } finally {
      if (owner.current === epoch) {
        owner.current = null;
        if (active.current) setBusy(false);
      }
    }
  }
  return (
    <SettingsPage
      title={tr(formal?'导出这一册':'打印验收')}
      backLabel={tr('这一册')}
      accessibilityLabel={tr(formal?'导出这一册':'打印验收')}
      onBack={() => router.back()}
    >
      {!blocked ? (
        <View style={styles.body}>
          {!formal?<Text style={styles.meta}>{tr('开发验收入口，正式导出尚未开放。')}</Text>:null}
          {formal&&config.paid?<AlbumExportUnlock/>:null}
          {accessNotice?<Text accessibilityLiveRegion="polite" style={styles.meta}>{tr('请先解锁或恢复导出权益，再点生成PDF。')}</Text>:null}
          <Text style={styles.meta}>
            {tr('PDF不含声音，电子册文件将在后续阶段提供。')}
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={busy || !ready}
            accessibilityState={{ disabled: busy || !ready }}
            style={styles.hit}
            onPress={() =>
              void run(async (valid) => {
                const result = await createExpoAlbumPrint(id, valid).save(
                  style,
                );
                if (valid())
                  setSaved((previous) => [
                    summarizePrint(result.manifest),
                    ...previous,
                  ]);
              })
            }
          >
            <Text style={styles.action}>
              {busy ? tr('正在冻结并排成PDF。') : tr(formal?'生成PDF':'生成并保存测试PDF')}
            </Text>
          </Pressable>
          {busy ? (
            <Pressable
              accessibilityRole="button"
              style={styles.hit}
              onPress={() => {
                generation.current += 1;
              }}
            >
              <Text style={styles.action}>{tr('取消')}</Text>
            </Pressable>
          ) : null}
          {error ? (
            <Text style={styles.meta}>
              {tr('本次没有生成。请核对记录、媒体和原生构建后再试。')}
            </Text>
          ) : null}
          {error && !ready ? (
            <Pressable
              accessibilityRole="button"
              style={styles.hit}
              onPress={() => setRetry((value) => value + 1)}
            >
              <Text style={styles.action}>{tr('再试一次')}</Text>
            </Pressable>
          ) : null}
          {error && diagnostic && !formal ? (
            <Text testID="album-print-failure-diagnostic" style={styles.meta}>
              {[diagnostic.stage, diagnostic.code, diagnostic.reason]
                .filter(Boolean)
                .join(' / ')}
            </Text>
          ) : null}
          {!saved.length && !busy ? (
            <Text style={styles.meta}>{tr(formal?'尚未生成PDF。':'尚未生成测试成品。')}</Text>
          ) : null}
          {saved.map((edition) => (
            <View key={edition.id} style={styles.edition}>
              <Text style={styles.title}>{edition.name}</Text>
              <Text style={styles.meta}>
                {edition.createdAt} · A5 · {edition.pdf.pageCount} ·{' '}
                {(edition.pdf.bytes / 1024).toFixed(0)} KB
              </Text>
              <Text style={styles.meta}>{tr(formal?'PDF已生成在本机，保存到系统文件请点下方按钮。':'测试成品已保存在本机。')}</Text>
              <Text style={styles.meta}>{tr(edition.pdf.emojiVisualCheckRequired
                ? '普通文字选择已核对；请打开PDF核对emoji显示，emoji可能无法复制。'
                : '页面与文字选择已核对')}</Text>
              <Text style={styles.meta}>
                {tr(
                  edition.pdf.fontsEmbedded === true
                    ? '字体嵌入已核对'
                    : edition.pdf.fontsEmbedded === false
                      ? '字体未完整嵌入'
                      : '字体嵌入尚未确认',
                )}
              </Text>
              {edition.imageDpi.some(
                (image) => image.dpi !== null && image.dpi < 300,
              ) ? (
                <Text style={styles.meta}>
                  {tr('部分照片低于300DPI，打印前请检查清晰度。')}
                </Text>
              ) : null}
              <Text style={styles.meta}>
                {edition.pdf.fontRunNames.join(' · ')}
              </Text>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                style={styles.hit}
                onPress={() =>
                  void run(async (valid) => {
                    if (valid()) await shareSavedAlbumPrint(edition, valid);
                  })
                }
              >
                <Text style={styles.action}>{tr('保存或打印PDF')}</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </SettingsPage>
  );
}
const styles = StyleSheet.create({
  body: { paddingTop: 24, gap: 16 },
  edition: { gap: 8, paddingVertical: 16 },
  hit: { minHeight: 48, justifyContent: 'center' },
  title: { ...type.action, color: ink },
  meta: { ...type.meta, color: inkSoft },
  action: { ...type.action, color: sage },
});
