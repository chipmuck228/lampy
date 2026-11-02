import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type ScrollView } from 'react-native';
import { Asset } from 'expo-asset';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { appLanguage, tr } from '../i18n';
import type { AlbumLayout } from '../application/album-layout';
import type { AlbumLayoutInput, AlbumLayoutMediaMap, AlbumLayoutRecordInput } from '../application/album-layout-input';
import type { AlbumPrintProgress } from '../application/album-print';
import type { AlbumReadingStyle } from '../application/album-reading';
import { albumEditionFacts, albumFileSizeLabel } from '../application/album-export-showcase';
import { paginateAlbumLayout } from '../application/album-paginate';
import { createAlbumTextMeasurer } from '../application/album-text-measure';
import { firstSearchParam } from './lookback-origin';
import { inkSoft, readingWidth } from './life-page';
import { Text, type } from './life-text';
import { SettingsPage } from './settings-chrome';
import { usePageMetrics } from './use-page-metrics';
import {
  AlbumExportShowcase,
  BindingPanel,
  FreshEdition,
  ShowcaseButton,
  ShowcaseNote,
  ShowcaseUnlocked,
} from './album-export-showcase';

/**
 * Dev-only review of the export showcase with synthetic fixture moments
 * (spec/life-album-v2/sample). Nothing here reads the personal library,
 * purchases, or writes a file; pagination is the real Core Text paginator.
 */
const PHOTOS = {
  coffee: require('../../assets/first-run/coffee.jpg'),
  window: require('../../assets/first-run/window.jpg'),
  flowers: require('../../assets/first-run/flowers.jpg'),
};
type Photo = keyof typeof PHOTOS;
type FixtureRecord = { id: string; day: string; text?: string; photos?: Photo[]; seconds?: number; feeling?: string };

const ZH = {
  name: '窗边的一些日子',
  opening: '有几个下午，我想把它们放在一起。\n不是为了记住每一件事，只是想以后再读到这些声音、这些光。',
  records: [
    { id: 'm01', day: '2026-09-03', text: '咖啡放凉了一点，下午还长。', photos: ['coffee'], feeling: '平静' },
    { id: 'm02', day: '2026-09-03', text: '洗好了杯子，留一盏灯。' },
    {
      id: 'm03',
      day: '2026-09-12',
      text: [
        '下午坐在桌边，把灯拧到刚够看清纸面。窗外没有特别的事，风偶尔把叶子翻过去。我想把这一段留下来，不是因为有什么要宣布，只是日子这样走过，不写就散了。杯子里的水已经凉了。',
        '早上买回来的花还放在旧玻璃瓶里，水面到瓶子的一半。我们说起上次去河边的事，谁也没记住是哪一天。记得风很大，记得回来以后鞋子上有泥。',
        '午后的光慢慢走到杯子后面，桌子的一半亮着，另一半安静地暗下来。',
      ].join('\n\n'),
      photos: ['window', 'flowers'],
      seconds: 9,
      feeling: '说不清',
    },
    { id: 'm04', day: '2026-09-18', text: '花瓶没有换，花开得更松了。', photos: ['flowers'] },
    { id: 'm05', day: '2026-09-22', seconds: 9 },
    { id: 'm06', day: '2026-10-02', text: '把三个画面放在一起。顺序就是当时留下的顺序。', photos: ['coffee', 'window', 'flowers'], feeling: '高兴' },
    { id: 'm07', day: '2026-10-02', text: '出门前，把窗关上了。' },
    { id: 'm08', day: '2026-10-20', text: '今天没有更多要写的。窗边有光。', feeling: '平静' },
  ] as FixtureRecord[],
};
const EN = {
  name: 'Days by the window',
  opening: 'A few afternoons, gathered together.\nNot every detail. Just enough to hear and see these days again.',
  records: [
    { id: 'm01', day: '2026-09-03', text: 'The coffee cooled a little. There was still plenty of afternoon.', photos: ['coffee'], feeling: '平静' },
    { id: 'm02', day: '2026-09-03', text: 'Washed the cups. Left one light on.' },
    {
      id: 'm03',
      day: '2026-09-12',
      text: [
        'I sat at the table and turned the lamp down until there was just enough light to read. Nothing much was happening outside. Every so often the wind turned a leaf over.',
        'The flowers we brought home that morning were still in the old glass bottle, with the water halfway up. We talked about the last time we went to the river.',
        'The afternoon light moved slowly behind the cup: half of the table stayed bright while the other half grew quietly dim.',
      ].join('\n\n'),
      photos: ['window', 'flowers'],
      seconds: 9,
      feeling: '说不清',
    },
    { id: 'm04', day: '2026-09-18', text: 'The same vase. The flowers opened a little further.', photos: ['flowers'] },
    { id: 'm05', day: '2026-09-22', seconds: 9 },
    { id: 'm06', day: '2026-10-02', text: 'Three views, in the order I left them.', photos: ['coffee', 'window', 'flowers'], feeling: '高兴' },
    { id: 'm07', day: '2026-10-02', text: 'Closed the window before going out.' },
    { id: 'm08', day: '2026-10-20', text: 'Nothing more to write today.', feeling: '平静' },
  ] as FixtureRecord[],
};

