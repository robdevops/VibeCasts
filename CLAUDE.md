# VibeCasts (repo: mobiletest)

Expo (SDK 57, to match the store build of Expo Go) + React Native + TypeScript + Expo Router app for experimenting with small app clones. Read `AGENTS.md` first: Expo APIs change every SDK, so check the versioned docs before touching them.

## Working with the user
End every piece of work with a code block of the exact commands to run on the Mac to pick it up (e.g. `git pull`, `npm ci`, `npm run dev-client`, plus `npx eas-cli@latest build --profile development --platform android` only when native code or `app.json` changed). Say whether a rebuild is needed in the text, not in the block: no comments inside the command block, only commands.

## Commands
- `npm run web`: dev server for the web target on :8081 (`expo start --web`)
- `npm run check`: typecheck + lint + Jest (run before saying a change is done)
- `npm test`: Jest (`jest-expo`, `@testing-library/react-native`; `render`/`fireEvent` are async, so `await` them)
- `npm run shot -- /route out.png`: Playwright screenshot of a route at 390x844 (needs the dev server running; uses `/opt/pw-browsers/chromium`). `SEED=1` preloads a fake library from `tools/seed-data.mjs` (no network needed), `MOCK=1` fakes the iTunes endpoints (`MOCK=feeds` also answers `/api/feed`), `DARK=1` uses dark mode.

## Testing in the cloud container
No Android emulator (no KVM). Verify UI via the web target + screenshots, and logic via Jest. Web is a proxy for layout and logic only; gestures, haptics, safe areas and keyboards need a real device/emulator.
Don't run the dev server with `CI=1` (it disables reloads, so new routes aren't picked up).
`expo lint` can't auto-configure here (proxy), so ESLint is configured manually in `eslint.config.js`.

## Adding a screen
Each tab is a route group with its own stack (`src/app/(tabs)/(podcasts)`, `(discovery)`, `(playlists)`, `(profile)`; Downloads, Starred, Bookmarks, Listening history and Settings live under Profile) so detail pages keep the tab bar. A new tab needs a group folder with `_layout.tsx` (a `Stack`) plus a `TabTrigger` in `src/components/app-tabs.tsx`. That one custom tab bar serves every platform (instead of native tabs) so the persistent mini player can sit exactly above it. Tab roots other than Podcasts need a real segment (`playlists.tsx`, `discovery.tsx`) so URLs don't collide. Link to detail pages with the full group path, e.g. `/(tabs)/(podcasts)/podcast/[id]`.

## Local (macOS) emulator
Node 24 (`.nvmrc`), Xcode (iOS Simulator), Android Studio (AVD). `npx expo start`, then `i` / `a`. Claude Code run locally can screenshot with `xcrun simctl io booted screenshot x.png` or `adb exec-out screencap -p > x.png`.

## Gotchas
- Gesture objects in `TileGrid` cells are memoised on purpose: recreating a `Gesture` on re-render cancels an in-progress drag. Keep handlers stable (see the `latest` ref there).
- Use `sharedValue.set()`/`.get()` for writes (the React Compiler lint rule rejects `.value =`).
- Worklets (`useAnimatedStyle`, gesture `.onBegin/.onUpdate/.onEnd`) must not contain inline arrow functions (`.map(x => …)`, `.some(...)`, `interpolate` is fine): the React Compiler hoists them out as plain functions and native crashes with "Tried to synchronously call a Remote Function". Use plain `for` loops. Web runs everything on one thread, so it won't catch this.
- Artwork is wrapped in `pointerEvents="none"`: on web an `<img>` starts a native drag and cancels gestures.
- In SDK 57 native tabs are imported from `expo-router/unstable-native-tabs`.

