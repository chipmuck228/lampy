export type AssetType = 'image' | 'video' | 'audio'
export type CaptureTimeSource = 'metadata' | 'user' | 'system'
export type AssetStorageStatus = 'local' | 'pending' | 'ready' | 'failed' | 'missing'

export type Asset = {
  id: string
  ownerId: string
  type: AssetType
  captureTime?: string
  captureTimeSource?: CaptureTimeSource
  localUri?: string
  storage: {
    status: AssetStorageStatus
    originalKey?: string
    previewKey?: string
    thumbnailKey?: string
  }
  metadata: {
    mimeType?: string
    sizeBytes?: number
    width?: number
    height?: number
    durationMs?: number
  }
  integrity: {
    checksum?: string
  }
  userCaption?: string
  audit: {
    createdAt: string
    updatedAt: string
  }
}
