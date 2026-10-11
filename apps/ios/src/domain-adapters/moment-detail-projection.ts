import { formatCalendarDate } from './calendar';
import { tr } from '../i18n';
/* eslint-disable @typescript-eslint/no-require-imports */
const projection = require('@lampy/projections/moment-detail-projection.js') as {
  projectMomentDetail: (
    moment: object,
    assets: (object | null | undefined)[],
    options?: { timezoneOffsetMinutes?: number },
  ) => MomentDetailProjection;
};

export type MomentDetailProjection = {
  id: string;
  displayDate: {
    primary: string;
    precision: string;
    usedRecordedAtFallback: boolean;
  };
  content: { note: string; significance: string; emotion: string };
  source: { type: string; label: string; isLegacy: boolean };
  assets: {
    id: string;
    type: string;
    status: string;
    localUri?: string;
    display: {
      caption?: string;
      width?: number;
      height?: number;
      unavailableLabel?: string;
    };
  }[];
  state: {
    isActive: boolean;
    hasText: boolean;
    hasImages: boolean;
    hasAudio: boolean;
    hasUnavailableAssets: boolean;
  };
};


const SOURCE_LABELS: Record<string, string> = {
  created: tr("你留下的记录"),
  imported: tr("后来拾起的记录"),
  received: tr("收到的记录"),
};

export function projectMomentDetailView(
  moment: object,
  assets: (object | null | undefined)[],
  options?: { timezoneOffsetMinutes?: number },
): MomentDetailProjection {
  const view = projection.projectMomentDetail(moment, assets, options);
  const type = view.source.type;
  return {
    ...view,
    displayDate: {
      ...view.displayDate,
      primary: view.displayDate.usedRecordedAtFallback
        ? tr('记录于 {0}', [formatCalendarDate((moment as { time: { recordedAt: string } }).time.recordedAt, 'day', options?.timezoneOffsetMinutes)])
        : formatCalendarDate((moment as { time: { occurredAt?: string } }).time.occurredAt ?? '', view.displayDate.precision, options?.timezoneOffsetMinutes),
    },
    source: {
      ...view.source,
      label: SOURCE_LABELS[type] || view.source.label,
    },
    assets: view.assets.map((asset) =>
      asset.status === 'available'
        ? asset
        : {
            ...asset,
            display: {
              ...asset.display,
              unavailableLabel:
                asset.type === 'audio'
                  ? tr("这段声音暂时无法播放，其他内容仍然保留。")
                  : tr("这张照片暂时找不到了，但这条记录还在。"),
            },
          },
    ),
  };
}
