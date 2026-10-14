export type AlbumMeasuredLine = {
  start: number;
  end: number;
  widthPt: number;
  heightPt: number;
  ascentPt: number;
};

export type AlbumResolvedFontFace = {
  requested: string;
  familyName: string;
  fontName: string;
  matchedRequestedFamily: boolean;
  usedSystemFallback: boolean;
};

export type AlbumFontDiagnosis = {
  serif: AlbumResolvedFontFace;
  ui: AlbumResolvedFontFace;
  cover: AlbumResolvedFontFace;
  availableRelatedFamilies: string[];
  serifCoreTextRunFonts: { familyName: string; postScriptName: string }[];
  probeSample: string;
};

export type AlbumPdfFontResource = {
  baseFont: string;
  subtype: string;
  embedStream: 'FontFile' | 'FontFile2' | 'FontFile3' | 'none' | 'unknown' | string;
};

export type AlbumPdfProbeResult = {
  path: string;
  pageCount: number;
  bytes: number;
  /** true only when every listed font resource has a concrete embed stream; null = unknown / not claimed */
  fontsEmbedded: boolean | null;
  fontNames: string[];
  fontResources?: AlbumPdfFontResource[];
  preliminaryFontFileScan?: boolean;
  resolvedDrawFonts?: {
    serif: AlbumResolvedFontFace;
    ui: AlbumResolvedFontFace;
  };
};

type NativeModule = {
  measureText?(
    text: string,
    fontName: string,
    sizePt: number,
    lineHeightPt: number,
    widthPt: number,
  ): AlbumMeasuredLine[];
  diagnoseFonts?(serif: string, ui: string): AlbumFontDiagnosis;
  writeProbePdf?(layoutJson: string, mediaJson: string, destPath: string): Promise<AlbumPdfProbeResult>;
};

function loadNative(): NativeModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const core = require('expo-modules-core') as {
      requireOptionalNativeModule?: (name: string) => NativeModule | null;
    };
    return core.requireOptionalNativeModule?.('LampyAlbumLayout') ?? null;
  } catch {
    return null;
  }
}

export function albumLayoutNativeAvailable(): boolean {
  const native = loadNative();
  return typeof native?.measureText === 'function';
}

export function requireAlbumNativePageView(): unknown {
  if (typeof process !== 'undefined' && process.env.JEST_WORKER_ID) {
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const core = require('expo-modules-core') as {
      requireNativeViewManager?: (moduleName: string, viewName?: string) => unknown;
    };
    return (
      core.requireNativeViewManager?.('LampyAlbumLayout', 'AlbumPageView') ??
      core.requireNativeViewManager?.('LampyAlbumLayout') ??
      null
    );
  } catch {
    return null;
  }
}

export function albumNativePageViewAvailable(): boolean {
  return !!requireAlbumNativePageView();
}

export function measureTextNative(
  text: string,
  fontName: string,
  sizePt: number,
  lineHeightPt: number,
  widthPt: number,
): AlbumMeasuredLine[] {
  const native = loadNative();
  if (!native?.measureText) {
    throw new Error('LampyAlbumLayout native module is missing');
  }
  return native.measureText(text, fontName, sizePt, lineHeightPt, widthPt).map((line) => ({
    start: line.start,
    end: line.end,
    widthPt: line.widthPt,
    heightPt: line.heightPt || lineHeightPt,
    ascentPt: line.ascentPt ?? sizePt * 0.8,
  }));
}

export function diagnoseAlbumFonts(serif = 'Songti SC', ui = 'PingFang SC'): AlbumFontDiagnosis | null {
  const native = loadNative();
  if (!native?.diagnoseFonts) return null;
  return native.diagnoseFonts(serif, ui);
}

export async function writeAlbumProbePdf(
  layoutJson: string,
  mediaJson: string,
  destPath: string,
): Promise<AlbumPdfProbeResult> {
  const native = loadNative();
  if (!native?.writeProbePdf) {
    throw new Error('LampyAlbumLayout native module is missing');
  }
  return native.writeProbePdf(layoutJson, mediaJson, destPath);
}

export type AlbumPrintNativeResult = {
  pageCount: number; bytes: number; widthPt: number; heightPt: number;
  fontsEmbedded: boolean | null; fontResources: AlbumPdfFontResource[];
  textSelectable: boolean; fontRunNames: string[]; sha256: string;
};
type PrintNativeModule = {
  copyPrintMedia(source: string, destination: string): Promise<{ sha256: string; bytes: number }>;
  printFileDigest(path: string): Promise<{ sha256: string; bytes: number }>;
  writePrintPdf(layout: string, media: string, destination: string): Promise<AlbumPrintNativeResult>;
  sharePrintPdf(path: string): Promise<boolean>;
};
export function albumPrintNative(): PrintNativeModule {
  const module = loadNative() as unknown as PrintNativeModule | null;
  if (!module || typeof module.writePrintPdf !== 'function' || typeof module.copyPrintMedia !== 'function' || typeof module.printFileDigest !== 'function' || typeof module.sharePrintPdf !== 'function') throw new Error('PRINT_NATIVE_REBUILD_REQUIRED');
  return module;
}
