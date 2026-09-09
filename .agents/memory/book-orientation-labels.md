---
name: Book orientation labels
description: Product rule for keeping Book Mode page labels physically correct while the scanner UI stays portrait-locked.
---

Book Mode must show an upright `L` on the user's physical left and an upright `R` on the user's physical right in both sideways phone orientations.

**Why:** CSS viewport orientation remains portrait when the native scanner is orientation-locked, so responsive landscape styles cannot distinguish which physical edge is left. The user confirmed that sensor-based position swapping plus counter-rotation works correctly on-device.

**How to apply:** Use physical device orientation for Book labels only. Swap the two label positions when the phone is turned the opposite way and counter-rotate their glyphs so they remain readable; do not alter the binding guide.