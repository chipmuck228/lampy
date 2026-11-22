// Shared with the Node API: never import mobile feature gates or React Native here.
function isSafeInvitationUrl(url: URL) {
  if (url.protocol === "https:") return true;
  if (url.protocol !== "http:") return false;
  const host = url.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") return true;
  const ipv4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
  if (!ipv4) return false;
  const a = Number(ipv4[1]), b = Number(ipv4[2]);
  return a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}
export function invitationOrigin(
  value = process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL,
): string | null {
  try {
    const u = new URL(value || "");
    return isSafeInvitationUrl(u) &&
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
