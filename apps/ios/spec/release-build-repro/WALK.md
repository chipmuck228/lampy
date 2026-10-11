# Final release compatibility review

## Final pre-merge review — 2026-10-11 (Asia/Shanghai)

Reviewed implementation heads: #87 ce1a3f974cdf9afaf65d5f414570089f277bfd3e;
#105 3e7c56c9d03028ff1491f636a4f17196f4e3b180; main
708fb8c7375e299b1df25adab789594a1420ca58. Both PRs OPEN, MERGEABLE,
Bugbot SUCCESS, no inline review threads at review time. Local two-PR merge
completed without conflict. No new source blocker found; no PR merge/upload.

Checks actually rerun on combined tree: Node build tools 10/10 PASS;
TypeScript PASS; targeted Jest 7 suites / 74 tests PASS; changed source/script
ESLint PASS; shell syntax and git diff --check PASS. Expo public config
with internal Build 7 evaluated 0.1.0 (7), approved HTTPS API and both
invite-link/native-compat plugins. No whole-App test rerun; prior full-suite
failure history remains in #105 WALK. Linux checks are not CocoaPods/Xcode acceptance.

Physical-device evidence (user report): iPhone 17 Pro, iOS 26.2, Release
0.1.0 (7), clean worktree, runtime Git SHA
40fae1e4d0da88b15776289a79762b4f64747f09. Cold launch from Home without
Metro, Face ID background-return protection, and inline Settings nickname
save / confirmed sign-out / sign-in passed. Earlier eight-item acceptance
also passed by user report, but its individual running SHA was not supplied.
The reported Xcode-attached startup stall disappeared after stopping Xcode;
standalone cold launch/protection passed. Cause not diagnosed; no startup edit.

Runtime commit is local and not available from GitHub (422 commit not found).
Its parents/tree cannot be independently bound to the reviewed heads here.
Expected locally merged source tree before these docs-only updates:
21ac07dcc71e9d0e651c48be1e9e7bb0fcac9ae6. User can compare with
`git rev-parse '40fae1e4^{tree}'`; until matched, device evidence remains
user-reported integration evidence, not verified exact-head acceptance.

Still NOT VERIFIED: real Archive/codesign inspection, TestFlight installation,
system VoiceOver, AASA/Universal Link OS routing (distinct from manually
pasting an invite), server revoked/disabled-session UI. No public registration,
paid functionality or broader distribution approval implied.
