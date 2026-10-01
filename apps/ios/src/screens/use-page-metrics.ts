import { useEffect, useState } from 'react';
import { AppState, Dimensions } from 'react-native';

export type PageMetrics = {
  width: number;
  height: number;
};

export function readPageMetrics(): PageMetrics {
  const window = Dimensions.get('window');
  return {
    width: window.width,
    height: window.height,
  };
}

function sameMetrics(left: PageMetrics, right: PageMetrics): boolean {
  return left.width === right.width && left.height === right.height;
}

export function usePageMetrics(): PageMetrics {
  const [metrics, setMetrics] = useState(readPageMetrics);

  useEffect(() => {
    let alive = true;
    const apply = () => {
      if (!alive) return;
      setMetrics((current) => {
        const next = readPageMetrics();
        return sameMetrics(current, next) ? current : next;
      });
    };
    const dim = Dimensions.addEventListener('change', apply);
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') apply();
    });
    apply();
    return () => {
      alive = false;
      dim.remove();
      app.remove();
    };
  }, []);

  return metrics;
}
