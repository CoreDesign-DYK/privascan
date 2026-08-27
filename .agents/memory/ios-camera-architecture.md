---
name: iOS camera architecture
description: Why the Capacitor iOS app keeps the live web camera while using native file and share plugins.
---

Use the live WKWebView `getUserMedia` camera path inside the Capacitor iOS app,
while using Capacitor Filesystem and Share for exported files.

**Why:** The Capacitor Camera photo picker opens a separate system camera
screen. Using it for iOS would remove PrivaScan's automatic live preview,
continuous document-boundary tracking, and automatic capture behavior.

**How to apply:** Treat iOS as a live-camera platform for scanning and as a
native platform for file save/share. Do not switch iOS to the Android system
camera path unless the product intentionally gives up live edge detection.