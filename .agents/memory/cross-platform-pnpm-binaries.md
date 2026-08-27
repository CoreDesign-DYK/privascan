---
name: Cross-platform pnpm binaries
description: Native optional-package policy for a Replit Linux workspace whose iOS project is built on macOS.
---

Do not exclude Darwin variants of build-tool native packages from pnpm overrides
when the workspace is downloadable for local iOS builds.

**Why:** Linux-only optimization removed the Rollup Apple Silicon package from
the lockfile, so a Mac build failed with a missing `rollup-darwin-arm64` module
even after a forced install.

**How to apply:** Keep Darwin ARM64 and x64 packages available for Rollup,
esbuild, Lightning CSS, and Tailwind Oxide. Regenerate the lockfile whenever
platform exclusions change.