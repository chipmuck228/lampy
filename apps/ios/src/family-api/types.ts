export type MembershipRole = 'creator' | 'member';
export type MembershipStatus = 'active' | 'left' | 'removed';
export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';
export type FamilyStatus = 'active' | 'dissolved';

export type Account = {
  userId: string;
  appleSubject?: string;
  email?: string;
  createdAt: string;
};

export type TestCredential = {
  credentialId: string;
  loginNormalized: string;
  userId: string;
  passwordHash: string;
  enabled: boolean;
  createdAt: string;
  disabledAt?: string;
};

export type AuthRateLimit = {
  bucket: string;
  windowStartedAt: string;
  hitCount: number;
};

export type TestAccountHealth = {
  testAccountLogin: boolean;
  testAccountLoginReason: 'enabled' | 'disabled';
};

export type Session = {
  token: string;
  userId: string;
  expiresAt: string;
};

export type Family = {
  familyId: string;
  createdAt: string;
  status: FamilyStatus;
};

export type Membership = {
  membershipId: string;
  familyId: string;
  userId: string;
  role: MembershipRole;
  status: MembershipStatus;
  joinedAt: string;
};

export type Invitation = {
  invitationId: string;
  familyId: string;
  code: string;
  status: InvitationStatus;
  createdAt: string;
  expiresAt: string;
  acceptedByUserId?: string;
};

export type FamilyMemberView = {
  userId: string;
  role: MembershipRole;
  joinedAt: string;
};

export type FamilyView = {
  familyId: string;
  role: MembershipRole;
  members: FamilyMemberView[];
};

export type MembershipListView = {
  family: FamilyView | null;
};

export type SignInResult = {
  userId: string;
  sessionToken: string;
  expiresAt: string;
};

export type FamilyHealth = {
  ok: true;
  slice: 'identity-membership';
  media: true;
  shares: true;
  inbox: true;
  testAccountLogin: boolean;
  testAccountLoginReason: TestAccountHealth['testAccountLoginReason'];
  argon2id: { t: number; m: number; p: number; dkLen: number };
};

export type MediaObjectRecord = {
  objectId: string;
  ownerUserId: string;
  mimeType: string;
  byteLength: number;
  contentSha256: string;
  storageKey: string;
  createdAt: string;
};

export type MediaObjectView = {
  objectId: string;
  ownerUserId: string;
  mimeType: string;
  byteLength: number;
  createdAt: string;
};

export type ShareSnapshotMedia = {
  objectId: string;
  mimeType: string;
  byteLength: number;
};

export type ShareSnapshotOrigin = {
  type: 'received';
  transmissionId: string;
  originalMomentId: string;
  snapshotRevision: number;
};

export type ShareSnapshot = {
  note: string;
  emotion: string;
  occurredAt?: string;
  occurredAtPrecision: string;
  media: ShareSnapshotMedia[];
  origin: ShareSnapshotOrigin;
};

export type ShareStatus = 'active' | 'revoked';

export type ShareRecord = {
  shareId: string;
  familyId: string;
  authorUserId: string;
  sourceMomentId: string;
  sourceRevision: number;
  snapshot: ShareSnapshot;
  audienceUserIds: string[];
  sharedAt: string;
  status: ShareStatus;
  revokedAt?: string;
};

export type RevokeShareResult = {
  shareId: string;
  revoked: true;
  revokedAt: string;
};

export type ShareView = {
  shareId: string;
  familyId: string;
  authorUserId: string;
  sourceMomentId: string;
  sourceRevision: number;
  snapshot: ShareSnapshot;
  audienceUserIds: string[];
  sharedAt: string;
  stored: 'server';
};

export type ShareMediaView = {
  objectId: string;
  mimeType: string;
  byteLength: number;
  contentSha256: string;
};

export type ShareMomentInput = {
  sourceMomentId: string;
  sourceRevision: number;
  note: string;
  emotion: string;
  occurredAt?: string;
  occurredAtPrecision: string;
  mediaObjectIds: string[];
  expectedMediaCount: number;
  idempotencyKey?: string;
};

export type InvitationView = {
  invitationId: string;
  familyId: string;
  code: string;
  status: InvitationStatus;
  expiresAt: string;
};

export type AppleIdentity = {
  appleSubject: string;
  email?: string;
};

export interface AppleVerifier {
  verifyIdentityToken(identityToken: string): Promise<AppleIdentity>;
}

export type FamilyClock = {
  now: () => Date;
};

export type FamilyIds = {
  userId: () => string;
  familyId: () => string;
  membershipId: () => string;
  invitationId: () => string;
  invitationCode: () => string;
  sessionToken: () => string;
};
