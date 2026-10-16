# Word Havoc release status — October 15, 2026

Current CrazyGames/browser build: anonymous public matchmaking, optional CrazyGames profile names/avatars, SDK Data module progress, computer practice and local duels.

## Simplified support and data handling

- Removed developer email links from Word Havoc Privacy, Terms, Help and the shared landing page. No developer support form or report queue is offered.
- Help directs ordinary game feedback to CrazyGames platform feedback where available. Platform account/data questions use CrazyGames privacy controls. This does not transfer developer responsibilities to the platform.
- Retired `/report` with HTTP 410 and stopped accepting/logging new report metadata. Existing provider logs have not been erased.
- Kept local Block & Leave with an honest current-identifier/browser limitation.
- Removed full host-state snapshot writes; the old snapshot key is purged when opening the updated build.
- Added confirmed Reset My Record for the current save, preserving settings and other players' stores. Reset is blocked during a live match and reports save failures.
- Match-result overlays rebuild allowed B/BR formatting without remote attributes or active elements.

## Verification

Browser security regression: remote win/draw/stat/log payloads cannot create active elements or event handlers.
Local multiplayer regression: matching, scoring, invalid move rejection, reconnect, surrender/rematch, cancel, Block & Leave, 100 sockets paired into 50 rooms.
Browser profile/save tests use a simulated CrazyGames SDK. Actual platform cloud saving still needs a CrazyGames preview check.
Support pages tested for navigation, mobile layout, strict CSP and no email/form links.
This is not a guarantee of zero risk, legal compliance or production capacity. The host-authoritative casual multiplayer design is not a cheat-proof competitive system. CrazyGames decides acceptance and launch eligibility. Platform email notification settings have not been changed.
