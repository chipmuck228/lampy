import { createHash, randomBytes } from "node:crypto";
import { FamilyError, FAMILY_ERROR } from "./errors";
import type { FamilyRepository, FamilyTx } from "./repository";
import type {
  FamilyClock,
  FamilyIds,
  InviteLink,
  InviteLinkView,
  CreatedInviteLink,
  InvitePreview,
  FamilySummary,
} from "./types";
export type InviteLinkCommands = {
  createInviteLink(
    session: string,
    familyId: string,
  ): Promise<CreatedInviteLink>;
  listInviteLinks(session: string, familyId: string): Promise<InviteLinkView[]>;
  revokeInviteLink(session: string, id: string): Promise<InviteLinkView>;
  previewInviteLink(token: string, peer: string): Promise<InvitePreview>;
  acceptInviteLink(session: string, token: string): Promise<FamilySummary>;
};
const digest = (v: string) => createHash("sha256").update(v).digest("hex");
const view = (i: InviteLink): InviteLinkView => ({
  invitationId: i.invitationId,
  familyId: i.familyId,
  status: i.status,
  expiresAt: i.expiresAt,
});
function tokenHash(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new FamilyError(
      FAMILY_ERROR.INVITE_NOT_FOUND,
      "Invitation is unavailable.",
    );
  return digest(token);
}
export function createInviteLinkCommands(d: {
  repository: FamilyRepository;
  clock: FamilyClock;
  ids: FamilyIds;
  enabled: boolean;
  withAuthedUser<T>(
    session: string,
    work: (tx: FamilyTx, userId: string) => Promise<T>,
  ): Promise<T>;
}): InviteLinkCommands {
  function enabled() {
    if (!d.enabled)
      throw new FamilyError(
        "INVITE_LINKS_CLOSED",
        "Invitations are not available yet.",
      );
  }
  // Independent commit: failed attempts count too. No bearer appears in rate buckets.
  async function rate(bucket: string, max: number) {
    const ok = await d.repository.withTransaction(async (tx) => {
      const now = d.clock.now();
      const p = await tx.findRateLimit(bucket);
      const row =
        !p || now.getTime() - Date.parse(p.windowStartedAt) >= 900000
          ? { bucket, windowStartedAt: now.toISOString(), hitCount: 0 }
          : p;
      if (row.hitCount >= max) return false;
      await tx.saveRateLimit({ ...row, hitCount: row.hitCount + 1 });
      return true;
    });
    if (!ok)
      throw new FamilyError(FAMILY_ERROR.RATE_LIMITED, "Try again later.");
  }
  async function accountBucket(session: string) {
    return d.repository.withTransaction(
      async (tx) =>
        (await tx.findSession(session))?.userId || "unauthenticated",
    );
  }
  async function creator(tx: FamilyTx, id: string, user: string) {
    if ((await tx.findFamily(id))?.status !== "active")
      throw new FamilyError(
        FAMILY_ERROR.FAMILY_DISSOLVED,
        "This family is unavailable.",
      );
    if ((await tx.findActiveMembership(id, user))?.role !== "creator")
      throw new FamilyError(
        FAMILY_ERROR.FORBIDDEN,
        "Only the creator can invite.",
      );
  }
  async function summary(
    tx: FamilyTx,
    id: string,
    user: string,
  ): Promise<FamilySummary> {
    const f = (await tx.findFamily(id))!;
    const m = (await tx.findActiveMembership(id, user))!;
    return {
      familyId: id,
      name: f.name || "",
      role: m.role,
      memberCount: (await tx.listActiveMembers(id)).length,
    };
  }
  const effective = (i: InviteLink): InviteLink =>
    i.status === "pending" && Date.parse(i.expiresAt) <= d.clock.now().getTime()
      ? { ...i, status: "expired" }
      : i;
  return {
    async createInviteLink(session, id) {
      enabled();
      await rate(`invite-create:${await accountBucket(session)}`, 8);
      return d.withAuthedUser(session, async (tx, user) => {
        await creator(tx, id, user);
        const token = randomBytes(32).toString("hex");
        const now = d.clock.now();
        const i: InviteLink = {
          invitationId: d.ids.invitationId(),
          familyId: id,
          tokenHash: tokenHash(token),
          status: "pending",
          createdAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + 7 * 86400000).toISOString(),
        };
        await tx.saveInviteLink(i);
        return { ...view(i), token };
      });
    },
    async listInviteLinks(session, id) {
      enabled();
      return d.withAuthedUser(session, async (tx, user) => {
        await creator(tx, id, user);
        return (await tx.listInviteLinks(id)).map((i) => view(effective(i)));
      });
    },
    async revokeInviteLink(session, id) {
      enabled();
      return d.withAuthedUser(session, async (tx, user) => {
        const i = await tx.findInviteLinkById(id);
        if (!i)
          throw new FamilyError(
            FAMILY_ERROR.INVITE_NOT_FOUND,
            "Invitation is unavailable.",
          );
        await creator(tx, i.familyId, user);
        const next = effective(i);
        if (next.status === "pending") next.status = "revoked";
        await tx.saveInviteLink(next);
        return view(next);
      });
    },
    async previewInviteLink(token, peer) {
      enabled();
      await rate(`invite-preview:${digest(peer)}`, 40);
      const hash = tokenHash(token);
      return d.repository.withTransaction(async (tx) => {
        const i = await tx.findInviteLinkByHash(hash);
        if (!i)
          throw new FamilyError(
            FAMILY_ERROR.INVITE_NOT_FOUND,
            "Invitation is unavailable.",
          );
        const f = await tx.findFamily(i.familyId);
        return {
          name: f?.name || "",
          expiresAt: i.expiresAt,
          status: f?.status === "active" ? effective(i).status : "dissolved",
        };
      });
    },
    async acceptInviteLink(session, token) {
      enabled();
      await rate(`invite-accept:${await accountBucket(session)}`, 20);
      const hash = tokenHash(token);
      return d.withAuthedUser(session, async (tx, user) => {
        const saved = await tx.findInviteLinkByHash(hash);
        if (!saved)
          throw new FamilyError(
            FAMILY_ERROR.INVITE_NOT_FOUND,
            "Invitation is unavailable.",
          );
        const i = effective(saved);
        if ((await tx.findFamily(i.familyId))?.status !== "active")
          throw new FamilyError(
            FAMILY_ERROR.FAMILY_DISSOLVED,
            "This family is unavailable.",
          );
        if (await tx.findActiveMembership(i.familyId, user))
          return summary(tx, i.familyId, user);
        if (i.status !== "pending")
          throw new FamilyError(
            i.status === "expired"
              ? FAMILY_ERROR.INVITE_EXPIRED
              : i.status === "revoked"
                ? FAMILY_ERROR.INVITE_REVOKED
                : FAMILY_ERROR.INVITE_ALREADY_USED,
            "Ask the creator for a new invitation.",
          );
        let count = 0;
        for (const m of await tx.findMembershipsForUser(user))
          if (
            m.status === "active" &&
            (await tx.findFamily(m.familyId))?.status === "active"
          )
            count++;
        if (count >= 10)
          throw new FamilyError(
            FAMILY_ERROR.FAMILY_LIMIT_REACHED,
            "You already belong to 10 families.",
          );
        await tx.saveMembership({
          membershipId: d.ids.membershipId(),
          familyId: i.familyId,
          userId: user,
          role: "member",
          status: "active",
          joinedAt: d.clock.now().toISOString(),
        });
        await tx.saveInviteLink({
          ...i,
          status: "accepted",
          acceptedByUserId: user,
        });
        return summary(tx, i.familyId, user);
      });
    },
  };
}
