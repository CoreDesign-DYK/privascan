---
name: Book orientation labels
description: Product rule for keeping Book Mode page labels physically correct while the scanner UI stays portrait-locked.
---

Book Mode must show an upright `L` on the user's physical left and an upright `R` on the user's physical right in both sideways phone orientations.

**Why:** CSS viewport orientation remains portrait when the native scanner is orientation-locked, so responsive landscape styles cannot distinguish which physical edge is left. The user confirmed that sensor-based position swapping plus counter-rotation works correctly on-device. On Android, pitching the phone backward can reverse the reported `gamma` sign even when the same physical edge remains down.

**How to apply:** Derive the physical side from the screen-projected gravity vector using both `beta` and `gamma`, not the raw `gamma` sign. Confirm vertical only when gravity is strongly portrait-aligned, retain the current side through ambiguous front/back tilt, and require a confirmed vertical transition before switching sides. Do not expire a confirmed side on a short timer because Android may pause sensor events while held still; generation/sign changes remain the capture guard. In the portrait viewport show vertical as L above R; after either sideways turn, the physically viewed landscape screen must show L on the left and R on the right. Counter-rotate glyphs so they remain readable; do not alter the binding guide.