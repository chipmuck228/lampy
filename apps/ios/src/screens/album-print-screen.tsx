import { useAlbumExportUnlock } from './album-export-unlock';
import { albumExportConfig, albumExportEntryOpen, AlbumExportAccessError } from '../application/album-export-access';
import { unifiedPurchasesEnabled } from '../application/unified-purchases';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  printFailureDiagnostic,
  type AlbumPrintProgress,
  type PrintFailureDiagnostic,
} from '../application/album-print';
import type { AlbumReadingPosition, AlbumReadingStyle } from '../application/album-reading';
import type { AlbumLayout } from '../application/album-layout';
import type { AlbumLayoutMediaMap } from '../application/album-layout-input';
import {
  albumEditionDateLabel,
  albumEditionNumbers,
  albumFileSizeLabel,
  albumPrintFailureKind,
  albumReadyToBind,
} from '../application/album-export-showcase';
import { getUseCases } from '../application/container';
import {
  createExpoAlbumPrint,
  listSavedAlbumPrints,
  shareSavedAlbumPrint,
  summarizePrint,
  type SavedPrintSummary,
} from '../infrastructure/album-print-files';
import { readAlbumReadingState, saveAlbumReadingState } from '../infrastructure/album-reading-store';
import { tr } from '../i18n';
import { useDeviceLock } from './device-lock-context';
import { firstSearchParam } from './lookback-origin';
import { SettingsPage } from './settings-chrome';
import { Text, type } from './life-text';
import { ink, inkSoft, readingWidth } from './life-page';
import { usePageMetrics } from './use-page-metrics';
import {
  AlbumExportShowcase,
  BindingPanel,
  FreshEdition,
  MiniBook,
  ShelfHeader,
  ShowcaseButton,
  ShowcaseNote,
  ShowcaseUnlocked,
} from './album-export-showcase';

function successHaptic() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const haptics = require('expo-haptics') as typeof import('expo-haptics');
    void haptics.notificationAsync(haptics.NotificationFeedbackType.Success).catch(() => undefined);
  } catch {
    // Haptics are a courtesy; a missing module never blocks the edition.
  }
}

