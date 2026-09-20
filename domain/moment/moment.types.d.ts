export type OccurredAtPrecision = 'exact' | 'day' | 'month' | 'year' | 'unknown'
export type MomentVisibility = 'private' | 'selected_people' | 'shared_space' | 'public'
export type MomentStatus = 'draft' | 'active' | 'archived' | 'trashed'
export type ImportSource = 'album' | 'camera' | 'file' | 'voice'

export type PersonReference = {
  id: string
  displayName: string
  linkedUserId?: string
  relationship?: string
}

export type PlaceReference = {
  id: string
  displayName: string
  latitude?: number
  longitude?: number
}

export type CreatedOrigin = {
  type: 'created'
}

export type ImportedOrigin = {
  type: 'imported'
  importSource: ImportSource
}

export type ReceivedOrigin = {
  type: 'received'
  transmissionId: string
  originalMomentId: string
  snapshotRevision: number
  legacy?: boolean
  legacySource?: string
}

export type MomentOrigin = CreatedOrigin | ImportedOrigin | ReceivedOrigin

export type Moment = {
  id: string
  schemaVersion: 1
  revision: number
  ownerId: string
  content: {
    note?: string
    significance?: string
    emotion?: string
  }
  time: {
    occurredAt?: string
    occurredAtPrecision: OccurredAtPrecision
    timezone?: string
    recordedAt: string
    importedAt?: string
  }
  assetIds: string[]
  context: {
    people: PersonReference[]
    place?: PlaceReference
    tags: string[]
  }
  origin: MomentOrigin
  accessSummary: {
    visibility: MomentVisibility
    futureAccessEnabled: boolean
  }
  lifecycle: {
    status: MomentStatus
    activatedAt?: string
    archivedAt?: string
    trashedAt?: string
  }
  audit: {
    createdAt: string
    updatedAt: string
  }
}

export type ValidationIssue = {
  code: string
  message: string
  path?: string
}

export type ValidationResult = {
  ok: boolean
  errors: ValidationIssue[]
}

export type Suggestion = {
  id: string
  targetMomentId?: string
  kind: string
  payload: unknown
  createdAt: string
}

export type AccessGrant = {
  id: string
  momentId: string
  granteeId: string
  permission: 'view' | 'receive' | 'manage'
  createdAt: string
  expiresAt?: string
}

export type Collection = {
  id: string
  ownerId: string
  title: string
  momentIds: string[]
  createdAt: string
  updatedAt: string
}

export type FutureAccessPolicy = {
  id: string
  ownerId: string
  momentIds: string[]
  enabled: boolean
  createdAt: string
}
