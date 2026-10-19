import { appLanguage, dateLabel, tr } from '../i18n';
export function familyHistoryError(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
  if (code === 'CONTENT_NOT_ALLOWED') return tr('这段内容暂时不能分享，请调整文字；本机原记录保留。');
  if (code === 'SHARING_RESTRICTED') return tr('此账号暂时不能新增家庭分享。已有记录仍可阅读，如有疑问请联系 dev@yunpura.com。');
  if (code === 'FAMILY_DISSOLVED') return tr('这个家庭已解散，个人记录还在。');
  if (code === 'UNAUTHENTICATED') return tr('登录后，才能和家人一起看。');
  if (code === 'NOT_IN_FAMILY') return tr('现在无法访问这个家庭，个人记录还在。');
  if (code === 'FORBIDDEN' || code === 'SHARE_NOT_FOUND') return tr('这份家庭记录现在不可读。');
  if (code === 'FAMILY_HISTORY_CLOSED' || code === 'FAMILY_UPGRADE_REQUIRED') return tr('家庭分享暂未开放。');
  if (code === 'SOURCE_CHANGED' || code === 'MOMENT_NOT_FOUND') return tr('记录已变化，请重新查看并确认。');
  if (code === 'SHARE_MEDIA_UNAVAILABLE') return tr('这份分享的照片或声音暂时读不出来，请再试一次。');
  if (code === 'SHARE_MEDIA_INCOMPLETE') return tr('照片或声音暂时无法分享，原记录还在。');
  if (code === 'SHARE_IMAGE_CONVERSION_UNAVAILABLE') return tr('照片分享需要更新测试安装，原照片还在。');
  if (code === 'SHARE_IMAGE_CONVERSION_FAILED' || code === 'MEDIA_UNSUPPORTED' || code === 'MEDIA_CORRUPT') return tr('这张照片暂时无法分享，可以取消勾选后再试。');
  if (code === 'MEDIA_TOO_LARGE') return tr('这份照片或声音超过分享大小限制，可以取消勾选后再试。');
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

// Nicknames describe authors; user IDs alone decide self and permissions.
export function familyShareAuthorLabel(share: { authorUserId: string; authorNickname?: string }, viewer: string | null) {
  const nickname = share.authorNickname?.trim();
  return nickname
    ? tr(viewer === share.authorUserId ? '你 · {0} 分享的' : '{0} 分享的', [nickname])
    : tr(viewer === share.authorUserId ? '你分享的' : '家人分享的');
}
