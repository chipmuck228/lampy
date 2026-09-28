export type LookbackWindowMeasure = (
  callback: (x: number, y: number, width: number, height: number) => void,
) => void;

export function lookbackLocateScrollY(offset: number, anchorPageY: number, scrollPageY: number): number {
  return Math.max(0, offset + (anchorPageY - scrollPageY));
}

export function nextLookbackLocateSeq(currentSeq: number): number {
  return currentSeq + 1;
}

export function lookbackLocateIsCurrent(
  requestId: string,
  requestSeq: number,
  currentId: string | null,
  currentSeq: number,
): boolean {
  return currentId === requestId && currentSeq === requestSeq;
}

export function requestLookbackLocate(input: {
  measureAnchorWindow?: LookbackWindowMeasure | null;
  measureScrollWindow?: LookbackWindowMeasure | null;
  measureAnchorInScroll?: (
    onSuccess: (x: number, y: number, width: number, height: number) => void,
    onFail: () => void,
  ) => void;
  readOffset: () => number;
  isCurrent?: () => boolean;
  consume: (y: number) => void;
}): void {
  const measureAnchorWindow = input.measureAnchorWindow;
  const measureScrollWindow = input.measureScrollWindow;
  const stillCurrent = () => !input.isCurrent || input.isCurrent();
  if (typeof measureAnchorWindow === 'function' && typeof measureScrollWindow === 'function') {
    measureAnchorWindow((_x, pageY) => {
      if (!stillCurrent()) return;
      measureScrollWindow((_sx, scrollPageY) => {
        if (!stillCurrent()) return;
        input.consume(lookbackLocateScrollY(input.readOffset(), pageY, scrollPageY));
      });
    });
    return;
  }
  if (typeof input.measureAnchorInScroll === 'function') {
    input.measureAnchorInScroll(
      (_x, relativeY) => {
        if (!stillCurrent()) return;
        input.consume(lookbackLocateScrollY(input.readOffset(), relativeY, 0));
      },
      () => undefined,
    );
  }
}
