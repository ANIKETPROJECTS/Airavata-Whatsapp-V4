---
name: Direct artifact builds
description: Environment variables required when running artifact production builds directly from the workspace shell.
---

For production builds of Airavata's Vite artifact, pass the required `PORT` and `BASE_PATH` values from the artifact's service configuration when running the build command directly in the shell. Managed workflows inject these values when starting the service, but standalone shell commands do not.

**Why:** The Vite config requires service environment variables even for production builds, while direct `pnpm` commands run outside the managed workflow environment.

**How to apply:** Check the artifact's `.replit-artifact/artifact.toml` `[services.env]` values and prefix the direct build command with them. Do not change the artifact configuration just to accommodate a one-off shell build.
