import { isFamilyApiConfigured, isSafeFamilyApiBaseUrl } from './family-config';
import { createFamilyHttpTransport } from './family-http-client';

describe('family API URL safety', () => {
  it('treats any non-empty URL as configured so the family entry can appear', () => {
    expect(isFamilyApiConfigured('http://example.com')).toBe(true);
    expect(isFamilyApiConfigured('')).toBe(false);
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
});
