import { isWebsiteOpenLink } from "../infrastructure/website-open-link";
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
  if (isWebsiteOpenLink(path)) return "/";
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
