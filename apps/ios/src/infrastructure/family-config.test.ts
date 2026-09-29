import { isFamilyApiConfigured, isFamilyProductEntryOpen, isSafeFamilyApiBaseUrl } from './family-config';
import { createFamilyHttpTransport } from './family-http-client';
import { armFamilyTestNextRequestFailure } from './family-test-driver';

describe('family API URL safety', () => {
  it('treats any non-empty URL as a configured auth/HTTP target, not as a product entry', () => {
    expect(isFamilyApiConfigured('http://example.com')).toBe(true);
    expect(isFamilyApiConfigured('')).toBe(false);
    expect(isFamilyProductEntryOpen('')).toBe(false);
    expect(isFamilyProductEntryOpen(undefined)).toBe(false);
  });

  it('keeps the family product entry closed unless EXPO_PUBLIC_FAMILY_ENTRY_OPEN is explicitly on', () => {
    expect(isFamilyProductEntryOpen('1')).toBe(true);
    expect(isFamilyProductEntryOpen('true')).toBe(true);
    expect(isFamilyProductEntryOpen('YES')).toBe(true);
    expect(isFamilyProductEntryOpen('0')).toBe(false);
    expect(isFamilyProductEntryOpen('https://family.example.com')).toBe(false);
  });

  it('walks no URL / auth URL with entry closed / family entry open as separate gates', () => {
    expect(isFamilyApiConfigured('')).toBe(false);
    expect(isSafeFamilyApiBaseUrl('')).toBe(false);
    expect(isFamilyProductEntryOpen('')).toBe(false);

    expect(isFamilyApiConfigured('https://family.example.com')).toBe(true);
    expect(isSafeFamilyApiBaseUrl('https://family.example.com')).toBe(true);
    expect(isFamilyProductEntryOpen('')).toBe(false);

    expect(isFamilyApiConfigured('https://family.example.com')).toBe(true);
    expect(isSafeFamilyApiBaseUrl('https://family.example.com')).toBe(true);
    expect(isFamilyProductEntryOpen('1')).toBe(true);
  });

  it('allows HTTPS and local HTTP, and refuses public HTTP before a session token is sent', async () => {
    expect(isSafeFamilyApiBaseUrl('https://family.example.com')).toBe(true);
    expect(isSafeFamilyApiBaseUrl('http://127.0.0.1:8787')).toBe(true);
    expect(isSafeFamilyApiBaseUrl('http://192.168.31.10:8787')).toBe(true);
    expect(isSafeFamilyApiBaseUrl('http://family.example.com')).toBe(false);

    const fetchImpl = jest.fn();
    const publicHttp = createFamilyHttpTransport({
      baseUrl: 'http://family.example.com',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(
      publicHttp.request({ method: 'GET', path: '/v1/me/membership', sessionToken: 'ses_secret' }),
    ).rejects.toMatchObject({ code: 'SERVER_UNREACHABLE' });
    await expect(
      publicHttp.request({
        method: 'POST',
        path: '/v1/auth/test-account',
        body: { login: 'tester@example.com', password: 'correct-horse' },
      }),
    ).rejects.toMatchObject({ code: 'SERVER_UNREACHABLE' });
    expect(fetchImpl).not.toHaveBeenCalled();

    const local = createFamilyHttpTransport({
      baseUrl: 'http://127.0.0.1:8787',
      fetchImpl: (async () =>
        ({
          status: 200,
          text: async () => '{"family":null}',
        }) as Response) as unknown as typeof fetch,
    });
    await expect(local.request({ method: 'GET', path: '/v1/me/membership', sessionToken: 'ses_local' })).resolves.toEqual({
      status: 200,
      body: { family: null },
    });
  });

  it('lets the test driver fail exactly one request without changing the official entry switch', async () => {
    expect(isFamilyApiConfigured('')).toBe(false);
    const previous = process.env.EXPO_PUBLIC_FAMILY_TEST_DRIVER;
    process.env.EXPO_PUBLIC_FAMILY_TEST_DRIVER = '1';
    const fetchImpl = jest.fn(async () => ({
      status: 200,
      ok: true,
      text: async () => '{"shares":[]}',
      headers: { get: () => 'application/json' },
    }));
    const transport = createFamilyHttpTransport({
      baseUrl: 'http://127.0.0.1:8787',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    armFamilyTestNextRequestFailure('revoke');
    await expect(
      transport.request({ method: 'GET', path: '/v1/families/fam_1/shares', sessionToken: 'ses_local' }),
    ).resolves.toEqual({
      status: 200,
      body: { shares: [] },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await expect(transport.request({ method: 'POST', path: '/v1/families/fam_1/shares/shr_1/revoke' })).rejects.toMatchObject({
      code: 'NETWORK',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    if (previous === undefined) delete process.env.EXPO_PUBLIC_FAMILY_TEST_DRIVER;
    else process.env.EXPO_PUBLIC_FAMILY_TEST_DRIVER = previous;
  });
});
