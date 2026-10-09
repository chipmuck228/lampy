import { appLanguage, dateLabel, tr } from '../i18n';
export function familyHistoryError(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
  if (code === 'UNAUTHENTICATED') return tr('登录后，才能和家人一起看。');
  if (code === 'NOT_IN_FAMILY' || code === 'FORBIDDEN' || code === 'SHARE_NOT_FOUND') return tr('这份家庭记录现在不可读。');
  if (code === 'FAMILY_HISTORY_CLOSED' || code === 'FAMILY_UPGRADE_REQUIRED') return tr('家庭分享暂未开放。');
  if (code === 'SOURCE_CHANGED' || code === 'MOMENT_NOT_FOUND') return tr('记录已变化，请重新查看并确认。');
  if (code === 'SHARE_MEDIA_INCOMPLETE' || code === 'SHARE_MEDIA_UNAVAILABLE') return tr('照片或声音暂时无法分享，原记录还在。');
  return tr('暂时读不出来，请再试一次。');
}

export function familySnapshotDate(snapshot: { occurredAt?: string; occurredAtPrecision: string }) {
  const { occurredAt, occurredAtPrecision } = snapshot;
  if (!occurredAt || occurredAtPrecision === 'unknown') return tr('时间还没确定');
  const date = new Date(occurredAt);
  if (!Number.isFinite(date.getTime())) return tr('时间还没确定');
  const y = date.getFullYear(), m = date.getMonth() + 1;
  if (occurredAtPrecision === 'year') return appLanguage === 'en' ? String(y) : `${y}年`;
  if (occurredAtPrecision === 'month') return dateLabel(y,m);
  return dateLabel(y,m,date.getDate());
}
