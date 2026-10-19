export const REPORT_REASONS = ['inappropriate', 'harassment', 'privacy', 'other'] as const;
export type ReportReason = typeof REPORT_REASONS[number];
export type SafetyReport = {
  reportId: string; reporterUserId: string; authorUserId: string; familyId: string;
  shareId: string; reason: ReportReason; detail: string; createdAt: string;
  status: 'pending' | 'reviewed' | 'restricted';
};
export type ReportReceipt = Pick<SafetyReport, 'reportId' | 'reason' | 'createdAt' | 'status'>;
export type UserBlock = { userId: string; targetUserId: string; createdAt: string };
export type ModerationRecord = {
  shareId: string; hidden: boolean; operator: string; reason: string; updatedAt: string;
};
export type SharingRestriction = { userId: string; restricted: boolean; operator: string; reason: string; updatedAt: string };
export type SafetyTx = {
  findSharingRestriction(userId: string): Promise<SharingRestriction | null>;
  saveSharingRestriction(row: SharingRestriction): Promise<void>;
  listHiddenShares(familyId: string): Promise<string[]>;
  listSafetyReports(userId?: string): Promise<SafetyReport[]>;
  findSafetyReport(id: string): Promise<SafetyReport | null>;
  saveSafetyReport(report: SafetyReport): Promise<void>;
  listUserBlocks(userId: string): Promise<UserBlock[]>;
  saveUserBlock(block: UserBlock): Promise<void>;
  deleteUserBlock(userId: string, targetUserId: string): Promise<void>;
  findModeration(shareId: string): Promise<ModerationRecord | null>;
  saveModeration(row: ModerationRecord): Promise<void>;
};
export type FamilySafetyApi = {
  report(session: string, familyId: string, shareId: string, input: { requestId: string; reason: ReportReason; detail: string }): Promise<ReportReceipt>;
  reports(session: string): Promise<{ reports: ReportReceipt[]; sharingRestricted?: boolean; restrictedShares?: string[] }>;
  blocks(session: string): Promise<{ blocks: (UserBlock & { nickname: string })[] }>;
  block(session: string, familyId: string, targetUserId: string): Promise<{ blocked: true }>;
  unblock(session: string, targetUserId: string): Promise<{ blocked: false }>;
};
