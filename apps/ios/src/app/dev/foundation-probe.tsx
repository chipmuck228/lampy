import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import {
  buildProbeExcerptRows,
  compareProbeQuotes,
  probeLogLine,
  type ProbeExcerptFlag,
  type ProbeExcerptRow,
} from '../../application/memoir-probe-compare';
import { MEMOIR_PROBE_FIXTURE } from '../../application/memoir-probe-fixture';
import { selectQuotesDeterministic } from '../../application/memoir-quote-select';
import {
  cancelFoundationProbe,
  inspectFoundationProbe,
  selectQuotesOnDevice,
  type FoundationInspect,
} from '../../infrastructure/foundation-probe';
import { firstSearchParam } from '../../screens/lookback-origin';
import { ink, inkSoft, paper, sage } from '../../screens/life-page';

type SideNote = { side: string; line: string };

function flagLabel(flag: ProbeExcerptFlag): string {
  if (flag === 'exact') return '原文';
  if (flag === 'rewritten') return '改写';
  return '遗漏';
}

function boolLabel(value: boolean | null | undefined): string {
  if (value === true) return 'yes';
  if (value === false) return 'no';
  return 'n/a';
}

export default function FoundationProbeScreen() {
  const params = useLocalSearchParams<{ run?: string | string[]; cancel?: string | string[] }>();
  const run = firstSearchParam(params.run);
  const cancel = firstSearchParam(params.cancel);
  const [inspect, setInspect] = useState<FoundationInspect | null>(null);
  const [lines, setLines] = useState<SideNote[]>([]);
  const [excerpts, setExcerpts] = useState<ProbeExcerptRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const runInspect = useCallback(async () => {
    setError(null);
    try {
      setInspect(await inspectFoundationProbe());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'inspect failed');
    }
  }, []);

  const runCompare = useCallback(async () => {
    setError(null);
    const startedA = Date.now();
    const quotesA = selectQuotesDeterministic(MEMOIR_PROBE_FIXTURE);
    const metricsA = compareProbeQuotes({
      moments: MEMOIR_PROBE_FIXTURE,
      quotes: quotesA,
      side: 'deterministic',
      status: 'ok',
      durationMs: Date.now() - startedA,
    });
    const next = [{ side: 'A', line: probeLogLine(metricsA) }];
    let quotesB: { id: string; text: string }[] = [];
    try {
      const model = await selectQuotesOnDevice(MEMOIR_PROBE_FIXTURE);
      quotesB = model.quotes;
      const metricsB = compareProbeQuotes({
        moments: MEMOIR_PROBE_FIXTURE,
        quotes: model.quotes,
        side: 'foundation',
        status: model.status,
        durationMs: model.durationMs,
      });
      next.push({ side: 'B', line: probeLogLine(metricsB) });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'select failed');
    }
    setLines(next);
    setExcerpts(
      buildProbeExcerptRows({
        moments: MEMOIR_PROBE_FIXTURE,
        deterministicQuotes: quotesA,
        foundationQuotes: quotesB,
      }),
    );
  }, []);

  useEffect(() => {
    if (typeof __DEV__ === 'undefined' || !__DEV__) return;
    if (run === '1') {
      void runInspect().then(() => runCompare());
      return;
    }
    if (cancel === '1') {
      void (async () => {
        await runInspect();
        const pending = selectQuotesOnDevice(MEMOIR_PROBE_FIXTURE, { timeoutMs: 20_000 });
        setTimeout(() => cancelFoundationProbe(), 80);
        const model = await pending;
        setLines([
          {
            side: 'B',
            line: probeLogLine(
              compareProbeQuotes({
                moments: MEMOIR_PROBE_FIXTURE,
                quotes: model.quotes,
                side: 'foundation',
                status: model.status,
                durationMs: model.durationMs,
              }),
            ),
          },
        ]);
        setExcerpts(
          buildProbeExcerptRows({
            moments: MEMOIR_PROBE_FIXTURE,
            foundationQuotes: model.quotes,
          }),
        );
      })();
    }
  }, [run, cancel, runInspect, runCompare]);

  if (typeof __DEV__ === 'undefined' || !__DEV__) {
    return (
      <View style={{ flex: 1, backgroundColor: paper, padding: 24 }}>
        <Text style={{ color: ink }}>这个探针只在开发构建里可用。</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: paper }} contentContainerStyle={{ padding: 24, gap: 16 }}>
      <Text style={{ color: ink, fontSize: 28 }}>端侧模型探针</Text>
      <Text style={{ color: inkSoft, fontSize: 16 }}>
        只用代码内合成中文。不读个人库，不接回眸页，不转云端。摘录只显示在本页，不写进日志。
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel="查看可用性" onPress={() => void runInspect()}>
        <Text style={{ color: sage, fontSize: 17, minHeight: 44 }}>查看可用性</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="对照原文选取" onPress={() => void runCompare()}>
        <Text style={{ color: sage, fontSize: 17, minHeight: 44 }}>对照原文选取</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="取消生成" onPress={() => cancelFoundationProbe()}>
        <Text style={{ color: sage, fontSize: 17, minHeight: 44 }}>取消生成</Text>
      </Pressable>
      {inspect ? (
        <View style={{ gap: 6 }}>
          <Text style={{ color: ink, fontSize: 16 }}>
            {inspect.availability}
            {inspect.unavailableReason ? ` · ${inspect.unavailableReason}` : ''}
            {inspect.localeIdentifier ? ` · ${inspect.localeIdentifier}` : ''}
            {inspect.osVersion ? ` · iOS ${inspect.osVersion}` : ''}
            {inspect.deviceModel ? ` · ${inspect.deviceModel}` : ''}
          </Text>
          <Text style={{ color: ink, fontSize: 15 }}>
            supportsLocale current={boolLabel(inspect.supportsLocaleCurrent)} zh-Hans=
            {boolLabel(inspect.supportsLocaleZhHans)} zh-CN={boolLabel(inspect.supportsLocaleZhCN)} zh-Hant=
            {boolLabel(inspect.supportsLocaleZhHant)}
          </Text>
          <Text style={{ color: ink, fontSize: 15 }}>
            supportedLanguagesIncludesChinese={boolLabel(inspect.supportedLanguagesIncludesChinese)}
            {inspect.supportedLanguages.length > 0 ? ` · ${inspect.supportedLanguages.join(', ')}` : ''}
          </Text>
          <Text style={{ color: ink, fontSize: 15 }}>
            contextSize={inspect.contextCapacityTokens ?? 'n/a'}
            {inspect.tokenCountForProbePrompt != null
              ? ` · tokenCount(probe)=${inspect.tokenCountForProbePrompt}`
              : ''}
          </Text>
          {inspect.contextCapacityNote ? (
            <Text style={{ color: inkSoft, fontSize: 13 }}>{inspect.contextCapacityNote}</Text>
          ) : null}
          {inspect.tokenCountNote ? (
            <Text style={{ color: inkSoft, fontSize: 13 }}>{inspect.tokenCountNote}</Text>
          ) : null}
          {inspect.compileSdkVersion || inspect.compileXcodeVersion ? (
            <Text style={{ color: inkSoft, fontSize: 13 }}>
              compile SDK iPhoneOS{inspect.compileSdkVersion ?? '?'} · Xcode {inspect.compileXcodeVersion ?? '?'}
            </Text>
          ) : null}
        </View>
      ) : null}
      {lines.map((row) => (
        <Text key={row.side} style={{ color: ink, fontSize: 15 }}>
          {row.line}
        </Text>
      ))}
      {excerpts.length > 0 ? (
        <View style={{ gap: 14 }}>
          <Text style={{ color: ink, fontSize: 18 }}>合成夹具对照（仅本页）</Text>
          {excerpts.map((row) => (
            <View key={row.id} style={{ gap: 4 }}>
              <Text style={{ color: inkSoft, fontSize: 13 }}>{row.id}</Text>
              <Text style={{ color: ink, fontSize: 15 }}>原文 {row.original}</Text>
              <Text style={{ color: ink, fontSize: 15 }}>
                A {row.deterministicText ?? '—'} · {flagLabel(row.deterministicFlag)}
              </Text>
              <Text style={{ color: ink, fontSize: 15 }}>
                B {row.foundationText ?? '—'} · {flagLabel(row.foundationFlag)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {error ? <Text style={{ color: ink, fontSize: 16 }}>{error}</Text> : null}
    </ScrollView>
  );
}
