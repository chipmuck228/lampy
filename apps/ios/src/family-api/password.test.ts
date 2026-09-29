import { ARGON2ID_PRODUCTION, ARGON2ID_TEST, createArgon2idPasswordHasher } from './password';

describe('argon2id password hasher', () => {
  it('stores Argon2id parameters and never the password', async () => {
    const hasher = createArgon2idPasswordHasher(ARGON2ID_TEST);
    const encoded = await hasher.hash('correct-horse');
    expect(encoded.startsWith('argon2id$m=8,t=1,p=1$')).toBe(true);
    expect(encoded.includes('correct-horse')).toBe(false);
    expect(await hasher.verify('correct-horse', encoded)).toBe(true);
    expect(await hasher.verify('wrong-password', encoded)).toBe(false);
    expect(ARGON2ID_PRODUCTION).toEqual({ t: 2, m: 19_456, p: 1, dkLen: 32 });
  });
});
