import {
  createFamilyUseCases,
  createMemoryFamilySessionStore,
} from "./family-use-cases";
import { createFamilyApiClient } from "../infrastructure/family-http-client";
import { createPendingFamilyOperationStore } from "../infrastructure/pending-family-operations";
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
async function setup(
  request: Parameters<typeof createFamilyApiClient>[0]["request"],
) {
  const session = createMemoryFamilySessionStore();
  await session.setSession({ userId: "a", sessionToken: "s-a" });
  const u = createFamilyUseCases({
    session,
    client: createFamilyApiClient({ request }),
    pending: createPendingFamilyOperationStore({
      read: () => [],
      write: () => undefined,
    }),
  });
  return { u, session };
}
it("never sends an acceptance after leaving/locking or an account switch", async () => {
  const request = jest.fn();
  const { u, session } = await setup(request);
  await expect(u.acceptInviteLink("t", "a", () => false)).rejects.toMatchObject(
    { code: "STALE_FAMILY_REQUEST" },
  );
  expect(request).not.toHaveBeenCalled();
  await session.setSession({ userId: "b", sessionToken: "s-b" });
  await expect(u.acceptInviteLink("t", "a", () => true)).rejects.toMatchObject({
    code: "STALE_FAMILY_REQUEST",
  });
  expect(request).not.toHaveBeenCalled();
});
it("rejects a late successful acceptance for a different account", async () => {
  const d = deferred<{ status: number; body: unknown }>();
  const request = jest.fn(() => d.promise);
  const { u, session } = await setup(request);
  const work = u.acceptInviteLink("t", "a", () => true);
  for (let n = 0; n < 10 && !request.mock.calls.length; n++)
    await Promise.resolve();
  expect(request).toHaveBeenCalledTimes(1);
  await session.setSession({ userId: "b", sessionToken: "s-b" });
  d.resolve({
    status: 200,
    body: { familyId: "f", name: "Home", role: "member", memberCount: 2 },
  });
  await expect(work).rejects.toMatchObject({ code: "STALE_FAMILY_REQUEST" });
});
