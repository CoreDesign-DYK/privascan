---
name: Capacitor iOS startup
description: Preventing a blank native window when bootstrapping the Capacitor 8 iOS app.
---

Use the programmatic `SceneDelegate` bootstrap as the only application-content startup path. Do not add scene or main storyboard launch declarations while `SceneDelegate` creates the window and `CAPBridgeViewController`.

**Why:** Mixing storyboard-driven startup with a programmatically created Capacitor bridge can initialize competing root windows/controllers and leave the installed native app showing only a black screen.

**How to apply:** Keep the launch screen storyboard for the splash screen, but leave application-content storyboard keys unset. After native configuration changes, perform a clean Xcode build and reinstall the app rather than relying on the previous installed bundle.