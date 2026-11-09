# Budget Control UI Migration Design

## Intent

Bring the visual direction of the Budget Control Sites demo into the existing React app. The app should feel like one cohesive product: a dark, calm finance workspace with compact cards, clear financial hierarchy, indigo navigation states, and restrained status colors. People should keep using the same budget features and seeing their real app data.

The migration is staged. Phase 1 updates the shared app shell and Dashboard. Later phases carry the same visual system through Deficits, Cash Flow, History, Accounts, Storage, Jobs, Rates, and dialogs. This first phase creates a reliable foundation without trying to restyle the entire product in one large change.

## Goals

- Apply the Site demo's visual language to the existing application shell and Dashboard.
- Preserve every existing calculation, store action, selector, callback, navigation intent, modal flow, and persistence behavior.
- Keep all currently displayed Dashboard information and interactions, arranging them into a clearer hierarchy.
- Preserve desktop and mobile navigation, dark and light themes, keyboard access, and existing responsive behavior.
- Establish shared card, panel, spacing, typography, border, and status treatments that later screen phases can reuse.

## Non-goals

- Replacing actual Dashboard values with the Site demo's fictional sample figures.
- Changing `src/engine`, Zustand store slices, types, persistence, migrations, routing, or financial domain behavior.
- Removing Dashboard alerts, credit due information, forecast tools, health insights, clickable summary metrics, or any existing action.
- Reworking the other seven views or the modals in Phase 1 beyond shared shell styles that are necessary for visual continuity.
- Adding a UI library, new icon package, or a second application runtime.

## Anti-goals

- Simplifying the app by hiding advanced financial details or actions.
- Hard-coding layout values into JSX when an existing design token or a focused class can express them.
- Introducing visual changes that break dark/light theme support or mobile navigation.

## Current structure and constraints

- `src/App.tsx` selects the active view and wires its callbacks. Keep this routing and callback wiring intact.
- `Sidebar`, `Topbar`, and `BottomNav` own shared navigation and app actions. They also expose sync, undo/redo, theme, quick-add, command palette, update, and data tools controls; preserve each one.
- `DashboardView` contains calculations, store selectors, alert conditions, forecast and health data, and navigation handlers alongside its JSX. Keep the hooks, expressions, conditions, handlers, and destinations unchanged while reworking the presentation markup and classes.
- `src/index.css` is the live theme and override layer, loaded after `src/styles/base.css`. Work in `src/index.css`; do not add new `!important` declarations.
- Design tokens support both `data-theme="dark"` and `data-theme="light"`. Reuse and extend those token mappings instead of hard-coding dark-only colors.
- Use current React, TypeScript, CSS, and `lucide-react` dependencies. Do not add packages.
- The existing repository is the canonical app. The Sites demo remains a visual reference and is not imported as application code.

## Approaches

1. **Restyle all views and dialogs at once.** This would produce consistency sooner, but touches many large feature components in a single review and makes accidental behavior changes harder to isolate.
2. **Staged UI-only migration — selected.** Begin with the shared shell and Dashboard, then apply the established patterns to the remaining views and dialogs in reviewable phases. This matches the user's selected staged scope and keeps financial behavior easy to compare as each screen changes.
3. **CSS-only restyle.** This has the smallest JSX diff, but cannot reliably express the demo's changed hierarchy and responsive grouping in the current markup. Use it for presentation details where it fits, not as a constraint on all UI work.

## Phase 1 design

### Shared shell

- Restyle the sidebar, active section indicator, brand block, sync status, top bar, and page content area to match the demo's compact dark workspace.
- Keep the existing collapse, mobile close, theme toggle, sync/reconnect, undo/redo, quick-add, command-palette, update, loan, and data-tools actions and IDs where existing UI flows depend on them.
- Keep `BottomNav` and `MobileActionSheet` behavior on narrow screens. Reflow visual controls for small screens without removing or disabling actions.
- Apply token-based surfaces, borders, typography, focus states, and responsive spacing. Light theme gets corresponding light surface, text, and border values.

### Dashboard

- Preserve the Action Center and its conditional severity, credit-funding alerts, deficit alerts, all KPI values, card due panels, forecast, financial health score, insights, and recent/summary content.
- Recompose existing live values into a hierarchy inspired by the demo: primary financial summary, status/obligation details, then forecast and supporting analysis. Do not introduce demo-only figures or omit information to make the page look simpler.
- Keep current click and keyboard destinations for interactive summary rows and buttons. Keep row targeting/navigation intents consumed by other views intact.
- Keep the forecast and other existing data visualizations backed by current engine outputs.

## Later phases

- Phase 2: Deficits, Cash Flow, and History.
- Phase 3: Accounts, Storage, Jobs, and Rates.
- Phase 4: shared and feature-specific dialogs, action sheets, and empty/error states.

Each phase reuses Phase 1 tokens and interaction patterns. New phase work should retain each view's filters, row navigation/highlighting, inputs, and modal sequencing.

## Acceptance criteria

- The Phase 1 shell and Dashboard visually follow the Site demo while displaying only values derived from the existing application state.
- Existing Dashboard actions still invoke the same handlers and navigate to the same views.
- The shared shell retains existing sync, undo/redo, theme, quick-add, search/command, mobile navigation, and data-management controls.
- Both dark and light themes remain readable; the layout remains usable on desktop and mobile widths.
- No changes are made to engine/store business logic, persisted data, routes, or dependencies.
- TypeScript compilation and lint remain clean; UI-specific checks are run for the changed shell and Dashboard. Do not change tests to encode new behavior because behavior is intended to stay the same.

## Builder calls

- Treat “existing logic unchanged” as no changes to data calculations, state shape, selectors, actions, event destinations, navigation intents, persistence, and modal behavior. JSX structure and CSS may change to achieve the new presentation.
- Preserve every current Dashboard content group and its visibility conditions, even when grouping it differently.
- Keep Phase 1 scoped to `Sidebar`, `Topbar`, `BottomNav` only if visual adjustments are needed, `DashboardView`, and `src/index.css`; avoid unrelated cleanups.
- Use the existing Sites demo as a visual reference rather than adding a screenshot or image asset dependency.
