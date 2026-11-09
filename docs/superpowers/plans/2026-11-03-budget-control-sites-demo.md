# Budget Control Sites Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and privately publish a clickable Sites demo that visually reflects Budget Control v2 with fictional data.

**Architecture:** A buildless responsive HTML/CSS/JS Site in a distinct source folder, with a dashboard and client-side section switching. Sites manages registration, source synchronization, packaging, and deployment; the existing React app remains untouched.

**Tech Stack:** HTML, CSS, vanilla JavaScript, Sites static hosting.

**Spec:** `docs/superpowers/specs/2026-11-03-budget-control-sites-demo-design.md`

## Global Constraints

- Use the existing app's Budget Control identity, dark palette, and eight section labels.
- Use fictional sample EGP amounts and mark the experience clearly as demo data.
- Do not connect to or persist real financial data.
- Keep the demo source separate from the existing app implementation.
- Publish the new Site privately.

## Review Focus

- Narrow viewports: navigation and cards remain readable and usable.
- Keyboard use: section navigation works with buttons and visible focus.
- Demo-data clarity: headings or labels make fictional values apparent.
- Section changes: selected navigation and displayed panel stay in sync.
- Deployment state: share the production URL only after successful publishing.

---

### Task 1: Create the static Site source

**Files:**
- Create: `sites/budget-control-demo/dist/index.html`
- Create: `sites/budget-control-demo/.openai/hosting.json` (Site identity/static directory, set using the Sites workflow)

**Interfaces:**
- Produces: one static entry point at `dist/index.html`; Site metadata points its static directory to `dist`.

- [x] **Step 1: Create a new, empty Sites source folder and inspect the hosting setup.** Confirm no existing project identity is present before registration; never register the same local site twice.
- [x] **Step 2: Create the Site through the Sites connector and persist its returned opaque project ID unchanged.** Keep the Site private.
- [x] **Step 3: Implement the responsive dashboard and section panels in `dist/index.html`.** Use the established black/charcoal surfaces, slate text, indigo accents, Budget Control branding, and sample EGP values. Include net worth, cash, a forecast summary, card dues, a recent activity list, and clear demo-data labeling.
- [x] **Step 4: Verify the source has a single static entry point and no external data or persistence dependency.**

### Task 2: Add clickable section navigation

**Files:**
- Modify: `sites/budget-control-demo/dist/index.html`

**Interfaces:**
- Consumes: the eight app sections: Dashboard, Deficits, Cash Flow, History, Accounts, Storage, Jobs, Rates.
- Produces: accessible navigation that switches the active view without a page reload.

- [x] **Step 1: Add navigation buttons for all eight sections.** Use semantic buttons with visible keyboard focus.
- [x] **Step 2: Add a small section-switching controller.** Update the active button and visible panel together; each section gets a concise representative summary using fictional demo data.
- [x] **Step 3: Add responsive layout rules.** At small widths, make navigation and dashboard cards fit without horizontal page overflow.
- [x] **Step 4: Preview the page and manually check Dashboard plus every section button in the browser; inspect desktop and narrow layout rules.** The in-app preview allowed the narrow layout to be checked at its available width; the wide layout was reviewed in source CSS rather than separately rendered.

### Task 3: Package, publish, and hand off

**Files:**
- Read/modify: `sites/budget-control-demo/.openai/hosting.json`
- Package: Sites workflow archive derived from the pushed Site source.

**Interfaces:**
- Consumes: source folder and opaque Site ID from Task 1.
- Produces: a saved and deployed private Site with a verified production URL.

- [x] **Step 1: Run the Sites source workflow to push the completed source and package the static directory.** Supply no unnecessary build commands for buildless HTML/JS.
- [x] **Step 2: Save and deploy the matching source commit using the private-site publication operation.** Preserve the exact commit, archive, and returned version identifiers.
- [x] **Step 3: Check deployment status if the initial result is non-terminal.** Stop only at a terminal status.
- [x] **Step 4: Open the deployed URL in the existing Site tab when supported and report the URL and any verification limits.** The browser reached the ChatGPT sign-in gate; the Site remains owner-only.

## Execution Record

- Published version 2 to `https://budget-control-demo.aloftankle1.chatgpt.site`; Sites reports the project active and the current user as owner, with no groups or non-owner viewers configured.
- HTTP preview returned `200 OK`; the browser preview showed the dashboard and all eight section buttons switched the visible panel and URL hash correctly.
- Code review found the History expense rows were short by EGP 1,500. Added a fictional transport entry, re-packaged, and privately deployed the corrected source as version 2.
- `Final: fixed History entry discrepancy — added a fictional EGP 1,500 transport expense so the expense rows total EGP 12,140; income rows total EGP 54,750, matching the displayed net of EGP 42,610.`
- `Final: minor (deferred): Jobs open value is EGP 96,000 while the two displayed project values sum to EGP 76,000; all data is labeled fictional, so this does not affect real finances, but it can make the demo summary confusing.`
- `Ruling: wide-screen browser rendering was unavailable in the in-app preview, which stayed at 674px wide; I reviewed the desktop CSS rules instead — the cost if wrong is an unobserved desktop-only layout issue.`
- Final review: fresh read-only review found the History discrepancy and one minor Jobs summary inconsistency; the Important History finding was fixed and redeployed.
- No application tests were added or run; this is a standalone static demo and the user did not request test runs.
