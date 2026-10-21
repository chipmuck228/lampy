import { ApplicationError } from './errors';

export class FamilySharePhotoError extends ApplicationError {
  constructor(failure: unknown, readonly assetId: string, readonly photoNumber: number) {
    super(failure instanceof ApplicationError ? failure.code : 'SHARE_IMAGE_CONVERSION_FAILED', 'Photo copy could not be prepared.');
    this.name = 'FamilySharePhotoError';
  }
}
