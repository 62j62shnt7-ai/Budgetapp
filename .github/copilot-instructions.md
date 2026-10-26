# Copilot Agent Instructions — Budget Control

## 1. Token Budgeting & TPM Quota Rule (< 2M TPM)
The workspace has an operational token ceiling. Agents working in this repository must keep token throughput strictly under 2M TPM:
- **Never dump whole large files into context:** For files over 150 lines or 10KB, always use targeted `grep` or narrow, bounded `view_range` line reads.
- **Pace tool executions:** Keep tool calls to concise batches (maximum 2–3 calls per turn). Avoid aggressive, rapid-fire multi-tool loops.
- **Do not spawn subagents unless explicitly requested:** Avoid launching background agents or explore tasks for work that can be done directly.
- **Run targeted verification commands:** When validating intermediate steps, run only the affected test file rather than full multi-suite audits.
- **Trust `AGENTS.md` directory structure:** Refer to `AGENTS.md` for architecture and directory maps instead of re-scanning directory trees.

## 2. Core Repository Rules (from AGENTS.md)
- **Financial Engine:** Pure math in `src/engine/` must have zero UI or store coupling and remain deterministic.
- **State Management:** All global state lives in `useBudgetStore`. Subscribe with `useShallow` or fine-grained selectors. Wrap state mutations in `runTransaction(label, fn)` for undo/redo safety.
- **Persistence:** High-capacity IndexedDB via `storageAdapter.ts`.
- **Pre-flight checks:** Always ensure `npm test`, `npm run typecheck`, and `npm run lint` pass.
