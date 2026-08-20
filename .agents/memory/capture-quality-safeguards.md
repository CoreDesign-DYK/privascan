---
name: Capture quality safeguards
description: Product rules for preserving document-only, sharp results during camera capture and perspective correction.
---

Document-mode capture must use a confident boundary from the exact frame being saved. It must not fall back to saving the full camera frame when edge detection fails, and it must reject blurred results before they become a draft page.

**Why:** A full-frame fallback retains the desk or camera background and makes a failed scan look complete. Perspective correction must be seam-free; mesh artifacts can look like document damage.

**How to apply:** Prefer fresh full-resolution detection over an older live overlay for cropping. Use a continuous projective transform with a seam-free fallback, preserve available camera resolution, and hold auto mode after a rejected frame until the page leaves or is meaningfully repositioned.

When an edge fit is weak or incoherent, reject it rather than forcing its corners into an axis-aligned rectangle.

**Why:** Axis snapping can turn a legitimate small camera roll into an inaccurate crop, while a rejected frame cannot silently create a bad scan.

**How to apply:** Require coherent support along all four fitted edges and propagate any failed side or intersection as a failed detection; retain genuine perspective or rotation for the projective correction step.

Live scan-frame tracking may smooth small movement and hold a known-good quad through brief detection misses, but it must never supply crop corners for the saved image.

**Why:** A calm overlay helps users hold the camera steady, while stale corners can crop a moving document incorrectly.

**How to apply:** Require repeated confirmation before switching to a distant candidate, restart stability after a focus transition, and always re-detect the exact high-resolution capture frame before saving.

When a coloured document lies near a parallel background edge, prefer candidates whose horizontal and vertical edges both continue inward from every corner, and keep final line fitting anchored to the coarse candidate.

**Why:** A strong desk or shadow line can otherwise win a row-profile peak and pull a document boundary outward, leaving background strips in the saved crop.

**How to apply:** Score corner continuity as paired directional support, and penalize refinement samples farther from the selected profile boundary rather than letting the strongest nearby line always win.