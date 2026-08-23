---
name: Android Build Pipeline
description: GitHub Actions requirements and keystore setup for Capacitor 8 Android builds
---

# Android Build Pipeline — Capacitor 8

## Runtime requirements (all three required together)
- Node.js **22** (`actions/setup-node@v4` with `node-version: '22'`) — Capacitor 8 CLI refuses ≤21
- Java **21** (`actions/setup-java@v4` with `java-version: '21'`) — capacitor-android plugin fails with "invalid source release: 21" on Java 17
- pnpm **10**

## Keystore setup (PKCS12)

**Why:** OpenSSL-generated PKCS12 keystores require `storeType "PKCS12"` explicitly in `build.gradle`; omitting it causes "keystore password was incorrect" even when the password is correct.

**How to apply:**
1. Create keystore with no special chars in password:
   ```bash
   openssl genrsa -out privascan.key 2048
   openssl req -new -x509 -key privascan.key -out privascan.crt -days 9855 -subj "..."
   openssl pkcs12 -export -in privascan.crt -inkey privascan.key -out privascan-release.p12 -name privascan -passout pass:SIMPLEPASSWORD
   ```
2. Encode **without newlines**: `base64 -w0 privascan-release.p12 | gh secret set KEYSTORE_BASE64`
3. In `android/app/build.gradle` signing config, add `storeType "PKCS12"`
4. In workflow decode step, strip newlines as safety net:
   ```bash
   echo "${{ secrets.KEYSTORE_BASE64 }}" | tr -d '\n\r ' | base64 --decode > /tmp/privascan-release.p12
   ```

## Release AAB trigger
Release AAB job condition: `vars.RELEASE_ENABLED == 'true' || github.event_name == 'workflow_dispatch'`
→ Must use "Run workflow" button manually; push-triggered builds only produce Debug APK.

## Current keystore
- File: `artifacts/web-scanner/.keys/privascan-release.p12` (gitignored)
- Alias: `privascan`
- Password: stored in GitHub Secret `KEYSTORE_PASSWORD`
- Valid: 27 years from Aug 2026
