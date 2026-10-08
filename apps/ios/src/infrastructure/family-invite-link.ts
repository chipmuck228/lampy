import { isSafeFamilyApiBaseUrl } from "./family-config";
export function invitationOrigin(
  value = process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL,
): string | null {
  try {
    const u = new URL(value || "");
    return isSafeFamilyApiBaseUrl(value) &&
      u.pathname === "/" &&
      !u.search &&
      !u.hash &&
      !u.username &&
      !u.password
      ? u.origin
      : null;
  } catch {
    return null;
  }
}
export function parseFamilyInviteLink(
  value: string,
  origin = invitationOrigin(),
): string | null {
  try {
    const u = new URL(value);
    const web = origin && u.origin === origin && u.pathname === "/invite";
    const native =
      u.protocol === "lampy:" &&
      u.hostname === "" &&
      u.pathname === "/family-invite";
    if ((!web && !native) || u.search || !/^#[a-f0-9]{64}$/.test(u.hash))
      return null;
    return u.hash.slice(1);
  } catch {
    return null;
  }
}
export function makeFamilyInviteLink(origin: string, token: string) {
  if (!invitationOrigin(origin) || !/^[a-f0-9]{64}$/.test(token))
    throw new Error("Invalid invitation configuration.");
  return `${origin}/invite#${token}`;
}
// A bearer survives login/navigation only in memory. No AsyncStorage/Keychain/logging.
let pending: { token: string; generation: number } | null = null;
let generation = 0;
export function rememberFamilyInvite(token: string) {
  pending = { token, generation: ++generation };
  return pending;
}
export function currentFamilyInvite() {
  return pending;
}
export function forgetFamilyInvite(expected?: number) {
  if (expected === undefined || pending?.generation === expected) {
    pending = null;
    generation++;
  }
}
