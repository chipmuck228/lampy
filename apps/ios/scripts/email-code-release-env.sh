# Source after the normal release/profile environment. This is an explicit release opt-in.
export EXPO_PUBLIC_EMAIL_CODE_LOGIN_ENABLED=0
export EXPO_PUBLIC_ACCOUNT_API_BASE_URL=
if [[ -n "${LAMPY_EMAIL_CODE_RELEASE_URL:-}" ]]; then
  email_code_release_base="$(node - <<'NODE'
try {
  const canonical = raw => {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error();
    return url.href.replace(/\/+$/, '');
  };
  const base = canonical(process.env.LAMPY_EMAIL_CODE_RELEASE_URL);
  const family = process.env.EXPO_PUBLIC_FAMILY_API_BASE_URL;
  if (family && canonical(family) !== base) throw new Error();
  process.stdout.write(base);
} catch { console.error('Email-code release requires HTTPS and the same backend as the family profile.'); process.exit(1); }
NODE
  )" || return 1
  export EXPO_PUBLIC_EMAIL_CODE_LOGIN_ENABLED=1
  export EXPO_PUBLIC_ACCOUNT_API_BASE_URL="$email_code_release_base"
  unset email_code_release_base
fi
