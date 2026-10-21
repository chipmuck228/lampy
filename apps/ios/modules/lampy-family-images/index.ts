import { requireOptionalNativeModule } from 'expo';
export type FamilyImageCopy = { base64: string; mimeType: string; width: number; height: number };
export function familyImagesNative() {
  try {
    return requireOptionalNativeModule<{ prepare(base64: string, mime: string): Promise<FamilyImageCopy | { error: string }> }>('LampyFamilyImages');
  } catch { return null; }
}
