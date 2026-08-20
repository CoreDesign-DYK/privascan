---
name: Camera focus fallback
description: Cross-browser camera focus behavior and capture readiness rules for the document scanner.
---

Request `continuous` camera focus when a device exposes that capability, with `single-shot` as the standards-based fallback. Do not require focus controls for capture because some mobile browsers, especially Safari variants, hide those capabilities despite using native autofocus.

**Why:** Browser camera APIs expose focus controls inconsistently. Assuming support breaks capture on otherwise functional devices; assuming an immediate frame is ready leads to soft scans right after startup.

**How to apply:** Feature-detect and catch focus-constraint failures, then begin a bounded focus-settling gate only after the preview produces a frame. Keep a guarded fallback for WebKit preview events, and make camera startup session-safe so late permission results cannot revive a stopped stream.