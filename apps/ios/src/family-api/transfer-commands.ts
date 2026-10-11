import { FAMILY_ERROR, FamilyError } from './errors';
import type { FamilyTx } from './repository';
import type { FamilyClock, FamilyTransfer } from './types';

export function createFamilyTransferCommands(deps: {
  authed<T>(session: string, work: (tx: FamilyTx, userId: string) => Promise<T>): Promise<T>;
  clock: FamilyClock;
  id: () => string;
}) {
  function fail(code: string): never { throw new FamilyError(code, code); }

  async function member(tx: FamilyTx, familyId: string, userId: string) {
    const family = await tx.findFamily(familyId);
    if (!family || family.status !== 'active') fail(FAMILY_ERROR.FAMILY_DISSOLVED);
    const membership = await tx.findActiveMembership(familyId, userId);
    if (!membership) fail(FAMILY_ERROR.NOT_IN_FAMILY);
    return membership;
  }

  async function normalize(tx: FamilyTx, transfer: FamilyTransfer) {
    if (transfer.status !== 'pending') return transfer;
    const from = await tx.findActiveMembership(transfer.familyId, transfer.fromUserId);
    const to = await tx.findActiveMembership(transfer.familyId, transfer.toUserId);
    if (from?.membershipId !== transfer.fromMembershipId || from.role !== 'creator'
      || to?.membershipId !== transfer.toMembershipId || to.role !== 'member') {
      const invalid: FamilyTransfer = {
        ...transfer, status: 'invalid', revision: transfer.revision + 1,
        updatedAt: deps.clock.now().toISOString(),
      };
      await tx.saveTransfer(invalid);
      return invalid;
    }
    return transfer;
  }

  return {
    get(session: string, familyId: string) {
      return deps.authed(session, async (tx, userId) => {
        await member(tx, familyId, userId);
        const raw = (await tx.listTransfers(familyId)).find(t => t.status === 'pending');
        const transfer = raw ? await normalize(tx, raw) : null;
        return { transfer: transfer?.status === 'pending' ? transfer : null };
      });
    },

    create(session: string, familyId: string, input: {
      requestId: string; fromMembershipId: string; toMembershipId: string;
    }) {
      return deps.authed(session, async (tx, userId) => {
        const from = await member(tx, familyId, userId);
        if (!input.requestId || input.requestId.length > 100) fail(FAMILY_ERROR.BAD_REQUEST);
        const rows = await tx.listTransfers(familyId);
        const prior = rows.find(t => t.fromUserId === userId && t.requestId === input.requestId);
        if (prior) {
          if (prior.fromMembershipId !== input.fromMembershipId
            || prior.toMembershipId !== input.toMembershipId) fail(FAMILY_ERROR.CONFLICT);
          return normalize(tx, prior);
        }
        if (from.role !== 'creator' || from.membershipId !== input.fromMembershipId) fail(FAMILY_ERROR.FORBIDDEN);
        const to = (await tx.listActiveMembers(familyId)).find(m => m.membershipId === input.toMembershipId);
        if (!to || to.role !== 'member' || to.userId === userId) fail(FAMILY_ERROR.MEMBER_NOT_FOUND);
        for (const transfer of rows.filter(t => t.status === 'pending')) {
          if ((await normalize(tx, transfer)).status === 'pending') fail(FAMILY_ERROR.CONFLICT);
        }
        const now = deps.clock.now().toISOString();
        const transfer: FamilyTransfer = {
          transferId: deps.id(), familyId, requestId: input.requestId,
          fromUserId: userId, toUserId: to.userId,
          fromMembershipId: from.membershipId, toMembershipId: to.membershipId,
          status: 'pending', revision: 1, createdAt: now, updatedAt: now,
        };
        await tx.saveTransfer(transfer);
        return transfer;
      });
    },

    respond(session: string, familyId: string, transferId: string, revision: number, action: 'accept' | 'cancel') {
      return deps.authed(session, async (tx, userId) => {
        await member(tx, familyId, userId);
        const raw = (await tx.listTransfers(familyId)).find(t => t.transferId === transferId);
        if (!raw) fail(FAMILY_ERROR.CONFLICT);
        const transfer = await normalize(tx, raw);
        if (action === 'accept' ? userId !== transfer.toUserId : userId !== transfer.fromUserId) fail(FAMILY_ERROR.FORBIDDEN);
        const completed = action === 'accept' ? 'accepted' : 'cancelled';
        // A lost response can be retried; a receipt never reapplies the role swap.
        if (transfer.status === completed) return transfer;
        if (transfer.status !== 'pending' || transfer.revision !== revision) fail(FAMILY_ERROR.CONFLICT);
        if (action === 'accept') {
          const from = await member(tx, familyId, transfer.fromUserId);
          const to = await member(tx, familyId, transfer.toUserId);
          // Demote first for the one-active-creator index. Any subsequent failure rolls back the transaction.
          await tx.saveMembership({ ...from, role: 'member' });
          await tx.saveMembership({ ...to, role: 'creator' });
          for (const invite of await tx.listInviteLinks(familyId)) {
            if (invite.status === 'pending') await tx.saveInviteLink({ ...invite, status: 'revoked' });
          }
          for (const invite of await tx.listPendingInvitations(familyId)) {
            await tx.saveInvitation({ ...invite, status: 'revoked' });
          }
        }
        const result: FamilyTransfer = {
          ...transfer, status: completed, revision: transfer.revision + 1,
          updatedAt: deps.clock.now().toISOString(),
        };
        await tx.saveTransfer(result);
        return result;
      });
    },
  };
}
