# VibeCasts (repo: mobiletest)

Expo (SDK 57, to match the store build of Expo Go) + React Native + TypeScript + Expo Router app for experimenting with small app clones. Read `AGENTS.md` first: Expo APIs change every SDK, so check the versioned docs before touching them.

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
- Pure rules live in `lib/downloads.ts` (`shouldAutoArchive`, `planAutoDownloads`, `downloadAllowed`); `downloads/auto.ts` applies them (foreground, feed refresh, an episode becoming played, setting changes; not on every progress save, to avoid wake-ups while listening). `downloads/background.ts` registers an hourly `expo-background-task` (OS-scheduled, best effort). Conditions come from `expo-battery` and `@react-native-community/netinfo` (`downloads/conditions.ts`).
- Native modules added for this: netinfo, expo-battery, expo-background-task, expo-task-manager. Needs a rebuild.

## New-episode notifications
- Per-podcast toggle (podcast settings sheet) asks for permission, then `notifications/notifier.ts` compares each refreshed feed with the ids it has already seen (`lib/new-episodes.ts`; the first check only sets a baseline) and posts one local notification per podcast through `expo-notifications` (`notifications/platform.ts`, Android channel `new-episodes`). Tapping one opens the episode (listener in `app/_layout.tsx`).
- Checks run after feed refreshes in the app and in the hourly background task (`downloads/background.ts`), so alerts can be late and arrive only when the OS runs the task; there is no push server. Needs a native rebuild (`expo-notifications`).
