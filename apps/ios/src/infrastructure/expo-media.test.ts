import { Image } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

import { createExpoMediaStore } from './expo-media';

jest.mock('expo-image-picker', () => ({
  getMediaLibraryPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
}));

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  getInfoAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  copyAsync: jest.fn(),
  deleteAsync: jest.fn(),
}));

describe('expo media decode', () => {
  afterEach(() => {
    jest.mocked(FileSystem.getInfoAsync).mockReset();
    jest.mocked(FileSystem.copyAsync).mockReset();
    jest.mocked(FileSystem.deleteAsync).mockReset();
    jest.restoreAllMocks();
  });

  it('returns false when a non-empty file cannot be decoded', async () => {
    jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({
      exists: true,
      isDirectory: false,
      size: 2048,
      uri: 'file:///docs/lampy-assets/broken.jpg',
      modificationTime: 0,
    });
    jest.spyOn(Image, 'getSize').mockImplementation((_uri, _onSuccess, onError) => {
      onError?.(new Error('undecodable'));
    });

    await expect(createExpoMediaStore().canDecode('file:///docs/lampy-assets/broken.jpg')).resolves.toBe(
      false,
    );
  });

  it('returns true only when the file exists and decodes', async () => {
    jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({
      exists: true,
      isDirectory: false,
      size: 2048,
      uri: 'file:///docs/lampy-assets/ok.jpg',
      modificationTime: 0,
    });
    jest.spyOn(Image, 'getSize').mockImplementation((_uri, onSuccess) => {
      onSuccess(800, 600);
    });

    await expect(createExpoMediaStore().canDecode('file:///docs/lampy-assets/ok.jpg')).resolves.toBe(true);
  });

  it('classifies a disk-full copy as DISK_FULL and removes the partial dest', async () => {
    jest.mocked(FileSystem.getInfoAsync).mockImplementation(async (uri) => {
      if (String(uri).endsWith('lampy-assets')) {
        return {
          exists: true,
          isDirectory: true,
          uri: String(uri),
          size: 0,
          modificationTime: 0,
        };
      }
      return {
        exists: false,
        isDirectory: false,
        uri: String(uri),
        size: 0,
        modificationTime: 0,
      };
    });
    jest.mocked(FileSystem.copyAsync).mockRejectedValueOnce(
      Object.assign(new Error('ENOSPC: no space'), { code: 'ENOSPC' }),
    );
    jest.mocked(FileSystem.deleteAsync).mockResolvedValueOnce();

    await expect(
      createExpoMediaStore().persistImage({
        assetId: 'asset_full',
        sourceUri: 'file:///tmp/source.jpg',
        mimeType: 'image/jpeg',
      }),
    ).rejects.toMatchObject({ code: 'DISK_FULL' });
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
      'file:///docs/lampy-assets/asset_full.jpg',
      { idempotent: true },
    );
  });

  it('classifies a generic copy failure as COPY_FAILED', async () => {
    jest.mocked(FileSystem.getInfoAsync).mockImplementation(async (uri) => {
      if (String(uri).endsWith('lampy-assets')) {
        return {
          exists: true,
          isDirectory: true,
          uri: String(uri),
          size: 0,
          modificationTime: 0,
        };
      }
      return {
        exists: false,
        isDirectory: false,
        uri: String(uri),
        size: 0,
        modificationTime: 0,
      };
    });
    jest.mocked(FileSystem.copyAsync).mockRejectedValueOnce(new Error('EIO'));

    await expect(
      createExpoMediaStore().persistAudio({
        assetId: 'asset_copy',
        sourceUri: 'file:///tmp/source.m4a',
        mimeType: 'audio/mp4',
      }),
    ).rejects.toMatchObject({ code: 'COPY_FAILED' });
  });

  it('does not delete a system album original', async () => {
    jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({
      exists: true,
      isDirectory: false,
      size: 2048,
      uri: 'file:///DCIM/100APPLE/IMG_0001.JPG',
      modificationTime: 0,
    });

    await expect(
      createExpoMediaStore().removeAppOwned('file:///DCIM/100APPLE/IMG_0001.JPG'),
    ).resolves.toBe(false);
    expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
  });

  it('treats an empty audio file as unplayable', async () => {
    jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({
      exists: true,
      isDirectory: false,
      size: 0,
      uri: 'file:///docs/lampy-assets/empty.m4a',
      modificationTime: 0,
    });

    await expect(createExpoMediaStore().canPlay('file:///docs/lampy-assets/empty.m4a')).resolves.toBe(false);
  });
});
