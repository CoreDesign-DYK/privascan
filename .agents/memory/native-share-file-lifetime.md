---
name: Native share file lifetime
description: Safe lifecycle and verification rules for files passed to Android or iOS share sheets.
---

Do not delete a native share cache file when the share-sheet promise resolves. Validate the generated file and its on-disk byte size before sharing, retain it afterward, and clean only sufficiently old share files during later maintenance.

**Why:** The share sheet returning does not guarantee that the selected email or storage app has copied the attachment. Some Android clients read the granted URI later, so immediate cleanup can produce a correctly named 0-byte attachment.

**How to apply:** Use a unique cache path that preserves the requested filename and extension, compare the written size with the generated Blob, propagate cancellation without finalizing or clearing user data, and age out retained files rather than deleting them in a share-call `finally` block.