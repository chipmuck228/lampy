import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createFamilyCommands } from "./commands";
import { createMapAppleVerifier } from "./apple";
import { openFamilySqliteDatabase } from "./node-db";
import { applyFamilyApiSchema } from "./schema";
import { createSqliteFamilyRepository } from "./sqlite-repository";
const apple = createMapAppleVerifier({
  a: { appleSubject: "a" },
  b: { appleSubject: "b" },
  c: { appleSubject: "c" },
});
async function setup(
  work: (s: Awaited<ReturnType<typeof open>>, file: string) => Promise<void>,
) {
  const dir = await mkdtemp(path.join(tmpdir(), "lampy-links-"));
  const file = path.join(dir, "f.db");
  const s = await open(file);
  try {
    await work(s, file);
  } finally {
    await s.db.close();
    await rm(dir, { recursive: true, force: true });
  }
}
async function open(file: string, enabled = true) {
  const db = openFamilySqliteDatabase(file);
  await applyFamilyApiSchema(db);
  let now = new Date("2026-10-08T00:00:00Z");
  const commands = createFamilyCommands({
    repository: createSqliteFamilyRepository(db),
    apple,
    inviteLinksEnabled: enabled,
    clock: { now: () => now },
  });
  const a = await commands.signInWithApple("a"),
    b = await commands.signInWithApple("b"),
    c = await commands.signInWithApple("c");
  const f = await commands.createNamedFamily(a.sessionToken, "Home", "home");
  return {
    db,
    commands,
    a,
    b,
    c,
    f,
    advance: (n: number) => {
      now = new Date(now.getTime() + n);
    },
  };
}
it("is closed by default and leaves Apple and families usable", async () =>
  setup(async (s) => {
    const closed = createFamilyCommands({
      repository: createSqliteFamilyRepository(s.db),
      apple,
    });
    await expect(
      closed.createInviteLink(s.a.sessionToken, s.f.familyId),
    ).rejects.toMatchObject({ code: "INVITE_LINKS_CLOSED" });
    expect((await closed.listFamilies(s.a.sessionToken)).families).toHaveLength(
      1,
    );
  }));