async function demoLayout(): Promise<{ layout: AlbumLayout; media: AlbumLayoutMediaMap }> {
  const fixture = appLanguage === 'en' ? EN : ZH;
  const files: Record<Photo, { uri: string; width: number; height: number }> = {} as never;
  for (const key of Object.keys(PHOTOS) as Photo[]) {
    const asset = await Asset.fromModule(PHOTOS[key]).downloadAsync();
    files[key] = { uri: asset.localUri ?? asset.uri, width: asset.width ?? 1, height: asset.height ?? 1 };
  }
  const media: AlbumLayoutMediaMap = {};
  const entries: AlbumLayoutRecordInput[] = fixture.records.map((record) => {
    const at = `${record.day}T04:00:00.000Z`;
    const photos = (record.photos ?? []).map((photo, index) => {
      const assetId = `${record.id}_p${index}`;
      media[assetId] = files[photo].uri;
      return {
        assetId,
        role: 'image' as const,
        availability: 'available' as const,
        intrinsicRatio: files[photo].width / files[photo].height,
        widthPx: files[photo].width,
        heightPx: files[photo].height,
        durationMs: null,
        uri: files[photo].uri,
      };
    });
    const sound = record.seconds
      ? [{ assetId: `${record.id}_s`, role: 'audio' as const, availability: 'available' as const, intrinsicRatio: null, durationMs: record.seconds * 1000 }]
      : [];
    return {
      momentId: record.id,
      collectedAt: at,
      sourceRevisionAtCollect: 1,
      presence: 'ready',
      revision: 1,
      note: record.text ?? '',
      feeling: record.feeling ?? '',
      occurredAt: at,
      occurredAtPrecision: 'day',
      recordedAt: at,
      media: [...photos, ...sound],
    };
  });
  const input: AlbumLayoutInput = {
    album: {
      id: 'demo-export-showcase',
      schemaVersion: 1,
      name: fixture.name,
      opening: fixture.opening,
      cover: { kind: 'image', momentId: 'm01', assetId: 'm01_p0' },
      entries: entries.map((entry) => ({ momentId: entry.momentId, collectedAt: entry.collectedAt, sourceRevisionAtCollect: 1 })),
      createdAt: '2026-10-20T04:00:00.000Z',
      updatedAt: '2026-10-20T04:00:00.000Z',
    },
    entries,
  };
  const layout = await paginateAlbumLayout(input, createAlbumTextMeasurer(), {
    generatedAt: new Date().toISOString(),
    timezone: { timeZone: 'Asia/Shanghai' },
  });
  return { layout, media };
}

const STEPS: AlbumPrintProgress['step'][] = ['authorize', 'read', 'prepare', 'copy', 'layout', 'write', 'verify', 'bind'];

