import type { AlbumLayout } from './album-layout';
import {
  albumLayoutNativeAvailable,
  writeAlbumProbePdf,
  type AlbumPdfProbeResult,
} from '../../modules/lampy-album-layout';
import type { AlbumLayoutMediaMap } from './album-layout-input';

export type AlbumPdfProbeLayoutMatch = {
  pageCount: boolean;
  boxes: boolean;
};

export type AlbumPdfProbeVerdict = 'PASS' | 'NOT VERIFIED';

export function compareAlbumPdfProbe(
  layout: AlbumLayout,
  probe: { pageCount: number; fontsEmbedded?: boolean | null },
): AlbumPdfProbeLayoutMatch {
  return {
    pageCount: probe.pageCount === layout.pages.length,
    // Box-level compare is still manual / visual for phase C; do not invent PASS.
    boxes: false,
  };
}

export function albumPdfProbeVerdict(
  probe: { fontsEmbedded?: boolean | null } | null,
  match: AlbumPdfProbeLayoutMatch | null,
): AlbumPdfProbeVerdict {
  if (!probe || !match) return 'NOT VERIFIED';
  // Only a concrete true plus full layout match may become PASS. null/false stay unverified.
  if (probe.fontsEmbedded !== true) return 'NOT VERIFIED';
  if (!match.pageCount || !match.boxes) return 'NOT VERIFIED';
  return 'PASS';
}

export function albumPdfProbeReason(probe: AlbumPdfProbeResult | null): string {
  if (!probe) return 'native-module-missing';
  if (probe.preliminaryFontFileScan && probe.fontsEmbedded == null) {
    return 'preliminary-fontfile-scan-only-per-font-embed-unknown';
  }
  if (probe.fontsEmbedded === true) return 'all-listed-font-resources-have-embed-stream';
  if (probe.fontsEmbedded === false) return 'listed-font-resources-missing-embed-stream';
  return 'font-embed-unknown';
}

export async function runIsolatedAlbumPdfProbe(input: {
  layout: AlbumLayout;
  media: AlbumLayoutMediaMap;
  destPath: string;
}): Promise<{
  probe: AlbumPdfProbeResult | null;
  match: AlbumPdfProbeLayoutMatch | null;
  verdict: AlbumPdfProbeVerdict;
  reason: string;
}> {
  if (!albumLayoutNativeAvailable()) {
    return { probe: null, match: null, verdict: 'NOT VERIFIED', reason: 'native-module-missing' };
  }
  const probe = await writeAlbumProbePdf(JSON.stringify(input.layout), JSON.stringify(input.media), input.destPath);
  const match = compareAlbumPdfProbe(input.layout, probe);
  return {
    probe,
    match,
    verdict: albumPdfProbeVerdict(probe, match),
    reason: albumPdfProbeReason(probe),
  };
}
