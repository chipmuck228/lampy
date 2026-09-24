/* eslint-disable @typescript-eslint/no-require-imports */
const errors = require('@lampy/domain/moment/moment.errors.js') as {
  ERROR_CODES: Record<string, string>;
  DomainError: new (code: string, message: string) => Error & { code: string };
};

export const ERROR_CODES = errors.ERROR_CODES;
export const DomainError = errors.DomainError;
