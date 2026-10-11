import { tr } from '../i18n';
export function formatSoundDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs < 0) return tr("0秒");
  const totalSeconds = Math.round(durationMs / 1000);
  if (totalSeconds < 60) return tr("{0}秒", [totalSeconds]);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
