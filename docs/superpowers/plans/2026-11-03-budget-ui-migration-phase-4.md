# Budget UI Migration Phase 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Carry the demo's visual system into shared dialogs, mobile action sheets, and common empty/error/notice states.

**Architecture:** Restyle existing shared components and selectors through theme-aware tokens and focused CSS. Preserve modal sequencing, dialog actions, focus behavior, state transitions, and all existing workflows.

**Tech Stack:** Existing React/TypeScript, native `<dialog>`, vanilla CSS in `src/index.css`; no dependencies.

**Spec:** `docs/superpowers/specs/2026-11-03-budget-app-ui-migration-design.md`, with the user's later direction that demo presentation is authoritative and legacy visual patterns may change.

## Global Constraints

- Work only on shared Modal, mobile action sheet, common empty/error/notice presentation, and `src/index.css`.
- Preserve dialog sequencing, callbacks, focus management, keyboard behavior, and modal content/actions.
- Support dark/light themes and narrow screens.
- Add no dependencies and no new `!important` declarations.

## Review Focus

- Escape/backdrop close and focus restoration still work — inspect common modal open/close.
- Only one top-layer dialog remains active through multi-step flows — inspect a dialog that opens a follow-up.
- Mobile action sheet controls remain reachable and keyboard operable — inspect at narrow viewport.
- Empty/error/notice statuses stay readable and distinguishable in both themes — inspect common examples.

---

### Task 1: Shared dialogs and mobile action sheet

**Files:**
- Modify: `src/components/Common/Modal.tsx` only if a visual class hook is needed; do not change modal mechanics.
- Modify: `src/components/Layout/MobileActionSheet.tsx` only if a visual class hook is needed; do not change actions.
- Modify: `src/index.css`

- [x] Map current dialog shell, title, body, action footer, close control, backdrop, and mobile sheet classes.
- [x] Apply the demo's calm raised surface, compact header, clear action hierarchy, focus ring, and responsive sheet treatment.
- [x] Preserve native top-layer and action-sheet behavior.
- [x] Inspect a form dialog and the mobile menu in both themes, plus a confirmation dialog.

### Task 2: Shared status and empty states

**Files:**
- Modify: `src/components/Common/DriveReconnectBanner.tsx` only if a visual class hook is needed.
- Modify: `src/components/Common/UndoToast.tsx` only if a visual class hook is needed.
- Modify: `src/components/Common/ErrorBoundary.tsx` only if a visual class hook is needed.
- Modify: `src/index.css`

- [x] Map existing empty, alert, unsaved, reconnect, and notice styles.
- [x] Align common status surfaces, empty states, and notices to the shared tokens with clear severity and readable text.
- [x] Keep retry/export/reconnect and notice interactions unchanged.
- [x] Inspect representative warning, empty, and success states; review the token-based error screen styling.

### Task 3: Full migration verification

- [x] Run `npm run typecheck`, `npm run lint`, and `npm run test:ui`.
- [x] Inspect desktop/mobile and dark/light appearance across all app views and representative dialogs.
- [x] Run `git diff --check`; confirm no engine/store/types/routing/persistence/dependency/test changes and preserve existing untracked content.