export default function AlbumPrintScreen() {
  const router = useRouter();
  const id =
    firstSearchParam(useLocalSearchParams<{ id?: string | string[] }>().id) ??
    '';
  const lock = useDeviceLock();
  const config = albumExportConfig();
  const formal = config.enabled;
  const paidGate = formal && config.paid;
  const enabled = albumExportEntryOpen(
    typeof __DEV__ !== 'undefined' && __DEV__,
  );
  const [foreground, setForeground] = useState(
    AppState.currentState === 'active',
  );
  const blocked = !enabled || !foreground || !!lock?.snapshot.locked;
  const unlock = useAlbumExportUnlock(paidGate && !blocked);
  const metrics = usePageMetrics();
  const [style, setStyle] = useState<AlbumReadingStyle>('plain');
  const position = useRef<AlbumReadingPosition | null>(null);
  const [saved, setSaved] = useState<SavedPrintSummary[]>([]);
  const [ready, setReady] = useState(false);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<AlbumPrintProgress | null>(null);
  const [fresh, setFresh] = useState<SavedPrintSummary | null>(null);
  const [celebrate, setCelebrate] = useState(0);
  const [book, setBook] = useState<{ layout: AlbumLayout; media: AlbumLayoutMediaMap } | null>(null);
  const [bookFailed, setBookFailed] = useState(false);
  const [diagnostic, setDiagnostic] = useState<PrintFailureDiagnostic | null>(
    null,
  );
  const [error, setError] = useState(false);
  const [accessNotice, setAccessNotice] = useState(false);
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
      setBook(null);
      setBookFailed(false);
      setFresh(null);
      let layoutRequest: number | null = null;
      const signal = { cancelled: false };
      const still = () => active.current && generation.current === epoch && !signal.cancelled;
      if (!blocked && id) {
        void Promise.all([listSavedAlbumPrints(id), readAlbumReadingState(id)])
          .then(([editions, preference]) => {
            if (still()) {
              setSaved(editions);
              setStyle(preference.style);
              position.current = preference.position;
              setReady(true);
            }
          })
          .catch((caught) => {
            if (still()) {
              setError(true);
              setDiagnostic(printFailureDiagnostic(caught, 'LOAD_SAVED'));
            }
          });
        // The showcase is the same measured layout as the paper preview.
        void getUseCases()
          .then(async (app) => {
            if (!still()) return;
            const began = app.beginAlbumLayout(id);
            layoutRequest = began.requestId;
            const result = await app.generateAlbumLayout(id, {
              signal,
              requestId: began.requestId,
              privateUnlocked: !locked.current,
            });
            if (still() && result.layout.albumId === id) setBook({ layout: result.layout, media: result.media });
          })
          .catch(() => {
            if (still()) setBookFailed(true);
          });
      }
      return () => {
        active.current = false;
        signal.cancelled = true;
        generation.current += 1;
        if (layoutRequest != null) {
          const owned = layoutRequest;
          void getUseCases().then((app) => app.cancelAlbumLayout(owned)).catch(() => undefined);
        }
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
        if (caught instanceof AlbumExportAccessError || printFailureDiagnostic(caught).code.startsWith('EXPORT_')) {
          setAccessNotice(true);
          return;
        }
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
  const [binding, setBinding] = useState(false);
  function bind() {
    void run(async (valid) => {
      setFresh(null);
      setProgress(null);
      setBinding(true);
      try {
        const result = await createExpoAlbumPrint(id, valid, (update) => {
          if (valid()) setProgress(update);
        }).save(style);
        if (valid()) {
          const summary = summarizePrint(result.manifest);
          setSaved((previous) => [summary, ...previous]);
          setFresh(summary);
          setCelebrate((value) => value + 1);
          successHaptic();
        }
      } finally {
        if (active.current) setBinding(false);
      }
    });
  }
  function share(edition: SavedPrintSummary) {
    void run(async (valid) => {
      if (valid()) await shareSavedAlbumPrint(edition, valid);
    });
  }
  function chooseStyle(next: AlbumReadingStyle) {
    if (busy || next === style) return;
    setStyle(next);
    // Same preference as continuous reading; the reading position is kept as read.
    void saveAlbumReadingState(id, next, position.current).catch(() => undefined);
  }
  const owned = !paidGate || !!unlock.status?.owned;
  const bindable = !book || albumReadyToBind(book.layout);
  const numbers = albumEditionNumbers(saved.map((edition) => edition.createdAt));
  const freshNumber = fresh ? numbers[saved.findIndex((edition) => edition.id === fresh.id)] ?? saved.length : 0;
  const failure = diagnostic ? albumPrintFailureKind(diagnostic.code) : 'other';
  return (
    <SettingsPage
      title={tr(formal ? '导出这一册' : '打印验收')}
      backLabel={tr('这一册')}
      accessibilityLabel={tr(formal ? '导出这一册' : '打印验收')}
      onBack={() => router.back()}
    >
      {!blocked ? (
        <AlbumExportShowcase
          layout={book?.layout ?? null}
          media={book?.media ?? {}}
          failed={bookFailed}
          style={style}
          onStyle={chooseStyle}
          width={readingWidth(metrics.width, metrics.height)}
          busy={binding}
          celebrate={celebrate}
        >
          {!formal ? <Text style={styles.meta}>{tr('开发验收入口，正式导出尚未开放。')}</Text> : null}
          <View style={styles.cta}>
            {binding ? (
              <BindingPanel
                progress={progress}
                onCancel={() => {
                  generation.current += 1;
                  setBinding(false);
                }}
              />
            ) : fresh ? (
              <FreshEdition
                number={freshNumber}
                pages={fresh.pdf.pageCount}
                size={albumFileSizeLabel(fresh.pdf.bytes)}
                disabled={busy}
                onShare={() => share(fresh)}
              />
            ) : owned ? (
              <>
                {paidGate ? <ShowcaseUnlocked /> : null}
                <ShowcaseButton
                  testID="album-export-bind"
                  label={busy ? tr('正在冻结并排成PDF。') : tr(formal ? '装订成册' : '生成并保存测试PDF')}
                  disabled={busy || !ready || !bindable}
                  onPress={bind}
                />
                {formal ? <ShowcaseNote>{tr('生成A5 PDF，保存在本机；之后可以存到「文件」或直接打印。')}</ShowcaseNote> : null}
              </>
            ) : unlock.price ? (
              <>
                <ShowcaseButton
                  testID="album-export-purchase"
                  label={tr('解锁导出 · {0}', [unlock.price])}
                  disabled={unlock.working}
                  onPress={unlock.purchase}
                />
                <ShowcaseNote>{tr('一次购买，之后每一册、每一次导出都不再收费。')}</ShowcaseNote>
                <ShowcaseNote>{tr('同时解锁最长30分钟的录音。')}</ShowcaseNote>
              </>
            ) : unlock.loading ? (
              <ShowcaseNote>{tr('正在核对导出权益。')}</ShowcaseNote>
            ) : (
              <>
                <ShowcaseNote>{tr('商品暂时不可用，请稍后再试。')}</ShowcaseNote>
                <ShowcaseButton tone="quiet" label={tr('再试一次')} disabled={unlock.working} onPress={unlock.retry} />
              </>
            )}
            {paidGate && !owned ? (
              <>
                {unifiedPurchasesEnabled() ? <ShowcaseNote>{tr('购买将关联当前Lampy账号，不随家庭转交。')}</ShowcaseNote> : null}
                <ShowcaseButton tone="quiet" label={tr('恢复购买')} disabled={unlock.working} onPress={unlock.restore} />
              </>
            ) : null}
            {paidGate && unlock.outcome ? (
              <ShowcaseNote live>
                {unlock.outcome === 'purchased' || unlock.outcome === 'restored'
                  ? tr('已解锁。现在可以装订这一册了。')
                  : unlock.notice}
              </ShowcaseNote>
            ) : paidGate && unlock.notice && !unlock.loading ? (
              <ShowcaseNote live>{unlock.notice}</ShowcaseNote>
            ) : null}
            {accessNotice ? <ShowcaseNote live>{tr('请先解锁或恢复导出权益，再装订这一册。')}</ShowcaseNote> : null}
            {book && !bindable ? (
              <ShowcaseNote live>{tr('这一册里有读不到的记录或媒体。核对后才能装订。')}</ShowcaseNote>
            ) : null}
            <ShowcaseNote>{tr('PDF不含声音，电子册文件将在后续阶段提供。')}</ShowcaseNote>
          </View>
          {error ? (
            <ShowcaseNote live>
              {formal
                ? failure === 'changed'
                  ? tr('排的时候记录有变动，这一次没有导出。')
                  : failure === 'missing'
                    ? tr('有记录、照片或声音现在读不到，请先在这一册里核对。')
                    : tr('这一次没有装订成功，原来的记录都还在。')
                : tr('本次没有生成。请核对记录、媒体和原生构建后再试。')}
            </ShowcaseNote>
          ) : null}
          {error && !ready ? (
            <ShowcaseButton tone="quiet" label={tr('再试一次')} onPress={() => setRetry((value) => value + 1)} />
          ) : null}
          {error && diagnostic && !formal ? (
            <Text testID="album-print-failure-diagnostic" style={styles.meta}>
              {[diagnostic.stage, diagnostic.code, diagnostic.reason]
                .filter(Boolean)
                .join(' / ')}
            </Text>
          ) : null}
          {!saved.length && !busy && !formal ? (
            <Text style={styles.meta}>{tr('尚未生成测试成品。')}</Text>
          ) : null}
          {saved.length ? <ShelfHeader /> : null}
          {saved.map((edition, index) => (
            <View key={edition.id} style={styles.edition}>
              <MiniBook style={edition.style} />
              <View style={styles.editionText}>
                <Text style={styles.title}>{edition.name}</Text>
                <Text style={styles.meta}>
                  {tr('第{0}版 · {1} · {2}页 · {3}', [
                    numbers[index],
                    albumEditionDateLabel(edition.createdAt),
                    edition.pdf.pageCount,
                    albumFileSizeLabel(edition.pdf.bytes),
                  ])}
                </Text>
                {!formal ? (
                  <>
                    <Text style={styles.meta}>{tr('测试成品已保存在本机。')}</Text>
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
                    <Text style={styles.meta}>
                      {edition.pdf.fontRunNames.join(' · ')}
                    </Text>
                  </>
                ) : null}
                {edition.imageDpi.some(
                  (image) => image.dpi !== null && image.dpi < 300,
                ) ? (
                  <Text style={styles.meta}>
                    {tr('部分照片低于300DPI，打印前请检查清晰度。')}
                  </Text>
                ) : null}
                <ShowcaseButton
                  tone="quiet"
                  label={tr('保存或打印PDF')}
                  disabled={busy}
                  onPress={() => share(edition)}
                />
              </View>
            </View>
          ))}
        </AlbumExportShowcase>
      ) : null}
    </SettingsPage>
  );
}
const styles = StyleSheet.create({
  cta: { gap: 10, paddingTop: 6 },
  edition: { flexDirection: 'row', gap: 14, paddingVertical: 10, alignItems: 'flex-start' },
  editionText: { flex: 1, gap: 4, alignItems: 'flex-start' },
  title: { ...type.action, color: ink },
  meta: { ...type.meta, color: inkSoft },
});
