import { Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';

import {
  classifyCopyError,
  extensionForAudioMime,
  extensionForMime,
  type ImageSource,
  type MediaStore,
  type PickedImage,
} from './media';

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
  try {
    const copied = await FileSystem.getInfoAsync(dest);
    return {
      localUri: dest,
      sizeBytes: copied.exists ? copied.size : undefined,
    };
  } catch {
    return { localUri: dest };
  }
}

function isAppOwned(localUri: string): boolean {
  return localUri.includes(`/${ASSET_DIR}/`);
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
    async exists(localUri) {
      const info = await FileSystem.getInfoAsync(localUri);
      return info.exists && !info.isDirectory;
    },
    async canDecode(localUri) {
      const info = await FileSystem.getInfoAsync(localUri);
      if (!info.exists || info.isDirectory || (info.size ?? 0) <= 0) return false;
      return new Promise((resolve) => {
        Image.getSize(
          localUri,
          () => resolve(true),
          () => resolve(false),
        );
      });
    },
    async canPlay(localUri) {
      const info = await FileSystem.getInfoAsync(localUri);
      return info.exists && !info.isDirectory && (info.size ?? 0) > 0;
    },
    async removeAppOwned(localUri) {
      if (!isAppOwned(localUri)) return false;
      const info = await FileSystem.getInfoAsync(localUri);
      if (!info.exists || info.isDirectory) return false;
      await FileSystem.deleteAsync(localUri, { idempotent: true });
      return true;
    },
  };
}
