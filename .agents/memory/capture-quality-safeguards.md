---
name: Capture quality safeguards
description: Product rules for preserving document-only, sharp results during camera capture and perspective correction.
---

Document-mode capture must use a confident boundary from the exact frame being saved. It must not fall back to saving the full camera frame when edge detection fails, and it must reject blurred results before they become a draft page.

**Why:** A full-frame fallback retains the desk or camera background and makes a failed scan look complete. Perspective correction must be seam-free; mesh artifacts can look like document damage.

**How to apply:** Prefer fresh full-resolution detection over an older live overlay for cropping. Use a continuous projective transform with a seam-free fallback, preserve available camera resolution, and hold auto mode after a rejected frame until the page leaves or is meaningfully repositioned.

Treat DPI as an output-size target, not a JPEG compression setting. Preserve the source pixels when the crop is smaller than the target, never enlarge beyond the captured detail, and apply mobile memory ceilings only after the document crop is known.

**Why:** Enlarging a low-resolution crop does not restore detail, while shrinking the full camera frame before cropping permanently discards useful document pixels.

**How to apply:** Keep JPEG quality internal and high. Derive per-paper pixel bounds from the requested DPI, preserve aspect ratio, and ensure GPU and CPU perspective paths share the same platform-specific post-correction ceiling.

When an edge fit is weak or incoherent, reject it rather than forcing its corners into an axis-aligned rectangle.

**Why:** Axis snapping can turn a legitimate small camera roll into an inaccurate crop, while a rejected frame cannot silently create a bad scan.

**How to apply:** Require coherent support along all four fitted edges and propagate any failed side or intersection as a failed detection; retain genuine perspective or rotation for the projective correction step.

Live scan-frame tracking may smooth small movement and hold a known-good quad through brief detection misses, but it must never supply crop corners for the saved image.

**Why:** A calm overlay helps users hold the camera steady, while stale corners can crop a moving document incorrectly.

**How to apply:** Require repeated confirmation before switching to a distant candidate, restart stability after a focus transition, and always re-detect the exact high-resolution capture frame before saving.

The live frame must visibly follow sustained subject movement; it is not a static placement guide. Brief detection gaps may keep a dim last-known frame, but never contribute toward automatic capture.

**Why:** Excessive smoothing makes users move the phone to a frozen rectangle instead of seeing the scanner actively catch the document edges, while immediate disappearance makes valid detection feel unreliable.

**How to apply:** Use only short confirmation for a large candidate change, blend accepted motion responsively, and keep display persistence separate from fresh-frame stability.

When a coloured document lies near a parallel background edge, prefer candidates whose horizontal and vertical edges both continue inward from every corner, and keep final line fitting anchored to the coarse candidate.

**Why:** A strong desk or shadow line can otherwise win a row-profile peak and pull a document boundary outward, leaving background strips in the saved crop.

**How to apply:** Score corner continuity as paired directional support, and penalize refinement samples farther from the selected profile boundary rather than letting the strongest nearby line always win.

When a strong internal divider might be mistaken for the document bottom, require the adjacent left and right edges to terminate there. If both side edges continue below that line, reject it as an internal boundary rather than crop the document.

**Why:** Covers with photos, barcodes, or footer rules can contain a stronger horizontal transition than the physical lower edge; warping an otherwise valid quad still cuts content when its bottom corners are wrong.

**How to apply:** Apply the continuation check while scoring coarse candidates and again after line refinement. Require sustained support on both sides, skip the check when there is too little exterior frame to judge, and reject uncertainty instead of using a stale or interior crop.

Calibrate detector sharpness thresholds on the same downscaled frame the live detector actually evaluates, then keep a separate post-warp quality gate on the full capture result.

**Why:** A threshold that looks reasonable on native-size synthetic pixels can reject a sharp high-resolution card after detector downscaling, while a live-only check is not enough to prevent a soft saved crop.

**How to apply:** Measure representative sharp and blurred fixtures after the detector's real resize step. Use the live threshold for readiness, and independently reject the perspective-corrected output before saving.

Manual Document capture must judge whether the user is too far away from the visible preview occupancy, not from an absolute pixel threshold on the Android still frame.

**Why:** Android still capture can use a wider sensor field of view than the WebView preview, so a document that already fills the screen can fall below a fixed still-pixel threshold even though moving closer is not a realistic remedy.

**How to apply:** Show “Move closer” only when a detected document is genuinely small by both live-preview area and longest-axis occupancy. Never use short-edge occupancy alone because it rejects landscape pages in portrait camera frames. Let sharp manual captures proceed with a clear limited-resolution warning, while retaining the post-warp sharpness gate.