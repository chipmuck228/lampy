# E1 verification

## Automated evidence

Server tests use temporary real SQLite: explicit multi-family leave, persistence after reopen, creator/self/unauthorized restrictions, repeat requests, fresh invitation rejoin, old membership request rejection, and history/media denial.

Application tests cover scoped cache cleanup, another-family/personal-record preservation, account-bound confirmation, late history list after leave, and successful-directory-only cache reconciliation. Persistent cache family discovery is checked after SQLite reopen.

Component tests cover explicit confirmation, creator/member actions, unmount/background stale confirmation, repeated submit, failed read/retry, protection hiding, and lost membership refresh.

Actual command results will be recorded at implementation closeout. Automated tests are not simulator or device PASS.

## Two-simulator walkthrough — NOT VERIFIED

Use two different controlled accounts A (creator) and B (member), and at least two families. Preserve current data. Record git SHA, device UUID/OS and Metro cwd.

1. B selects A's family → 家庭成员 → 离开家庭. Cancel changes nothing. Confirm removes only this family; B's other family and personal text/photo/audio remain.
2. Refresh A: member count/roster excludes B; previously shared moments remain readable by A.
3. B tries the old family record route and cached sound: cannot read/play; old used invite cannot rejoin. A issues a fresh invite, B joins explicitly, and active historical shares are readable again.
4. A opens 家庭成员 and removes B explicitly. Cancel preserves membership. B refreshes/reenters and loses this family's access; other-family data remains intact.
5. After B rejoins, an old leave/remove confirmation must not affect the new membership. Repeat taps must not issue duplicate mutations.
6. Stop API: failed roster/mutation shows retry, not fake success or an empty family list. Restart and reread actual state, especially when a mutation response was lost.
7. Open confirmation, then change selected card / background / lock / account: no late action may apply the old intent. With protection enabled, names/roster/content stay concealed during authentication.
8. English and Chinese, short viewport, landscape/iPad and system VoiceOver: labels, confirmation, scrolling and controls accessible. No system Dynamic Type reflow claim (fixed-font policy).

Simulator and real-device operation: NOT VERIFIED. No TestFlight upload or production work performed.

## Implementation closeout

- `npx tsc --noEmit`: PASS.
- Changed-source ESLint: PASS, 0 errors / 0 warnings.
- Targeted Jest: 13 suites / 113 tests PASS.
- Full Jest: 208 suites / 1140 tests passed; 2 suites / 2 tests failed. This is NOT full PASS.
- Clean base checkout `38307a8`, same dependencies: `life-page.test.ts` and `life-album-detail-sheet.test.tsx` reproduce the same 2 failures (8 other tests passed). They are baseline navigation/album-label assertions, not E1 failures.
- `git diff --check`: PASS.
- No new schema migration, dependencies or default feature flags.
- Simulator / real device / VoiceOver: NOT VERIFIED. No production or TestFlight actions.
