import { useEffect, useState } from 'react';
import { AppState, Dimensions, PixelRatio } from 'react-native';

export type PageMetrics = {
  width: number;
  height: number;
  fontScale: number;
  windowFontScale: number;
  pixelFontScale: number;
};

export type FontScaleReading = {
  fontScale: number;
  windowScale: number;
  pixelScale: number;
};

export const RESUME_REREAD_MS = [80, 400] as const;

function normalizeScale(scale: number | undefined): number {
  return scale && scale > 0 ? scale : 0;
}

function asReading(
  previous?: FontScaleReading | PageMetrics | number,
): FontScaleReading | undefined {
  if (previous == null) return undefined;
  if (typeof previous === 'number') {
    return previous > 0
      ? { fontScale: previous, windowScale: previous, pixelScale: previous }
      : undefined;
  }
  if ('windowScale' in previous) {
    return previous;
  }
  return {
    fontScale: previous.fontScale,
    windowScale: previous.windowFontScale,
    pixelScale: previous.pixelFontScale,
  };
}

/**
 * Window and PixelRatio can disagree after iOS Settings.
 * - Both agree: use that value (sources converged).
 * - One source still matches the confirmed scale and the other moved: adopt the new one.
 * - Sources still disagree: keep the confirmed scale. Do not treat a stale
 *   window value as a new change just because it differs from the confirmed scale.
 */
export function resolveFontScale(
  windowScale: number | undefined,
  pixelScale: number | undefined,
  previous?: FontScaleReading | PageMetrics | number,
): FontScaleReading {
  const window = normalizeScale(windowScale);
  const pixel = normalizeScale(pixelScale);
  const prior = asReading(previous);

  if (window && pixel && window === pixel) {
    return { fontScale: window, windowScale: window, pixelScale: pixel };
  }

  if (!prior) {
    const fontScale = window || pixel || 1;
    return { fontScale, windowScale: window, pixelScale: pixel };
  }

  const windowMoved = window > 0 && window !== prior.windowScale;
  const pixelMoved = pixel > 0 && pixel !== prior.pixelScale;

  if (pixelMoved && pixel !== prior.fontScale && (!window || window === prior.fontScale || !windowMoved)) {
    return { fontScale: pixel, windowScale: window, pixelScale: pixel };
  }
  if (windowMoved && window !== prior.fontScale && (!pixel || pixel === prior.fontScale || !pixelMoved)) {
    return { fontScale: window, windowScale: window, pixelScale: pixel };
  }

  return { fontScale: prior.fontScale, windowScale: window, pixelScale: pixel };
}

export function pickFontScale(
  windowScale: number | undefined,
  pixelScale: number | undefined,
  previous?: FontScaleReading | PageMetrics | number,
): number {
  return resolveFontScale(windowScale, pixelScale, previous).fontScale;
}

export function readPageMetrics(previous?: PageMetrics): PageMetrics {
  const window = Dimensions.get('window');
  const windowFontScale = normalizeScale(window.fontScale);
  const pixelFontScale = normalizeScale(PixelRatio.getFontScale());
  const reading = resolveFontScale(windowFontScale, pixelFontScale, previous);
  return {
    width: window.width,
    height: window.height,
    fontScale: reading.fontScale,
    windowFontScale: reading.windowScale,
    pixelFontScale: reading.pixelScale,
  };
}

function sameMetrics(left: PageMetrics, right: PageMetrics): boolean {
  return (
    left.width === right.width &&
    left.height === right.height &&
    left.fontScale === right.fontScale &&
    left.windowFontScale === right.windowFontScale &&
    left.pixelFontScale === right.pixelFontScale
  );
}

export function usePageMetrics(): PageMetrics {
  const [metrics, setMetrics] = useState(readPageMetrics);

  useEffect(() => {
    let alive = true;
    const apply = () => {
      if (!alive) return;
      setMetrics((current) => {
        const next = readPageMetrics(current);
        return sameMetrics(current, next) ? current : next;
      });
    };
    let resumeTimers: ReturnType<typeof setTimeout>[] = [];
    const refreshAfterResume = () => {
      apply();
      resumeTimers.forEach(clearTimeout);
      resumeTimers = RESUME_REREAD_MS.map((ms) => setTimeout(apply, ms));
    };
    const dim = Dimensions.addEventListener('change', apply);
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshAfterResume();
    });
    apply();
    return () => {
      alive = false;
      dim.remove();
      app.remove();
      resumeTimers.forEach(clearTimeout);
    };
  }, []);

  return metrics;
}