## Audio, lock screen and background playback
- `src/store/player.ts` is the single player (current episode, position, rate, sleep timer; saves progress to the library and restores the last episode after a restart). It talks to audio only through the `PlayerEngine` interface in `src/player/engine.ts` (`expo-audio`); tests use `src/player/fake-engine.ts`.
- Background audio and lock-screen/notification/Bluetooth controls come from `expo-audio`: `setAudioModeAsync({ shouldPlayInBackground: true, interruptionMode: 'doNotMix' })` plus `setActiveForLockScreen(...)`, and the `expo-audio` config plugin in `app.json` (iOS `UIBackgroundModes: audio`; Android media foreground service). The lock-screen skip buttons are a fixed 10 s set by the OS.
- Battery: the native player pushes status to JS once a second (`STATUS_INTERVAL_MS`; fixed when the player is created). The store keeps a private live position for saving/skip-last/sleep and only publishes `positionSec` to React while `AppState` is active, then syncs once on resume. Keep it that way: every JS wake-up during a screen-off listen costs battery.
- Android in **Expo Go** can't show lock-screen controls (its manifest has no media service), so `engine.ts` skips them there. Use a development build for the real thing: `npx eas-cli@latest build --profile development --platform android` (or `ios`), install it, then `npm run dev-client`.
- `ios.bundleIdentifier` / `android.package` are `org.robstevens.vibecasts`: change them before the first store release.
- Runaway protection: `store/player.ts` checks every reported position against the wall clock (`isPlausibleAdvance`). A player that races ahead silently (seen after a long screen-off) is paused and put back at the last good position, the bad position is never saved, and the episode is never marked played from it. Keep any new status handling behind that check.
- `patches/expo-audio+57.0.5.patch` (applied by `postinstall: patch-package`) adds `setWakeMode(WAKE_MODE_NETWORK)` to the Android ExoPlayer, because expo-audio holds no wake/Wi-Fi lock and streaming could stall with the screen off. It needs `WAKE_LOCK` in `app.json`. If `expo-audio` is upgraded, regenerate the patch or drop it if upstream added a wake mode. Needs a native rebuild to take effect.
- The player buffers `FORWARD_BUFFER_SEC` (10 min) ahead so short network drops and long screen-off periods don't interrupt audio.

## OPML import/export
- `src/lib/opml.ts` parses/builds OPML (pure, tested against a sanitised fixture). Settings > Library (`components/settings/library-section.tsx`) previews, imports (`library.importFeeds`, deduped by `normalizeFeedUrl`, so http == https and iTunes-id subscriptions match) and exports (`opml-io.ts`: document picker + share sheet, Blob download on web).
- Imported shows are `needsMeta`; `feeds.backfill` fetches their feed 3 at a time and `mergePodcastMeta` fills in artwork/author/title (banner on the Podcasts screen).
- The persisted feed cache is slim (newest 50 episodes, no show notes); the full feed lives in memory. `TileGrid` mounts only rows near the viewport (`visibleRange`).
- Feeds given as http are tried over https first (`feedCandidates`); the build allows cleartext (`expo-build-properties`, iOS ATS) for feeds and audio that only offer http.

## Keeping your place, artwork, startup
- `store/player.ts` only adopts a reported position once it is near where it asked the player to be (`expecting`); a fall back to 0:00 (`isLostPlace`) or a runaway reloads the source at the known position instead of seeking, and `saveProgress` refuses to write "back at the start" unless the user sought. `player/event-log.ts` keeps a rolling log (Settings > Troubleshooting > Share playback log).
- `Artwork` asks the iTunes CDN for about the size shown (`lib/artwork.ts`), caches memory+disk, and the library's tile art is prefetched after first paint. The native splash stays up until the stores hydrate (the old animated overlay was removed).

## Downloads
- `downloads/download-manager.ts` (`useDownloads`): queue (2 at a time) over `expo-file-system` into `Paths.document/downloads`; sets `downloadedUri`/`autoDownloaded` on the library episode state and keeps a small `entries` record for the Downloads screen. Undefined file system on web (`downloadsSupported`).
- Pure rules live in `lib/downloads.ts` (`shouldAutoArchive`, `shouldAutoDelete` (same periods; the old "delete when finished" setting became `autoDelete`), `planAutoDownloads`, `downloadAllowed`); `downloads/auto.ts` applies them (foreground, feed refresh, an episode becoming played, setting changes; not on every progress save, to avoid wake-ups while listening). `downloads/background.ts` registers an hourly `expo-background-task` (OS-scheduled, best effort). Conditions come from `expo-battery` and `@react-native-community/netinfo` (`downloads/conditions.ts`).
- Native modules added for this: netinfo, expo-battery, expo-background-task, expo-task-manager. Needs a rebuild.

## New-episode notifications
- Per-podcast toggle (podcast settings sheet) asks for permission, then `notifications/notifier.ts` compares each refreshed feed with the ids it has already seen (`lib/new-episodes.ts`; the first check only sets a baseline) and posts one local notification per podcast through `expo-notifications` (`notifications/platform.ts`, Android channel `new-episodes`). Tapping one opens the episode (listener in `app/_layout.tsx`).
- Checks run after feed refreshes in the app and in the hourly background task (`downloads/background.ts`), so alerts can be late and arrive only when the OS runs the task; there is no push server. Needs a native rebuild (`expo-notifications`).

