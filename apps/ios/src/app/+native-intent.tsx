import { isWebsiteOpenLink } from "../infrastructure/website-open-link";
import { isFamilyProductEntryOpen } from "../infrastructure/family-config";
import {
  parseFamilyInviteLink,
  invitationOrigin,
  forgetFamilyInvite,
  rememberFamilyInvite,
} from "../infrastructure/family-invite-link";
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}) {
  if (isWebsiteOpenLink(path)) return "/";
  // Native routing may supply an app-relative path instead of the original URL.
  const normalized=/^\/family-invite#[a-f0-9]{64}$/.test(path)?'lampy://'+path:
    /^\/invite#[a-f0-9]{64}$/.test(path)&&invitationOrigin()?invitationOrigin()+path:path;
  const token = parseFamilyInviteLink(normalized);
  if (token && isFamilyProductEntryOpen()) {
    rememberFamilyInvite(token);
    return "/family-invite";
  }
  // An invalid invite cannot fall through and become a confirmable route.
  if (path.includes("/invite") || path.includes("/family-invite")){
    forgetFamilyInvite();
    return "/family";
  }
  return path;
}
