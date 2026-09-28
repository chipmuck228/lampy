/* eslint-disable @typescript-eslint/no-require-imports */
import { whitelistProbeMoments } from '../application/memoir-quote-select';
import type { ProbeMomentInput } from '../application/memoir-probe-fixture';

export type FoundationInspect = {
  linked: boolean;
  availability: 'available' | 'unavailable';
  unavailableReason: string | null;
  osName?: string;
  osVersion?: string;
  osMajor?: number;
  deviceModel?: string;
  localeIdentifier?: string;
  preferredLanguages?: string[];
  supportsLocaleCurrent: boolean | null;
  supportsLocaleZhHans: boolean | null;
  supportsLocaleZhCN: boolean | null;
  supportsLocaleZhHant: boolean | null;
  supportedLanguages: string[];
  supportedLanguagesIncludesChinese: boolean | null;
  contextCapacityTokens: number | null;
  contextCapacityNote?: string;
  tokenCountForProbePrompt: number | null;
  tokenCountNote?: string;
  compileSdkVersion?: string;
  compileXcodeVersion?: string;
};

export type FoundationSelectResult = {
  status: 'ok' | 'unavailable' | 'cancelled' | 'failed' | 'devOnly' | 'busy';
  unavailableReason?: string;
  durationMs: number;
  promptCharsUsed?: number;
  quotes: { id: string; text: string }[];
};

type NativeProbe = {
  inspect: () => Promise<Record<string, unknown>>;
  selectQuotes: (payload: {
    moments: ProbeMomentInput[];
    requestId: string;
  }) => Promise<Record<string, unknown>>;
  cancel: (requestId: string) => void;
};

let inFlightRequestId: string | null = null;

export function beginFoundationSelectRequest(): { ok: true; requestId: string } | { ok: false } {
  if (inFlightRequestId) return { ok: false };
  const requestId = `probe-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  inFlightRequestId = requestId;
  return { ok: true, requestId };
}

export function finishFoundationSelectRequest(requestId: string): void {
  if (inFlightRequestId === requestId) inFlightRequestId = null;
}

export function currentFoundationSelectRequestId(): string | null {
  return inFlightRequestId;
}

export function shouldCancelFoundationRequest(requestId: string): boolean {
  return inFlightRequestId === requestId;
}

export function resetFoundationSelectRequestForTests(): void {
  inFlightRequestId = null;
}

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

function optionalBool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
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
      supportsLocaleCurrent: null,
      supportsLocaleZhHans: null,
      supportsLocaleZhCN: null,
      supportsLocaleZhHant: null,
      supportedLanguages: [],
      supportedLanguagesIncludesChinese: null,
      contextCapacityTokens: null,
      contextCapacityNote: 'Rebuild the Development Client after adding the local module',
      tokenCountForProbePrompt: null,
    };
  }
  const raw = await native.inspect();
  return {
    linked: raw.linked === true,
    availability: raw.availability === 'available' ? 'available' : 'unavailable',
    unavailableReason: typeof raw.unavailableReason === 'string' ? raw.unavailableReason : null,
    osName: typeof raw.osName === 'string' ? raw.osName : undefined,
    osVersion: typeof raw.osVersion === 'string' ? raw.osVersion : undefined,
    osMajor: optionalNumber(raw.osMajor),
    deviceModel: typeof raw.deviceModel === 'string' ? raw.deviceModel : undefined,
    localeIdentifier: typeof raw.localeIdentifier === 'string' ? raw.localeIdentifier : undefined,
    preferredLanguages: Array.isArray(raw.preferredLanguages)
      ? raw.preferredLanguages.filter((item): item is string => typeof item === 'string')
      : undefined,
    supportsLocaleCurrent: optionalBool(raw.supportsLocaleCurrent),
    supportsLocaleZhHans: optionalBool(raw.supportsLocaleZhHans),
    supportsLocaleZhCN: optionalBool(raw.supportsLocaleZhCN),
    supportsLocaleZhHant: optionalBool(raw.supportsLocaleZhHant),
    supportedLanguages: Array.isArray(raw.supportedLanguages)
      ? raw.supportedLanguages.filter((item): item is string => typeof item === 'string')
      : [],
    supportedLanguagesIncludesChinese: optionalBool(raw.supportedLanguagesIncludesChinese),
    contextCapacityTokens: typeof raw.contextCapacityTokens === 'number' ? raw.contextCapacityTokens : null,
    contextCapacityNote: typeof raw.contextCapacityNote === 'string' ? raw.contextCapacityNote : undefined,
    tokenCountForProbePrompt: typeof raw.tokenCountForProbePrompt === 'number' ? raw.tokenCountForProbePrompt : null,
    tokenCountNote: typeof raw.tokenCountNote === 'string' ? raw.tokenCountNote : undefined,
    compileSdkVersion: typeof raw.compileSdkVersion === 'string' ? raw.compileSdkVersion : undefined,
    compileXcodeVersion: typeof raw.compileXcodeVersion === 'string' ? raw.compileXcodeVersion : undefined,
  };
}

function parseSelectResult(raced: Record<string, unknown>): FoundationSelectResult {
  const quotesRaw = Array.isArray(raced.quotes) ? raced.quotes : [];
  const quotes = quotesRaw.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const record = row as { id?: unknown; text?: unknown };
    if (typeof record.id !== 'string' || typeof record.text !== 'string') return [];
    return [{ id: record.id, text: record.text }];
  });
  const status =
    raced.status === 'ok' ||
    raced.status === 'cancelled' ||
    raced.status === 'failed' ||
    raced.status === 'unavailable' ||
    raced.status === 'busy'
      ? raced.status
      : 'failed';
  return {
    status,
    unavailableReason: typeof raced.unavailableReason === 'string' ? raced.unavailableReason : undefined,
    durationMs: typeof raced.durationMs === 'number' ? raced.durationMs : 0,
    promptCharsUsed: typeof raced.promptCharsUsed === 'number' ? raced.promptCharsUsed : undefined,
    quotes,
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
  const slot = beginFoundationSelectRequest();
  if (!slot.ok) {
    return { status: 'busy', unavailableReason: 'inFlight', durationMs: 0, quotes: [] };
  }
  const moments = whitelistProbeMoments(rawMoments);
  const timeoutMs = options?.timeoutMs ?? 20_000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const raced = await Promise.race([
      native.selectQuotes({ moments, requestId: slot.requestId }),
      new Promise<Record<string, unknown>>((resolve) => {
        timer = setTimeout(() => {
          if (!shouldCancelFoundationRequest(slot.requestId)) return;
          native.cancel(slot.requestId);
          resolve({ status: 'cancelled', unavailableReason: 'timeout', durationMs: timeoutMs, quotes: [] });
        }, timeoutMs);
      }),
    ]);
    return parseSelectResult(raced);
  } finally {
    if (timer) clearTimeout(timer);
    finishFoundationSelectRequest(slot.requestId);
  }
}

export function cancelFoundationProbe(): void {
  if (typeof __DEV__ !== 'undefined' && !__DEV__) return;
  const requestId = currentFoundationSelectRequestId();
  if (!requestId) return;
  loadNative()?.cancel(requestId);
}
