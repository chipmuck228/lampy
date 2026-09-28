/* eslint-disable @typescript-eslint/no-require-imports */
import { whitelistProbeMoments } from '../application/memoir-quote-select';
import type { ProbeMomentInput } from '../application/memoir-probe-fixture';

export type FoundationInspect = {
  linked: boolean;
  availability: 'available' | 'unavailable';
  unavailableReason: string | null;
  osName?: string;
  osVersion?: string;
  localeIdentifier?: string;
  preferredLanguages?: string[];
  contextCapacityTokens: number | null;
  contextCapacityNote?: string;
};

export type FoundationSelectResult = {
  status: 'ok' | 'unavailable' | 'cancelled' | 'failed' | 'devOnly';
  unavailableReason?: string;
  durationMs: number;
  promptCharsUsed?: number;
  quotes: { id: string; text: string }[];
};

type NativeProbe = {
  inspect: () => Promise<Record<string, unknown>>;
  selectQuotes: (payload: { moments: ProbeMomentInput[] }) => Promise<Record<string, unknown>>;
  cancel: () => void;
};

function loadNative(): NativeProbe | null {
  try {
    const core = require('expo-modules-core') as {
      requireOptionalNativeModule?: (name: string) => NativeProbe | null;
    };
    return core.requireOptionalNativeModule?.('LampyFoundationProbe') ?? null;
  } catch {
    return null;
  }
}

function assertDev(): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) return;
  throw new Error('foundation probe is dev-only');
}

export function foundationProbeLinked(): boolean {
  return loadNative() != null;
}

export async function inspectFoundationProbe(): Promise<FoundationInspect> {
  assertDev();
  const native = loadNative();
  if (!native) {
    return {
      linked: false,
      availability: 'unavailable',
      unavailableReason: 'nativeModuleNotLoaded',
      contextCapacityTokens: null,
      contextCapacityNote: 'Rebuild the Development Client after adding the local module',
    };
  }
  const raw = await native.inspect();
  return {
    linked: raw.linked === true,
    availability: raw.availability === 'available' ? 'available' : 'unavailable',
    unavailableReason: typeof raw.unavailableReason === 'string' ? raw.unavailableReason : null,
    osName: typeof raw.osName === 'string' ? raw.osName : undefined,
    osVersion: typeof raw.osVersion === 'string' ? raw.osVersion : undefined,
    localeIdentifier: typeof raw.localeIdentifier === 'string' ? raw.localeIdentifier : undefined,
    preferredLanguages: Array.isArray(raw.preferredLanguages)
      ? raw.preferredLanguages.filter((item): item is string => typeof item === 'string')
      : undefined,
    contextCapacityTokens: typeof raw.contextCapacityTokens === 'number' ? raw.contextCapacityTokens : null,
    contextCapacityNote: typeof raw.contextCapacityNote === 'string' ? raw.contextCapacityNote : undefined,
  };
}

export async function selectQuotesOnDevice(
  rawMoments: unknown,
  options?: { timeoutMs?: number },
): Promise<FoundationSelectResult> {
  assertDev();
  const native = loadNative();
  if (!native) {
    return { status: 'unavailable', unavailableReason: 'nativeModuleNotLoaded', durationMs: 0, quotes: [] };
  }
  const moments = whitelistProbeMoments(rawMoments);
  const timeoutMs = options?.timeoutMs ?? 20_000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const raced = await Promise.race([
      native.selectQuotes({ moments }),
      new Promise<Record<string, unknown>>((resolve) => {
        timer = setTimeout(() => {
          native.cancel();
          resolve({ status: 'cancelled', unavailableReason: 'timeout', durationMs: timeoutMs, quotes: [] });
        }, timeoutMs);
      }),
    ]);
    const quotesRaw = Array.isArray(raced.quotes) ? raced.quotes : [];
    const quotes = quotesRaw.flatMap((row) => {
      if (!row || typeof row !== 'object') return [];
      const record = row as { id?: unknown; text?: unknown };
      if (typeof record.id !== 'string' || typeof record.text !== 'string') return [];
      return [{ id: record.id, text: record.text }];
    });
    const status =
      raced.status === 'ok' || raced.status === 'cancelled' || raced.status === 'failed' || raced.status === 'unavailable'
        ? raced.status
        : 'failed';
    return {
      status,
      unavailableReason: typeof raced.unavailableReason === 'string' ? raced.unavailableReason : undefined,
      durationMs: typeof raced.durationMs === 'number' ? raced.durationMs : 0,
      promptCharsUsed: typeof raced.promptCharsUsed === 'number' ? raced.promptCharsUsed : undefined,
      quotes,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function cancelFoundationProbe(): void {
  if (typeof __DEV__ !== 'undefined' && !__DEV__) return;
  loadNative()?.cancel();
}
