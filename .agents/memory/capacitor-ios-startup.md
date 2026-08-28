---
name: Capacitor iOS startup
description: Preventing a blank native window when bootstrapping the Capacitor 8 iOS app.
---

Use the Capacitor 8.5 UIScene configuration exactly: the programmatic `SceneDelegate` creates the window and `CAPBridgeViewController`, while the scene manifest retains `UISceneStoryboardFile` with the value `Main`. Do not remove that scene-level entry.

**Why:** Capacitor 8.5's official migration contract requires both the registered `SceneDelegate` and the named Main scene storyboard. Omitting the scene storyboard can leave the installed native app at a black window before the web bundle or camera permission starts.

**How to apply:** Keep `UILaunchStoryboardName`, the scene manifest's `UISceneStoryboardFile = Main`, the SceneDelegate registration, and the AppDelegate scene-configuration hook aligned. After changes, clean-build and reinstall instead of relying on the previous bundle.