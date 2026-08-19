---
name: Active scan recovery
description: Product rule for retaining unfinished camera scans safely across reloads and app restarts.
---

Unfinished scans must be persisted locally as private work-in-progress and kept separate from completed documents shown in the gallery.

**Why:** A camera capture can be lost when the browser reloads, backgrounds the page, or discards in-memory state. Treating an unfinished scan as a completed document makes the gallery misleading, while keeping it only in memory risks data loss.

**How to apply:** Save capture and edit-progress state on-device while work is active; restore it when the app returns. Remove that temporary state only after an explicit full deletion or a successful save/share completion. Keep all of this device-local unless the user explicitly requests sync.