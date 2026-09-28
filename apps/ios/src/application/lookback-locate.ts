export type LookbackWindowMeasure = (
  callback: (x: number, y: number, width: number, height: number) => void,
) => void;

export function lookbackLocateScrollY(offset: number, anchorPageY: number, scrollPageY: number): number {
  return Math.max(0, offset + (anchorPageY - scrollPageY));
}

export function requestLookbackLocate(input: {
  measureAnchorWindow?: LookbackWindowMeasure | null;
  measureScrollWindow?: LookbackWindowMeasure | null;
  measureAnchorInScroll?: (
    onSuccess: (x: number, y: number, width: number, height: number) => void,
    onFail: () => void,
  ) => void;
  readOffset: () => number;
  consume: (y: number) => void;
}): void {
  const measureAnchorWindow = input.measureAnchorWindow;
  const measureScrollWindow = input.measureScrollWindow;
  if (typeof measureAnchorWindow === 'function' && typeof measureScrollWindow === 'function') {
    measureAnchorWindow((_x, pageY) => {
      measureScrollWindow((_sx, scrollPageY) => {
        input.consume(lookbackLocateScrollY(input.readOffset(), pageY, scrollPageY));
      });
    });
    return;
  }
  if (typeof input.measureAnchorInScroll === 'function') {
    input.measureAnchorInScroll(
      (_x, relativeY) => {
        input.consume(lookbackLocateScrollY(input.readOffset(), relativeY, 0));
      },
      () => undefined,
    );
  }
}
