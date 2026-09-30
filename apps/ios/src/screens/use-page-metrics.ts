import { useEffect, useState } from 'react';
import { AppState, Dimensions, PixelRatio } from 'react-native';

export type PageMetrics = {
  width: number;
  height: number;
  fontScale: number;
};

const RESUME_REREAD_MS = [80, 400];

export function readPageMetrics(): PageMetrics {
  const window = Dimensions.get('window');
  const fontScale = window.fontScale || PixelRatio.getFontScale() || 1;
  return {
    width: window.width,
    height: window.height,
    fontScale,
  };
}

function sameMetrics(left: PageMetrics, right: PageMetrics): boolean {
  return left.width === right.width && left.height === right.height && left.fontScale === right.fontScale;
}

export function usePageMetrics(): PageMetrics {
  const [metrics, setMetrics] = useState(readPageMetrics);

  useEffect(() => {
    let alive = true;
    const apply = () => {
      if (!alive) return;
      const next = readPageMetrics();
      setMetrics((current) => (sameMetrics(current, next) ? current : next));
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
