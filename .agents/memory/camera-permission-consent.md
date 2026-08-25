---
name: Camera Permission Consent
description: Camera access should be explicitly started by the user from the scanner screen
---

# Camera Permission Consent

The scanner should start the camera automatically when the scanner screen opens, without requiring a separate activation button for each scan.

**Why:** Requiring the user to dismiss a camera-off message and press an activation button before every scan makes the scanner cumbersome to use.

**How to apply:** Start the camera in the scanner screen lifecycle, keep the existing permission-error recovery, and stop the stream when leaving the screen.