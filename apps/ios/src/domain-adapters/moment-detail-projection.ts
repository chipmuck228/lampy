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
  created: '你留下的记录',
  imported: '后来拾起的记录',
  received: '收到的记录',
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
                  ? '这段声音暂时无法播放，其他内容仍然保留。'
                  : '这张照片暂时找不到了，但这条记录还在。',
            },
          },
    ),
  };
}
