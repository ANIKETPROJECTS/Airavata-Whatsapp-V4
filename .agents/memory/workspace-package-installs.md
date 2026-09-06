---
name: Workspace package installs
description: Dependency installation behavior for the Airavata pnpm monorepo.
---

In this pnpm monorepo, package installation must target the owning workspace package. A root-level add can fail with the workspace-root guard or place the dependency where the frontend cannot resolve it.

**Why:** The package-management helper defaults to the workspace root, while Airavata's runtime dependencies belong in the frontend artifact package.

**How to apply:** For a frontend-only dependency, use the Airavata workspace filter when installing and verify both that package.json and pnpm-lock.yaml record the dependency.