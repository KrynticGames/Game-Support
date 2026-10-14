# Apple Store release status — 14 October 2026

## Verified
- Both browser-source builds successfully compiled for **unsigned iOS Simulator** using Xcode 26.6 in [run 38610230688](https://github.com/WhatWhat689/Game-Support/actions/runs/38610230688).
- **No signed iOS App Store archive**, TestFlight upload, real-iPhone QA, or App Review submission has been verified.

## Word Havoc
- Existing publisher library package `Word_Havoc_1.0.0_APPLE_READY_MASTER.zip` contains Capacitor iOS source, app icon, screenshots, package-lock.json, 23-check QA results, App Store copy, and cloud `ios-testflight.yml` upload workflow.
- Existing latest audited single file `Word_Havoc_1.0.0_FINAL_AUDIT2.html` was audited 13 Oct; it is **not the same file** as the ZIP's `www/index.html`. Reconcile the final audited version and rerun package tests before signing.
- Do not use the older Github Pages browser build as the approved signed release without completing that reconciliation.
- Word Havoc approved registered bundle ID: `com.wordhavoc.game`.
- Account required only for Online Duel; ensure Apple's privacy labels disclose server-stored usernames, account IDs, match stats and relevant service data.

## Brain Attack
- Current GitHub `play/brain-attack.html` compiled for simulator, but current source may not include all the latest Oct 12–14 gameplay and visual edits.
- Scope first release to the working CPU game; do NOT claim live multiplayer without separate two-device/server-side security testing.
- Pending critical tests: placement uniqueness and resetting; hidden information; attack/retaliation and wreck states; correct/incorrect/timeouts; complete CPU matches, app background/resume, touch/audio on physical device.
- Proposed bundle ID `com.kryntic.brainattack` is a PLACEHOLDER. Confirm actual App ID in Apple Developer before creating a signed build.
- Description: **Brain Attack is a trivia-and-strategy battlefield game. Hide a soldier and two missile defenses, answer trivia questions to earn attacks, and uncover the enemy's soldier. When you hit a missile defense, expect retaliation. Play against a computer opponent and choose a difficulty that suits you.**
- Proposed subtitle: `Trivia Meets Tactics`; category Games / Trivia and Strategy; version 1.0; launch price free.
- Proposed keywords: `trivia,strategy,brain,quiz,battle,logic,tactics,questions,soldier,puzzle`. Verify terminology and exact features in the signed build before publishing metadata.

## Required common steps
1. Verify active Apple Developer membership, App Store Connect agreements, IDs and app records.
2. Use Apple's signing material **only in private encrypted Actions secrets** or an equivalent private signing service. GitHub repository is PUBLIC; NEVER commit certificates, private keys or provisioning profiles.
3. Produce signed `.ipa` archives, upload to App Store Connect/TestFlight, then install and run a real iPhone test checklist.
4. Ensure publicly accessible real-contact support and complete accurate privacy policy, data collection answers, screenshots, age ratings, and review-access instructions.
5. Upload final screenshots matching real shipped interface; rerender from signed build as needed. Include iPad captures if iPad supported.
6. Submit in App Store Connect after physical-device QA; this is not done by the unsigned GitHub checks.

Relevant Apple instructions:
- https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/
- https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-app
- https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/
