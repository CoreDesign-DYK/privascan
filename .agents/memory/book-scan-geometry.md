---
name: Book scan geometry
description: Product rule for safely splitting and flattening open-book captures.
---

Book mode must treat an open spread as two independent pages joined by a measured binding curve. Never restore a fixed center split or save the whole spread when the binding is uncertain.

**Why:** A geometric midpoint does not follow an off-center or curved binding, so it mixes the opposite page into the result and cannot flatten gutter distortion. The product prioritizes rejecting a questionable capture over saving a misleading scan.

**How to apply:** Keep live guidance, auto-capture stability, final capture validation, gutter exclusion, page-specific dewarping, DPI limits, and GPU/CPU fallbacks aligned to the same measured left/right geometry. Do not use low-resolution preview sharpness as a Book shutter gate. Apply interior page-surface correction only when multiple text-bearing columns provide coherent, bounded curvature evidence; otherwise retain the binding-curve warp.