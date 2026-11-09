# Budget App UI Migration Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved Site demo visual language to the existing Budget Control shared shell and Dashboard while preserving all existing behavior and content.

**Architecture:** Keep all calculations, selectors, actions, callbacks, destinations, IDs, conditions, and state wiring in place. Adjust shell/Dashboard presentation markup only where hierarchy requires it, with reusable theme-aware styles in the existing `src/index.css` layer.

**Tech Stack:** React 19, TypeScript, existing `lucide-react`, vanilla CSS, Vite; no dependencies added.

**Spec:** `docs/superpowers/specs/2026-11-03-budget-app-ui-migration-design.md`

## Global Constraints

- Keep Phase 1 scoped to `Sidebar`, `Topbar`, `BottomNav` only if visual adjustments are needed, `DashboardView`, and `src/index.css`.
- Preserve every calculation, store action, selector, callback, navigation intent, modal flow, persistence behavior, and Dashboard content/visibility condition.
- Preserve desktop/mobile navigation, dark/light theme support, keyboard access, and responsive behavior.
- Reuse and extend existing theme tokens; add no new `!important`, dependencies, or demo-only values.
- Do not modify engine, store, types, routing, persistence, or tests.

## Review Focus

- Dashboard actions and keyboard summary-row destinations remain unchanged — compare handlers, roles, tab stops, IDs, and targets before/after; inspect browser interactions.
- Every conditional alert, obligation detail, insight, forecast tool, and summary remains present — compare source content/conditions and inspect populated and empty states.
- Dark and light token mappings remain legible — inspect both themes in browser.
- Narrow viewport navigation retains its complete action set — inspect mobile layout and BottomNav/MobileActionSheet behavior.
- Shell controls retain their IDs and flows — inspect sync, undo/redo, theme, quick-add, command palette, refresh, loan, and data tools.

---

### Task 1: Shared shell visual system

**Files:**
- Modify: `src/components/Layout/Sidebar.tsx`
- Modify: `src/components/Layout/Topbar.tsx`
- Modify: `src/components/Layout/BottomNav.tsx` only if visual adjustments are needed
- Modify: `src/index.css`

**Interfaces:**
- Consumes existing props, Zustand selectors/actions, IDs, sync presentation helpers, and CSS tokens.
- Produces a compact, responsive, theme-aware shell with the same controls and behavior.

- [x] Inspect existing shell structure and token mappings; record current control IDs and event handlers.
- [x] Add/adjust focused class names and theme-aware CSS for sidebar, active navigation, brand, sync status, topbar, content spacing, focus states, and narrow widths. Preserve action wiring and IDs.
- [x] Adjust `BottomNav` styles only if required to carry the shared visual language; do not alter its destinations or click behavior.
- [x] Verify shell at desktop and mobile widths in dark and light themes; confirm all control IDs and handlers remain present.

### Task 2: Dashboard presentation

**Files:**
- Modify: `src/components/Dashboard/DashboardView.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes existing Dashboard calculations, selectors, callback, navigation intents, visibility conditions, and values unchanged.
- Produces a clearer hierarchy for primary financial summary, action/status details, obligations, forecast, and supporting analysis.

- [x] Map the Dashboard's current content groups, visibility conditions, action handlers, and keyboard destinations before editing.
- [x] Recompose presentation markup/classes around the existing live values, retaining every current content group, condition, ID, and interaction.
- [x] Add focused Dashboard styles using shared tokens for cards, panels, typography, spacing, status colors, focus, and responsive layout.
- [x] Compare the edited Dashboard against the pre-edit content/condition/handler map; verify populated and empty states and click/keyboard destinations in browser.

### Task 3: Final verification and scope review

**Files:**
- Review: Phase 1 files above; no other application files should change.

- [x] Run `npm run typecheck` and `npm run lint`; both must pass.
- [x] Run the repository UI audit `npm run test:ui` and inspect the Phase 1 shell and Dashboard in desktop/mobile and dark/light states.
- [x] Review `git diff --check` and `git status --short`; confirm no engine/store/types/routing/persistence/dependency/test changes and preserve pre-existing untracked `docs/` and `sites/` content.
