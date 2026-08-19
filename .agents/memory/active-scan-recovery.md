---
name: Active scan recovery
description: Product rule for retaining unfinished camera scans safely across reloads and app restarts.
---

Unfinished scans must be persisted locally as private work-in-progress and kept separate from completed documents shown in the gallery.

**Why:** A camera capture can be lost when the browser reloads, backgrounds the page, or discards in-memory state. Treating an unfinished scan as a completed document makes the gallery misleading, while keeping it only in memory risks data loss.

**How to apply:** Save capture and edit-progress state on-device while work is active; restore it when the app returns. Remove that temporary state only after an explicit full deletion or a successful save/share completion. Keep all of this device-local unless the user explicitly requests sync.

The default post-capture state is a clean document review: show the corrected page without crop handles or camera controls, and open crop/markup tools only from the review toolbar.

**Why:** Users need to verify the scan before making edits; exposing correction handles immediately makes the result look unfinished and mixes capture controls with document review.

**How to apply:** Route completed captures to the review screen, keep automatic perspective correction in the captured page, and make editing an explicit next action while preserving the draft until final export.