it("persists only a hash, fixed seven days; viewing and failed login consume nothing", async () =>
  setup(async (s, file) => {
    const i = await s.commands.createInviteLink(s.a.sessionToken, s.f.familyId);
    expect(i.token).toMatch(/^[a-f0-9]{64}$/);
    expect(Date.parse(i.expiresAt) - Date.parse("2026-10-08T00:00:00Z")).toBe(
      7 * 86400000,
    );
    expect(await s.commands.previewInviteLink(i.token, "peer")).toEqual({
      name: "Home",
      status: "pending",
      expiresAt: i.expiresAt,
    });
    await expect(
      s.commands.acceptInviteLink("", i.token),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect((await s.commands.previewInviteLink(i.token, "peer")).status).toBe(
      "pending",
    );
    const row = await s.db.getFirst<{ token_hash: string }>(
      "SELECT * FROM family_invite_links",
    );
    expect(JSON.stringify(row)).not.toContain(i.token);
    expect(
      JSON.stringify(await s.db.getAll("SELECT * FROM family_idempotency")),
    ).not.toContain(i.token);
    await s.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    expect((await readFile(file)).includes(Buffer.from(i.token))).toBe(false);
  }));
it("only creators create/list/revoke; public preview has no people, shares or identity", async () =>
  setup(async (s) => {
    const i = await s.commands.createInviteLink(s.a.sessionToken, s.f.familyId);
    await expect(
      s.commands.createInviteLink(s.b.sessionToken, s.f.familyId),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      s.commands.listInviteLinks(s.b.sessionToken, s.f.familyId),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      s.commands.revokeInviteLink(s.b.sessionToken, i.invitationId),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(
      Object.keys(await s.commands.previewInviteLink(i.token, "peer")).sort(),
    ).toEqual(["expiresAt", "name", "status"]);
    expect(
      JSON.stringify(
        await s.commands.listInviteLinks(s.a.sessionToken, s.f.familyId),
      ),
    ).not.toContain(i.token);
  }));
it("two real database connections compete for one slot; retry across sessions is idempotent", async () =>
  setup(async (s, file) => {
    const i = await s.commands.createInviteLink(s.a.sessionToken, s.f.familyId);
    const db2 = openFamilySqliteDatabase(file);
    const other = createFamilyCommands({
      repository: createSqliteFamilyRepository(db2),
      apple,
      inviteLinksEnabled: true,
      clock: { now: () => new Date("2026-10-08T00:00:00Z") },
    });
    try {
      const results = await Promise.allSettled([
        s.commands.acceptInviteLink(s.b.sessionToken, i.token),
        other.acceptInviteLink(s.c.sessionToken, i.token),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
      expect(
        (results.find((r) => r.status === "rejected") as PromiseRejectedResult)
          .reason.code,
      ).toBe("INVITE_ALREADY_USED");
      const winner = results[0].status === "fulfilled" ? s.b : s.c;
      const identity = winner === s.b ? "b" : "c";
      const session = await other.signInWithApple(identity);
      expect(
        (await other.acceptInviteLink(session.sessionToken, i.token)).familyId,
      ).toBe(s.f.familyId);
      expect(
        await s.db.getAll(
          "SELECT * FROM family_memberships WHERE family_id=? AND status='active'",
          [s.f.familyId],
        ),
      ).toHaveLength(2);
    } finally {
      await db2.close();
    }
  }));
it("current members do not consume the slot; used token cannot rejoin after leave or removal", async () =>
  setup(async (s) => {
    const i = await s.commands.createInviteLink(s.a.sessionToken, s.f.familyId);
    await s.commands.acceptInviteLink(s.a.sessionToken, i.token);
    expect((await s.commands.previewInviteLink(i.token, "peer")).status).toBe(
      "pending",
    );
    await s.commands.acceptInviteLink(s.b.sessionToken, i.token);
    await s.commands.leaveFamily(s.b.sessionToken);
    await expect(
      s.commands.acceptInviteLink(s.b.sessionToken, i.token),
    ).rejects.toMatchObject({ code: "INVITE_ALREADY_USED" });
    const fresh = await s.commands.createInviteLink(
      s.a.sessionToken,
      s.f.familyId,
    );
    await s.commands.acceptInviteLink(s.b.sessionToken, fresh.token);
    await s.commands.removeMember(s.a.sessionToken, s.f.familyId, s.b.userId);
    await expect(
      s.commands.acceptInviteLink(s.b.sessionToken, fresh.token),
    ).rejects.toMatchObject({ code: "INVITE_ALREADY_USED" });
  }));
it("limit failures leave invitation available; revoked/expired/dissolved do not add anyone", async () =>
  setup(async (s) => {
    for (let n = 0; n < 10; n++)
      await s.commands.createNamedFamily(s.b.sessionToken, `B${n}`, `b${n}`);
    const i = await s.commands.createInviteLink(s.a.sessionToken, s.f.familyId);
    await expect(
      s.commands.acceptInviteLink(s.b.sessionToken, i.token),
    ).rejects.toMatchObject({ code: "FAMILY_LIMIT_REACHED" });
    expect((await s.commands.previewInviteLink(i.token, "peer")).status).toBe(
      "pending",
    );
    await s.commands.revokeInviteLink(s.a.sessionToken, i.invitationId);
    await expect(
      s.commands.acceptInviteLink(s.c.sessionToken, i.token),
    ).rejects.toMatchObject({ code: "INVITE_REVOKED" });
    const expired = await s.commands.createInviteLink(
      s.a.sessionToken,
      s.f.familyId,
    );
    s.advance(7 * 86400000);
    await expect(
      s.commands.acceptInviteLink(s.c.sessionToken, expired.token),
    ).rejects.toMatchObject({ code: "INVITE_EXPIRED" });
    const dissolved = await s.commands.createInviteLink(
      s.a.sessionToken,
      s.f.familyId,
    );
    await s.commands.dissolveFamily(s.a.sessionToken, s.f.familyId);
    await expect(
      s.commands.acceptInviteLink(s.c.sessionToken, dissolved.token),
    ).rejects.toMatchObject({ code: "FAMILY_DISSOLVED" });
  }));
it("failed preview limits persist across reopening SQLite", async () =>
  setup(async (s, file) => {
    for (let n = 0; n < 40; n++)
      await expect(
        s.commands.previewInviteLink("bad", "peer"),
      ).rejects.toMatchObject({ code: "INVITE_NOT_FOUND" });
    const other = await open(file);
    try {
      await expect(
        other.commands.previewInviteLink("bad", "peer"),
      ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    } finally {
      await other.db.close();
    }
  }));
