---
name: Book orientation labels
description: Product rule for keeping Book Mode page labels physically correct while the scanner UI stays portrait-locked.
---

Book Mode must show an upright `L` on the user's physical left and an upright `R` on the user's physical right in both sideways phone orientations.

**Why:** CSS viewport orientation remains portrait when the native scanner is orientation-locked, so responsive landscape styles cannot distinguish which physical edge is left. The user confirmed that sensor-based position swapping plus counter-rotation works correctly on-device. On Android, pitching the phone backward can reverse the reported `gamma` sign even when the same physical edge remains down.

**How to apply:** Use physical device orientation for Book labels only. Swap positions only after a stable upright/neutral transition followed by a stable opposite-side reading; never switch directly between confirmed sides from a `gamma` sign reversal. Counter-rotate glyphs so they remain readable; do not alter the binding guide.