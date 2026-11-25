import { AlbumEditionSwipeRow } from './album-edition-swipe-row';
import { deleteSavedAlbumEdition } from '../infrastructure/album-edition-delete';
import type { EpubDesign } from '../application/album-epub';
import { createPersonalEpubSnapshot, discardUnfinishedEpubSnapshot, listEpubSnapshots, type SavedEpubSnapshot } from '../infrastructure/album-epub-snapshots';
import { AlbumEpubFailure, shareAlbumEpub } from '../infrastructure/album-epub-files';
import { useAlbumExportUnlock } from './album-export-unlock';
import { albumExportConfig, albumExportEntryOpen, AlbumExportAccessError } from '../application/album-export-access';
import { unifiedPurchasesEnabled } from '../application/unified-purchases';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, AppState, Pressable, StyleSheet, View } from 'react-native';
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
  ExportChoice,
  BindingPanel,
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
  const routeAlbum = useRef(id);
  useLayoutEffect(() => { routeAlbum.current = id; }, [id]);
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
  const [epubDesign, setEpubDesign] = useState<EpubDesign>('literary');
  const [format, setFormat] = useState<'epub' | 'pdf'>('epub');
  const [paperPreview, setPaperPreview] = useState(false);
  const position = useRef<AlbumReadingPosition | null>(null);
  const [epubState, setEpubState] = useState<{ id: string; pending: boolean; message: string; diagnostic?: string } | null>(null);
  const [freshEpub, setFreshEpub] = useState<{albumId:string;editionId:string}|null>(null);
  const freshEpubId=freshEpub?.albumId===id?freshEpub.editionId:null;
  const [epubEditions, setEpubEditions] = useState<SavedEpubSnapshot[]>([]);
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
      setEpubState(previous => previous?.pending ? { ...previous, pending: false, message: tr('本次制作已停止，请重新开始。') } : previous);
      active.current = true;
      const epoch = ++generation.current;
      setSaved([]);
      setEpubEditions([]);
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
        void Promise.all([listSavedAlbumPrints(id), readAlbumReadingState(id), listEpubSnapshots(id)])
          .then(([editions, preference, electronicEditions]) => {
            if (still()) {
              setSaved(editions);
              setEpubEditions(electronicEditions);
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
  function confirmDelete(editionId: string) {
    if (busy || blocked || owner.current !== null) return;
    const epoch = generation.current;
    Alert.alert(tr('删除这版成品？'), tr('仅删除Lampy内这一版成品及其制作副本，不删除原记录。已保存到「文件」或「图书」的副本不会删除。') + (editionId.startsWith('print_') ? '\n\n' + tr('删除这版PDF也会删除Lampy内基于该版制作的电子册。') : ''), [
      { text: tr('取消'), style: 'cancel' },
      { text: tr('删除'), style: 'destructive', onPress: () => {
        if (!current(epoch) || owner.current !== null) return;
        void run(async valid => {
          try {
            await deleteSavedAlbumEdition(editionId, id, valid);
            if (!valid()) return;
            setSaved(items => items.filter(item => item.id !== editionId));
            setEpubEditions(items => items.filter(item => item.id !== editionId));
            setFreshEpub(item=>item?.editionId===editionId?null:item);
            setFresh(item => item?.id === editionId ? null : item);
            setEpubState(item => item?.id === editionId ? null : item);
          } catch {
            if (valid()) Alert.alert(tr('这版成品未能删除，请再试一次。'));
          }
        });
      } },
    ]);
  }
  const epubCancelled = useRef(false);
  const [binding, setBinding] = useState(false);
  function electronic(edition?: { id: string }) {
    const feedbackId = edition?.id ?? 'new';
    epubCancelled.current = false;
    void run(async outerValid => {
      const valid = () => outerValid() && !epubCancelled.current;
      setEpubState({ id: feedbackId, pending: true, message: tr('正在制作电子册，请稍候。') });
      let createdId: string | undefined;
      let published=false;
      try {
        let editionId = edition?.id;
        if (!editionId) {
          const snapshot = await createPersonalEpubSnapshot(id, epubDesign, valid, (done, total) => {
            if (valid()) setEpubState({ id: feedbackId, pending: true, message: tr('正在整理内容：{0}/{1}', [done,total]) });
          });
          editionId = snapshot.id; createdId = snapshot.id;
        }
        const shared = await shareAlbumEpub(editionId, valid, update => {
          if (!valid()) return;
          if(update.stage==='SHARE'){
            published=true;
            if(createdId)setFreshEpub({albumId:id,editionId:createdId});
            setEpubState({id:feedbackId,pending:false,message:''});
            return;
          }
          const message = update.total > 0 ? tr('正在制作电子册：{0}/{1}', [update.done, update.total]) : tr('正在制作电子册，请稍候。');
          setEpubState({ id: feedbackId, pending: true, message });
        });
        if (valid()) {
          if(createdId)setFreshEpub({albumId:id,editionId:createdId});
          setEpubState({ id: feedbackId, pending: false, message: shared ? tr('电子册已交给所选应用。') : '' });
        }
      } catch (error) {
        if (!valid()) return;
        if(published){setEpubState({id:feedbackId,pending:false,message:''});return;}
        const code = error instanceof AlbumEpubFailure ? error.code : 'OPERATION_FAILED';
        const message = code === 'EPUB_DISK_FULL' ? tr('本机可用空间不足，请腾出空间后重试。')
          : code === 'EPUB_NATIVE_REBUILD_REQUIRED' ? tr('请更新Lampy后再试。')
          : code === 'EPUB_TOO_LARGE' ? tr('电子册超过当前支持的2GB，请分成较小的册子。')
          : code === 'EXPORT_PURCHASE_REQUIRED' || code === 'EXPORT_PURCHASE_UNAVAILABLE' || code === 'EXPORT_CLOSED' ? tr('请先解锁导出，或恢复已有购买。')
          : code === 'EPUB_UNSUPPORTED_AUDIO' ? tr('这段声音暂不支持电子册，请保留PDF并稍后再试。')
          : tr('这次未能制作电子册，请重试。原记录仍然保留。');
        setEpubState({ id: feedbackId, pending: false, message, diagnostic: error instanceof AlbumEpubFailure ? `${error.stage}/${code}` : code });
      } finally {
        if (createdId) {
          await discardUnfinishedEpubSnapshot(createdId);
          const editions = await listEpubSnapshots(id);
          if (valid()) setEpubEditions(editions);
        }
        if (!published && !valid() && active.current && routeAlbum.current === id) setEpubState({ id: feedbackId, pending: false, message: tr('本次制作已停止，请重新开始。') });
      }
    });
  }
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
  const failure = diagnostic ? albumPrintFailureKind(diagnostic.code) : 'other';
  const operationFeedback = (<>{error ? (
            <ShowcaseNote live>
              {diagnostic?.code === 'EPUB_TOO_LARGE' ? tr('电子册超过当前支持的2GB，请分成较小的册子。')
                : diagnostic?.code === 'EPUB_UNSUPPORTED_AUDIO' ? tr('这段声音暂不支持电子册，请保留PDF并稍后再试。')
                : formal
                ? failure === 'changed'
                  ? tr('内容有变化，请重新生成。')
                  : failure === 'missing'
                    ? tr('有记录、照片或声音现在读不到，请先在这一册里核对。')
                    : tr('这次未能生成PDF，请重试。原记录仍然保留。')
                : tr('这次没有制作完成，请稍后重试。')}
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
          ) : null}</>);
  const pdfActions = (!formal || format === 'pdf' || !owned ? <>{!formal ? <Text style={styles.meta}>{tr('开发验收入口，正式导出尚未开放。')}</Text> : null}
          <View style={styles.cta}>
            {formal && owned ? <ShowcaseNote>{tr('适合保存或打印，不含声音。')}</ShowcaseNote> : null}
            {binding ? (
              <BindingPanel
                progress={progress}
                onCancel={() => {
                  generation.current += 1;
                  setBinding(false);
                }}
              />
            ) : owned ? (
              <>
                {!formal && paidGate ? <ShowcaseUnlocked /> : null}
                <ShowcaseButton
                  testID="album-export-bind"
                  tone={formal ? 'editorial' : 'solid'}
                  label={busy ? tr('正在制作PDF，请稍候。') : tr(formal ? '生成PDF' : '生成并保存测试PDF')}
                  disabled={busy || !ready || !bindable}
                  onPress={bind}
                />

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
              <ShowcaseNote>{tr('正在确认购买状态…')}</ShowcaseNote>
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
                  ? tr('已解锁，可以开始导出了。')
                  : unlock.notice}
              </ShowcaseNote>
            ) : paidGate && unlock.notice && !unlock.loading ? (
              <ShowcaseNote live>{unlock.notice}</ShowcaseNote>
            ) : null}
            {accessNotice ? <ShowcaseNote live>{tr('请先解锁导出，或恢复已有购买。')}</ShowcaseNote> : null}
            {book && !bindable ? (
              <ShowcaseNote live>{tr('有内容暂时无法读取，请回到册子检查后重试。')}</ShowcaseNote>
            ) : null}
          </View>
          {!saved.length && !busy && !formal ? (
            <Text style={styles.meta}>{tr('尚未生成测试成品。')}</Text>
          ) : null}</> : null);
  const electronicActions = (formal && format === 'epub' ? <View style={{ gap: 10 }}>
            <View accessibilityRole="radiogroup" accessibilityLabel={tr('选择电子册样式')}>
              <ExportChoice label={tr('生活文集')} detail={tr('适合文字较多的记录。')} selected={epubDesign === 'literary'} disabled={busy} onPress={() => setEpubDesign('literary')} />
              <ExportChoice label={tr('影像小册')} detail={tr('适合照片较多的记录。')} selected={epubDesign === 'imagebook'} disabled={busy} onPress={() => setEpubDesign('imagebook')} />
            </View>
            <ShowcaseButton testID="album-export-create-epub" tone="editorial" label={tr('制作电子册')} disabled={busy || !owned || !ready} onPress={() => electronic()} />
            <ShowcaseNote>{tr('包含照片与声音，可在「图书」中阅读。')}</ShowcaseNote>
            {epubState?.id === 'new' && !!epubState.message ? <Text accessibilityLiveRegion="polite" style={styles.meta}>{epubState.message}</Text> : null}
            {epubState?.id === 'new' && epubState.pending ? <ShowcaseButton tone="quiet" label={tr('取消制作电子册')} onPress={() => { epubCancelled.current = true; }} /> : null}
            {__DEV__ && !formal && epubState?.id === 'new' && epubState.diagnostic ? <Text selectable style={styles.meta}>{`EPUB/${epubState.diagnostic}`}</Text> : null}
          </View> : null);
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
          ebookDesigns={formal}
          paperPreview={formal && format === 'pdf' && paperPreview}
          actions={<>
            {formal ? <View accessibilityRole="tablist" style={styles.formatRow}>
              {(['epub','pdf'] as const).map(value => <Pressable key={value} disabled={busy} accessibilityRole="tab" accessibilityLabel={tr(value === 'epub' ? '电子册' : 'PDF')} accessibilityState={{ selected: format === value, disabled: busy }} onPress={() => { setFormat(value); setPaperPreview(false); }} style={[styles.formatTab, format === value && styles.formatSelected]}><Text style={[styles.formatText, format !== value && { color: inkSoft }]}>{tr(value === 'epub' ? '电子册' : 'PDF')}</Text></Pressable>)}
            </View> : null}
            {electronicActions}{pdfActions}{operationFeedback}
            {formal && format === 'pdf' ? <ShowcaseButton tone="quiet" label={tr(paperPreview ? '收起纸页' : '看看纸页')} disabled={busy} onPress={() => setPaperPreview(value => !value)} /> : null}
            {formal && paidGate && owned ? <ShowcaseUnlocked /> : null}
          </>}
          style={style}
          onStyle={chooseStyle}
          width={readingWidth(metrics.width, metrics.height)}
          busy={binding}
          celebrate={celebrate}
        >
          {epubEditions.length && (!formal || format === 'epub') ? <View style={styles.shelfHead}><Text accessibilityRole="header" style={styles.sectionTitle}>{tr('已生成的电子册')}</Text><ShowcaseNote>{tr('点按分享，左滑可分享或删除。')}</ShowcaseNote></View> : null}
          {(!formal || format === 'epub' ? [...epubEditions].sort((a,b)=>Number(b.id===freshEpubId)-Number(a.id===freshEpubId)) : []).map(edition => <View key={edition.id}>
            <AlbumEditionSwipeRow id={edition.id} disabled={busy || blocked} onDelete={() => confirmDelete(edition.id)} onShare={()=>electronic(edition)}><View style={{ gap: 8 }}>
              {edition.id===freshEpubId?<Text testID="album-export-just-created" style={[styles.meta,{color:'#58746C'}]}>{tr('刚刚生成')}</Text>:null}
              <Text style={styles.title}>{edition.name}</Text>
              <Text style={styles.meta}>{albumEditionDateLabel(edition.createdAt)} · {tr(edition.design === 'imagebook' ? '影像小册' : edition.design === 'literary' ? '生活文集' : '电子册')}</Text>
            </View></AlbumEditionSwipeRow>
            {epubState?.id === edition.id && !!epubState.message ? <Text accessibilityLiveRegion="polite" style={styles.meta}>{epubState.message}</Text> : null}
            {epubState?.id === edition.id && epubState.pending ? <ShowcaseButton tone="quiet" label={tr('取消制作电子册')} onPress={() => { epubCancelled.current = true; }} /> : null}
            {__DEV__ && !formal && epubState?.id === edition.id && epubState.diagnostic ? <Text selectable style={styles.meta}>{`EPUB/${epubState.diagnostic}`}</Text> : null}
          </View>)}
          {saved.length && (!formal || format === 'pdf') ? <ShelfHeader /> : null}
          {fresh&&format==='pdf'?<Text accessibilityLiveRegion="polite" style={styles.meta}>{tr('PDF已生成。')}</Text>:null}
          {(!formal || format === 'pdf' ? saved : []).map((edition, index) => (
            <AlbumEditionSwipeRow key={edition.id} id={edition.id} disabled={busy || blocked} onDelete={() => confirmDelete(edition.id)}><View style={styles.edition}>
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
                    {tr('部分照片打印后可能不够清晰，请先检查。')}
                  </Text>
                ) : null}
                <ShowcaseButton
                  tone="editorial"
                  label={epubState?.id === edition.id && epubState.pending ? tr('正在制作电子册…') : tr('分享电子册')}
                  disabled={busy}
                  onPress={() => electronic(edition)}
                />
                {epubState?.id === edition.id && epubState.pending ? <ShowcaseButton tone="quiet" label={tr('取消制作电子册')} onPress={() => { epubCancelled.current = true; }} /> : null}
                {epubState?.id === edition.id ? <Text accessibilityLiveRegion="polite" style={styles.meta}>{epubState.message}</Text> : null}
                {__DEV__ && !formal && epubState?.id === edition.id && epubState.diagnostic ? <Text selectable testID="album-epub-diagnostic" style={styles.meta}>{`EPUB/${epubState.diagnostic}`}</Text> : null}
                <Text style={styles.meta}>{tr('可在「图书」中阅读，并播放其中的声音。')}</Text>
                <ShowcaseButton
                  tone="editorial"
                  label={tr('分享或打印PDF')}
                  disabled={busy}
                  onPress={() => share(edition)}
                />
              </View>
            </View></AlbumEditionSwipeRow>
          ))}
        </AlbumExportShowcase>
      ) : null}
    </SettingsPage>
  );
}
const styles = StyleSheet.create({
  cta: { gap: 10, paddingTop: 20 },
  sectionTitle: { ...type.action, fontSize: 18, lineHeight: 27, color: ink },
  formatRow: { flexDirection: 'row', gap: 30, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D7D0C4' },
  formatTab: { minHeight: 48, justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent', paddingHorizontal: 2 },
  formatSelected: { borderBottomColor: ink },
  formatText: { ...type.action, color: ink },
  shelfHead: { gap: 6, paddingTop: 22 },
  edition: { flexDirection: 'row', gap: 14, paddingVertical: 10, alignItems: 'flex-start' },
  editionText: { flex: 1, gap: 4, alignItems: 'flex-start' },
  title: { ...type.action, color: ink },
  meta: { ...type.meta, color: inkSoft },
});
