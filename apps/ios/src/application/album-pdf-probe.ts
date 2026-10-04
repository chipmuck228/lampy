import type { AlbumLayout } from './album-layout';
import { albumLayoutNativeAvailable, writeAlbumProbePdf, type AlbumPdfProbeResult } from '../../modules/lampy-album-layout';
import type { AlbumLayoutMediaMap } from './album-layout-input';

export type AlbumPdfProbeLayoutMatch = {
  pageCount: boolean;
  boxes: boolean;
};

export type AlbumPdfProbeVerdict = 'PASS' | 'NOT VERIFIED';

export function compareAlbumPdfProbe(
  layout: AlbumLayout,
  probe: { pageCount: number; fontsEmbedded?: boolean },
): AlbumPdfProbeLayoutMatch {
  return {
    pageCount: probe.pageCount === layout.pages.length,
    boxes: false,
  };
}

export function albumPdfProbeVerdict(
  probe: { fontsEmbedded?: boolean } | null,
  match: AlbumPdfProbeLayoutMatch | null,
): AlbumPdfProbeVerdict {
  if (!probe || !match) return 'NOT VERIFIED';
  if (!probe.fontsEmbedded) return 'NOT VERIFIED';
  if (!match.pageCount || !match.boxes) return 'NOT VERIFIED';
  return 'PASS';
}

export async function runIsolatedAlbumPdfProbe(input: {
  layout: AlbumLayout;
  media: AlbumLayoutMediaMap;
  destPath: string;
}): Promise<{ probe: AlbumPdfProbeResult | null; match: AlbumPdfProbeLayoutMatch | null; verdict: AlbumPdfProbeVerdict; reason: string }> {
  if (!albumLayoutNativeAvailable()) {
    return { probe: null, match: null, verdict: 'NOT VERIFIED', reason: 'native-module-missing' };
  }
  const probe = await writeAlbumProbePdf(JSON.stringify(input.layout), JSON.stringify(input.media), input.destPath);
  const match = compareAlbumPdfProbe(input.layout, probe);
  return {
    probe,
    match,
    verdict: albumPdfProbeVerdict(probe, match),
    reason: probe.fontsEmbedded ? 'json-page-count-only' : 'system-fonts-not-embedded',
  };
}
