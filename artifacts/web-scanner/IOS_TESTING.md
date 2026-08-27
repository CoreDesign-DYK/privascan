# PrivaScan iOS testing

The iOS project lives in `ios/App/App.xcodeproj`. Build the current web assets
and sync Capacitor before opening Xcode.

## Prepare on the Mac

1. Pull the latest project changes.
2. Install the workspace dependencies with `pnpm install`.
3. Run:

   ```sh
   pnpm --filter @workspace/web-scanner run cap:build:ios
   pnpm --filter @workspace/web-scanner run cap:open:ios
   ```

## Run on an iPhone

1. Connect the iPhone to the Mac and accept the trust prompt.
2. In Xcode, select the **App** target and open **Signing & Capabilities**.
3. Select the Apple Developer team. Keep the bundle identifier
   `com.privascan.app` unless App Store Connect requires a different registered
   identifier.
4. Select the connected iPhone as the run destination and press **Run**.
5. Allow camera access when PrivaScan asks for it.

The iOS app keeps the live camera inside the app so automatic startup and
real-time document boundary detection remain available. PDF save and share use
the native iOS Files/share flow.

## Test before TestFlight

- Enter the scanner and confirm the rear camera starts without another
  activation step.
- Capture a flat document, a slightly tilted document, and a document near
  background lines.
- Confirm an unclear or soft frame is rejected instead of saved as a full
  camera image.
- Create a multi-page PDF and use **Share** to save it to Files.
- Reopen the PDF from Files and verify every page.
- Check that bottom controls remain visible on the iPhone.

## Upload to TestFlight

1. In Xcode, select **Any iOS Device (arm64)** as the run destination.
2. Choose **Product → Archive**.
3. In Organizer, choose **Distribute App → App Store Connect → Upload**.
4. If Xcode reports that the build number was already used, increase
   **CURRENT_PROJECT_VERSION** for both Debug and Release before archiving
   again.

Uploading to TestFlight does not publish the app publicly. Public App Store
release remains a separate step.