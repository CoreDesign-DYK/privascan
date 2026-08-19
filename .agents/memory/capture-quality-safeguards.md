---
name: Capture quality safeguards
description: Product rules for preserving document-only, sharp results during camera capture and perspective correction.
---

Document-mode capture must use a confident boundary from the exact frame being saved. It must not fall back to saving the full camera frame when edge detection fails, and it must reject blurred results before they become a draft page.

**Why:** A full-frame fallback retains the desk or camera background and makes a failed scan look complete. Perspective correction must be seam-free; mesh artifacts can look like document damage.

**How to apply:** Prefer fresh full-resolution detection over an older live overlay for cropping. Use a continuous projective transform with a seam-free fallback, preserve available camera resolution, and hold auto mode after a rejected frame until the page leaves or is meaningfully repositioned.