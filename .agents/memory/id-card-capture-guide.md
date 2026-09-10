---
name: ID Card capture guide
description: Product rule for the ID Card framing, readiness, and Front/Back capture experience.
---

ID Card Mode uses one focus-friendly ID-1 frame defined by the full area between four L-shaped corners. The same frame handles Front and Back sequentially.

**Why:** A second detected polygon duplicates the guide, while an oversized frame forces the phone inside the camera's minimum focus distance. Separate Front and Back frames also crowd the portrait camera view.

**How to apply:** Keep the ID-1 ratio at 85.60:53.98, size the full L-corner area conservatively for mobile focus distance, and never render the generic active polygon in ID Card Mode. Detect edges internally; turn only the L corners green when all four card edges align, focus and quality pass, and tracking is stable, then auto-capture. Reuse the same frame as `1. Front` and `2. Back`.