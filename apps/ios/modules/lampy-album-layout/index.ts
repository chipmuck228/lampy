export type AlbumMeasuredLine = {
  start: number;
  end: number;
  widthPt: number;
  heightPt: number;
  ascentPt: number;
};

export type AlbumPdfProbeResult = {
  path: string;
  pageCount: number;
  bytes: number;
  fontsEmbedded: boolean;
  fontNames: string[];
};

type NativeModule = {
  measureText?(
    text: string,
    fontName: string,
    sizePt: number,
    lineHeightPt: number,
    widthPt: number,
  ): AlbumMeasuredLine[];
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
