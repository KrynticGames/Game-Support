# iOS release preparation

This repo now includes an **unsigned iOS simulator build check** for Word Havoc and Brain Attack. See [GitHub Actions](../../actions/workflows/ios-game-build.yml). It is NOT a signed iPhone .ipa and it does NOT publish to App Store Connect.

The build uses the current browser files in play/, not the latest full Word Havoc source-ready release ZIP held separately in the publisher's library. Replace the Word Havoc game input with the audited final source before shipping.

Word Havoc has a separately prepared native Capacitor 8 iOS project, app icon, screenshots, release audit, and signing/upload workflow in `Word_Havoc_1.0.0_APPLE_READY_MASTER.zip`; that full package is not yet imported to this repository. Do not discard its release improvements. Brain Attack has an October 2026 web build here; verify it includes every requested October 12-14 edit.

## Apple requirements
- Activate Apple Developer membership and accept current agreements.
- Keep Word Havoc's registered bundle ID `com.wordhavoc.game`.
- The Brain Attack identifier `com.kryntic.brainattack` is PROVISIONAL, and must be matched with the App ID you actually register.
- Prepare Apple Distribution certificate, App Store provisioning profiles, App Store Connect credentials and team ID in a **private** build/signing environment.
- Produce and upload signed archives using a cloud Mac or Xcode. Run TestFlight on iPhone.
- Finish privacy-policy verification, privacy labels, review access, age rating, screenshots, account deletion, store agreements and review submission.

## Note about the simulator builds
Game pages are copied and wrapped with Capacitor for compilation checks; CSS/layout/native touch/audio/online play may differ from a real signed build. The public Github Pages game builds remain unchanged. The repository is public, so never commit Apple API private keys or signing certificates.
