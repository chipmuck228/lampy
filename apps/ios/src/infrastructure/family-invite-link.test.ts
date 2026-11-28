import {
  currentFamilyInvite,
  forgetFamilyInvite,
  invitationOrigin,
  makeFamilyInviteLink,
  parseFamilyInviteLink,
  rememberFamilyInvite,
} from "./family-invite-link";
const token = "a".repeat(64);
it("accepts only configured origins, exact paths and fragment tokens; rejects queries and lookalikes", () => {
  expect(makeFamilyInviteLink("https://lampy-api.5sparks.ai", token)).toBe(
    `https://lampy-api.5sparks.ai/invite#${token}`,
  );
  expect(
    parseFamilyInviteLink(
      `https://lampy-api.5sparks.ai/invite#${token}`,
      "https://lampy-api.5sparks.ai",
    ),
  ).toBe(token);
  expect(parseFamilyInviteLink(`lampy:///family-invite#${token}`)).toBe(token);
  for (const url of [
    `https://evil.example/invite#${token}`,
    `https://family-test.yunpura.com/invite#${token}`,
    `https://lampy-family-api.5sparks.ai/invite#${token}`,
    `https://lampy-family-staging.onrender.com/invite#${token}`,
    `https://lampy-api.5sparks.ai.evil.test/invite#${token}`,
    `https://u:p@lampy-api.5sparks.ai/invite#${token}`,
    `https://lampy-api.5sparks.ai/invite?token=${token}`,
    `https://lampy-api.5sparks.ai/invite/other#${token}`,
    `lampy://evil/family-invite#${token}`,
  ])
    expect(parseFamilyInviteLink(url, "https://lampy-api.5sparks.ai")).toBeNull();
  expect(invitationOrigin("http://public.example")).toBeNull();
  expect(invitationOrigin("https://u:p@lampy-api.5sparks.ai")).toBeNull();
});
it("late cancellation cannot discard a new invite; bearer only lives in process memory", () => {
  const old = rememberFamilyInvite(token);
  const next = rememberFamilyInvite("b".repeat(64));
  forgetFamilyInvite(old.generation);
  expect(currentFamilyInvite()).toEqual(next);
  forgetFamilyInvite(next.generation);
  expect(currentFamilyInvite()).toBeNull();
});

it('rejects a clipboard containing two concatenated links instead of silently choosing one', () => {
  const link = makeFamilyInviteLink('http://127.0.0.1:8787', token);
  expect(parseFamilyInviteLink(link + link, 'http://127.0.0.1:8787')).toBeNull();
});
