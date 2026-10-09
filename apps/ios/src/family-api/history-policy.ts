import { FamilyError, FAMILY_ERROR } from './errors';
import type { FamilyTx } from './repository';
import type { FamilyHistoryPolicy } from './types';

export const HISTORY_CONFIRMATION = 'new-members-can-read-active-history';
export function assertHistoryEnabled(enabled: boolean) {
  if (!enabled) throw new FamilyError('FAMILY_HISTORY_CLOSED', 'Family history sharing is not available yet.');
}
export async function requireFamilyReadPolicy(tx: FamilyTx, familyId: string, policy: FamilyHistoryPolicy) {
  const family = await tx.findFamily(familyId);
  if (!family || family.status !== 'active') throw new FamilyError(FAMILY_ERROR.NOT_IN_FAMILY, 'This family is unavailable.');
  if ((family.historyPolicy ?? 'legacy') !== policy) {
    throw new FamilyError('FAMILY_POLICY_UPGRADE_REQUIRED', 'Use the matching family sharing version.');
  }
  return family;
}
