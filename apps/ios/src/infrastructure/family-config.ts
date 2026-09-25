export function familyApiBaseUrl(value = process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL) {
  return (value || '').trim();
}

export function isFamilyApiConfigured(value = process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL) {
  return Boolean(familyApiBaseUrl(value));
}

function isLocalOrPrivateHostname(hostname: string) {
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    return true;
  }
  const ipv4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(hostname);
  if (!ipv4) return false;
  const a = Number(ipv4[1]);
  const b = Number(ipv4[2]);
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

export function isSafeFamilyApiBaseUrl(value = process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL) {
  const raw = familyApiBaseUrl(value);
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'https:') return true;
    return parsed.protocol === 'http:' && isLocalOrPrivateHostname(parsed.hostname);
  } catch {
    return false;
  }
}
