export function normalizeEmail(raw: string) {
  return raw.normalize('NFC').trim().toLowerCase();
}

export function isPlausibleEmail(normalized: string) {
  if (normalized.length < 5 || normalized.length > 254) return false;
  if (normalized.includes(' ') || normalized.includes('\n') || normalized.includes('\r')) return false;
  const at = normalized.indexOf('@');
  if (at <= 0 || at !== normalized.lastIndexOf('@')) return false;
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  if (!local || !domain.includes('.') || domain.startsWith('.') || domain.endsWith('.')) return false;
  return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local) && /^[a-z0-9.-]+$/i.test(domain);
}

export const MIN_EMAIL_PASSWORD_LENGTH = 10;
export const MAX_EMAIL_PASSWORD_LENGTH = 128;

export function passwordPolicyError(password: string): string | null {
  if (password.length < MIN_EMAIL_PASSWORD_LENGTH || password.length > MAX_EMAIL_PASSWORD_LENGTH) {
    return `Password must be ${MIN_EMAIL_PASSWORD_LENGTH} to ${MAX_EMAIL_PASSWORD_LENGTH} characters.`;
  }
  if (/\s/.test(password) && password.trim() !== password) {
    return 'Password cannot start or end with whitespace.';
  }
  return null;
}
