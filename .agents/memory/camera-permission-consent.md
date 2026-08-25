---
name: Camera Permission Consent
description: Camera access should be explicitly started by the user from the scanner screen
---

# Camera Permission Consent

The scanner must enter with camera access deactivated and request camera permission only after the user chooses to turn it on.

**Why:** PrivaScan is privacy-focused, so opening the scanner should not immediately activate hardware or request a camera permission.

**How to apply:** Keep the initial state off, show a clear activation control, and preserve a separate deactivation path that stops the active stream before leaving or resetting the scanner.