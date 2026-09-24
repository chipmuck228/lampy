export type PickedImage = {
  sourceUri: string;
  mimeType?: string;
  width?: number;
  height?: number;
  fileName?: string;
};

export type MediaPermission = 'granted' | 'denied';

export interface ImageSource {
  requestPermission(): Promise<MediaPermission>;
  pick(remaining: number): Promise<PickedImage[]>;
}

export interface MediaStore {
  persistImage(input: {
    assetId: string;
    sourceUri: string;
    mimeType?: string;
  }): Promise<{ localUri: string; sizeBytes?: number }>;
  exists(localUri: string): Promise<boolean>;
  canDecode(localUri: string): Promise<boolean>;
}

export function extensionForMime(mimeType?: string, fileName?: string): string {
  const fromName = fileName?.match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase();
  if (fromName === 'png' || fromName === 'jpg' || fromName === 'jpeg' || fromName === 'heic' || fromName === 'webp') {
    return fromName === 'jpeg' ? 'jpg' : fromName;
  }
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/heic' || mimeType === 'image/heif') return 'heic';
  return 'jpg';
}

export function createMemoryMediaStore(): MediaStore & {
  markMissing(localUri: string): void;
  markUndecodable(localUri: string): void;
  persisted: Map<string, { sourceUri: string; exists: boolean; decodable: boolean }>;
} {
  const persisted = new Map<string, { sourceUri: string; exists: boolean; decodable: boolean }>();

  return {
    persisted,
    async persistImage({ assetId, sourceUri, mimeType }) {
      const dest = `memory://assets/${assetId}.${extensionForMime(mimeType)}`;
      const existing = persisted.get(dest);
      if (existing) return { localUri: dest };
      persisted.set(dest, { sourceUri, exists: true, decodable: true });
      return { localUri: dest };
    },
    async exists(localUri) {
      return persisted.get(localUri)?.exists === true;
    },
    async canDecode(localUri) {
      const file = persisted.get(localUri);
      return !!file && file.exists && file.decodable;
    },
    markMissing(localUri) {
      const file = persisted.get(localUri);
      if (file) persisted.set(localUri, { ...file, exists: false, decodable: false });
    },
    markUndecodable(localUri) {
      const file = persisted.get(localUri);
      if (file) persisted.set(localUri, { ...file, decodable: false });
    },
  };
}

export function createQueuedImageSource(options?: {
  permission?: MediaPermission;
  picks?: PickedImage[][];
}): ImageSource & {
  permission: MediaPermission;
  requests: number;
  picks: PickedImage[][];
} {
  const source = {
    permission: options?.permission ?? 'granted',
    requests: 0,
    picks: options?.picks ? options.picks.map((batch) => batch.slice()) : [],
    async requestPermission() {
      source.requests += 1;
      return source.permission;
    },
    async pick(remaining: number) {
      const next = source.picks.shift() ?? [];
      return next.slice(0, Math.max(0, remaining));
    },
  };
  return source;
}
