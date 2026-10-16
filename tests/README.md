# Word Havoc multiplayer verification

Run from the repository root with Node 24+, jsdom, and Playwright installed:

```
node tests/multiplayer-dom.cjs
node tests/multiplayer.cjs
node tests/crazygames-profile.cjs
```

`WH_JSDOM_MODULE` can name an installed jsdom module. `WH_CHROMIUM_PATH` can name a Chromium binary; otherwise Playwright uses its installed Chromium.

Both suites run the real relay matchmaking and message handlers over local WebSockets. The Bun API is adapted to Node, and database calls are mocked; these tests do not certify the deployed Bun runtime, production database, Internet reconnections, capacity, or CrazyGames approval.

The DOM suite checks automatic matching, valid moves, multiple-word scoring, invalid-word preview suppression and host rejection, board synchronization, reconnect, surrender, same-room rematch, cancellation, and 100 sockets paired into 50 matches.

The Chromium suite checks two independent browser clients, matching, moves, synchronization, reconnect, surrender, rematch, mobile cancellation, and mobile practice layout. Screenshots are temporary QA artifacts.

The CrazyGames profile Chromium suite uses a contract mock of the official SDK. It verifies profile/avatar display, guest migration, preservation of existing cloud data, a second browser loading the same saved data, isolated account switching, cumulative records, failed/disabled saves, and correct host/guest perspectives over real local WebSockets. It does not make real CrazyGames cloud calls; verify the final ZIP in the CrazyGames developer preview with Data Module progress saving enabled.
