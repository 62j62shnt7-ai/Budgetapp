---
description: "Coding standards and rules for Budget Control v2"
globs: "**/*"
---

# Budget Control v2 — Strict Development Rules

1. **Deterministic Engine Separation**:
   - `src/engine/` is strictly pure math. Never import React, DOM, or UI packages here.
   - Any financial logic modification MUST be validated against `test/verifyMath.mjs` by running `npm test`.

2. **TypeScript Standards**:
   - Strict typing is enforced. No `any` types.
   - All shared interfaces and types belong in `src/types/index.ts`.
   - Run `npx tsc -b` to verify clean compilation.

3. **Styling & Components**:
   - Maintain the existing Vanilla CSS design system in `src/index.css`.
   - Use Lucide icons consistently.
   - Keep components modular and placed under their respective `src/components/<Domain>/` folders.
