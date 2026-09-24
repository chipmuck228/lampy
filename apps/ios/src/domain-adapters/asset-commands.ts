/* eslint-disable @typescript-eslint/no-require-imports */
const assetModule = require('@lampy/domain/asset/asset.js') as {
  createAsset: (input: object, dependencies?: object) => AssetRecord;
  validateAsset: (raw: unknown) => { ok: boolean; errors: { code: string; message: string }[] };
};

export type AssetRecord = {
  id: string;
  ownerId: string;
  type: string;
  captureTime?: string;
  captureTimeSource?: string;
  localUri: string;
  storage: {
    status: string;
    originalKey?: string;
    previewKey?: string;
    thumbnailKey?: string;
  };
  metadata: {
    mimeType?: string;
    sizeBytes?: number;
    width?: number;
    height?: number;
    durationMs?: number;
  };
  integrity: { checksum?: string };
  userCaption: string;
  audit: { createdAt: string; updatedAt: string };
};

export const { createAsset, validateAsset } = assetModule;