export default function AlbumExportDemoScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ pos?: string; state?: string; style?: string; scroll?: string }>();
  const scroll = useRef<ScrollView>(null);
  const scrollTo = Number(firstSearchParam(params.scroll));
  const hold = Number(firstSearchParam(params.pos));
  const initialState = firstSearchParam(params.state) ?? 'purchase';
  const metrics = usePageMetrics();
  const [book, setBook] = useState<{ layout: AlbumLayout; media: AlbumLayoutMediaMap } | null>(null);
  const [failed, setFailed] = useState(false);
  const [style, setStyle] = useState<AlbumReadingStyle>(firstSearchParam(params.style) === 'handmade' ? 'handmade' : 'plain');
  const [owned, setOwned] = useState(initialState !== 'purchase');
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState<AlbumPrintProgress | null>(null);
  const [binding, setBinding] = useState(false);
  const [bound, setBound] = useState(initialState === 'bound');
  const [celebrate, setCelebrate] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  function later(ms: number, work: () => void) {
    timers.current.push(setTimeout(work, ms));
  }
  function bind(layout: AlbumLayout) {
    const facts = albumEditionFacts(layout);
    setBound(false);
    setBinding(true);
    const media = facts.photoCount + facts.soundCount;
    const sequence = STEPS.flatMap((step): AlbumPrintProgress[] =>
      step === 'copy'
        ? Array.from({ length: media }, (_, done) => ({ step, done, total: media }))
        : [{ step, done: 0, total: 0 }],
    );
    sequence.forEach((update, index) => later(380 + index * 260, () => setProgress(update)));
    later(380 + sequence.length * 260 + 500, () => {
      setBinding(false);
      setProgress(null);
      setBound(true);
      setCelebrate((value) => value + 1);
    });
  }
  // Review links start each state once the synthetic book exists.
  const start = useRef({ scrollTo, binding: initialState === 'binding', later, bind });
  useEffect(() => {
    let alive = true;
    const timers_ = timers.current;
    demoLayout()
      .then((next) => {
        if (!alive) return;
        setBook(next);
        const { scrollTo: y, binding: startBinding, later: wait, bind: run } = start.current;
        if (Number.isFinite(y)) wait(300, () => scroll.current?.scrollTo({ y, animated: false }));
        if (startBinding) wait(0, () => run(next.layout));
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      timers_.forEach(clearTimeout);
    };
  }, []);
  const facts = book ? albumEditionFacts(book.layout) : null;

  return (
    <SettingsPage title="导出展示（开发演示）" backLabel={tr('返回')} accessibilityLabel="导出展示（开发演示）" scrollRef={scroll} onBack={() => router.back()}>
      <AlbumExportShowcase
        layout={book?.layout ?? null}
        media={book?.media ?? {}}
        failed={failed}
        style={style}
        onStyle={setStyle}
        width={readingWidth(metrics.width, metrics.height)}
        busy={binding}
        celebrate={celebrate}
        holdAt={Number.isFinite(hold) ? hold : undefined}
      >
        <View style={styles.cta}>
          {binding ? (
            <BindingPanel
              progress={progress}
              onCancel={() => {
                timers.current.forEach(clearTimeout);
                setBinding(false);
              }}
            />
          ) : bound && facts ? (
            <FreshEdition number={1} pages={facts.pageCount} size={albumFileSizeLabel(2_480_000)} disabled={false} onShare={() => undefined} />
          ) : owned ? (
            <>
              <ShowcaseUnlocked />
              <ShowcaseButton label={tr('装订成册')} onPress={() => book && bind(book.layout)} disabled={!book} />
              <ShowcaseNote>{tr('生成A5 PDF，保存在本机；之后可以存到「文件」或直接打印。')}</ShowcaseNote>
            </>
          ) : (
            <>
              <ShowcaseButton
                label={tr('解锁导出 · {0}', ['¥18'])}
                disabled={working}
                onPress={() => {
                  setWorking(true);
                  later(900, () => {
                    setWorking(false);
                    setOwned(true);
                  });
                }}
              />
              <ShowcaseNote>{tr('一次购买，之后每一册、每一次导出都不再收费。')}</ShowcaseNote>
              <ShowcaseNote>{tr('同时解锁最长30分钟的录音。')}</ShowcaseNote>
              <ShowcaseButton tone="quiet" label={tr('恢复购买')} onPress={() => undefined} />
            </>
          )}
          <ShowcaseNote>{tr('PDF不含声音，电子册文件将在后续阶段提供。')}</ShowcaseNote>
        </View>
        <Text style={styles.dev}>开发演示：合成记录，价格与装订均为模拟，不购买、不生成文件。</Text>
      </AlbumExportShowcase>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  cta: { gap: 10, paddingTop: 6 },
  dev: { ...type.meta, fontSize: 12, lineHeight: 17, color: inkSoft, textAlign: 'center', opacity: 0.7 },
});