## Playlists and Up Next
- `store/playlists.ts` (`usePlaylists`): the Up Next queue plus named playlists, persisted under `playlists.v1`. Items are `EpisodeRef`s (`lib/playlist.ts`: slim episode + show, no notes) so they play without the feed. Pure list helpers (`addRefs`, `removeRef`, `moveRef`) are tested.
- `store/player.ts` rolls on into Up Next when an episode finishes (not after "stop at end of episode"), and starting an episode removes it from the queue. Playing a playlist item queues the rest of the playlist.
- UI: Playlists tab (`(playlists)/playlists.tsx`), `(playlists)/playlist/[id].tsx` (id `up-next` is the queue; drag the grip to reorder (`components/playlists/reorder-row.tsx`, fixed 76 px rows, no auto-scroll while dragging), remove with ×), "Play next / Play last / Add to playlist…" on the episode menu and the podcast page's multi-select menu, and a queue button on the episode screen header.

## Player sheet and tab pager
- The current episode's full player is `PlayerSheet` (root `_layout.tsx`), always mounted while something is loaded and moved by the shared value `sheetProgress` (`player/sheet-state.ts`): the mini player and the sheet header share `usePlayerSheetDrag` (worklet gesture, follows the finger, opens past the halfway point or on a fast flick, otherwise springs back); tapping the mini player runs `openPlayerSheet`. Browsing other episodes still uses the `/episode` modal route (both render `EpisodeView`).
- Playing / Details / Bookmarks live in `TabPager` (`player/tab-pager.tsx`): panels side by side that follow the finger; `SwipeIgnore` (measured relative to the pager) keeps the seek bar's own drag.
- Podcast page: tapping Bookmarks holds the scroll range open (`holdHeight`) so the page doesn't jump to the top.
- The mini player and the full player are one overlay (`PlayerSheet`): at rest it is the strip above the tab bar (`MiniPlayer` in the tab bar is an invisible placeholder that reserves the space and reports its position via `setMiniLayout`); dragging it up slides the card to fill the screen, dragging the header or art area down returns it to mini form. The header's underline and labels follow the pager's live offset (`pagerX`), and a flick moves one tab at most.

## Performance and caching
- Persisted stores write through `db/writer.ts` (`createWriter`): bursts are coalesced, progress-only library changes wait 2.5 s, the feed cache 3 s, and `flushAllWrites()` runs when the app leaves the foreground (root `_layout`). Don't write storage directly from a store subscription.
- Bulk and background feed refreshes are conditional (`refresh(podcast, { conditional: true })`): the saved ETag / Last-Modified is sent and a 304 (`FeedNotModified`) keeps the cache and just resets its age. Opening a page, pull to refresh and the notes fetch always do a full fetch (they need the whole feed in memory). Native only; web goes through the proxy.
- `library.countsVersion` changes only when played/archived does, so the Podcasts grid's unplayed counts (`useLibraryView`) don't recompute on every progress save. While backgrounded, playback progress is saved every 20 s instead of 5 s.
- The Podcasts grid shows `TileSkeleton` until the library has loaded, never "No podcasts yet".

## Library search, drag from results, visible-first loading
- Library search is `lib/search.ts` (`searchPodcasts`): a query matches at the start of a word in the title or author ("me" finds Metaverse, not Games).
- Long-pressing a search result swaps the grid to the whole library (`onDragBegin` in `(podcasts)/index.tsx`); `TileGrid` accepts a new `items` list mid-drag and keeps the gesture. `TileGrid` always renders tiles in `items` order and moves them by slot only (reordering the views under an active touch cancels it on web). A dragged podcast that lives in a folder appears as an extra tile; `library.placeInHome(keys)` sets the order and releases folder membership. The search closes when the drop finishes.
- Artwork prefetch, `feeds.refreshAll` and `feeds.backfill` work in on-screen order (`lib/display-order.ts`, `feeds.setPriority`, re-read before every pick so scrolling re-prioritises) and, when started with `whileLooking`, pause while the phone is locked or another tab is showing (`feeds.looking`, set by the Podcasts screen). The hourly background task has no screen and doesn't wait.

## Grid smoothness
- `TileGrid` keeps recently visible tiles mounted (`mountedRange`: only lets go of tiles more than 14 rows away), `Cell` is memoised and re-renders only for its slot, drag state or `itemVersion` (what the tile shows; `LibraryGrid` supplies it), and `renderItem` is read through the `latest` ref. Don't pass a fresh `children` element to `Cell`.
- `Artwork` skips the fade and placeholder for images already shown this session (`lib/shown-images.ts`), so remounted tiles don't flash.
- `PodcastsScreen` keeps the visible range in a ref and pushes the load priority to the feeds store on a 300 ms trailing throttle; don't put scroll position in React state there.
