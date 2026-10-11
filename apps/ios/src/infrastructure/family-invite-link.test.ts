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
  expect(makeFamilyInviteLink("https://family.yunpura.com", token)).toBe(
    `https://family.yunpura.com/invite#${token}`,
  );
  expect(
    parseFamilyInviteLink(
      `https://family.yunpura.com/invite#${token}`,
      "https://family.yunpura.com",
    ),
  ).toBe(token);
  expect(parseFamilyInviteLink(`lampy:///family-invite#${token}`)).toBe(token);
  for (const url of [
    `https://evil.example/invite#${token}`,
    `https://family.yunpura.com/invite?token=${token}`,
    `https://family.yunpura.com/invite/other#${token}`,
    `lampy://evil/family-invite#${token}`,
  ])
    expect(parseFamilyInviteLink(url, "https://family.yunpura.com")).toBeNull();
  expect(invitationOrigin("http://public.example")).toBeNull();
  expect(invitationOrigin("https://u:p@family.yunpura.com")).toBeNull();
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
