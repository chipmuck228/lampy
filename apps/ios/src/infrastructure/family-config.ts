export function familyApiBaseUrl(value = process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL) {
  return (value || '').trim();
}

export function isFamilyApiConfigured(value = process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL) {
  return Boolean(familyApiBaseUrl(value));
}
