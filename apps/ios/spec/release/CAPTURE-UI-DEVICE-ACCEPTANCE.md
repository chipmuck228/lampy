# Capture visual refinement acceptance

2026-11-25 · PR #144 · release/album-export-polish

The user reported the personal album overview at f74c699 passed iPhone acceptance. This update implements the accepted Capture visual proof only. It does not change capture/save, permissions, draft recovery/abandonment, recording, emotion/date choices, navigation or the three-photo limit.

## Presentation

- Existing warm paper and system type remain. The borderless note uses 18pt fixed-size text and a modest 112pt minimum height; it still grows with content and does not create the proof image's excessive blank area.
- A thin back chevron accompanies the existing return label. Restored-draft and abandon text keep their positions and confirmation behavior, with quieter typography.
- Capture photos use two-column, gently rounded thumbnail frames. Contain fitting keeps the entire image visible; original files are untouched. Available thumbnails have an overlaid remove icon with the original accessible label and 44pt hit area. Unavailable images retain their full explanation and text remove action below it.
- The recording presentation has calmer spacing and stable tabular elapsed digits. Start/stop, play/pause, rerecord/remove and all failure states remain unchanged. No synthetic waveform or new animation is introduced.
- Feeling/date controls use subtle sage selection rather than the black outline/underline treatment. Their default expansion, clear, unknown-date and calendar behaviors remain unchanged. Chinese feeling options form compact rows; English can wrap naturally.
- Camera/library stay at the left of the existing bottom band; Capture gains a light sage rounded background. Existing narrow-screen stacked mode, keyboard handling, safe-area padding and error/confirmation copy remain.
- Shared controls use an opt-in Capture appearance. Their existing presentation remains the default elsewhere. No new native source, dependency, font asset, translation or StoreKit configuration is added.

## Verification

- 19 relevant Jest suites / 90 tests passed, covering Capture, restored drafts, audio/voice intent, photos/limits, emotion/date, feedback/recovery, navigation/fixed type, shared photo/audio rendering and the album overview.
- TypeScript and diff checks pass. ESLint: zero errors, three pre-existing Hooks warnings in leave.tsx, verified against the branch's prior source; no new warnings.
- AST comparison confirms all 44 JSX event bindings across the touched UI components are unchanged.
- iPhone visual/keyboard appearance for this update remains pending. No device screenshot or native execution is claimed.

## Device checklist

Pull release/album-export-polish and open apps/ios/ios/Lampy.xcworkspace, then build/run with the existing signing/StoreKit settings. No Pod install or native regeneration is required for this update. Keep the existing app and its data.

1. Inspect an empty Capture page and a restored draft: refined system typography, no oversized blank gap, same return/restored/abandon controls and confirmation.
2. Add one/two/three photos, including portrait or long images. Confirm thumbnails show complete images, remove hits work, and the three-photo limit and camera/library permissions behave as before. Unavailable-media explanation must remain readable.
3. Type a long note, show/hide the keyboard, rotate the device and test a narrow screen. Capture and feedback remain accessible; scroll and text growth still work. Check English labels as well as Chinese.
4. Record, stop, play, pause, rerecord and remove audio. Check current duration limits and failure messages. Choose/clear a feeling and expand/collapse it. Choose today, an earlier date and unknown date using the same controls.
5. Save and return to Recent; restore a draft and confirm explicit abandonment. Existing records and files must remain intact. Revisit/photo/audio detail views retain their prior shared-control appearance.
