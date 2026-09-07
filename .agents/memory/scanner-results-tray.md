---
name: Scanner results tray
description: Product behavior for keeping captured-page controls from obstructing continuous scanning.
---

After each capture, briefly show the thumbnail and editing controls, then automatically slide them downward and fade them out. Leave only a small document icon with the current page count; tapping it reopens the tray.

**Why:** Leaving the blurred thumbnail and editing area open blocks too much of the live camera view and interferes with positioning the next document. Manual swipe-only collapse does not satisfy the continuous-scanning flow.

**How to apply:** Trigger automatic collapse after every newly added page, use the same animated close path for downward swipes, and do not auto-close a tray the user explicitly reopened unless another page is captured.