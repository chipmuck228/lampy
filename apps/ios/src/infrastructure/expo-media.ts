import { Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';

import {
  classifyCopyError,
  extensionForAudioMime,
  extensionForMime,
  MediaPersistError,
  type ImageSource,
  type MediaStore,
  type PickedImage,
} from './media';
import { consumeFamilyTestLibraryPick } from './family-test-driver';

const ASSET_DIR = 'lampy-assets';

function documentRoot(): string {
  const root = FileSystem.documentDirectory;
  if (!root) throw new Error('document directory is not available');
  return root;
}

function assetDirectory(): string {
  return `${documentRoot()}${ASSET_DIR}`;
}

function toPicked(asset: ImagePicker.ImagePickerAsset): PickedImage {
  return {
    sourceUri: asset.uri,
    mimeType: asset.mimeType,
    width: asset.width,
    height: asset.height,
    fileName: asset.fileName ?? undefined,
  };
}

export function createExpoLibrarySource(): ImageSource {
  return {
    async requestPermission() {
      const current = await ImagePicker.getMediaLibraryPermissionsAsync();
      if (current.status === 'undetermined') {
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      }
      // PHPicker can open without full-library access. A denied TCC
      // must not block the system picker or the rest of the draft.
      return 'granted';
    },
    async pick(remaining) {
      if (remaining <= 0) return [];
      const testPick = consumeFamilyTestLibraryPick();
      if (testPick) {
        return [{
          sourceUri: testPick.sourceUri,
          mimeType: testPick.mimeType,
          width: testPick.width,
          height: testPick.height,
        }];
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: remaining > 1,
        selectionLimit: remaining,
        quality: 1,
        allowsEditing: false,
        exif: false,
      });
      if (result.canceled) return [];
      return result.assets.map(toPicked);
    },
  };
}

export function createExpoCameraSource(): ImageSource {
  return {
    async requestPermission() {
      const result = await ImagePicker.requestCameraPermissionsAsync();
      return result.granted ? 'granted' : 'denied';
    },
    async pick() {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 1,
        allowsEditing: false,
        exif: false,
      });
      if (result.canceled) return [];
      return result.assets.map(toPicked);
    },
  };
}

async function persistCopy(
  dest: string,
  sourceUri: string,
): Promise<{ localUri: string; sizeBytes?: number }> {
  const directory = assetDirectory();
  const info = await FileSystem.getInfoAsync(directory);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  }
  let destInfo;
  try {
    destInfo = await FileSystem.getInfoAsync(dest);
  } catch (error) {
    throw classifyCopyError(error);
  }
  if (destInfo.exists) {
    return {
      localUri: dest,
      sizeBytes: destInfo.size,
    };
  }
  try {
    await FileSystem.copyAsync({ from: sourceUri, to: dest });
  } catch (error) {
    try {
      await FileSystem.deleteAsync(dest, { idempotent: true });
    } catch {
      // Only a dest this copy started may be a partial file.
    }
    throw classifyCopyError(error);
  }
  let copied;
  try {
    copied = await FileSystem.getInfoAsync(dest);
  } catch (error) {
    throw classifyCopyError(error);
  }
  if (!copied.exists || copied.isDirectory) {
    throw new MediaPersistError('COPY_FAILED', 'copied dest could not be confirmed');
  }
  return {
    localUri: dest,
    sizeBytes: copied.size,
  };
}

function isAppOwned(localUri: string): boolean {
  return localUri.includes(`/${ASSET_DIR}/`);
}

function assetFileName(localUri: string): string | null {
  const marker = `/${ASSET_DIR}/`;
  const index = localUri.lastIndexOf(marker);
  if (index < 0) return null;
  let rest = localUri.slice(index + marker.length).split('?')[0] ?? '';
  try {
    rest = decodeURIComponent(rest);
  } catch {
    return null;
  }
  if (!rest || rest.includes('/') || rest.includes('\\') || rest.includes('..')) return null;
  return rest;
}

function withPrivateVarVariants(uri: string): string[] {
  if (uri.includes('/private/var/')) {
    return [uri, uri.replace('/private/var/', '/var/')];
  }
  if (uri.includes('/var/')) {
    return [uri, uri.replace('file:///var/', 'file:///private/var/')];
  }
  return [uri];
}

function candidateUris(localUri: string): string[] {
  const out: string[] = [];
  for (const uri of withPrivateVarVariants(localUri)) {
    if (!out.includes(uri)) out.push(uri);
  }
  const name = assetFileName(localUri);
  if (name) {
    const remapped = `${assetDirectory()}/${name}`;
    for (const uri of withPrivateVarVariants(remapped)) {
      if (!out.includes(uri)) out.push(uri);
    }
  }
  return out;
}

async function locateExistingFile(localUri: string): Promise<string | null> {
  for (const uri of candidateUris(localUri)) {
    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (info.exists && !info.isDirectory) return uri;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

export async function readExpoAssetBytes(localUri: string): Promise<Uint8Array> {
  const located = (await locateExistingFile(localUri)) ?? localUri;
  const info = await FileSystem.getInfoAsync(located);
  if (!info.exists || info.isDirectory) {
    throw new Error('asset file is missing');
  }
  const base64 = await FileSystem.readAsStringAsync(located, {
    encoding: 'base64',
  });
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function createExpoMediaStore(): MediaStore {
  return {
    async persistImage({ assetId, sourceUri, mimeType }) {
      return persistCopy(`${assetDirectory()}/${assetId}.${extensionForMime(mimeType)}`, sourceUri);
    },
    async persistAudio({ assetId, sourceUri, mimeType }) {
      return persistCopy(
        `${assetDirectory()}/${assetId}.${extensionForAudioMime(mimeType, sourceUri)}`,
        sourceUri,
      );
    },
    async resolveUri(localUri) {
      return locateExistingFile(localUri);
    },
    async exists(localUri) {
      return (await locateExistingFile(localUri)) != null;
    },
    async canDecode(localUri) {
      const located = await locateExistingFile(localUri);
      if (!located) return false;
      const info = await FileSystem.getInfoAsync(located);
      if (!info.exists || info.isDirectory || (info.size ?? 0) <= 0) return false;
      return new Promise((resolve) => {
        Image.getSize(
          located,
          () => resolve(true),
          () => resolve(false),
        );
      });
    },
    async canPlay(localUri) {
      const located = await locateExistingFile(localUri);
      if (!located) return false;
      const info = await FileSystem.getInfoAsync(located);
      return info.exists && !info.isDirectory && (info.size ?? 0) > 0;
    },
    async removeAppOwned(localUri) {
      if (!isAppOwned(localUri)) return false;
      const located = (await locateExistingFile(localUri)) ?? localUri;
      const info = await FileSystem.getInfoAsync(located);
      if (!info.exists || info.isDirectory) return false;
      await FileSystem.deleteAsync(located, { idempotent: true });
      return true;
    },
  };
}
