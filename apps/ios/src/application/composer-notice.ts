import { tr } from '../i18n';
export const CAMERA_DENIED_STATUS = tr("相机未打开，草稿还在。");
export const LIBRARY_DENIED_STATUS = tr("相册未打开，草稿还在。");
export const MIC_DENIED_STATUS = tr("麦克风未打开，草稿还在。");

export function composerPermissionNotice(
  code: string,
  detail: string,
): { status: string; detail: string } | null {
  if (code === 'CAMERA_DENIED') return { status: CAMERA_DENIED_STATUS, detail };
  if (code === 'LIBRARY_DENIED') return { status: LIBRARY_DENIED_STATUS, detail };
  if (code === 'MIC_DENIED') return { status: MIC_DENIED_STATUS, detail };
  return null;
}
