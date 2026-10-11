import { request as httpRequest } from "node:http";
import { startFamilyApiServer } from "./listen";
import { inviteAssociation, inviteWebJs } from "./invite-web";
async function request(
  port: number,
  path: string,
  method = "GET",
  body?: unknown,
  token?: string,
  key?: string,
) {
  return new Promise<{
    status: number;
    headers: import("node:http").IncomingHttpHeaders;
    text: string;
  }>((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(key ? { "idempotency-key": key } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(Buffer.from(c)));
        res.on("end", () =>
          resolve({
            status: res.statusCode!,
            headers: res.headers,
            text: Buffer.concat(chunks).toString(),
          }),
        );
      },
    );
    req.on("error", reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
}
it("serves a no-store external invite page, real QR, explicit join, and never counts a web view", async () => {
  const s = await startFamilyApiServer({
    port: 0,
    host: "127.0.0.1",
    env: {
      LAMPY_FAMILY_API_MODE: "test",
      LAMPY_FAMILY_API_TEST_TOKENS: "a:apple.a,b:apple.b",
      LAMPY_FAMILY_INVITES_ENABLED: "1",
      LAMPY_FAMILY_INVITE_ORIGIN: "http://127.0.0.1:8787",
    },
  });
  try {
    const a = JSON.parse(
      (await request(s.port, "/v1/auth/apple", "POST", { identityToken: "a" }))
        .text,
    );
    const b = JSON.parse(
      (await request(s.port, "/v1/auth/apple", "POST", { identityToken: "b" }))
        .text,
    );
    const f = JSON.parse(
      (
        await request(
          s.port,
          "/v2/families",
          "POST",
          { name: "Home" },
          a.sessionToken,
          "home",
        )
      ).text,
    );
    const i = JSON.parse(
      (
        await request(
          s.port,
          `/v2/families/${f.familyId}/invitations`,
          "POST",
          {},
          a.sessionToken,
        )
      ).text,
    );
    expect(i.link).toBe(`http://127.0.0.1:8787/invite#${i.token}`);
    expect(i.qr).toMatch(/^data:image\/png;base64,/);
    const page = await request(s.port, "/invite");
    expect(page.status).toBe(200);
    expect(page.headers["cache-control"]).toBe("no-store");
    expect(page.headers["referrer-policy"]).toBe("no-referrer");
    expect(page.text).not.toContain(i.token);
    const preview = await request(s.port, "/v2/invitations/preview", "POST", {
      token: i.token,
    });
    expect(JSON.parse(preview.text).status).toBe("pending");
    const before = JSON.parse(
      (
        await request(
          s.port,
          "/v2/me/families",
          "GET",
          undefined,
          b.sessionToken,
        )
      ).text,
    );
    expect(before.families).toHaveLength(0);
    const join = await request(
      s.port,
      "/v2/invitations/accept",
      "POST",
      { token: i.token },
      b.sessionToken,
    );
    expect(join.status).toBe(200);
    expect(
      (
        await request(
          s.port,
          "/v2/invitations/accept",
          "POST",
          { token: i.token },
          b.sessionToken,
        )
      ).status,
    ).toBe(200);
  } finally {
    await s.close();
  }
});
it("does not invent a download URL and configures AASA only for safe HTTPS", () => {
  expect(inviteWebJs("https://evil.example")).not.toContain("evil.example");
  expect(inviteWebJs()).toContain('const download=""');
  expect(inviteAssociation("http://127.0.0.1")).toBeNull();
  expect(
    inviteAssociation("https://family.yunpura.com")?.applinks.details[0].appIDs,
  ).toEqual(["B283NY984J.app.lampy.ios"]);
});
it("disabled service never enables public invite pages", async () => {
  const s = await startFamilyApiServer({
    port: 0,
    host: "127.0.0.1",
    env: {
      LAMPY_FAMILY_API_MODE: "test",
      LAMPY_FAMILY_API_TEST_TOKENS: "a:apple.a",
    },
  });
  try {
    expect((await request(s.port, "/invite")).status).not.toBe(200);
    expect(
      (
        await request(s.port, "/v2/invitations/preview", "POST", {
          token: "a".repeat(64),
        })
      ).status,
    ).toBe(503);
  } finally {
    await s.close();
  }
});
