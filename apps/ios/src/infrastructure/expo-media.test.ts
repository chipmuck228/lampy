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
