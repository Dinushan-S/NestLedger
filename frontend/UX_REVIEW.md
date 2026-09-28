# NestLedger frontend UX and implementation review

Review date: 2026-09-23; implementation status updated 2026-09-28

Scope: login, adding expenses, receipt scanning, dashboard, and settings.

Method: independent Impeccable UX assessment and implementation assessment using relevant [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md). Browser-only rules were excluded for this Expo/React Native application.

Status: code changes for all 21 findings are implemented. Local checks passed; native device verification remains outstanding. Password recovery uses OTP and has no redirect URL dependency.

The findings and scores below record the original review, not current open defects. Locations refer to source at review time. Paths are relative to `frontend/`; line numbers may shift after changes.

## Findings ranked by user impact

P1 = high impact; P2 = significant usability/accessibility issue; P3 = minor clarity issue. Overlapping findings from the two assessments are combined.

| # | Priority | Finding and user impact | Location | Recommended change |
|---|---|---|---|---|
| 1 | P1 | **Failed expense saves discard entered work.** Add/edit clears the form before persistence completes. Failure rolls back the displayed expense but never restores the draft. | [NestLedgerApp.tsx](components/nestledger/NestLedgerApp.tsx):1299, 1362 | Preserve the draft and offer retry. |
| 2 | P1 | **Resolved: receipt amount editing.** The earlier controlled input converted every keystroke to a number and could remove a trailing decimal separator. The current input preserves typed text, including `12.50`. | [ReceiptScannerSheet.tsx](components/nestledger/ReceiptScannerSheet.tsx):185 | Done: preserve input text while editing. |
| 3 | P1 | **Resolved: incomplete item rows on save.** The earlier save paths could filter out invalid rows. Receipt confirmation and manual expense saving now identify incomplete rows and block submission with an error. | [NestLedgerApp.tsx](components/nestledger/NestLedgerApp.tsx):1237; [ReceiptScannerSheet.tsx](components/nestledger/ReceiptScannerSheet.tsx):230 | Done: require each row to be completed or removed. |
| 4 | P1 | **Receipt processing disclosure is incomplete.** Sending the image to the backend is required for the Gemini extraction feature, as confirmed in `backend/server.py:789–837`. The route decodes the image and passes it to Google Gemini; no raw-image persistence by NestLedger is visible in this route. The current “read on the device” message is inaccurate, and the published privacy policy's third-party list does not name Gemini. Gemini-side retention was not assessed. | [ReceiptScannerSheet.tsx](components/nestledger/ReceiptScannerSheet.tsx):390; [nestledger.ts](lib/nestledger.ts):871; [backend/server.py](../backend/server.py):789; [privacy.html](../backend/static/privacy.html):124 | Keep the backend flow; separately review accurate pre-scan and privacy-policy disclosure, including provider retention terms. |
| 5 | P1 | **Forgotten-password users have no recovery path.** Login offers sign-in/register only; no reset flow was found. | [NestLedgerApp.tsx](components/nestledger/NestLedgerApp.tsx):2038 | Add a password-recovery action and reset flow. |
| 6 | P1 | **Shared form labels are not explicitly associated with inputs.** Login/settings labels are separate text elements. Receipt numeric fields lack contextual accessible names. | [ProfileFormControls.tsx](components/nestledger/forms/ProfileFormControls.tsx):47; [ReceiptScannerSheet.tsx](components/nestledger/ReceiptScannerSheet.tsx):335 | Supply accessible input names, including item context for receipt fields. |
| 7 | P2 | **Resolved: outside tap on an edited expense.** The backdrop now asks whether to Keep editing or Discard when the expense has unsaved changes. This close action is separate from validation when saving incomplete rows (#3). | [BottomSheet.tsx](components/ui/BottomSheet.tsx):36; [NestLedgerApp.tsx](components/nestledger/NestLedgerApp.tsx):4716 | Done: confirm before discarding an edited draft. |
| 8 | P2 | **Several light-theme text combinations have insufficient contrast.** Receipt confidence/error text, secondary buttons, and selected settings labels are affected. See measurements below. | [ReceiptScannerSheet.tsx](components/nestledger/ReceiptScannerSheet.tsx):370; [ModernButton.tsx](components/ui/ModernButton.tsx):97; [ProfileSettingsModal.tsx](components/nestledger/settings/ProfileSettingsModal.tsx):501 | Adjust foreground/background combinations while preserving the palette identity. |
| 9 | P2 | **Important icon buttons lack accessible names.** Close settings, notifications, and remove-expense-item actions lack meaningful labels and button roles. | [ModalScaffold.tsx](components/ui/ModalScaffold.tsx):32; [NestLedgerApp.tsx](components/nestledger/NestLedgerApp.tsx):2345, 4760 | Add action-specific accessible labels and roles. |
| 10 | P2 | **Selection and loading feedback are mostly visual.** Chips/tabs/theme options omit selected-state semantics; Contributions lacks a switch label. Loading buttons replace their name with a spinner without an explicit accessible name/busy state. | [CategoryChip.tsx](components/ui/CategoryChip.tsx):15; [nestledger.ui.tsx](components/nestledger/nestledger.ui.tsx):148; [ProfileSettingsModal.tsx](components/nestledger/settings/ProfileSettingsModal.tsx):244; [ModernButton.tsx](components/ui/ModernButton.tsx):51 | Expose roles and states, label the switch, and retain the action name during loading. |
| 11 | P2 | **Android Back handling is missing from key modals.** Receipt, expense composer, and settings omit `onRequestClose`, so Back is not wired to their close actions. | [NestLedgerApp.tsx](components/nestledger/NestLedgerApp.tsx):4703, 4713; [ProfileSettingsModal.tsx](components/nestledger/settings/ProfileSettingsModal.tsx):165 | Wire native Back to the appropriate close/discard behavior and verify on-device. |
| 12 | P2 | **Receipt Add/Remove touch targets are too small.** They consist of 12–14px text without padding, minimum dimensions, or hit slop. | [ReceiptScannerSheet.tsx](components/nestledger/ReceiptScannerSheet.tsx):308, 318 | Expand targets to native 44–48 logical-unit touch sizes. |
| 13 | P2 | **Dashboard hides how far over budget the user is.** Remaining balance is clamped to zero, making slight and substantial overspending show the same number. | [NestLedgerApp.tsx](components/nestledger/NestLedgerApp.tsx):2424, 2568 | Show a signed balance or “Over budget by …”. |
| 14 | P2 | **The empty dashboard lacks a next-step action.** “No budget yet” appears with zero metrics and a report link, without a Create Budget action. | [NestLedgerApp.tsx](components/nestledger/NestLedgerApp.tsx):2394 | Add “Create your first budget” to the empty state. |
| 15 | P2 | **Settings places “Save changes” inside “Danger zone.”** Routine saving is grouped with sign-out/deletion, making it harder to find and unnecessarily alarming. | [ProfileSettingsModal.tsx](components/nestledger/settings/ProfileSettingsModal.tsx):295 | Move Save outside the destructive-action section. |
| 16 | P2 | **Settings mixes immediate and explicit saving.** Appearance applies immediately; profile/currency changes require Save. Closing provides no dirty-form warning. | [ProfileSettingsModal.tsx](components/nestledger/settings/ProfileSettingsModal.tsx):269; [NestLedgerApp.tsx](components/nestledger/NestLedgerApp.tsx):1909 | Clarify or unify persistence behavior and handle unsaved edits. |
| 17 | P2 | **Scanner recovery makes users restart or leave manually.** Permission denial has no Open Settings action; extraction failure retains the photo but offers no retry of that photo. | [ReceiptScannerSheet.tsx](components/nestledger/ReceiptScannerSheet.tsx):124, 139 | Offer Open Settings and Retry Photo for the corresponding failures. |
| 18 | P2 | **Login error feedback lacks accessibility support.** Errors render as plain text without announcement/field association. Password input also lacks explicit password-autofill metadata. | [NestLedgerApp.tsx](components/nestledger/NestLedgerApp.tsx):2065, 2077 | Announce errors, associate them with fields, and provide appropriate password autofill metadata. |
| 19 | P2 | **Expense entry presents ten equal category choices.** This adds scanning effort alongside items, attribution, date, and description. This is a design judgment, not a functional defect. | [NestLedgerApp.tsx](components/nestledger/NestLedgerApp.tsx):4819 | Consider recent/default categories with access to the full list. |
| 20 | P3 | **Product copy exposes implementation details.** References to Supabase, “full-list editing,” picker rendering, and “tracker logic” do not help users complete their tasks. | [NestLedgerApp.tsx](components/nestledger/NestLedgerApp.tsx):2087; [ProfileSettingsModal.tsx](components/nestledger/settings/ProfileSettingsModal.tsx):108 | Replace implementation language with user-facing outcomes and next steps. |
| 21 | P3 | **Family terminology conflicts with other space types.** Personal, Friend Trip, and Shared Living still encounter Family/Household labels. | [ProfileSettingsModal.tsx](components/nestledger/settings/ProfileSettingsModal.tsx):178 | Use neutral “Space” wording where appropriate. |

## Contrast evidence

Calculated using WCAG relative luminance from the actual light-theme colors in [constants/nestledger.ts](constants/nestledger.ts). These small-text combinations should reach 4.5:1.

| Text treatment | Foreground | Background | Contrast |
|---|---|---|---:|
| Receipt “Clear match” | `#8AB096` | `#F9F9F8` | 2.28:1 |
| Receipt “Please verify this row” | `#E1B45C` | `#F9F9F8` | 1.83:1 |
| Receipt error text on white | `#D67C7C` | `#FFFFFF` | 2.99:1 |
| Secondary button label | `#5D7B6F` | `#F5E3DD` | 3.74:1 |
| Selected settings label | `#5D7B6F` | `#E5EFE9` | 3.94:1 |

The primary white-on-green button reaches **4.64:1** and passes this check. This is not a claim that all buttons or all themes fail.

## Impeccable UX assessment

The household-finance structure is coherent, and the existing design can be preserved. The largest opportunity is making entry, saving, and recovery trustworthy.

### Strengths

- Four labeled navigation tabs support recognition.
- Receipt review exposes editable quantities, prices, totals, and confidence descriptions.
- Keyboard-aware scrolling, recent expense suggestions, and native date controls already reduce entry effort.

### Cognitive load and user journey

Cognitive load rises in expense entry and settings because many choices appear together: ten expense categories and five space types. Grouping and inline totals help, but progressive disclosure could improve task focus.

Distracted mobile users face lost drafts. First-time users lack a clear dashboard starting action. Screen-reader users encounter missing labels and states.

At the original review, apparent save success followed by lost work was the emotional weak point. The receipt decimal and incomplete-row issues recorded above have since been fixed. Placing ordinary saving in Danger zone added unnecessary concern at the end of settings edits.

### Provisional heuristic scores

Source-based scores, not a visual or native-device usability certification.

| Heuristic | Score /4 | Main concern |
|---|---:|---|
| Visibility of system status | 2 | Optimistic dismissal implies completion before persistence. |
| Match with real-world language | 2 | Implementation copy and family-only terminology. |
| User control and freedom | 2 | Lost drafts and missing password recovery. |
| Consistency and standards | 2 | Mixed save semantics. |
| Error prevention | 1 | Silent row omission and numeric editing hazard. |
| Recognition over recall | 2 | Empty dashboard leaves the next step undiscoverable. |
| Flexibility and efficiency | 3 | Receipt import, suggestions, and native date controls help. |
| Aesthetic and minimalist presentation | 2 | Repeated dashboard totals and broad category choices. |
| Error recovery | 1 | Failed saves lose work; scanner recovery is limited. |
| Help and guidance | 2 | Useful capture hints, but limited recovery guidance. |
| **Total** | **19/40** | Recovery and error-prevention issues drive the score. |

## Validation and review limits

- Both assessments ran independently: UX agent `ux_review`, implementation agent `implementation_review`.
- `impeccable.cmd detect --json frontend` returned `[]`; this does not establish React Native accessibility compliance.
- The pre-fix receipt input converted text to a number on each keystroke, which could remove a trailing decimal separator. The current input preserves `12.50` as typed; native device interaction was not rerun for this update.
- The backend `/receipts/extract` route authenticates, decodes the image, and sends it to Google Gemini; the inspected route does not persist the raw image. Provider-side handling depends on the applicable [Gemini API terms](https://ai.google.dev/gemini-api/terms) and account billing tier.
- `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run test:theme`, and `git diff --check` passed after changes.
- No native device session was available, so native interaction and Android Back behavior remain unverified.

## Implementation status

- **#1-3 Implemented:** failed-save drafts are restored; receipt decimals remain editable as typed; incomplete receipt and expense rows block submission with feedback.
- **#4 Implemented; provider handling unverified:** the scanner discloses AI service processing, and the privacy policy names Gemini and receipt image handling. Data handling depends on the account billing tier and applicable Gemini API terms; this project tier was not verified.
- **#5 Implemented with OTP:** password reset is wired in the app as an OTP code flow. It does not use a password-reset redirect URL; verify the OTP flow end to end when a test account is available.
- **#6, #8-10, #12, #15, #18 Implemented:** accessible names and states, readable text, larger receipt touch targets, settings save placement, and login feedback were updated.
- **#7, #16-17 Implemented:** outside taps on an edited expense ask Keep editing or Discard; settings discard handling, settings save behavior, and scanner recovery were updated.
- **#11 Implemented; device verification pending:** receipt and expense composer Back handlers are wired. Verify the close/discard behavior on Android.
- **#13-14, #19-21 Implemented:** the dashboard shows overspending and offers budget creation; categories reveal progressively; user-facing setup and space copy is clearer.

## Follow-up fixes (2026-09-28)

- Login credentials clear after authentication and session end; the shared input component uses a visible theme-colored caret.
- Receipt scanning says the photo is sent to an AI service. Receipt amount edits preserve typed decimals, incomplete rows block submission, and outside taps on edited expenses ask whether to keep editing or discard.
- Each space stores its currency at creation. Invited members see amounts in that space's currency, while the personal default applies to new spaces. The user reports running `backend/migration_space_currency.sql` successfully in Supabase SQL Editor.
- Existing spaces were backfilled from their creator's current default currency. Correct any space whose creator changed their default before the migration.

Frontend typecheck and lint passed after these follow-up changes. Native device behavior remains unverified.

Local typecheck, lint, theme checks, and diff checks passed. Native OTP password reset and Android Back behavior still need end-to-end verification. No password-reset redirect URL is required by the current flow.
