import { argon2id } from '@noble/hashes/argon2.js';
import { bytesToHex, hexToBytes, randomBytes } from '@noble/hashes/utils.js';

/** OWASP 2023 Argon2id minimum: 19 MiB, 2 iterations, parallelism 1. */
export const ARGON2ID_PRODUCTION = {
  t: 2,
  m: 19_456,
  p: 1,
  dkLen: 32,
} as const;

/** Fast Argon2id for isolated tests. Never use in production. */
export const ARGON2ID_TEST = {
  t: 1,
  m: 8,
  p: 1,
  dkLen: 32,
} as const;

export type Argon2idParams = {
  t: number;
  m: number;
  p: number;
  dkLen: number;
};

export type PasswordHasher = {
  hash(password: string): Promise<string>;
  verify(password: string, encoded: string): Promise<boolean>;
};

function encode(params: Argon2idParams, salt: Uint8Array, hash: Uint8Array) {
  return `argon2id$m=${params.m},t=${params.t},p=${params.p}$${bytesToHex(salt)}$${bytesToHex(hash)}`;
}

function parse(encoded: string): { params: Argon2idParams; salt: Uint8Array; hash: Uint8Array } | null {
  const match = /^argon2id\$m=(\d+),t=(\d+),p=(\d+)\$([0-9a-f]+)\$([0-9a-f]+)$/i.exec(encoded);
  if (!match) return null;
  return {
    params: {
      m: Number(match[1]),
      t: Number(match[2]),
      p: Number(match[3]),
      dkLen: match[5].length / 2,
    },
    salt: hexToBytes(match[4]),
    hash: hexToBytes(match[5]),
  };
}

function derive(password: string, salt: Uint8Array, params: Argon2idParams) {
  return argon2id(password, salt, {
    t: params.t,
    m: params.m,
    p: params.p,
    dkLen: params.dkLen,
    maxmem: Math.max(params.m * 1024 * 2, 1024 * 1024),
  });
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i]! ^ right[i]!;
  return diff === 0;
}

export function createArgon2idPasswordHasher(params: Argon2idParams = ARGON2ID_PRODUCTION): PasswordHasher {
  return {
    async hash(password) {
      const salt = randomBytes(16);
      return encode(params, salt, derive(password, salt, params));
    },
    async verify(password, encoded) {
      const parsed = parse(encoded);
      if (!parsed) return false;
      const next = derive(password, parsed.salt, parsed.params);
      return timingSafeEqual(next, parsed.hash);
    },
  };
}
