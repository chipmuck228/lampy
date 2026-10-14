import { receiveAlbumFile } from '../application/album-file-open';
import { isFamilyProductEntryOpen } from "../infrastructure/family-config";
import {
  parseFamilyInviteLink,
  rememberFamilyInvite,
} from "../infrastructure/family-invite-link";
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}) {
  if (path.startsWith('file:')) {
    try { return `/album-file?token=${receiveAlbumFile(path)}`; }
    catch { return '/album-file'; }
  }
  const token = parseFamilyInviteLink(path);
  if (token && isFamilyProductEntryOpen()) {
    rememberFamilyInvite(token);
    return "/family-invite";
  }
  // An invalid invite cannot fall through and become a confirmable route.
  if (path.includes("/invite") || path.includes("/family-invite"))
    return "/family";
  return path;
}
