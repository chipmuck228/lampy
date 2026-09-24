/* eslint-disable @typescript-eslint/no-require-imports */
const identity = require('@lampy/domain/shared/identity.js') as {
  LOCAL_OWNER_ID: string;
  SCHEMA_VERSION: number;
};

export const LOCAL_OWNER_ID = identity.LOCAL_OWNER_ID;
export const SCHEMA_VERSION = identity.SCHEMA_VERSION;
