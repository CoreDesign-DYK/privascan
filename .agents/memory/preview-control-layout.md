---
name: Preview control layout
description: Mobile layout rule for the scan review screen’s action hierarchy.
---

The document review screen must keep the page preview, thumbnail strip, Keep scanning action, and Save PDF action in one mobile viewport. Secondary editing tools may use horizontal scrolling instead of forcing every tool into the available width.

**Why:** Saving or continuing a scan is the primary decision after capture; hiding those actions behind a vertical page scroll slows the review flow and makes the screen feel split in two.

**How to apply:** Use a fixed dynamic-viewport review layout with a flexible preview area. Preserve all editing tools, but make their toolbar horizontally scrollable on narrow screens.